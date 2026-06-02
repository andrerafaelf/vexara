import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { parsePositiveInt } from '../utils/validation.js';
import { TROOP_STATS } from '../utils/combatMath.js';
import { logError } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { applyQuestRewards } from '../models/Nexus.js';

// ---- constants ----
const EMBED_BASE_COST = { biomass: 400, alloy: 200 };
const SABOTAGE_BASE_COST = { biomass: 300, ore: 300 };

// Recon operative speed (mirrors TROOP_STATS.reconOperative.speed = 25)
const RECON_SPEED =
	(TROOP_STATS as Record<string, { speed: number }>)['reconOperative']?.speed ?? 25;

// Embed detection: 5% base + 2% per defender stealthArray, max 15%.
const EMBED_DETECT_BASE = 0.05;
const EMBED_DETECT_PER_STEALTH = 0.02;
const EMBED_DETECT_MAX = 0.15;

// Intel refresh detection: slightly lower since operative is already embedded.
const REFRESH_DETECT_BASE = 0.04;
const REFRESH_DETECT_PER_STEALTH = 0.015;
const REFRESH_DETECT_MAX = 0.12;

const SABOTAGE_TARGETS = ['troops', 'building'] as const;
type SabotageTarget = (typeof SABOTAGE_TARGETS)[number];

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}

function travelMinutes(x1: number, y1: number, x2: number, y2: number): number {
	const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
	// Same formula as scout missions in attackController
	return distance * (4 + (28 - RECON_SPEED) / 10);
}

function buildIntel(defender: Record<string, unknown>) {
	return {
		troops: {
			lancerDrone: defender.lancerDrone,
			assaultTrooper: defender.assaultTrooper,
			breakerUnit: defender.breakerUnit,
			bulwarkGuard: defender.bulwarkGuard,
			suppressorTeam: defender.suppressorTeam,
			annihilatorPlatform: defender.annihilatorPlatform,
			reconOperative: defender.reconOperative,
			skimmerBike: defender.skimmerBike,
			siegeMech: defender.siegeMech,
			disruptorUnit: defender.disruptorUnit,
			interceptorBike: defender.interceptorBike,
			// voidStalker and plasmaTurret were missing here, so espionage intel
			// dropped them entirely (the scout-mission intel builder in
			// scouting.ts has always included both). Plasma Turrets are a
			// stationary defensive emplacement — exactly the thing a spy needs to
			// see before committing an attack.
			voidStalker: defender.voidStalker,
			plasmaTurret: defender.plasmaTurret,
			overseer: defender.overseer
		},
		resources: {
			biomass: Math.floor(defender.biomass as number),
			alloy: Math.floor(defender.alloy as number),
			ore: Math.floor(defender.ore as number)
		},
		buildings: {
			commandCore: defender.commandCore,
			shieldGrid: defender.shieldGrid,
			recruitmentCore: defender.recruitmentCore
		},
		nexusType: (defender.nexusType as string) ?? null,
		buildQueue: Array.isArray(defender.buildQueue) ? defender.buildQueue : [],
		trainingQueue: Array.isArray(defender.trainingQueue) ? defender.trainingQueue : []
	};
}

