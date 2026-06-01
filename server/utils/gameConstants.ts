// Single source of truth for building / troop costs and time math.
// Mirrored verbatim in client/src/realtime/gameConstants.shared.ts -
// same convention as economy.ts / economy.shared.ts. If you change a
// number or formula here, change it in the client mirror in the same commit.

export interface BuildingCost {
	biomass: number;
	alloy: number;
	ore: number;
	time: number;
}

export const BUILDING_COSTS: Record<string, BuildingCost> = {
	commandCore: { biomass: 90, alloy: 80, ore: 70, time: 120 },
	recruitmentCore: { biomass: 180, alloy: 150, ore: 80, time: 180 },
	lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 150 },
	storageVault: { biomass: 60, alloy: 50, ore: 70, time: 120 },
	biomassFarm: { biomass: 50, alloy: 60, ore: 60, time: 120 },
	alloyForge: { biomass: 65, alloy: 40, ore: 60, time: 120 },
	oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 150 },
	shieldGrid: { biomass: 50, alloy: 100, ore: 60, time: 180 },
	armory: { biomass: 120, alloy: 180, ore: 140, time: 210 },
	stealthArray: { biomass: 100, alloy: 150, ore: 180, time: 210 }
};

export interface TroopCost {
	biomass: number;
	alloy: number;
	ore: number;
	population: number;
	time: number;
}

export const TROOP_COSTS: Record<string, TroopCost> = {
	lancerDrone: { biomass: 150, alloy: 150, ore: 200, population: 1, time: 53 },
	assaultTrooper: { biomass: 150, alloy: 150, ore: 350, population: 1, time: 79 },
	breakerUnit: { biomass: 250, alloy: 150, ore: 300, population: 1, time: 160 },
	reconOperative: { biomass: 400, alloy: 150, ore: 400, population: 1, time: 180 },
	suppressorTeam: { biomass: 450, alloy: 400, ore: 450, population: 2, time: 540 },
	skimmerBike: { biomass: 625, alloy: 500, ore: 750, population: 3, time: 720 },
	bulwarkGuard: { biomass: 400, alloy: 600, ore: 500, population: 2, time: 720 },
	disruptorUnit: { biomass: 550, alloy: 750, ore: 650, population: 2, time: 840 },
	interceptorBike: { biomass: 750, alloy: 600, ore: 900, population: 3, time: 1080 },
	voidStalker: { biomass: 900, alloy: 700, ore: 1100, population: 3, time: 1440 },
	siegeMech: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: 2400 },
	plasmaTurret: { biomass: 1500, alloy: 1200, ore: 2500, population: 2, time: 3000 },
	annihilatorPlatform: { biomass: 2000, alloy: 1750, ore: 3000, population: 5, time: 4080 },
	overseer: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 }
};

// Building cost / time scaling per upgrade tier
export const COST_SCALING = { early: 1.5, mid: 1.65, late: 1.8 };
export const TIME_SCALING = { early: 1.25, mid: 1.35, late: 1.45 };

// Command Core reduces build time 5% per level (compounding)
export const COMMAND_BUILD_TIME_FACTOR_PER_LEVEL = 0.95;

// Recruitment Core reduces train time 9% per level (compounding). Overseer is exempt.
export const RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL = 0.91;

// Veteran tier (CC 16-20) grants extra queue slots instead of any combat or
// economy bonus - pure quality-of-life so late-game CC actually pays rent.
// CC 16 / 17 each add +1 build queue slot (5 -> 7). CC 18 / 19 each add +1
// training queue slot (5 -> 7). CC 20 is the cap and grants nothing extra
// beyond the standard 5%-per-level build-time discount it already gives.
export const COMMAND_VETERAN_THRESHOLD = 15;

export function getCommandTimeFactor(commandLevel: number): number {
	return Math.pow(COMMAND_BUILD_TIME_FACTOR_PER_LEVEL, Math.max(0, commandLevel || 0));
}

// Extra build queue slots from the Veteran tier: +1 at CC 16, +1 at CC 17.
// Capped at +2 so CC 18-20 don't keep stacking.
export function getCommandBuildQueueBonus(commandLevel: number): number {
	const veteran = Math.max(0, (commandLevel || 0) - COMMAND_VETERAN_THRESHOLD);
	return Math.min(2, veteran);
}

// Extra training queue slots from the Veteran tier: +1 at CC 18, +1 at CC 19.
// CC 17 still gives 0 (build slots only); CC 20 stays at +2 (cap).
export function getCommandTrainingQueueBonus(commandLevel: number): number {
	const veteran = Math.max(0, (commandLevel || 0) - COMMAND_VETERAN_THRESHOLD);
	return Math.max(0, Math.min(2, veteran - 2));
}

