import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import * as friendsService from '../services/friendsService.js';
import { comparePassword, hashPassword } from '../models/User.js';
import { sendPasswordChanged } from '../services/emailService.js';
import type { AuthRequest } from '../types/index.js';
import { validatePassword } from '../utils/validation.js';
import { logError } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import { getResourceProduction } from '../utils/economy.js';
import { sortOwnedNexuses } from '../services/nexusService.js';

type FriendshipStatus = 'self' | 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

const TROOP_KEYS = [
	'lancerDrone',
	'assaultTrooper',
	'breakerUnit',
	'reconOperative',
	'skimmerBike',
	'siegeMech',
	'bulwarkGuard',
	'suppressorTeam',
	'disruptorUnit',
	'interceptorBike',
	'annihilatorPlatform',
	'overseer'
];

function sumTroops(troopObj: unknown): number {
	if (!troopObj || typeof troopObj !== 'object') return 0;
	return TROOP_KEYS.reduce(
		(sum, k) => sum + (Number((troopObj as Record<string, unknown>)[k]) || 0),
		0
	);
}

export async function listPlayersInGalaxy(req: AuthRequest, res: Response): Promise<void> {
	try {
		const galaxyId = req.galaxyId;
		if (!galaxyId) {
			res.json([]);
			return;
		}

		const [players, factions, nexusCounts] = await Promise.all([
			prisma.galaxyPlayer.findMany({
				where: { galaxyId },
				select: {
					userId: true,
					points: true,
					joinedAt: true,
					user: {
						select: {
							username: true,
							isSupporter: true,
							supporterTier: true,
							isFounder: true,
							avatarKey: true
						}
					}
				},
				orderBy: { points: 'desc' }
			}),
			prisma.factionMember.findMany({
				where: { galaxyId },
				select: {
					userId: true,
					role: true,
					faction: { select: { id: true, name: true, tag: true } }
				}
			}),
			prisma.nexus.groupBy({
				by: ['ownerId'],
				where: { galaxyId, ownerId: { not: null } },
				_count: { id: true }
			})
		]);

		const factionByUser = new Map(factions.map((m) => [m.userId, m]));
		const nexusByOwner = new Map(nexusCounts.map((r) => [r.ownerId!, r._count.id]));

		res.json(
			players
				.filter((p) => (nexusByOwner.get(p.userId) ?? 0) > 0)
				.map((p) => ({
					userId: p.userId,
					username: p.user?.username ?? 'Unknown',
					isSupporter: p.user?.isSupporter ?? false,
					supporterTier: p.user?.supporterTier ?? null,
					isFounder: p.user?.isFounder ?? false,
					avatarUrl: avatarUrl(p.userId, p.user?.avatarKey ?? null),
					avatarUrlSm: avatarUrlSm(p.userId, p.user?.avatarKey ?? null),
					points: p.points,
					joinedAt: p.joinedAt,
					nexuses: nexusByOwner.get(p.userId) || 0,
					faction: factionByUser.get(p.userId)
						? {
								id: factionByUser.get(p.userId)!.faction.id,
								name: factionByUser.get(p.userId)!.faction.name,
								tag: factionByUser.get(p.userId)!.faction.tag,
								role: factionByUser.get(p.userId)!.role
							}
						: null
				}))
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: {
				id: true,
				username: true,
				email: true,
				isSupporter: true,
				supporterTier: true,
				isFounder: true,
				avatarKey: true,
				beginnerTipsEnabled: true,
				onboardingStep: true
			}
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		res.json({
			id: user.id,
			username: user.username,
			email: user.email,
			isSupporter: user.isSupporter,
			supporterTier: user.supporterTier ?? null,
			isFounder: user.isFounder ?? false,
			avatarUrl: avatarUrl(user.id, user.avatarKey),
			avatarUrlSm: avatarUrlSm(user.id, user.avatarKey),
			beginnerTipsEnabled: user.beginnerTipsEnabled,
			onboardingStep: user.onboardingStep ?? null
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function updateOnboardingStep(req: AuthRequest, res: Response): Promise<void> {
	try {
		const step = typeof req.body?.step === 'string' ? req.body.step.slice(0, 64) : null;
		if (!step) {
			res.status(400).json({ error: 'step is required' });
			return;
		}
		const data: Record<string, unknown> = { onboardingStep: step };
		if (step === '__disabled__') data.beginnerTipsEnabled = false;
		await prisma.user.update({ where: { id: req.userId }, data });
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { currentPassword, newPassword } = (req.body ?? {}) as {
			currentPassword?: string;
			newPassword?: string;
		};

		if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
			res.status(400).json({ error: 'Current password is required.' });
			return;
		}
		if (!validatePassword(newPassword)) {
			res.status(400).json({ error: 'New password must be 8-72 characters.' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { id: true, username: true, email: true, password: true }
		});
		if (!user) {
			res.status(404).json({ error: 'User not found.' });
			return;
		}

		const isMatch = await comparePassword(currentPassword, user.password);
		if (!isMatch) {
			res.status(400).json({ error: 'Current password is incorrect.' });
			return;
		}

		const hashed = await hashPassword(newPassword!);
		await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

		sendPasswordChanged(user.email, user.username).catch((err) =>
			console.error('[emailService] sendPasswordChanged failed:', err)
		);

		res.json({ ok: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getPublicProfile(req: AuthRequest, res: Response): Promise<void> {
	try {
		const username = String(req.params.username || '').trim();
		if (!username) {
			res.status(400).json({ error: 'Username required' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { username },
			select: {
				id: true,
				username: true,
				isSupporter: true,
				supporterTier: true,
				isFounder: true,
				avatarKey: true,
				createdAt: true,
				activeGalaxyId: true
			}
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		const [players, activePlayer, activeNexuses, completedAttacks, streak] = await Promise.all([
			prisma.galaxyPlayer.findMany({
				where: { userId: user.id },
				select: {
					points: true,
					finalPoints: true,
					joinedAt: true,
					galaxy: {
						select: {
							id: true,
							name: true,
							status: true,
							startsAt: true,
							endedAt: true,
							winnerUserId: true,
							winnerFactionId: true
						}
					}
				},
				orderBy: { joinedAt: 'desc' }
			}),
			prisma.galaxyPlayer.findUnique({
				where: { userId_galaxyId: { userId: user.id, galaxyId: req.galaxyId } },
				select: { points: true }
			}),
			prisma.nexus
				.findMany({ where: { ownerId: user.id, galaxyId: req.galaxyId } })
				.then(sortOwnedNexuses),
			prisma.attack.findMany({
				where: {
					galaxyId: req.galaxyId,
					status: 'completed',
					OR: [{ attackerUserId: user.id }, { defenderUserId: user.id }]
				},
				select: { attackerUserId: true, defenderUserId: true, result: true }
			}),
			prisma.dailyStreak.findUnique({
				where: { userId_galaxyId: { userId: user.id, galaxyId: req.galaxyId } },
				select: { currentStreak: true, longestStreak: true }
			})
		]);

		const factionMemberships = await prisma.factionMember.findMany({
			where: { userId: user.id },
			select: {
				galaxyId: true,
				role: true,
				faction: { select: { id: true, name: true, tag: true } }
			}
		});
		const factionByGalaxy = new Map(factionMemberships.map((m) => [m.galaxyId, m]));

		let totalInfluence = 0;
		let bestSingleGalaxy = 0;
		let galaxiesWon = 0;
		const galaxies = players.map((p) => {
			const fm = factionByGalaxy.get(p.galaxy.id);
			const isFactionWinner = !!(
				p.galaxy.winnerFactionId &&
				fm &&
				fm.faction.id === p.galaxy.winnerFactionId
			);
			const isLeaderWinner = p.galaxy.winnerUserId === user.id;
			const isWinner = isFactionWinner || isLeaderWinner;
			const isEnded = p.galaxy.status === 'ended';
			// Live points while active, snapshot once ended. finalPoints is null for non-winners.
			const effectivePoints = isEnded ? (p.finalPoints ?? 0) : p.points;
			totalInfluence += effectivePoints;
			if (effectivePoints > bestSingleGalaxy) bestSingleGalaxy = effectivePoints;
			if (isEnded && isWinner) galaxiesWon++;
			return {
				galaxyId: p.galaxy.id,
				galaxyName: p.galaxy.name,
				status: p.galaxy.status,
				startsAt: p.galaxy.startsAt,
				endedAt: p.galaxy.endedAt,
				joinedAt: p.joinedAt,
				livePoints: p.points,
				finalPoints: p.finalPoints,
				effectivePoints,
				isWinner,
				isCurrent: p.galaxy.id === user.activeGalaxyId,
				faction: fm
					? { id: fm.faction.id, name: fm.faction.name, tag: fm.faction.tag, role: fm.role }
					: null
			};
		});

		let friendship: { status: FriendshipStatus; requestId?: number } = { status: 'none' };
		if (user.id === req.userId) {
			friendship = { status: 'self' };
		} else {
			const { userAId, userBId } = friendsService.pairKey(req.userId, user.id);
			const existing = await friendsService.getFriendship(userAId, userBId);
			if (existing) {
				friendship = { status: 'friends' };
			} else {
				const outgoing = await friendsService.getPendingRequestBetween(req.userId, user.id);
				if (outgoing) {
					friendship = { status: 'pending_outgoing', requestId: outgoing.id };
				} else {
					const incoming = await friendsService.getPendingRequestBetween(user.id, req.userId);
					if (incoming) friendship = { status: 'pending_incoming', requestId: incoming.id };
				}
			}
		}

		const isSelf = user.id === req.userId;
		const accountAgeDays = Math.max(
			1,
			Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
		);

		let attacksLaunched = 0,
			attacksDefended = 0,
			victories = 0,
			defeats = 0;
		let troopsLost = 0,
			troopsKilled = 0;
		const resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
		const resourcesLost = { biomass: 0, alloy: 0, ore: 0 };
		for (const attack of completedAttacks) {
			const result = attack.result as Record<string, unknown> | null;
			if (!result) continue;
			const isAttacker = attack.attackerUserId === user.id;
			const isDefender = attack.defenderUserId === user.id;
			const won = result.victory === true;
			const stolen = result.resourcesStolen as
				| { biomass?: number; alloy?: number; ore?: number }
				| undefined;
			if (isAttacker) {
				attacksLaunched++;
				if (won) victories++;
				else defeats++;
				troopsLost += sumTroops(result.attackerLosses);
				// Count every defending unit destroyed (garrison + allied support).
				// defenderLosses is now garrison-only; mergedDefenderLosses includes
				// allied casualties. Fall back to defenderLosses for legacy reports.
				troopsKilled += sumTroops(result.mergedDefenderLosses ?? result.defenderLosses);
				if (won && stolen) {
					resourcesStolen.biomass += stolen.biomass || 0;
					resourcesStolen.alloy += stolen.alloy || 0;
					resourcesStolen.ore += stolen.ore || 0;
				}
			}
			if (isDefender) {
				attacksDefended++;
				troopsLost += sumTroops(result.defenderLosses);
				troopsKilled += sumTroops(result.attackerLosses);
				if (!won && stolen) {
					resourcesLost.biomass += stolen.biomass || 0;
					resourcesLost.alloy += stolen.alloy || 0;
					resourcesLost.ore += stolen.ore || 0;
				}
			}
		}

		let totalProductionPerHour = { biomass: 0, alloy: 0, ore: 0 };
		let totalCurrentResources = { biomass: 0, alloy: 0, ore: 0 };
		let totalTroops = 0;
		for (const nexus of activeNexuses) {
			const prod = getResourceProduction(nexus);
			totalProductionPerHour.biomass += prod.biomass;
			totalProductionPerHour.alloy += prod.alloy;
			totalProductionPerHour.ore += prod.ore;
			totalCurrentResources.biomass += nexus.biomass;
			totalCurrentResources.alloy += nexus.alloy;
			totalCurrentResources.ore += nexus.ore;
			const nexusRecord = nexus as unknown as Record<string, number>;
			for (const k of TROOP_KEYS) totalTroops += nexusRecord[k] || 0;
		}

		// A public profile must NOT leak operational intel about another player:
		// current resource stockpile, production rates, and total troop count are
		// self-only. Nexus names/coordinates are public — they're visible on the
		// map anyway and give opponents no advantage they don't already have.
		res.json({
			userId: user.id,
			username: user.username,
			isSelf,
			isSupporter: user.isSupporter,
			supporterTier: user.supporterTier ?? null,
			isFounder: user.isFounder ?? false,
			avatarUrl: avatarUrl(user.id, user.avatarKey),
			avatarUrlSm: avatarUrlSm(user.id, user.avatarKey),
			createdAt: user.createdAt,
			accountAgeDays,
			totalInfluence,
			bestSingleGalaxy,
			galaxiesWon,
			galaxiesPlayed: galaxies.length,
			points: activePlayer?.points ?? 0,
			nexusCount: activeNexuses.length,
			// Reputational combat record is public. Resource theft totals stay too —
			// they're a track record, not live stockpile intel.
			combat: {
				attacksLaunched,
				attacksDefended,
				victories,
				defeats,
				troopsLost,
				troopsKilled,
				resourcesStolen,
				resourcesLost
			},
			// --- self-only operational data ---
			totalTroops: isSelf ? totalTroops : null,
			resources: isSelf
				? {
						current: totalCurrentResources,
						productionPerHour: {
							biomass: Math.round(totalProductionPerHour.biomass),
							alloy: Math.round(totalProductionPerHour.alloy),
							ore: Math.round(totalProductionPerHour.ore)
						},
						avgPerDay: {
							biomass: Math.round(totalProductionPerHour.biomass * 24),
							alloy: Math.round(totalProductionPerHour.alloy * 24),
							ore: Math.round(totalProductionPerHour.ore * 24)
						}
					}
				: null,
			streak: streak
				? { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak }
				: null,
			nexuses: activeNexuses.map((n) => ({
				_id: String(n.id),
				id: n.id,
				name: n.name,
				x: n.x,
				y: n.y,
				nexusType: n.nexusType,
				points: n.points
			})),
			galaxies,
			friendship
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
