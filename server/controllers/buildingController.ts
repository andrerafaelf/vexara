import type { Response } from 'express';
import {
	applyCompletedQueues,
	applyQuestRewards,
	computeResourceUpdate,
	normalizeBuildQueue,
	queueToJson,
	serializeNexus
} from '../models/Nexus.js';
import * as buildingService from '../services/buildingService.js';
import { atomicUpdateNexusResources, ResourceConflictError } from '../services/nexusService.js';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { getMaxStorage, getResourceProduction } from '../utils/economy.js';
import {
	BUILDING_COSTS,
	getBuildingCost,
	getCommandBuildQueueBonus,
	getEffectiveBuildTimeSeconds,
	getOnboardingTaperFraction,
	isOnboardingBuildEligible,
	ONBOARDING_BUILD_TIME_SECONDS
} from '../utils/gameConstants.js';
import { notifyNexusResources } from '../services/warRoomSocket.js';
import { getPopulationMax } from '../utils/population.js';
import { logError, logGameEventOnce } from '../utils/logger.js';
import { getActiveProductionBoostPct } from '../utils/battlePass.js';

const BASE_MAX_BUILD_QUEUE = 5;

// CC Veteran tier (Lv16-17) adds +1 build queue slot each, capped at +2 (7 total).
function getMaxBuildQueue(commandCore: number): number {
	return BASE_MAX_BUILD_QUEUE + getCommandBuildQueueBonus(commandCore);
}

const BUILDING_RULES: Record<
	string,
	{
		maxLevel: number;
		unlock: { building: string; level: number } | null;
		milestones: Array<{ level: number; requires: Array<{ building: string; level: number }> }>;
	}
