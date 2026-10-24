import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { invalidateAuthCache } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import * as friendsService from '../services/friendsService.js';
import { comparePassword, hashPassword } from '../models/User.js';
import { sendPasswordChanged } from '../services/emailService.js';
import { type AuthRequest, TROOP_KEYS } from '../types/index.js';
import { validatePassword } from '../utils/validation.js';
import { logError, logGameEvent, logGameEventOnce } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import { getResourceProduction } from '../utils/economy.js';
import { resolveTitle } from '../utils/commanderTitle.js';
import { sortOwnedNexuses } from '../services/nexusService.js';

type FriendshipStatus = 'self' | 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

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
							isAlphaFounder: true,
							isBetaFounder: true,
							avatarKey: true,
							avatarBorder: true,
							activeTitle: true
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
					isAlphaFounder: p.user?.isAlphaFounder ?? false,
					isBetaFounder: p.user?.isBetaFounder ?? false,
					avatarUrl: avatarUrl(p.userId, p.user?.avatarKey ?? null),
					avatarUrlSm: avatarUrlSm(p.userId, p.user?.avatarKey ?? null),
					avatarBorder: p.user?.avatarBorder ?? null,
					activeTitle: p.user?.activeTitle ?? null,
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
				isAlphaFounder: true,
				isBetaFounder: true,
				avatarKey: true,
				beginnerTipsEnabled: true,
				onboardingStep: true,
				createdAt: true,
				galaxiesWon: true,
				galaxiesPlayed: true,
				lifetimePoints: true,
				vexPoints: true,
				passTitle: true,
				earnedBadges: true,
				earnedTitles: true,
				activeTitle: true,
				avatarBorder: true
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
			isAlphaFounder: user.isAlphaFounder ?? false,
			isBetaFounder: user.isBetaFounder ?? false,
			avatarUrl: avatarUrl(user.id, user.avatarKey),
			avatarUrlSm: avatarUrlSm(user.id, user.avatarKey),
			beginnerTipsEnabled: user.beginnerTipsEnabled,
			onboardingStep: user.onboardingStep ?? null,
			createdAt: user.createdAt,
			galaxiesWon: user.galaxiesWon,
			galaxiesPlayed: user.galaxiesPlayed,
			lifetimePoints: user.lifetimePoints,
			vexPoints: user.vexPoints,
			passTitle: user.passTitle ?? null,
			earnedBadges: (user.earnedBadges as string[]) ?? [],
			earnedTitles: (user.earnedTitles as string[]) ?? [],
			activeTitle: user.activeTitle ?? null,
			avatarBorder: user.avatarBorder ?? null,
			commanderTitle: resolveTitle(user)
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
		if (step === '__enabled__') { data.beginnerTipsEnabled = true; data.onboardingStep = null; }
		await prisma.user.update({ where: { id: req.userId }, data });

		// Funnel instrumentation (beta): record onboarding progression so we can
		// see where new players drop off in the tutorial. '__disabled__' is a
		// distinct opt-out signal (the player turned tips off). Each real step is a
		// once-per-user milestone; the step id is folded into the event NAME
		// (onboarding_step:<id>) so the once-per-user dedup is per-step — otherwise
		// only the first step the user ever completed would log. The step is also
		// kept in meta for convenience. A cohort query over event LIKE
		// 'onboarding_step:%' charts how far players get through the guided flow.
		if (req.userId) {
			if (step === '__disabled__') {
				logGameEvent('onboarding_disabled', req.userId, req.galaxyId);
			} else if (step !== '__enabled__') {
				logGameEventOnce(`onboarding_step:${step}`, req.userId, req.galaxyId, { step });
			}
		}
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
		// passwordChangedAt revokes every JWT issued before now (see middleware/auth.ts);
		// the caller gets a fresh token below so their own session continues.
		await prisma.user.update({
			where: { id: user.id },
			data: { password: hashed, passwordChangedAt: new Date() }
		});
		invalidateAuthCache(user.id);

		sendPasswordChanged(user.email, user.username).catch((err) =>
			logError('password_changed_email_failed', { userId: user.id, message: (err as Error).message })
		);

		const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
		res.json({ ok: true, token });
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
				isAlphaFounder: true,
				isBetaFounder: true,
				avatarKey: true,
				createdAt: true,
				activeGalaxyId: true,
				earnedBadges: true,
				earnedTitles: true,
				activeTitle: true,
				avatarBorder: true
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
			isAlphaFounder: user.isAlphaFounder ?? false,
			isBetaFounder: user.isBetaFounder ?? false,
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
			friendship,
			earnedBadges: (user.earnedBadges as string[]) ?? [],
			earnedTitles: (user.earnedTitles as string[]) ?? [],
			activeTitle: user.activeTitle ?? null,
			avatarBorder: user.avatarBorder ?? null
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// Unauthenticated, minimal public profile for the /u/<username> social card.
// The full getPublicProfile is auth-gated (it computes viewer-relative bits like
// friendship and galaxy-scoped stats), but the OG image route runs server-side
// with no session, so it needs a no-auth endpoint that returns only the
// genuinely-public career aggregates — nothing operational, nothing viewer-relative.
export async function getPublicProfileOg(req: Request, res: Response): Promise<void> {
	try {
		const username = String(req.params.username || '').trim();
		if (!username) {
			res.status(400).json({ error: 'Username required' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { username },
			select: { id: true, username: true, isFounder: true, isBetaFounder: true, supporterTier: true }
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		const players = await prisma.galaxyPlayer.findMany({
			where: { userId: user.id },
			select: {
				points: true,
				finalPoints: true,
				galaxy: { select: { id: true, status: true, winnerUserId: true, winnerFactionId: true } }
			}
		});

		const factionMemberships = await prisma.factionMember.findMany({
			where: { userId: user.id },
			select: { galaxyId: true, faction: { select: { id: true } } }
		});
		const factionByGalaxy = new Map(factionMemberships.map((m) => [m.galaxyId, m.faction.id]));

		let totalInfluence = 0;
		let galaxiesWon = 0;
		for (const p of players) {
			const isEnded = p.galaxy.status === 'ended';
			const effectivePoints = isEnded ? (p.finalPoints ?? 0) : p.points;
			totalInfluence += effectivePoints;
			const isFactionWinner = !!(
				p.galaxy.winnerFactionId && factionByGalaxy.get(p.galaxy.id) === p.galaxy.winnerFactionId
			);
			if (isEnded && (isFactionWinner || p.galaxy.winnerUserId === user.id)) galaxiesWon++;
		}

		res.json({
			username: user.username,
			isFounder: user.isFounder ?? false,
			isBetaFounder: user.isBetaFounder ?? false,
			supporterTier: user.supporterTier ?? null,
			totalInfluence,
			galaxiesWon,
			galaxiesPlayed: players.length
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'usersController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