// ---- sendSpyMission ----
// Creates a SpyMission record and returns immediately with travel time.
// Actual resolution happens in processArrivedSpyMissions().
export async function sendSpyMission(req: AuthRequest, res: Response): Promise<void> {
	try {
		const {
			fromNexusId,
			toNexusId,
			type,
			operatives = 1,
			sabotageTarget
		} = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			type?: string;
			operatives?: unknown;
			sabotageTarget?: string;
		};

		const parsedFrom = parsePositiveInt(fromNexusId);
		const parsedTo = parsePositiveInt(toNexusId);
		if (!parsedFrom || !parsedTo) {
			res.status(400).json({ error: 'Invalid nexus IDs' });
			return;
		}
		if (type !== 'sabotage' && type !== 'embed') {
			res.status(400).json({ error: 'type must be sabotage or embed' });
			return;
		}

		const requestedOps = Math.floor(Number(operatives));
		if (requestedOps < 1) {
			res.status(400).json({ error: 'operatives must be at least 1' });
			return;
		}
		// An embed only ever stations a single operative — its cost and detection are
		// flat regardless of how many are requested. Clamp to 1 so a stale/over-eager
		// client can't silently spend extra recon operatives for no benefit.
		const opCount = type === 'embed' ? 1 : requestedOps;

		if (type === 'sabotage') {
			if (!sabotageTarget || !(SABOTAGE_TARGETS as readonly string[]).includes(sabotageTarget)) {
				res
					.status(400)
					.json({ error: `sabotageTarget must be one of: ${SABOTAGE_TARGETS.join(', ')}` });
				return;
			}
		}

		const [attacker, defender] = await Promise.all([
			prisma.nexus.findUnique({ where: { id: parsedFrom } }),
			prisma.nexus.findUnique({ where: { id: parsedTo } })
		]);

		if (!attacker || attacker.ownerId !== req.userId || attacker.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (!defender || defender.galaxyId !== req.galaxyId) {
			res.status(404).json({ error: 'Target not found' });
			return;
		}
		if (defender.ownerId === req.userId) {
			res.status(400).json({ error: 'Cannot spy on your own nexus' });
			return;
		}
		if (defender.newbieProtectionEndsAt && new Date(defender.newbieProtectionEndsAt) > new Date()) {
			res
				.status(403)
				.json({
					error: 'This nexus is under newbie protection and cannot be targeted yet',
					protectedUntil: defender.newbieProtectionEndsAt
				});
			return;
		}
		if (attacker.reconOperative < opCount) {
			res
				.status(400)
				.json({
					error: `Not enough Recon Operatives (have ${attacker.reconOperative}, need ${opCount})`
				});
			return;
		}

		// Embed costs flat 1-operative worth regardless of opCount sent.
		const embedUnits = 1;
		const biomassNeeded =
			type === 'embed'
				? EMBED_BASE_COST.biomass * embedUnits
				: SABOTAGE_BASE_COST.biomass * opCount;
		const secondaryNeeded =
			type === 'embed' ? EMBED_BASE_COST.alloy * embedUnits : SABOTAGE_BASE_COST.ore * opCount;
		const secondaryKey = type === 'embed' ? 'alloy' : 'ore';

		if (
			attacker.biomass < biomassNeeded ||
			(attacker as unknown as Record<string, number>)[secondaryKey] < secondaryNeeded
		) {
			res.status(400).json({ error: 'Not enough resources for this mission' });
			return;
		}

		// Calculate travel time and deduct operatives + resources immediately so they
		// can't be double-spent while the mission is in flight.
		const mins = travelMinutes(attacker.x, attacker.y, defender.x, defender.y);
		const travelMs = Math.round(mins * 60 * 1000);
		const arrivesAt = new Date(Date.now() + travelMs);

		const resourceUpdate: Record<string, number> = {
			biomass: attacker.biomass - biomassNeeded,
			reconOperative: attacker.reconOperative - opCount
		};
		resourceUpdate[secondaryKey] =
			(attacker as unknown as Record<string, number>)[secondaryKey] - secondaryNeeded;

		const [mission] = await prisma.$transaction([
			prisma.spyMission.create({
				data: {
					galaxyId: req.galaxyId,
					ownerUserId: req.userId,
					fromNexusId: parsedFrom,
					toNexusId: parsedTo,
					type,
					operatives: opCount,
					sabotageTarget: type === 'sabotage' ? sabotageTarget : null,
					status: 'traveling',
					arrivesAt
				}
			}),
			prisma.nexus.update({ where: { id: parsedFrom }, data: resourceUpdate })
		]);

		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			// Awaited (not fire-and-forget void) so a rejection can't silently drop the
			// quest tick - that was leaving "Send 1 espionage / sabotage mission" stuck
			// at 0/1 after a successful dispatch. Every espionage mission counts toward
			// scout_1 ("Reconnaissance"); sabotage additionally ticks sabotage_1.
			await incrementQuestProgress(req.userId, req.galaxyId, 'scout_1', 1);
			if (type === 'sabotage') {
				await incrementQuestProgress(req.userId, req.galaxyId, 'sabotage_1', 1);
			}
			await incrementQuestProgress(req.userId, req.galaxyId, 'login', 1);
		} catch (e) {
			logError('quest_progress_increment_failed', {
				message: (e as Error).message,
				file: 'spyController.ts',
				op: 'sendSpyMission',
				type
			});
		}
		void applyQuestRewards(attacker, { hasOutgoingSpyMission: true });

		res.json({
			queued: true,
			missionId: mission.id,
			arrivesAt: mission.arrivesAt,
			returnsAt: new Date(arrivesAt.getTime() + travelMs) // estimated return
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- processArrivedSpyMissions ----
// Called by the background job loop every 10 seconds.
export async function processArrivedSpyMissions(): Promise<void> {
	const now = new Date();

	// Resolve missions that have arrived at the target
	const arrived = await prisma.spyMission.findMany({
		where: { status: 'traveling', arrivesAt: { lte: now } }
	});

	for (const mission of arrived) {
		try {
			const [attacker, defender] = await Promise.all([
				prisma.nexus.findUnique({ where: { id: mission.fromNexusId } }),
				prisma.nexus.findUnique({ where: { id: mission.toNexusId } })
			]);

			if (!defender) {
				// Target nexus gone - complete mission and return operatives atomically
				const ops: Prisma.PrismaPromise<unknown>[] = [
					prisma.spyMission.update({
						where: { id: mission.id },
						data: { status: 'completed', result: { error: 'Target nexus no longer exists' } }
					})
				];
				if (attacker) {
					ops.push(
						prisma.nexus.update({
							where: { id: mission.fromNexusId },
							data: { reconOperative: { increment: mission.operatives } }
						})
					);
				}
				await prisma.$transaction(ops);
				continue;
			}

			const travelMs = mission.arrivesAt.getTime() - mission.createdAt.getTime();
			const returnsAt = new Date(now.getTime() + travelMs);

			let result: Record<string, unknown> = { type: mission.type, operatives: mission.operatives };
			let operativesReturning = mission.operatives;

			if (mission.type === 'embed') {
				const defenderStealth =
					(defender as unknown as { stealthArray?: number }).stealthArray ?? 0;
				const detectChance = clamp(
					EMBED_DETECT_BASE + defenderStealth * EMBED_DETECT_PER_STEALTH,
					0,
					EMBED_DETECT_MAX
				);
				const detected = Math.random() < detectChance;

				if (detected) {
					operativesReturning = mission.operatives - 1; // 1 operative lost on detection
					result = { ...result, success: false, detected: true };
				} else {
					const existing = await prisma.spyAsset.findFirst({
						where: {
							ownerUserId: mission.ownerUserId,
							targetNexusId: mission.toNexusId,
							status: 'active'
						}
					});
					if (existing) {
						await prisma.spyAsset.update({
							where: { id: existing.id },
							data: { lastReportAt: now }
						});
						result = {
							...result,
							success: true,
							assetId: existing.id,
							refreshed: true,
							intel: buildIntel(defender as unknown as Record<string, unknown>)
						};
					} else {
						const asset = await prisma.spyAsset.create({
							data: {
								galaxyId: mission.galaxyId,
								ownerUserId: mission.ownerUserId,
								ownerNexusId: mission.fromNexusId,
								targetNexusId: mission.toNexusId,
								status: 'active',
								lastReportAt: now
							}
						});
						result = {
							...result,
							success: true,
							assetId: asset.id,
							intel: buildIntel(defender as unknown as Record<string, unknown>)
						};
					}
				}
			} else {
				// Sabotage: deterministic by operative count
				const defenderRecon = defender.reconOperative ?? 0;
				const success = mission.operatives > defenderRecon;

				if (success) {
					const target = mission.sabotageTarget as SabotageTarget;
					const excessOps = Math.max(0, mission.operatives - defenderRecon);
					const excessRatio = clamp(
						(mission.operatives - defenderRecon) / Math.max(mission.operatives, 1),
						0,
						1
					);
					const sabotagePercent = clamp(0.05 + excessRatio * 0.35, 0.05, 0.4);
					operativesReturning = mission.operatives - Math.ceil(mission.operatives * 0.25);

					// Collect all defender nexus mutations for this sabotage into one update
					const defenderNexusData: Record<string, unknown> = {};

					if (target === 'troops') {
						const delayMs = excessOps * 30 * 60 * 1000;
						const tq =
							(defender.trainingQueue as Array<{
								troopType: string;
								amount: number;
								completesAt: string;
								perUnitSeconds?: number;
							}>) ?? [];
						if (tq.length > 0) {
							defenderNexusData.trainingQueue = tq.map((item) => ({
								...item,
								completesAt: new Date(new Date(item.completesAt).getTime() + delayMs).toISOString()
							}));
							result = { ...result, success: true, target, delayMinutes: excessOps * 30 };
						} else {
							result = { ...result, success: true, target, message: 'No active training queue' };
						}
					} else if (target === 'building') {
						const delayMs = excessOps * 30 * 60 * 1000;
						const bq =
							(defender.buildQueue as Array<{
								building: string;
								targetLevel: number;
								completesAt: string;
							}>) ?? [];
						if (bq.length > 0) {
							defenderNexusData.buildQueue = bq.map((item) => ({
								...item,
								completesAt: new Date(new Date(item.completesAt).getTime() + delayMs).toISOString()
							}));
							result = { ...result, success: true, target, delayMinutes: excessOps * 30 };
						} else {
							result = { ...result, success: true, target, message: 'No active build queue' };
						}
					}

					if (defenderRecon > 0) {
						defenderNexusData.reconOperative = 0;
					}

					// Atomically apply all defender mutations + mark mission returning
					const sabotageOps: Prisma.PrismaPromise<unknown>[] = [
						prisma.spyMission.update({
							where: { id: mission.id },
							data: {
								status: 'returning',
								returnsAt,
								result: result as Prisma.InputJsonValue,
								operatives: operativesReturning
							}
						})
					];
					if (Object.keys(defenderNexusData).length > 0) {
						sabotageOps.push(
							prisma.nexus.update({ where: { id: mission.toNexusId }, data: defenderNexusData })
						);
					}
					await prisma.$transaction(sabotageOps);

					if (defender.ownerId) {
						const targetLabel = target === 'troops' ? 'training queue' : 'build queue';
						const delayMins = (result as any).delayMinutes;
						void sendPushToUser(defender.ownerId, NOTIF.ATTACK_INCOMING, {
							title: 'Sabotage detected!',
							body: delayMins
								? `Your ${targetLabel} at ${defender.name} was sabotaged — delayed by ${delayMins} minutes.`
								: `A sabotage attempt hit your nexus ${defender.name} but had no active queues to disrupt.`,
							tag: `sabotage-${mission.id}`,
							data: { url: `/nexus/${defender.id}` }
						});
					}
					continue;
				} else {
					operativesReturning = 0; // all lost on sabotage failure
					result = { ...result, success: false, detected: true, defenderRecon };
				}
			}

			// Mark as returning (embed path and failed sabotage reach here)
			await prisma.spyMission.update({
				where: { id: mission.id },
				data: {
					status: 'returning',
					returnsAt,
					result: result as Prisma.InputJsonValue,
					operatives: operativesReturning
				}
			});
		} catch (err) {
			console.error('Error processing spy mission', mission.id, err);
		}
	}

	// Return operatives from missions that have completed their return trip
	const returning = await prisma.spyMission.findMany({
		where: { status: 'returning', returnsAt: { lte: now } }
	});

	for (const mission of returning) {
		try {
			const returnOps: Prisma.PrismaPromise<unknown>[] = [
				prisma.spyMission.update({ where: { id: mission.id }, data: { status: 'completed' } })
			];
			if (mission.operatives > 0) {
				returnOps.push(
					prisma.nexus.update({
						where: { id: mission.fromNexusId },
						data: { reconOperative: { increment: mission.operatives } }
					})
				);
			}
			await prisma.$transaction(returnOps);
		} catch (err) {
			console.error('Error completing spy mission return', mission.id, err);
		}
	}
}

// ---- getSpyMissions ----
// Returns in-flight missions (traveling or returning) for a nexus.
export async function getSpyMissions(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parsePositiveInt(req.params.nexusId);
		if (!nexusId) {
			res.status(400).json({ error: 'Invalid nexus ID' });
			return;
		}

		const nexus = await prisma.nexus.findUnique({
			where: { id: nexusId },
			select: { ownerId: true, galaxyId: true }
		});
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		const missions = await prisma.spyMission.findMany({
			where: { fromNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
			orderBy: { createdAt: 'desc' }
		});

		const enriched = await Promise.all(
			missions.map(async (m) => {
				const target = await prisma.nexus.findUnique({
					where: { id: m.toNexusId },
					select: { name: true, x: true, y: true }
				});
				return { ...m, targetName: target?.name };
			})
		);

		res.json(enriched);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getCompletedSpyMissions ----
// Returns the most recent completed missions so the frontend can show results.
export async function getCompletedSpyMissions(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parsePositiveInt(req.params.nexusId);
		if (!nexusId) {
			res.status(400).json({ error: 'Invalid nexus ID' });
			return;
		}

		const nexus = await prisma.nexus.findUnique({
			where: { id: nexusId },
			select: { ownerId: true, galaxyId: true }
		});
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		const missions = await prisma.spyMission.findMany({
			where: { fromNexusId: nexusId, status: 'completed' },
			orderBy: { createdAt: 'desc' },
			take: 10
		});

		const enriched = await Promise.all(
			missions.map(async (m) => {
				const target = await prisma.nexus.findUnique({
					where: { id: m.toNexusId },
					select: { name: true, x: true, y: true }
				});
				return { ...m, targetName: target?.name, targetX: target?.x, targetY: target?.y };
			})
		);

		res.json(enriched);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getSpyAssets ----
export async function getSpyAssets(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parsePositiveInt(req.params.nexusId);
		if (!nexusId) {
			res.status(400).json({ error: 'Invalid nexus ID' });
			return;
		}

		const nexus = await prisma.nexus.findUnique({
			where: { id: nexusId },
			select: { ownerId: true, galaxyId: true }
		});
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		const assets = await prisma.spyAsset.findMany({
			where: { ownerNexusId: nexusId, status: 'active' },
			orderBy: { createdAt: 'desc' }
		});

		const enriched = await Promise.all(
			assets.map(async (a) => {
				const target = await prisma.nexus.findUnique({
					where: { id: a.targetNexusId },
					select: { name: true, x: true, y: true }
				});
				return { ...a, targetName: target?.name, targetX: target?.x, targetY: target?.y };
			})
		);

		res.json(enriched);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getDiscoveredSpyAssets ----
// Returns the most recent embed assets that are no longer active (discovered or
// lost), so the frontend can offer a quick "re-embed" without hunting the map.
export async function getDiscoveredSpyAssets(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parsePositiveInt(req.params.nexusId);
		if (!nexusId) {
			res.status(400).json({ error: 'Invalid nexus ID' });
			return;
		}

		const nexus = await prisma.nexus.findUnique({
			where: { id: nexusId },
			select: { ownerId: true, galaxyId: true }
		});
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		const assets = await prisma.spyAsset.findMany({
			where: { ownerNexusId: nexusId, status: { in: ['discovered', 'lost'] } },
			orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }],
			take: 5
		});

		const enriched = await Promise.all(
			assets.map(async (a) => {
				const target = await prisma.nexus.findUnique({
					where: { id: a.targetNexusId },
					select: { name: true, x: true, y: true, ownerId: true }
				});
				// A target that has been razed or now belongs to the player can't be re-embedded.
				const reembeddable = !!target && target.ownerId !== req.userId;
				return {
					...a,
					targetName: target?.name,
					targetX: target?.x,
					targetY: target?.y,
					reembeddable
				};
			})
		);

		res.json(enriched);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getAllEspionageLogs ----
// Returns completed spy missions across all of a user's nexuses for the espionage tab.
// Cursor-based pagination: pass ?cursor=<id> to get the next page.
const ESPIONAGE_PAGE_SIZE = 50;

export async function getAllEspionageLogs(req: AuthRequest, res: Response): Promise<void> {
	try {
		const cursorRaw = req.query?.cursor;
		const cursor = cursorRaw ? parsePositiveInt(String(cursorRaw)) : undefined;

		const missions = await prisma.spyMission.findMany({
			where: { ownerUserId: req.userId, galaxyId: req.galaxyId, status: 'completed' },
			orderBy: { createdAt: 'desc' },
			take: ESPIONAGE_PAGE_SIZE + 1,
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
		});

		const hasMore = missions.length > ESPIONAGE_PAGE_SIZE;
		const page = hasMore ? missions.slice(0, ESPIONAGE_PAGE_SIZE) : missions;
		const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

		const nexusIds = [...new Set(page.flatMap((m) => [m.fromNexusId, m.toNexusId]))];
		const nexuses = await prisma.nexus.findMany({
			where: { id: { in: nexusIds } },
			select: { id: true, name: true, x: true, y: true, ownerId: true }
		});
		const nexusMap = new Map(nexuses.map((n) => [n.id, n]));

		const userIds = [...new Set(nexuses.filter((n) => n.ownerId).map((n) => n.ownerId!))];
		const users = await prisma.user.findMany({
			where: { id: { in: userIds } },
			select: { id: true, username: true }
		});
		const userMap = new Map(users.map((u) => [u.id, u.username]));

		const enriched = page.map((m) => {
			const from = nexusMap.get(m.fromNexusId);
			const to = nexusMap.get(m.toNexusId);
			return {
				...m,
				fromNexusName: from?.name ?? 'Unknown',
				targetName: to?.name ?? 'Unknown',
				targetX: to?.x,
				targetY: to?.y,
				targetOwnerUsername: to?.ownerId ? (userMap.get(to.ownerId) ?? null) : null
			};
		});

		res.json({ missions: enriched, nextCursor });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- recallSpyAsset ----
export async function recallSpyAsset(req: AuthRequest, res: Response): Promise<void> {
	try {
		const assetId = parsePositiveInt(req.params.assetId);
		if (!assetId) {
			res.status(400).json({ error: 'Invalid asset ID' });
			return;
		}

		const asset = await prisma.spyAsset.findUnique({ where: { id: assetId } });
		if (!asset || asset.ownerUserId !== req.userId || asset.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		await prisma.spyAsset.update({ where: { id: assetId }, data: { status: 'recalled' } });
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getEmbedIntel ----
// Refresh intel from an already-embedded operative. Instant once stationary.
export async function getEmbedIntel(req: AuthRequest, res: Response): Promise<void> {
	try {
		const assetId = parsePositiveInt(req.params.assetId);
		if (!assetId) {
			res.status(400).json({ error: 'Invalid asset ID' });
			return;
		}

		const asset = await prisma.spyAsset.findUnique({ where: { id: assetId } });
		if (!asset || asset.ownerUserId !== req.userId || asset.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (asset.status !== 'active') {
			res.status(400).json({ error: 'Asset is not active' });
			return;
		}

		const defender = await prisma.nexus.findUnique({ where: { id: asset.targetNexusId } });
		if (!defender) {
			await prisma.spyAsset.update({ where: { id: assetId }, data: { status: 'lost' } });
			res.status(404).json({ error: 'Target nexus no longer exists' });
			return;
		}

		// Discovery chance per refresh
		const defenderStealth = (defender as unknown as { stealthArray?: number }).stealthArray ?? 0;
		const discoveryChance = clamp(
			REFRESH_DETECT_BASE + defenderStealth * REFRESH_DETECT_PER_STEALTH,
			0,
			REFRESH_DETECT_MAX
		);
		if (Math.random() < discoveryChance) {
			await prisma.spyAsset.update({
				where: { id: assetId },
				data: { status: 'discovered', discoveredAt: new Date() }
			});
			res.json({ discovered: true });
			return;
		}

		await prisma.spyAsset.update({ where: { id: assetId }, data: { lastReportAt: new Date() } });
		res.json({
			discovered: false,
			intel: buildIntel(defender as unknown as Record<string, unknown>)
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'spyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
