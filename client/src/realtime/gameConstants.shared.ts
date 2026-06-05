// Single source of truth for building / troop costs and time math.
// Mirrored verbatim in server/utils/gameConstants.ts - same convention as
// economy.ts / economy.shared.ts. If you change a number or formula here,
// change it in the server mirror in the same commit.

export interface BuildingCost {
	biomass: number;
	alloy: number;
	ore: number;
	time: number;
}

export const BUILDING_COSTS: Record<string, BuildingCost> = {
	commandCore: { biomass: 90, alloy: 80, ore: 70, time: 120 },
	hangarBay: { biomass: 180, alloy: 150, ore: 80, time: 180 },
	plasmaForge: { biomass: 180, alloy: 150, ore: 80, time: 180 },
	armorFoundry: { biomass: 180, alloy: 150, ore: 80, time: 180 },
	lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 150 },
	storageVault: { biomass: 60, alloy: 50, ore: 70, time: 120 },
	biomassFarm: { biomass: 50, alloy: 60, ore: 60, time: 120 },
	alloyForge: { biomass: 65, alloy: 40, ore: 60, time: 120 },
	oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 150 },
	shieldGrid: { biomass: 50, alloy: 100, ore: 60, time: 180 },
	targetingCore: { biomass: 120, alloy: 180, ore: 140, time: 210 },
	stealthArray: { biomass: 100, alloy: 150, ore: 180, time: 210 }
};

export interface TroopCost {
	biomass: number;
	alloy: number;
	ore: number;
	population: number;
	time: number;
}

// v0.22 economy overhaul: STRIKER resource costs re-tuned to rising tier bands;
// Siege Colossus pop 5→4. ANVILS unchanged (their re-pricing was DROPPED — it
// moved COMBAT_BALANCE §2.1 ratios; §8.1). MUST match server gameConstants.ts.
// Full rationale: server/ECONOMY_BALANCE.md §3.4 / §3.6 / §8.
export const TROOP_COSTS: Record<string, TroopCost> = {
	sentinelLancer: { biomass: 200, alloy: 200, ore: 250, population: 1, time: 53 },
	assaultTrooper: { biomass: 150, alloy: 150, ore: 350, population: 1, time: 79 },
	vanguardBreaker: { biomass: 250, alloy: 150, ore: 300, population: 1, time: 160 },
	reconOperative: { biomass: 400, alloy: 150, ore: 400, population: 1, time: 180 },
	pyreSuppressor: { biomass: 520, alloy: 460, ore: 520, population: 2, time: 540 },
	wraithSkimmer: { biomass: 650, alloy: 520, ore: 780, population: 3, time: 720 },
	bulwarkGuard: { biomass: 400, alloy: 600, ore: 500, population: 2, time: 720 },
	aegisSkirmisher: { biomass: 500, alloy: 550, ore: 450, population: 2, time: 720 },
	arcDisruptor: { biomass: 550, alloy: 750, ore: 650, population: 2, time: 840 },
	phantomLance: { biomass: 780, alloy: 630, ore: 940, population: 3, time: 1080 },
	voidStalker: { biomass: 1120, alloy: 910, ore: 1420, population: 3, time: 1620 },
	siegeMech: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: 1800 },
	plasmaTurret: { biomass: 1500, alloy: 1200, ore: 2500, population: 3, time: 2700 },
	annihilatorPlatform: { biomass: 1900, alloy: 1660, ore: 2840, population: 4, time: 2400 },
	siegeColossus: { biomass: 1550, alloy: 1890, ore: 2760, population: 4, time: 3000 },
	overseer: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 }
};

export const COST_SCALING = { early: 1.5, mid: 1.65, late: 1.8 };
export const TIME_SCALING = { early: 1.25, mid: 1.35, late: 1.45 };
const LIFE_SUPPORT_OLD_MAX_LEVEL = 20;
const LIFE_SUPPORT_MAX_LEVEL = 25;