// Effective per-tier multiplier when a building cost is computed from level 1 → targetLevel.
// Levels 2-5 use early, 6-10 mid, 11+ late. Cost and time use their respective tables.
export function getBuildingCost(building: string, currentLevel: number): BuildingCost {
	const base = BUILDING_COSTS[building];
	const targetLevel = currentLevel + 1;
	let { biomass, alloy, ore, time } = base;
	for (let level = 2; level <= targetLevel; level += 1) {
		const cm = level <= 5 ? COST_SCALING.early : level <= 10 ? COST_SCALING.mid : COST_SCALING.late;
		const tm = level <= 5 ? TIME_SCALING.early : level <= 10 ? TIME_SCALING.mid : TIME_SCALING.late;
		biomass *= cm;
		alloy *= cm;
		ore *= cm;
		time *= tm;
	}
	return {
		biomass: Math.floor(biomass),
		alloy: Math.floor(alloy),
		ore: Math.floor(ore),
		time: Math.floor(time)
	};
}

// Overseer cost scales 1.5x per nexus owned beyond 3.
// The first 3 nexuses use the base cost from TROOP_COSTS.
export const OVERSEER_COST_SCALE_THRESHOLD = 3;
export const OVERSEER_COST_SCALE_PER_EXTRA = 1.5;

export function getOverseerCost(nexusCount: number): {
	biomass: number;
	alloy: number;
	ore: number;
} {
	const base = TROOP_COSTS.overseer;
	const extra = Math.max(0, nexusCount - OVERSEER_COST_SCALE_THRESHOLD);
	const multiplier = extra > 0 ? Math.pow(OVERSEER_COST_SCALE_PER_EXTRA, extra) : 1;
	return {
		biomass: Math.floor(base.biomass * multiplier),
		alloy: Math.floor(base.alloy * multiplier),
		ore: Math.floor(base.ore * multiplier)
	};
}

// Per-unit train time in seconds, before the Nexus-type training multiplier.
// Overseer trains at base time regardless of Recruitment Core.
export function getTrainTimeSeconds(troopType: string, recruitmentLevel: number): number {
	const baseTime = TROOP_COSTS[troopType].time;
	if (troopType === 'overseer') return baseTime;
	const factor = Math.pow(
		RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL,
		Math.max(0, recruitmentLevel || 0)
	);
	return Math.max(1, Math.floor(baseTime * factor));
}

// Applies the Nexus-type training multiplier (Military Outpost = 0.5x base / 0.25x doubled),
// preserving the existing rule that overseer is exempt from type bonuses.
export function getEffectiveTrainTimeSeconds(
	troopType: string,
	recruitmentLevel: number,
	nexusType: string | null | undefined,
	nexusTypeDoubled: boolean
): number {
	const perUnit = getTrainTimeSeconds(troopType, recruitmentLevel);
	if (troopType === 'overseer') return perUnit;
	const baseTrainMult = NEXUS_TYPE_TRAINING_MULTIPLIERS[nexusType ?? ''];
	if (baseTrainMult === undefined) return perUnit;
	const effective = nexusTypeDoubled ? Math.pow(baseTrainMult, 2) : baseTrainMult;
	return Math.max(1, Math.floor(perUnit * effective));
}

// Applies the Nexus-type build multiplier (Forward Base = 0.8x base / 0.64x doubled)
// on top of the level-scaled build cost and Command Core discount.
export function getEffectiveBuildTimeSeconds(
	building: string,
	currentLevel: number,
	commandCoreLevel: number,
	nexusType: string | null | undefined,
	nexusTypeDoubled: boolean
): number {
	const cost = getBuildingCost(building, currentLevel);
	const baseBuildMult = NEXUS_TYPE_BUILD_TIME_MULTIPLIERS[nexusType ?? ''];
	const nexusFactor =
		baseBuildMult === undefined ? 1 : nexusTypeDoubled ? Math.pow(baseBuildMult, 2) : baseBuildMult;
	return Math.max(1, Math.floor(cost.time * getCommandTimeFactor(commandCoreLevel) * nexusFactor));
}

// Nexus-type time multipliers (kept here so client and server stay in lockstep).
// These mirror NEXUS_TYPE_BONUSES in economy.ts but are pulled out as plain
// numeric maps so the time helpers can be called without importing the bonuses table.
export const NEXUS_TYPE_TRAINING_MULTIPLIERS: Record<string, number> = {
	'Military Outpost': 0.5
};

export const NEXUS_TYPE_BUILD_TIME_MULTIPLIERS: Record<string, number> = {
	'Forward Base': 0.8
};
