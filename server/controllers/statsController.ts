import type { Response } from 'express';
import * as statsService from '../services/statsService.js';
import { type AuthRequest, TROOP_KEYS } from '../types/index.js';
import { getResourceProduction } from '../utils/economy.js';
import { logError } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import prisma from '../lib/prisma.js';
import { CHALLENGE_DEFS, computeChallengeProgress, type ChallengeStats } from '../utils/challenges.js';

function sumTroops(troopObj: unknown): number {
	if (!troopObj || typeof troopObj !== 'object') return 0;
	return TROOP_KEYS.reduce(
		(sum, k) => sum + (Number((troopObj as Record<string, unknown>)[k]) || 0),
		0
	);
}

export async function getMyStats(req: AuthRequest, res: Response): Promise<void> {
	try {
		const userId = req.userId;
		const [user, player, nexuses, completedAttacks] = await Promise.all([
			statsService.getUserById(userId),
			statsService.getGalaxyPlayer(userId, req.galaxyId),
			statsService.getUserNexuses(userId, req.galaxyId),
			statsService.getCompletedAttacks(userId, req.galaxyId)
		]);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

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
			const isAttacker = attack.attackerUserId === userId;
			const isDefender = attack.defenderUserId === userId;
			const won = result.victory === true;
			const stolen = result.resourcesStolen as
				| { biomass?: number; alloy?: number; ore?: number }
				| undefined;
			if (isAttacker) {
				attacksLaunched++;
				if (won) victories++;
				else defeats++;
				troopsLost += sumTroops(result.attackerLosses);
				troopsKilled += sumTroops(result.defenderLosses);
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
		for (const nexus of nexuses) {
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

		const avgResourcesPerDay = {
			biomass: Math.round(totalProductionPerHour.biomass * 24),
			alloy: Math.round(totalProductionPerHour.alloy * 24),
			ore: Math.round(totalProductionPerHour.ore * 24)
		};
		const accountAgeDays = Math.max(
			1,
			Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
		);

		res.json({
			username: user.username,
			isSupporter: user.isSupporter,
			supporterTier: user.supporterTier ?? null,
			isFounder: user.isFounder ?? false,
			isAlphaFounder: user.isAlphaFounder ?? false,
			avatarUrl: avatarUrl(user.id, user.avatarKey),
			avatarUrlSm: avatarUrlSm(user.id, user.avatarKey),
			earnedBadges: (user.earnedBadges as string[]) ?? [],
			earnedTitles: (user.earnedTitles as string[]) ?? [],
			activeTitle: user.activeTitle ?? null,
			points: player?.points ?? 0,
			accountAgeDays,
			nexusCount: nexuses.length,
			totalTroops,
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
			resources: {
				current: totalCurrentResources,
				productionPerHour: {
					biomass: Math.round(totalProductionPerHour.biomass),
					alloy: Math.round(totalProductionPerHour.alloy),
					ore: Math.round(totalProductionPerHour.ore)
				},
				avgPerDay: avgResourcesPerDay
			}
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'statsController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getChallenges(req: AuthRequest, res: Response): Promise<void> {
	try {
		const userId = req.userId;

		// Fetch username first so we can query MarketTransaction by username
		const userRow = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				username: true,
				galaxiesWon: true,
				galaxiesPlayed: true,
				lifetimePoints: true,
				createdAt: true,
			},
		});

		if (!userRow) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		const [
			allAttacks,
			nexuses,
			marketTrades,
			seasonRecords,
			referralCount,
			nexusTroopsTrained,
			referredUsers,
			factionMessages,
			treaties,
			factionsJoined,
			dailyStreaks,
			galaxyPlayers,
		] = await Promise.all([
			// All completed attacks across all galaxies for lifetime combat stats
			prisma.attack.findMany({
				where: {
					status: 'completed',
					OR: [{ attackerUserId: userId }, { defenderUserId: userId }],
				},
				select: { attackerUserId: true, defenderUserId: true, result: true, type: true },
			}),
			// Current nexus count (all galaxies, owned)
			prisma.nexus.count({ where: { ownerId: userId } }),
			// Market trades as buyer or seller (keyed by username in the transaction table)
			prisma.marketTransaction.findMany({
				where: {
					OR: [
						{ sellerUsername: userRow.username },
						{ buyerUsername: userRow.username },
					],
				},
				select: { offerAmount: true, wantAmount: true },
			}),
			// Season records for best single-galaxy score and total career points
			prisma.seasonRecord.findMany({
				where: { userId },
				select: { points: true },
			}),
			// Count of users who used this user's referral code
			prisma.user.count({ where: { referredById: userId } }),
			// All nexuses currently owned for troopsTrained counters
			prisma.nexus.findMany({
				where: { ownerId: userId },
				select: { troopsTrained: true },
			}),
			// Referred users' lifetime points for Mentor challenge
			prisma.user.findMany({
				where: { referredById: userId },
				select: { lifetimePoints: true },
			}),
			// Faction messages sent by this user
			prisma.factionMessage.count({ where: { userId } }),
			// Treaties proposed or accepted by this user
			prisma.factionTreaty.count({
				where: {
					status: 'active',
					OR: [{ proposedByUserId: userId }, { acceptedByUserId: userId }],
				},
			}),
			// Distinct factions joined across all galaxies
			prisma.factionMember.count({ where: { userId } }),
			// Daily streak records for longestStreak
			prisma.dailyStreak.findMany({
				where: { userId },
				select: { longestStreak: true },
			}),
			// GalaxyPlayer rows for completedQuestIds
			prisma.galaxyPlayer.findMany({
				where: { userId },
				select: { completedQuestIds: true },
			}),
		]);

		let troopsKilled = 0;
		let troopsLost = 0;
		let victories = 0;
		let defeats = 0;
		let attacksLaunched = 0;
		let attacksDefended = 0;
		let nexusesCaptured = 0;
		let scoutsMade = 0;
		let supportMissionsSent = 0;
		let defenseVictories = 0;
		let perfectVictories = 0;
		let resourcesStolen = 0;
		let resourcesLost = 0;
		const attackedPlayerIds = new Set<number>();
		const incomingPlayerIds = new Set<number>();

		for (const attack of allAttacks) {
			const result = attack.result as Record<string, unknown> | null;
			if (!result) continue;
			const isAttacker = attack.attackerUserId === userId;
			const isDefender = attack.defenderUserId === userId;
			const won = result.victory === true;
			const stolen = result.resourcesStolen as
				| { biomass?: number; alloy?: number; ore?: number }
				| undefined;

			if (isAttacker) {
				if (attack.type === 'scout') {
					scoutsMade++;
				} else if (attack.type === 'support') {
					supportMissionsSent++;
				} else {
					attacksLaunched++;
					if (attack.defenderUserId != null) attackedPlayerIds.add(attack.defenderUserId);
					if (won) {
						victories++;
						if (result.nexusCaptured) nexusesCaptured++;
						if (stolen) {
							resourcesStolen +=
								(stolen.biomass || 0) + (stolen.alloy || 0) + (stolen.ore || 0);
						}
						const attackerLost = sumTroops(result.attackerLosses);
						if (attackerLost === 0) perfectVictories++;
					} else {
						defeats++;
					}
				}
				troopsKilled += sumTroops(result.defenderLosses);
				troopsLost += sumTroops(result.attackerLosses);
			}
			if (isDefender) {
				attacksDefended++;
				if (attack.attackerUserId != null) incomingPlayerIds.add(attack.attackerUserId);
				if (!won) {
					defenseVictories++;
				} else if (stolen) {
					resourcesLost += (stolen.biomass || 0) + (stolen.alloy || 0) + (stolen.ore || 0);
				}
				troopsKilled += sumTroops(result.attackerLosses);
				troopsLost += sumTroops(result.defenderLosses);
			}
		}

		// Lifetime troops trained from nexus troopsTrained JSON counters
		let totalTroopsEverTrained = 0;
		for (const nexus of nexusTroopsTrained) {
			const tt = nexus.troopsTrained as Record<string, number> | null;
			if (tt && typeof tt === 'object') {
				for (const v of Object.values(tt)) totalTroopsEverTrained += Number(v) || 0;
			}
		}

		// Market aggregates
		let tradesMade = 0;
		let totalTradeVolume = 0;
		for (const trade of marketTrades) {
			tradesMade++;
			totalTradeVolume += (trade.offerAmount || 0) + (trade.wantAmount || 0);
		}

		// Best single-galaxy points and total career points from SeasonRecord
		let bestGalaxyPoints = 0;
		let totalSeasonPoints = 0;
		for (const r of seasonRecords) {
			if (r.points > bestGalaxyPoints) bestGalaxyPoints = r.points;
			totalSeasonPoints += r.points;
		}

		// Mentor influence — sum of lifetimePoints of all referred users
		const mentorInfluence = referredUsers.reduce((sum, u) => sum + u.lifetimePoints, 0);

		// Longest quest streak across all galaxies
		const longestQuestStreak = dailyStreaks.reduce((best, s) => Math.max(best, s.longestStreak), 0);

		// Total quests completed across all GalaxyPlayer rows
		let questsCompleted = 0;
		for (const gp of galaxyPlayers) {
			const ids = gp.completedQuestIds as string[] | null;
			if (Array.isArray(ids)) questsCompleted += ids.length;
		}

		const accountAgeDays = Math.max(
			1,
			Math.floor((Date.now() - new Date(userRow.createdAt).getTime()) / (1000 * 60 * 60 * 24))
		);

		const stats: ChallengeStats = {
			troopsKilled,
			troopsLost,
			victories,
			defeats,
			attacksLaunched,
			attacksDefended,
			nexusesCaptured,
			scoutsMade,
			supportMissionsSent,
			defenseVictories,
			perfectVictories,
			resourcesStolen,
			resourcesLost,
			uniquePlayersAttacked: attackedPlayerIds.size,
			uniquePlayersDefendedAgainst: incomingPlayerIds.size,
			nexusCount: nexuses,
			lifetimePoints: userRow.lifetimePoints,
			totalTroopsEverTrained,
			galaxiesWon: userRow.galaxiesWon,
			galaxiesPlayed: userRow.galaxiesPlayed,
			bestGalaxyPoints,
			totalSeasonPoints,
			factionMessagesSent: factionMessages,
			treatiesSigned: treaties,
			factionsJoined,
			mentorInfluence,
			longestQuestStreak,
			questsCompleted,
			tradesMade,
			totalTradeVolume,
			accountAgeDays,
			referralCount,
		};

		const challenges = computeChallengeProgress(CHALLENGE_DEFS, stats);
		const unlockedTitles = challenges
			.filter((c) => c.unlockedTitle !== null)
			.map((c) => c.unlockedTitle as string);
		res.json({ challenges, unlockedTitles });

		// Sync any newly unlocked challenge titles into User.earnedTitles so they
		// can be equipped via PATCH /battle-pass/title (which validates against the DB).
		if (unlockedTitles.length > 0) {
			prisma.user.findUnique({ where: { id: userId }, select: { earnedTitles: true } })
				.then((u) => {
					const existing = new Set((u?.earnedTitles as string[]) ?? []);
					const toAdd = unlockedTitles.filter((t) => !existing.has(t));
					if (toAdd.length > 0) {
						return prisma.user.update({
							where: { id: userId },
							data: { earnedTitles: [...existing, ...toAdd] as any },
						});
					}
				})
				.catch((err) => logError('challenge_title_sync_failed', { message: (err as Error).message }));
		}
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'statsController.ts:getChallenges',
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getTimeline(req: AuthRequest, res: Response): Promise<void> {
	try {
		const userId = req.userId;
		const days = Math.min(90, Math.max(7, parseInt(String(req.query.days), 10) || 30));
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const [nexuses, attacks] = await Promise.all([
			statsService.getUserNexuses(userId, req.galaxyId),
			statsService.getCompletedAttacksSince(userId, req.galaxyId, since)
		]);
		let prodPerHour = { biomass: 0, alloy: 0, ore: 0 };
		for (const nexus of nexuses) {
			const p = getResourceProduction(nexus);
			prodPerHour.biomass += p.biomass;
			prodPerHour.alloy += p.alloy;
			prodPerHour.ore += p.ore;
		}
		const prodPerDay = {
			biomass: Math.round(prodPerHour.biomass * 24),
			alloy: Math.round(prodPerHour.alloy * 24),
			ore: Math.round(prodPerHour.ore * 24)
		};
		const buckets: Record<
			string,
			{
				date: string;
				attacksLaunched: number;
				attacksDefended: number;
				troopsKilled: number;
				troopsLost: number;
				resourcesStolen: number;
				resourcesLost: number;
				biomassProduced: number;
				alloyProduced: number;
				oreProduced: number;
			}
		> = {};
		for (let i = 0; i < days; i++) {
			const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
			const key = d.toISOString().slice(0, 10);
			buckets[key] = {
				date: key,
				attacksLaunched: 0,
				attacksDefended: 0,
				troopsKilled: 0,
				troopsLost: 0,
				resourcesStolen: 0,
				resourcesLost: 0,
				biomassProduced: prodPerDay.biomass,
				alloyProduced: prodPerDay.alloy,
				oreProduced: prodPerDay.ore
			};
		}
		for (const attack of attacks) {
			const key = new Date(attack.createdAt).toISOString().slice(0, 10);
			if (!buckets[key]) continue;
			const b = buckets[key];
			const result = attack.result as Record<string, unknown> | null;
			if (!result) continue;
			const isAttacker = attack.attackerUserId === userId;
			const isDefender = attack.defenderUserId === userId;
			const won = result.victory === true;
			const stolen = result.resourcesStolen as
				| { biomass?: number; alloy?: number; ore?: number }
				| undefined;
			const stolenSum = (stolen?.biomass || 0) + (stolen?.alloy || 0) + (stolen?.ore || 0);
			if (isAttacker) {
				b.attacksLaunched++;
				b.troopsLost += sumTroops(result.attackerLosses);
				b.troopsKilled += sumTroops(result.defenderLosses);
				if (won && stolen) b.resourcesStolen += stolenSum;
			}
			if (isDefender) {
				b.attacksDefended++;
				b.troopsLost += sumTroops(result.defenderLosses);
				b.troopsKilled += sumTroops(result.attackerLosses);
				if (!won && stolen) b.resourcesLost += stolenSum;
			}
		}
		res.json(Object.values(buckets));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'statsController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