> = {
	commandCore: {
		maxLevel: 20,
		unlock: null,
		milestones: [
			{ level: 4, requires: [{ building: 'lifeSupport', level: 2 }] },
			{ level: 6, requires: [{ building: 'shieldGrid', level: 2 }] },
			{ level: 10, requires: [{ building: 'storageVault', level: 5 }] }
		]
	},
	// Three class-specific production buildings replaced the old Recruitment
	// Core in the Military Restructure. Each gates and accelerates training of
	// units in its class only (Hangar Bay = mobile, Plasma Forge = fire, Armor
	// Foundry = armor). Specials (recon, overseer) train from Command Core.
	hangarBay: {
		maxLevel: 20,
		unlock: { building: 'commandCore', level: 2 },
		milestones: [
			{ level: 4, requires: [{ building: 'alloyForge', level: 2 }] },
			{ level: 6, requires: [{ building: 'lifeSupport', level: 3 }] },
			{ level: 10, requires: [{ building: 'commandCore', level: 6 }] }
		]
	},
	plasmaForge: {
		maxLevel: 20,
		unlock: { building: 'commandCore', level: 2 },
		milestones: [
			{ level: 4, requires: [{ building: 'oreExtractor', level: 3 }] },
			{ level: 6, requires: [{ building: 'alloyForge', level: 4 }] },
			{ level: 10, requires: [{ building: 'shieldGrid', level: 4 }] }
		]
	},
	armorFoundry: {
		maxLevel: 20,
		unlock: { building: 'commandCore', level: 2 },
		milestones: [
			{ level: 4, requires: [{ building: 'biomassFarm', level: 2 }] },
			{ level: 6, requires: [{ building: 'oreExtractor', level: 4 }] },
			{ level: 10, requires: [{ building: 'lifeSupport', level: 5 }] }
		]
	},
	lifeSupport: {
		maxLevel: 25,
		unlock: { building: 'commandCore', level: 2 },
		milestones: [
			{ level: 4, requires: [{ building: 'biomassFarm', level: 2 }] },
			{ level: 8, requires: [{ building: 'storageVault', level: 4 }] }
		]
	},
	storageVault: {
		maxLevel: 20,
		unlock: { building: 'commandCore', level: 2 },
		milestones: [
			{ level: 4, requires: [{ building: 'oreExtractor', level: 2 }] },
			{ level: 6, requires: [{ building: 'alloyForge', level: 2 }] },
			{ level: 10, requires: [{ building: 'commandCore', level: 8 }] }
		]
	},
	biomassFarm: {
		maxLevel: 20,
		unlock: { building: 'lifeSupport', level: 1 },
		milestones: [{ level: 10, requires: [{ building: 'lifeSupport', level: 5 }] }]
	},
	alloyForge: {
		maxLevel: 20,
		unlock: { building: 'oreExtractor', level: 2 },
		milestones: [
			{ level: 6, requires: [{ building: 'commandCore', level: 4 }] },
			{ level: 10, requires: [{ building: 'oreExtractor', level: 8 }] }
		]
	},
	oreExtractor: {
		maxLevel: 20,
		unlock: { building: 'commandCore', level: 1 },
		milestones: [{ level: 8, requires: [{ building: 'alloyForge', level: 4 }] }]
	},
	shieldGrid: {
		maxLevel: 15,
		unlock: { building: 'commandCore', level: 3 },
		milestones: [
			{ level: 4, requires: [{ building: 'storageVault', level: 3 }] },
			{ level: 8, requires: [{ building: 'alloyForge', level: 5 }] }
		]
	},
	targetingCore: {
		maxLevel: 20,
		unlock: { building: 'commandCore', level: 5 },
		milestones: [
			// Targeting Core milestones are gated by the class building matching the unit
			// each Targeting Core tier unlocks. Lv3 unlocks Void Stalker (mobile) -> gate
			// on Hangar Bay. Lv5 unlocks Plasma Turret (fire) -> Plasma Forge.
			// Lv10 caps the heavy-end on Armor Foundry to keep symmetry across
			// the three production buildings.
			{ level: 3, requires: [{ building: 'hangarBay', level: 5 }] },
			{
				level: 5,
				requires: [
					{ building: 'plasmaForge', level: 7 },
					{ building: 'shieldGrid', level: 3 }
				]
			},
			{
				level: 10,
				requires: [
					{ building: 'commandCore', level: 10 },
					{ building: 'armorFoundry', level: 10 }
				]
			}
		]
	},
	stealthArray: {
		maxLevel: 15,
		unlock: { building: 'commandCore', level: 7 },
		milestones: [
			{ level: 3, requires: [{ building: 'targetingCore', level: 3 }] },
			{
				level: 7,
				requires: [
					{ building: 'shieldGrid', level: 5 },
					{ building: 'commandCore', level: 10 }
				]
			},
			{
				level: 12,
				requires: [
					{ building: 'targetingCore', level: 10 },
					{ building: 'commandCore', level: 15 }
				]
			}
		]
	}
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
	targetingCore: 'Targeting Core',
	stealthArray: 'Stealth Array'
};

function getRequirementsForTargetLevel(building: string, targetLevel: number) {
	const rule = BUILDING_RULES[building];
	if (!rule) return [];
	const merged = new Map<string, number>();
	if (rule.unlock && targetLevel >= 1) merged.set(rule.unlock.building, rule.unlock.level);
	for (const milestone of rule.milestones) {
		if (targetLevel >= milestone.level) {
			for (const req of milestone.requires) {
				merged.set(req.building, Math.max(merged.get(req.building) || 0, req.level));
			}
		}
	}
	return Array.from(merged.entries()).map(([b, level]) => ({ building: b, level }));
}

function getMissingRequirements(
	nexus: Record<string, unknown>,
	building: string,
	targetLevel: number
) {
	return getRequirementsForTargetLevel(building, targetLevel).filter(
		({ building: b, level }) => ((nexus[b] as number) || 0) < level
	);
}

function getPlannedBuildingLevels(nexus: Record<string, unknown>) {
	const planned: Record<string, number> = {
		commandCore: nexus.commandCore as number,
		hangarBay: (nexus.hangarBay as number) || 0,
		plasmaForge: (nexus.plasmaForge as number) || 0,
		armorFoundry: (nexus.armorFoundry as number) || 0,
		lifeSupport: nexus.lifeSupport as number,
		storageVault: nexus.storageVault as number,
		biomassFarm: nexus.biomassFarm as number,
		alloyForge: nexus.alloyForge as number,
		oreExtractor: nexus.oreExtractor as number,
		shieldGrid: nexus.shieldGrid as number,
		targetingCore: (nexus.targetingCore as number) || 0,
		stealthArray: (nexus.stealthArray as number) || 0
	};
	const buildQueue = normalizeBuildQueue(nexus.buildQueue);
	for (const queued of buildQueue) {
		planned[queued.building] = Math.max(planned[queued.building] || 0, queued.targetLevel);
	}
	return planned;
}