export const COMMAND_BUILD_TIME_FACTOR_PER_LEVEL = 0.95;
// -9%/level through L15, then -5%/level for L16-20. Applied per class building
// (Hangar Bay / Plasma Forge / Armor Foundry) to its own units only.
export const CLASS_BUILDING_TRAIN_TIME_FACTOR_PER_LEVEL = 0.91;
const CLASS_BUILDING_TRAIN_FACTOR_LATE = 0.95;
const CLASS_BUILDING_TRAIN_FACTOR_BREAKPOINT = 15;

export function getClassBuildingTrainFactor(classBuildingLevel: number): number {
	const lvl = Math.max(0, classBuildingLevel || 0);
	const earlyLevels = Math.min(lvl, CLASS_BUILDING_TRAIN_FACTOR_BREAKPOINT);
	const lateLevels = Math.max(0, lvl - CLASS_BUILDING_TRAIN_FACTOR_BREAKPOINT);
	return (
		Math.pow(CLASS_BUILDING_TRAIN_TIME_FACTOR_PER_LEVEL, earlyLevels) *
		Math.pow(CLASS_BUILDING_TRAIN_FACTOR_LATE, lateLevels)
	);
}

// Mirror of server/utils/gameConstants.ts TROOP_TRAINING_BUILDING. Mobile/fire/
// armor classes map to their class building; specials (recon, overseer) train
// from Command Core. Both halves must move together when units are added.
const TROOP_TRAINING_BUILDING: Record<string, string> = {
	sentinelLancer: 'plasmaForge',
	assaultTrooper: 'armorFoundry',
	vanguardBreaker: 'hangarBay',
	reconOperative: 'commandCore',
	wraithSkimmer: 'hangarBay',
	bulwarkGuard: 'armorFoundry',
	aegisSkirmisher: 'hangarBay',
	pyreSuppressor: 'plasmaForge',
	arcDisruptor: 'plasmaForge',
	phantomLance: 'hangarBay',
	siegeMech: 'armorFoundry',
	annihilatorPlatform: 'plasmaForge',
	voidStalker: 'hangarBay',
	plasmaTurret: 'plasmaForge',
	siegeColossus: 'armorFoundry',
	overseer: 'commandCore'
};

export function trainingBuildingFor(troopType: string): string {
	return TROOP_TRAINING_BUILDING[troopType] ?? 'commandCore';
}

// Hard cap on units trained per single train request. Mirror of
// server/utils/gameConstants.ts; the train input clamps "max trainable" to this.
export const MAX_TRAIN_PER_BATCH = 1000;

// Veteran tier (CC 16-20) grants extra queue slots. CC 16/17 each add +1
// build slot; CC 18/19 each add +1 training slot. Mirror of
// server/utils/gameConstants.ts.
export const COMMAND_VETERAN_THRESHOLD = 15;

export function getCommandTimeFactor(commandLevel: number): number {
	return Math.pow(COMMAND_BUILD_TIME_FACTOR_PER_LEVEL, Math.max(0, commandLevel || 0));
}

export function getCommandBuildQueueBonus(commandLevel: number): number {
	const veteran = Math.max(0, (commandLevel || 0) - COMMAND_VETERAN_THRESHOLD);
	return Math.min(2, veteran);
}

export function getCommandTrainingQueueBonus(commandLevel: number): number {
	const veteran = Math.max(0, (commandLevel || 0) - COMMAND_VETERAN_THRESHOLD);
	return Math.max(0, Math.min(2, veteran - 2));
}

// ── Class-based training chains (CC15 veteran unlock) ───────────────────────
// Mirror of server/utils/gameConstants.ts. See that file for the full rationale.
// Training runs as concurrent chains; at CC15 the single `combat` chain splits
// into the mobile/armor/fire counter classes. Purely additive for veterans.
export type TrainingChain = 'mobile' | 'armor' | 'fire' | 'special' | 'combat';

