import type { Response } from 'express';
import {
	applyCompletedQueues,
	serializeNexus,
	normalizeBuildQueue,
	queueToJson
} from '../models/Nexus.js';
import type { BuildQueueEntry } from '../models/Nexus.js';
import prisma from '../lib/prisma.js';
import * as referralService from '../services/referralService.js';
import type { AuthRequest } from '../types/index.js';
import { computeNexusPopulation, loadAwayPopulation } from '../utils/population.js';
import { logError } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';

// Shift any queued upgrades for `building` up by `levelsGained` so the in-flight
// queue doesn't overwrite the boosted level when it completes. Caps at maxLevel
// and drops entries that would no-op (queued target ≤ current level after boost).
function absorbBoostIntoBuildQueue(
	queue: BuildQueueEntry[],
	building: string,
	newCurrentLevel: number,
	levelsGained: number,
	maxLevel: number
): BuildQueueEntry[] {
	let lastLevelForBuilding = newCurrentLevel;
	const result: BuildQueueEntry[] = [];
	for (const entry of queue) {
		if (entry.building !== building) {
			result.push(entry);
			continue;
		}
		const shifted = Math.min(entry.targetLevel + levelsGained, maxLevel);
		if (shifted <= lastLevelForBuilding) continue;
		lastLevelForBuilding = shifted;
		result.push({ ...entry, targetLevel: shifted });
	}
	return result;
}

const BUILDINGS = [
	'commandCore',
	'hangarBay',
	'plasmaForge',
	'armorFoundry',
	'lifeSupport',
	'storageVault',
	'biomassFarm',
	'alloyForge',
	'oreExtractor',
	'shieldGrid',
	'armory',
	'stealthArray'
] as const;

const BUILDING_MAX: Record<string, number> = {
	commandCore: 20,
	hangarBay: 20,
	plasmaForge: 20,
	armorFoundry: 20,
	lifeSupport: 25,
	storageVault: 20,
	biomassFarm: 20,
	alloyForge: 20,
	oreExtractor: 20,
	shieldGrid: 15,
	armory: 20,
	stealthArray: 15
};

const BUILDING_NAMES: Record<string, string> = {
	commandCore: 'Command Core',
	hangarBay: 'Hangar Bay',
	plasmaForge: 'Plasma Forge',
	armorFoundry: 'Armor Foundry',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid',
	armory: 'Armory',
	stealthArray: 'Stealth Array'
};

const TROOP_NAMES: Record<string, string> = {
	sentinelLancer: 'Sentinel Lancer',
	assaultTrooper: 'Assault Trooper',
	vanguardBreaker: 'Vanguard Breaker',
	reconOperative: 'Recon Operative',
	wraithSkimmer: 'Wraith Skimmer',
	bulwarkGuard: 'Bulwark Guard',
	pyreSuppressor: 'Pyre Suppressor',
	arcDisruptor: 'Arc Disruptor',
	phantomLance: 'Phantom Lance',
	siegeMech: 'Siege Mech',
	annihilatorPlatform: 'Annihilator Platform'
};

const TROOP_POPULATION: Record<string, number> = {
	sentinelLancer: 1,
	assaultTrooper: 1,
	vanguardBreaker: 1,
	reconOperative: 1,
	wraithSkimmer: 3,
	bulwarkGuard: 2,
	pyreSuppressor: 2,
	arcDisruptor: 2,
	phantomLance: 3,
	siegeMech: 4,
	annihilatorPlatform: 5
};

// Grant amounts indexed by commandCore tier: 1-4 / 5-8 / 9-12 / 13-20
const TROOP_GRANTS: Record<string, [number, number, number, number]> = {
	sentinelLancer: [35, 75, 120, 180],
	vanguardBreaker: [35, 75, 120, 180],
	assaultTrooper: [20, 45, 75, 110],
	reconOperative: [20, 45, 75, 110],
	bulwarkGuard: [15, 32, 50, 75],
	pyreSuppressor: [15, 32, 50, 75],
	wraithSkimmer: [12, 25, 40, 60],
	arcDisruptor: [12, 25, 40, 60],
	phantomLance: [12, 25, 40, 60],
	siegeMech: [5, 12, 20, 30],
	annihilatorPlatform: [2, 5, 10, 15]
};

function commandCoreTier(level: number): 0 | 1 | 2 | 3 {
	if (level <= 4) return 0;
	if (level <= 8) return 1;
	if (level <= 12) return 2;
	return 3;
}