export type AttemptUpgradeBuildingResult =
	| { ok: true; completesAt: Date; nexus: ReturnType<typeof serializeNexus> }
	| { ok: false; status: number; error: string };

/**
 * Core building-upgrade logic shared by the upgradeBuilding HTTP handler and
 * the auto-requeue background job (Nexus.ts's processCompletedQueuesAndNotify).
 * Takes an already-authorized, already-completed-queues-applied nexus row —
 * callers are responsible for ownership/galaxy checks and applyCompletedQueues,
 * exactly as the HTTP handler always did before this was extracted.
 */
export async function attemptUpgradeBuilding(
	nexus: Awaited<ReturnType<typeof applyCompletedQueues>>,
	building: string | undefined,
	userId: number,
	galaxyId: number
): Promise<AttemptUpgradeBuildingResult> {
	if (!building || !BUILDING_COSTS[building]) {
		return { ok: false, status: 400, error: 'Invalid building' };
	}
	const buildQueue = normalizeBuildQueue(nexus.buildQueue);
	const maxQueue = getMaxBuildQueue(nexus.commandCore);
	if (buildQueue.length >= maxQueue) {
		return { ok: false, status: 400, error: `Build queue is full (${maxQueue}/${maxQueue})` };
	}
	const plannedLevels = getPlannedBuildingLevels(nexus as unknown as Record<string, unknown>);
	const currentLevel =
		plannedLevels[building] ??
		((nexus as unknown as Record<string, unknown>)[building] as number) ??
		0;
	const targetLevel = currentLevel + 1;
	const rule = BUILDING_RULES[building];
	if (rule && currentLevel >= rule.maxLevel) {
		return {
			ok: false,
			status: 400,
			error: `${BUILDING_NAMES[building]} is already at max level (${rule.maxLevel})`
		};
	}
	const missing = getMissingRequirements(
		nexus as unknown as Record<string, unknown>,
		building,
		targetLevel
	);
	if (missing.length > 0) {
		const text = missing
			.map(({ building: b, level }) => `${BUILDING_NAMES[b] || b} level ${level}`)
			.join(', ');
		return { ok: false, status: 400, error: `Requirements not met: ${text}` };
	}
	const [galaxy, boostPct, userForBuild] = await Promise.all([
		prisma.galaxy.findUnique({ where: { id: galaxyId }, select: { speedMultiplier: true } }),
		getActiveProductionBoostPct(userId, galaxyId),
		prisma.user.findUnique({
			where: { id: userId },
			select: { beginnerTipsEnabled: true, onboardingStep: true, createdAt: true }
		})
	]);
	const speedMultiplier = galaxy?.speedMultiplier ?? 1.0;
	const resourceUpdate = computeResourceUpdate(nexus, undefined, speedMultiplier, boostPct);
	const current = { ...nexus, ...resourceUpdate };
	const cost = getBuildingCost(building, currentLevel);
	if (
		(current as unknown as Record<string, number>).biomass < cost.biomass ||
		(current as unknown as Record<string, number>).alloy < cost.alloy ||
		(current as unknown as Record<string, number>).ore < cost.ore
	) {
		return { ok: false, status: 400, error: 'Insufficient resources' };
	}
	const queueStart =
		buildQueue.length > 0
			? new Date(buildQueue[buildQueue.length - 1].completesAt as string).getTime()
			: Date.now();
	const buildDoubled =
		(nexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
	const onboardingBuild = isOnboardingBuildEligible(
		building,
		currentLevel,
		userForBuild?.beginnerTipsEnabled ?? false,
		userForBuild?.onboardingStep ?? null
	);
	const onboardingBuildTaper = onboardingBuild
		? getOnboardingTaperFraction(userForBuild?.createdAt)
		: 0;
	const fullBuildSeconds = getEffectiveBuildTimeSeconds(
		building,
		currentLevel,
		nexus.commandCore,
		nexus.nexusType,
		buildDoubled
	);
	const buildSeconds =
		onboardingBuildTaper > 0
			? ONBOARDING_BUILD_TIME_SECONDS +
				(fullBuildSeconds - ONBOARDING_BUILD_TIME_SECONDS) * (1 - onboardingBuildTaper)
			: fullBuildSeconds;
	const completesAt = new Date(queueStart + (buildSeconds * 1000) / speedMultiplier);
	const newQueue = [...buildQueue, { building, targetLevel: currentLevel + 1, completesAt }];
	let updated;
	try {
		updated = await atomicUpdateNexusResources(nexus.id, nexus.lastResourceUpdate, {
			...resourceUpdate,
			biomass: (current as unknown as Record<string, number>).biomass - cost.biomass,
			alloy: (current as unknown as Record<string, number>).alloy - cost.alloy,
			ore: (current as unknown as Record<string, number>).ore - cost.ore,
			buildQueue: queueToJson(newQueue)
		});
	} catch (e) {
		if (e instanceof ResourceConflictError) {
			return { ok: false, status: 409, error: 'Resources updated simultaneously - please retry' };
		}
		throw e;
	}
	const rewardApplied = await applyQuestRewards(updated);
	try {
		notifyNexusResources(userId, {
			nexusId: rewardApplied.id,
			base: {
				biomass: rewardApplied.biomass,
				alloy: rewardApplied.alloy,
				ore: rewardApplied.ore
			},
			production: getResourceProduction(rewardApplied),
			storageMax: getMaxStorage(rewardApplied),
			lastResourceUpdate: rewardApplied.lastResourceUpdate
		});
	} catch (emitErr) {
		logError('nexus_resources_emit_failed', {
			message: (emitErr as Error).message,
			file: 'buildingController.ts'
		});
	}
	try {
		const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
		void (async () => {
			await incrementQuestProgress(userId, galaxyId, 'upgrade_1', 1);
			await incrementQuestProgress(userId, galaxyId, 'upgrade_2', 1);
		})();
	} catch {}
	// True funnel milestone: fired at most once per user, the first time they
	// ever queue a build (logGameEventOnce dedups on userId+event). The old
	// "queue was empty" guard fired on every later build too.
	logGameEventOnce('first_build', userId, galaxyId, { building, nexusId: nexus.id });
	return { ok: true, completesAt, nexus: serializeNexus(rewardApplied) };
}

export async function upgradeBuilding(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, building } = req.body as { nexusId?: unknown; building?: string };
		const rawNexus = await buildingService.getNexusById(parseInt(String(nexusId)));
		if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const nexus = await applyCompletedQueues(rawNexus);

		const result = await attemptUpgradeBuilding(nexus, building, req.userId!, req.galaxyId!);
		if (!result.ok) {
			res.status(result.status).json({ error: result.error });
			return;
		}
		res.json({ success: true, completesAt: result.completesAt, nexus: result.nexus });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'buildingController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function cancelBuildQueue(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, index } = req.body as { nexusId?: unknown; index?: unknown };
		const parsedIndex = parseInt(String(index), 10);
		const nexus = await buildingService.getNexusById(parseInt(String(nexusId)));
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const buildQueue = normalizeBuildQueue(nexus.buildQueue);
		if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= buildQueue.length) {
			res.status(400).json({ error: 'Invalid queue index' });
			return;
		}
		const item = buildQueue[parsedIndex];
		const cost = getBuildingCost(item.building, item.targetLevel - 1);
		const refund = {
			biomass: Math.floor(cost.biomass * 0.85),
			alloy: Math.floor(cost.alloy * 0.85),
			ore: Math.floor(cost.ore * 0.85)
		};
		const itemCompletesAt = new Date(item.completesAt as string).getTime();
		const newQueue = buildQueue.filter((_, i) => i !== parsedIndex);
		if (parsedIndex === 0 && newQueue.length > 0) {
			const remaining = Math.max(0, itemCompletesAt - Date.now());
			for (let i = 0; i < newQueue.length; i++) {
				const oldAt = new Date(newQueue[i].completesAt as string).getTime();
				newQueue[i] = { ...newQueue[i], completesAt: new Date(oldAt - remaining) };
			}
		} else if (parsedIndex > 0) {
			const prevAt = new Date(buildQueue[parsedIndex - 1].completesAt as string).getTime();
			const duration = itemCompletesAt - prevAt;
			for (let i = parsedIndex; i < newQueue.length; i++) {
				const oldAt = new Date(newQueue[i].completesAt as string).getTime();
				newQueue[i] = { ...newQueue[i], completesAt: new Date(oldAt - duration) };
			}
		}
		const [galaxyForCancel, cancelBoostPct] = await Promise.all([
			prisma.galaxy.findUnique({ where: { id: req.galaxyId! }, select: { speedMultiplier: true } }),
			getActiveProductionBoostPct(req.userId!, req.galaxyId!)
		]);
		const resourceUpdate = computeResourceUpdate(nexus, undefined, galaxyForCancel?.speedMultiplier ?? 1.0, cancelBoostPct);
		const current = { ...nexus, ...resourceUpdate } as unknown as Record<string, number>;
		let updated;
		try {
			updated = await atomicUpdateNexusResources(nexus.id, nexus.lastResourceUpdate, {
				...resourceUpdate,
				biomass: current.biomass + refund.biomass,
				alloy: current.alloy + refund.alloy,
				ore: current.ore + refund.ore,
				buildQueue: queueToJson(newQueue)
			});
		} catch (e) {
			if (e instanceof ResourceConflictError) {
				res.status(409).json({ error: 'Resources updated simultaneously - please retry' });
				return;
			}
			throw e;
		}
		try {
			notifyNexusResources(req.userId!, {
				nexusId: updated.id,
				base: { biomass: updated.biomass, alloy: updated.alloy, ore: updated.ore },
				production: getResourceProduction(updated),
				storageMax: getMaxStorage(updated),
				lastResourceUpdate: updated.lastResourceUpdate
			});
		} catch (emitErr) {
			logError('nexus_resources_emit_failed', {
				message: (emitErr as Error).message,
				file: 'buildingController.ts',
				op: 'cancelBuildQueue'
			});
		}
		res.json({ success: true, refund, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'buildingController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function checkBuildQueue(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId } = req.body as { nexusId?: unknown };
		const nexus = await buildingService.getNexusById(parseInt(String(nexusId)));
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const now = new Date();
		const buildQueue = normalizeBuildQueue(nexus.buildQueue);
		let completed = false;
		const data: Record<string, unknown> = {};
		while (buildQueue.length > 0 && new Date(buildQueue[0].completesAt as string) <= now) {
			const build = buildQueue.shift()!;
			data[build.building] = build.targetLevel;
			completed = true;
			if (build.building === 'lifeSupport') {
				data.populationMax = getPopulationMax(build.targetLevel);
			}
		}
		data.buildQueue = queueToJson(buildQueue);
		const [galaxyForClaim, claimBoostPct] = await Promise.all([
			prisma.galaxy.findUnique({ where: { id: req.galaxyId! }, select: { speedMultiplier: true } }),
			getActiveProductionBoostPct(req.userId!, req.galaxyId!)
		]);
		const resourceUpdate = computeResourceUpdate(nexus, undefined, galaxyForClaim?.speedMultiplier ?? 1.0, claimBoostPct);
		const updated = await buildingService.updateNexus(nexus.id, { ...resourceUpdate, ...data });
		const rewardApplied = await applyQuestRewards(updated);
		try {
			notifyNexusResources(req.userId!, {
				nexusId: rewardApplied.id,
				base: {
					biomass: rewardApplied.biomass,
					alloy: rewardApplied.alloy,
					ore: rewardApplied.ore
				},
				production: getResourceProduction(rewardApplied),
				storageMax: getMaxStorage(rewardApplied),
				lastResourceUpdate: rewardApplied.lastResourceUpdate
			});
		} catch (emitErr) {
			logError('nexus_resources_emit_failed', {
				message: (emitErr as Error).message,
				file: 'buildingController.ts',
				op: 'checkBuildQueue'
			});
		}
		res.json({ completed, nexus: serializeNexus(rewardApplied) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'buildingController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