export type TroopCombatClass = 'mobile' | 'armor' | 'fire' | 'special';
export const TROOP_COMBAT_CLASS: Record<string, TroopCombatClass> = {
	sentinelLancer: 'fire',
	assaultTrooper: 'armor',
	vanguardBreaker: 'mobile',
	reconOperative: 'special',
	wraithSkimmer: 'mobile',
	bulwarkGuard: 'armor',
	aegisSkirmisher: 'mobile',
	pyreSuppressor: 'fire',
	arcDisruptor: 'fire',
	phantomLance: 'mobile',
	siegeMech: 'armor',
	annihilatorPlatform: 'fire',
	voidStalker: 'mobile',
	plasmaTurret: 'fire',
	siegeColossus: 'armor',
	overseer: 'special'
};

export const PRE_VETERAN_QUEUE_BASE = 5;
export const VETERAN_CHAIN_QUEUE_BASE = 2;

export function getTrainingChains(commandLevel: number): TrainingChain[] {
	return (commandLevel || 0) >= COMMAND_VETERAN_THRESHOLD
		? ['mobile', 'armor', 'fire', 'special']
		: ['combat', 'special'];
}

export function trainingChainFor(troopType: string, commandLevel: number): TrainingChain {
	const cls = TROOP_COMBAT_CLASS[troopType] ?? 'special';
	if (cls === 'special') return 'special';
	return (commandLevel || 0) >= COMMAND_VETERAN_THRESHOLD ? cls : 'combat';
}

export function getMaxTrainingQueueSlots(commandLevel: number): number {
	const base =
		(commandLevel || 0) >= COMMAND_VETERAN_THRESHOLD
			? VETERAN_CHAIN_QUEUE_BASE
			: PRE_VETERAN_QUEUE_BASE;
	return base + getCommandTrainingQueueBonus(commandLevel);
}

function getLifeSupportCostCurveLevel(targetLevel: number): number {
	return (
		1 +
		((Math.max(1, targetLevel) - 1) * (LIFE_SUPPORT_OLD_MAX_LEVEL - 1)) /
			(LIFE_SUPPORT_MAX_LEVEL - 1)
	);
}

function getTieredMultiplier(
	level: number,
	scaling: { early: number; mid: number; late: number }
): number {
	const earlyLevels = Math.min(Math.max(level - 1, 0), 4);
	const midLevels = Math.min(Math.max(level - 5, 0), 5);
	const lateLevels = Math.max(level - 10, 0);
	return (
		Math.pow(scaling.early, earlyLevels) *
		Math.pow(scaling.mid, midLevels) *
		Math.pow(scaling.late, lateLevels)
	);
}