function grantAmountForTroop(troopType: string, commandLevel: number): number {
	const tiers = TROOP_GRANTS[troopType];
	if (!tiers) return 0;
	return tiers[commandCoreTier(commandLevel)];
}

// -- Route handlers --

export async function getMyReferrals(req: AuthRequest, res: Response): Promise<void> {
	try {
		const status = await referralService.getReferralStatus(req.userId!);
		res.json(status);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'referralController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMyPendingTokens(req: AuthRequest, res: Response): Promise<void> {
	try {
		const [referralTokens, milestoneTokens] = await Promise.all([
			referralService.getPendingTokens(req.userId!),
			referralService.getPendingMilestoneTokens(req.userId!)
		]);
		res.json({
			referral: referralTokens,
			milestone: milestoneTokens
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'referralController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function redeemToken(req: AuthRequest, res: Response): Promise<void> {
	try {
		const tokenId = parseInt(req.params.tokenId, 10);
		const { rewardType, nexusId, building, troopType } = req.body as {
			rewardType?: string;
			nexusId?: number;
			building?: string;
			troopType?: string;
		};

		if (!rewardType || !nexusId) {
			res.status(400).json({ error: 'rewardType and nexusId are required' });
			return;
		}

		const token = await referralService.getTokenById(tokenId);
		if (!token) {
			res.status(404).json({ error: 'Token not found' });
			return;
		}
		if (token.referrerId !== req.userId!) {
			res.status(403).json({ error: 'Not your token' });
			return;
		}
		if (token.redeemedAt) {
			res.status(400).json({ error: 'Token already redeemed' });
			return;
		}

		const rawNexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
		if (!rawNexus || rawNexus.ownerId !== req.userId! || rawNexus.galaxyId !== req.galaxyId!) {
			res.status(403).json({ error: 'Nexus not found or not yours' });
			return;
		}

		const nexus = await applyCompletedQueues(rawNexus);

		if (rewardType === 'building_instant') {
			if (!building || !BUILDINGS.includes(building as (typeof BUILDINGS)[number])) {
				res.status(400).json({ error: 'Invalid building' });
				return;
			}
			const currentLevel = (nexus as unknown as Record<string, number>)[building] ?? 0;
			const maxLevel = BUILDING_MAX[building];
			if (currentLevel >= maxLevel) {
				res
					.status(400)
					.json({ error: `${BUILDING_NAMES[building]} is already at max level (${maxLevel})` });
				return;
			}
			const targetLevel = Math.min(currentLevel + 2, maxLevel);
			const levelsGained = targetLevel - currentLevel;

			const existingQueue = normalizeBuildQueue(nexus.buildQueue);
			const newQueue = absorbBoostIntoBuildQueue(
				existingQueue,
				building,
				targetLevel,
				levelsGained,
				maxLevel
			);

			const updated = await prisma.nexus.update({
				where: { id: nexus.id },
				data: {
					[building]: targetLevel,
					buildQueue: queueToJson(newQueue)
				}
			});

			await referralService.markTokenRedeemed(tokenId, 'building_instant', {
				building,
				fromLevel: currentLevel,
				toLevel: targetLevel,
				nexusId: nexus.id
			});

			res.json({
				success: true,
				message: `${BUILDING_NAMES[building]} instantly upgraded by ${levelsGained} level${levelsGained > 1 ? 's' : ''} to level ${targetLevel} at ${nexus.name}.`,
				nexus: serializeNexus(updated)
			});
			return;
		}

		if (rewardType === 'troop_grant') {
			if (!troopType || !TROOP_NAMES[troopType]) {
				res.status(400).json({ error: 'Invalid troop type' });
				return;
			}
			const commandLevel = (nexus as unknown as Record<string, number>).commandCore ?? 0;
			const grantAmount = grantAmountForTroop(troopType, commandLevel);
			if (grantAmount === 0) {
				res.status(400).json({ error: 'Cannot determine grant amount' });
				return;
			}

			const popPerUnit = TROOP_POPULATION[troopType] ?? 1;
			const popMax = (nexus as unknown as Record<string, number>).populationMax ?? 24;
			const popCurrent = (nexus as unknown as Record<string, number>).populationCurrent ?? 0;
			const popFree = Math.max(0, popMax - popCurrent);
			const canFit = Math.floor(popFree / popPerUnit);
			const actualGrant = Math.min(grantAmount, canFit);

			if (actualGrant <= 0) {
				res.status(400).json({ error: 'Not enough population capacity for any troops' });
				return;
			}

			const currentTroops = (nexus as unknown as Record<string, number>)[troopType] ?? 0;
			const grantAway = await loadAwayPopulation(prisma, nexus.id);
			const updated = await prisma.nexus.update({
				where: { id: nexus.id },
				data: {
					[troopType]: currentTroops + actualGrant,
					// Recompute from the post-grant troop columns rather than adding a
					// delta - also self-heals the row if it was already drifted.
					populationCurrent: computeNexusPopulation({
						troops: { ...(nexus as unknown as Record<string, unknown>), [troopType]: currentTroops + actualGrant },
						trainingQueue: nexus.trainingQueue,
						populationMax: popMax,
						...grantAway
					})
				}
			});

			await referralService.markTokenRedeemed(tokenId, 'troop_grant', {
				troopType,
				amount: actualGrant,
				nexusId: nexus.id,
				commandLevel
			});

			res.json({
				success: true,
				message: `${actualGrant}x ${TROOP_NAMES[troopType]} granted at ${nexus.name}.`,
				nexus: serializeNexus(updated)
			});
			return;
		}

		res.status(400).json({ error: 'Unknown rewardType' });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'referralController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function redeemMilestoneToken(req: AuthRequest, res: Response): Promise<void> {
	try {
		const tokenId = parseInt(req.params.tokenId, 10);
		const { rewardType, nexusId, building, troopType } = req.body as {
			rewardType?: string;
			nexusId?: number;
			building?: string;
			troopType?: string;
		};

		if (!rewardType || !nexusId) {
			res.status(400).json({ error: 'rewardType and nexusId are required' });
			return;
		}

		const token = await referralService.getMilestoneTokenById(tokenId);
		if (!token) {
			res.status(404).json({ error: 'Token not found' });
			return;
		}
		if (token.userId !== req.userId!) {
			res.status(403).json({ error: 'Not your token' });
			return;
		}
		if (token.redeemedAt) {
			res.status(400).json({ error: 'Token already redeemed' });
			return;
		}

		const rawNexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
		if (!rawNexus || rawNexus.ownerId !== req.userId! || rawNexus.galaxyId !== req.galaxyId!) {
			res.status(403).json({ error: 'Nexus not found or not yours' });
			return;
		}

		const nexus = await applyCompletedQueues(rawNexus);

		if (rewardType === 'building_instant') {
			if (!building || !BUILDINGS.includes(building as (typeof BUILDINGS)[number])) {
				res.status(400).json({ error: 'Invalid building' });
				return;
			}
			const currentLevel = (nexus as unknown as Record<string, number>)[building] ?? 0;
			const maxLevel = BUILDING_MAX[building];
			if (currentLevel >= maxLevel) {
				res
					.status(400)
					.json({ error: `${BUILDING_NAMES[building]} is already at max level (${maxLevel})` });
				return;
			}
			const targetLevel = Math.min(currentLevel + 2, maxLevel);
			const levelsGained = targetLevel - currentLevel;

			const existingQueue = normalizeBuildQueue(nexus.buildQueue);
			const newQueue = absorbBoostIntoBuildQueue(
				existingQueue,
				building,
				targetLevel,
				levelsGained,
				maxLevel
			);

			const updated = await prisma.nexus.update({
				where: { id: nexus.id },
				data: {
					[building]: targetLevel,
					buildQueue: queueToJson(newQueue)
				}
			});
			await referralService.markMilestoneTokenRedeemed(tokenId, 'building_instant', {
				building,
				fromLevel: currentLevel,
				toLevel: targetLevel,
				nexusId: nexus.id
			});
			res.json({
				success: true,
				message: `${BUILDING_NAMES[building]} instantly upgraded by ${levelsGained} level${levelsGained > 1 ? 's' : ''} to level ${targetLevel} at ${nexus.name}.`,
				nexus: serializeNexus(updated)
			});
			return;
		}

		if (rewardType === 'troop_grant') {
			if (!troopType || !TROOP_NAMES[troopType]) {
				res.status(400).json({ error: 'Invalid troop type' });
				return;
			}
			const commandLevel = (nexus as unknown as Record<string, number>).commandCore ?? 0;
			const grantAmount = grantAmountForTroop(troopType, commandLevel);
			if (grantAmount === 0) {
				res.status(400).json({ error: 'Cannot determine grant amount' });
				return;
			}
			const popPerUnit = TROOP_POPULATION[troopType] ?? 1;
			const popMax = (nexus as unknown as Record<string, number>).populationMax ?? 24;
			const popCurrent = (nexus as unknown as Record<string, number>).populationCurrent ?? 0;
			const actualGrant = Math.min(
				grantAmount,
				Math.floor(Math.max(0, popMax - popCurrent) / popPerUnit)
			);
			if (actualGrant <= 0) {
				res.status(400).json({ error: 'Not enough population capacity for any troops' });
				return;
			}
			const currentTroops = (nexus as unknown as Record<string, number>)[troopType] ?? 0;
			const grantAway = await loadAwayPopulation(prisma, nexus.id);
			const updated = await prisma.nexus.update({
				where: { id: nexus.id },
				data: {
					[troopType]: currentTroops + actualGrant,
					// Recompute from the post-grant troop columns rather than adding a
					// delta - also self-heals the row if it was already drifted.
					populationCurrent: computeNexusPopulation({
						troops: { ...(nexus as unknown as Record<string, unknown>), [troopType]: currentTroops + actualGrant },
						trainingQueue: nexus.trainingQueue,
						populationMax: popMax,
						...grantAway
					})
				}
			});
			await referralService.markMilestoneTokenRedeemed(tokenId, 'troop_grant', {
				troopType,
				amount: actualGrant,
				nexusId: nexus.id,
				commandLevel
			});
			res.json({
				success: true,
				message: `${actualGrant}x ${TROOP_NAMES[troopType]} granted at ${nexus.name}.`,
				nexus: serializeNexus(updated)
			});
			return;
		}

		res.status(400).json({ error: 'Unknown rewardType' });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'referralController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMyReferralCode(req: AuthRequest, res: Response): Promise<void> {
	try {
		const me = await prisma.user.findUnique({
			where: { id: req.userId! },
			select: { referralCode: true, referralClickCount: true }
		});
		if (!me) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		res.json({ referralCode: me.referralCode, referralClickCount: me.referralClickCount ?? 0 });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'referralController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMyReferrer(req: AuthRequest, res: Response): Promise<void> {
	try {
		const me = await prisma.user.findUnique({
			where: { id: req.userId! },
			select: {
				referredById: true,
				referredBy: {
					select: {
						id: true,
						username: true,
						isSupporter: true,
						supporterTier: true,
						avatarKey: true
					}
				}
			}
		});
		if (!me?.referredById) {
			res.json({ referrer: null });
			return;
		}

		// Get referrer's best points across galaxies
		const playerRecords = await prisma.galaxyPlayer.findMany({
			where: { userId: me.referredById },
			select: { points: true },
			orderBy: { points: 'desc' },
			take: 1
		});
		const referrerPoints = playerRecords[0]?.points ?? 0;

		// Check if the referral tokens (for the referrer) were already issued
		const tokenCount = await prisma.referralToken.count({ where: { refereeId: req.userId! } });

		// Get our own best points to show progress toward the referral threshold
		const myRecords = await prisma.galaxyPlayer.findMany({
			where: { userId: req.userId! },
			select: { points: true },
			orderBy: { points: 'desc' },
			take: 1
		});
		const myPoints = myRecords[0]?.points ?? 0;

		res.json({
			referrer: {
				username: me.referredBy?.username,
				isSupporter: me.referredBy?.isSupporter ?? false,
				supporterTier: me.referredBy?.supporterTier ?? null,
				avatarUrl: me.referredBy ? avatarUrl(me.referredBy.id, me.referredBy.avatarKey) : null,
				avatarUrlSm: me.referredBy ? avatarUrlSm(me.referredBy.id, me.referredBy.avatarKey) : null,
				thresholdMet: tokenCount > 0,
				referrerPoints,
				myPoints
			}
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'referralController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function trackReferralClick(
	req: { params: { code: string } },
	res: Response
): Promise<void> {
	const code = req.params.code?.trim();
	if (!code) {
		res.json({ ok: true });
		return;
	}
	try {
		await prisma.user.updateMany({
			where: { referralCode: code },
			data: { referralClickCount: { increment: 1 } }
		});
	} catch {
		/* best-effort, never surface errors to the client */
	}
	res.json({ ok: true });
}

export {
	grantAmountForTroop,
	TROOP_GRANTS,
	TROOP_NAMES,
	BUILDING_NAMES,
	BUILDING_MAX,
	TROOP_POPULATION
};