export function getBuildingCost(building: string, currentLevel: number): BuildingCost {
	const base = BUILDING_COSTS[building];
	const targetLevel = currentLevel + 1;
	let { biomass, alloy, ore, time } = base;
	if (building === 'lifeSupport') {
		const costCurveLevel = getLifeSupportCostCurveLevel(targetLevel);
		const costMultiplier = getTieredMultiplier(costCurveLevel, COST_SCALING);
		const timeMultiplier = getTieredMultiplier(costCurveLevel, TIME_SCALING);
		return {
			biomass: Math.floor(biomass * costMultiplier),
			alloy: Math.floor(alloy * costMultiplier),
			ore: Math.floor(ore * costMultiplier),
			time: Math.floor(time * timeMultiplier)
		};
	}
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

// Overseer cost scales with owned nexuses, then caps at 4x from 12+.
export const OVERSEER_COST_SCALE_THRESHOLD = 3;
export const OVERSEER_COST_SCALE_CAP_NEXUSES = 12;
export const OVERSEER_COST_MAX_MULTIPLIER = 4;

export function getOverseerCostMultiplier(nexusCount: number): number {
	const count = Math.max(0, nexusCount || 0);
	if (count <= OVERSEER_COST_SCALE_THRESHOLD) return 1;
	const span = OVERSEER_COST_SCALE_CAP_NEXUSES - OVERSEER_COST_SCALE_THRESHOLD;
	const progress = Math.min(1, (count - OVERSEER_COST_SCALE_THRESHOLD) / span);
	return 1 + (OVERSEER_COST_MAX_MULTIPLIER - 1) * progress;
}

export function getOverseerCost(nexusCount: number): {
	biomass: number;
	alloy: number;
	ore: number;
} {
	const base = TROOP_COSTS.overseer;
	const multiplier = getOverseerCostMultiplier(nexusCount);
	return {
		biomass: Math.floor(base.biomass * multiplier),
		alloy: Math.floor(base.alloy * multiplier),
		ore: Math.floor(base.ore * multiplier)
	};
}

export function getTrainTimeSeconds(troopType: string, classBuildingLevel: number): number {
	const baseTime = TROOP_COSTS[troopType].time;
	if (troopType === 'overseer' || troopType === 'reconOperative') return baseTime;
	const factor = getClassBuildingTrainFactor(classBuildingLevel);
	return Math.max(1, Math.floor(baseTime * factor));
}

export function getEffectiveTrainTimeSeconds(
	troopType: string,
	classBuildingLevel: number,
	nexusType: string | null | undefined,
	nexusTypeDoubled: boolean
): number {
	const perUnit = getTrainTimeSeconds(troopType, classBuildingLevel);
	if (troopType === 'overseer') return perUnit;
	const baseTrainMult = NEXUS_TYPE_TRAINING_MULTIPLIERS[nexusType ?? ''];
	if (baseTrainMult === undefined) return perUnit;
	const effective = nexusTypeDoubled ? Math.pow(baseTrainMult, 2) : baseTrainMult;
	return Math.max(1, Math.floor(perUnit * effective));
}

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

export const NEXUS_TYPE_TRAINING_MULTIPLIERS: Record<string, number> = {
	'Military Outpost': 0.5
};

export const NEXUS_TYPE_BUILD_TIME_MULTIPLIERS: Record<string, number> = {
	'Forward Base': 0.8
};

// ── Stealth Array (defensive concealment) ───────────────────────────────────
// Mirror of server/utils/gameConstants.ts. Stealth Array gives 1) a low %
// chance scouts fail outright (1.5%/level, cap 22.5% at Lv15) and 2) a hidden
// vault that protects the first N units of each resource from raids and
// scout reports. Curve floor(550 * 1.35^L) lands ~49k per resource at Lv15
// (~1% of the 5M storage cap).
export const STEALTH_SCOUT_FAIL_PER_LEVEL = 0.015;
export const STEALTH_SCOUT_FAIL_CAP = 0.225;
export const STEALTH_VAULT_BASE = 550;
export const STEALTH_VAULT_GROWTH = 1.35;

export function getStealthScoutFailChance(stealthArrayLevel: number): number {
	const lvl = Math.max(0, stealthArrayLevel || 0);
	return Math.min(STEALTH_SCOUT_FAIL_CAP, lvl * STEALTH_SCOUT_FAIL_PER_LEVEL);
}

export function getStealthVaultPerResource(stealthArrayLevel: number): number {
	const lvl = Math.max(0, stealthArrayLevel || 0);
	if (lvl <= 0) return 0;
	return Math.floor(STEALTH_VAULT_BASE * Math.pow(STEALTH_VAULT_GROWTH, lvl));
}

export function partitionStealthVault(
	stockpile: number,
	stealthArrayLevel: number
): { visible: number; hidden: number } {
	const total = Math.max(0, Math.floor(stockpile || 0));
	const cap = getStealthVaultPerResource(stealthArrayLevel);
	const hidden = Math.min(total, cap);
	return { visible: total - hidden, hidden };
}
