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
	// Three class-specific production buildings share the same cost / curve so
	// no class is privileged at build time; differentiation comes from WHAT they
	// train (TROOP_REQUIREMENTS in troopController.ts) and from each one
	// reducing train time for its own class only (getTrainTimeSeconds below).
	hangarBay: { biomass: 180, alloy: 150, ore: 80, time: 180 },
	plasmaForge: { biomass: 180, alloy: 150, ore: 80, time: 180 },
	armorFoundry: { biomass: 180, alloy: 150, ore: 80, time: 180 },
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
	voidStalker: { biomass: 1100, alloy: 900, ore: 1400, population: 3, time: 1620 },
	siegeMech: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: 1800 },
	plasmaTurret: { biomass: 1500, alloy: 1200, ore: 2500, population: 3, time: 2700 },
	annihilatorPlatform: { biomass: 2000, alloy: 1750, ore: 3000, population: 4, time: 2400 },
	overseer: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 }
};

// Building cost / time scaling per upgrade tier
export const COST_SCALING = { early: 1.5, mid: 1.65, late: 1.8 };
export const TIME_SCALING = { early: 1.25, mid: 1.35, late: 1.45 };
const LIFE_SUPPORT_OLD_MAX_LEVEL = 20;
const LIFE_SUPPORT_MAX_LEVEL = 25;

// Command Core reduces build time 5% per level (compounding)
export const COMMAND_BUILD_TIME_FACTOR_PER_LEVEL = 0.95;

// Each class building (Hangar Bay / Plasma Forge / Armor Foundry) reduces
// train time for its own class. Same curve that the retired Recruitment Core
// used to apply globally: -9%/level through L15, then flattens to -5%/level for
// 16-20. Without the flatten, a maxed L20 would train ~6.6x faster and L25
// ~10.6x - that compounding undercuts the v0.19 anti-snowball training-queue
// limits for top players. The flattened tail keeps the bonus a meaningful but
// bounded late-game reward (L20 ~5.3x). Levels are capped by the building's
// maxLevel (20). Overseer and Recon Operative (the two `special` units) train
// at base time; they're produced from Command Core and don't follow the
// per-class production model.
export const CLASS_BUILDING_TRAIN_TIME_FACTOR_PER_LEVEL = 0.91;
const CLASS_BUILDING_TRAIN_FACTOR_LATE = 0.95;
const CLASS_BUILDING_TRAIN_FACTOR_BREAKPOINT = 15;

// Compound train-time multiplier from a class building level: 0.91^min(L,15) *
// 0.95^max(0,L-15). Continuous at L15. Lower = faster.
export function getClassBuildingTrainFactor(classBuildingLevel: number): number {
	const lvl = Math.max(0, classBuildingLevel || 0);
	const earlyLevels = Math.min(lvl, CLASS_BUILDING_TRAIN_FACTOR_BREAKPOINT);
	const lateLevels = Math.max(0, lvl - CLASS_BUILDING_TRAIN_FACTOR_BREAKPOINT);
	return (
		Math.pow(CLASS_BUILDING_TRAIN_TIME_FACTOR_PER_LEVEL, earlyLevels) *
		Math.pow(CLASS_BUILDING_TRAIN_FACTOR_LATE, lateLevels)
	);
}

// Hard cap on units trained in a single train request (one queue entry). The
// client must clamp its "max trainable" to this so the input never offers a
// value the server will reject. Mirrored in client/realtime/gameConstants.shared.ts.
export const MAX_TRAIN_PER_BATCH = 1000;

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

// ── Class-based training chains (CC15 veteran unlock) ───────────────────────
// Training runs as several independent, concurrent chains. Each chain has its
// own slot budget and its own timeline, so a nexus can train (say) a mobile and
// an armor batch at the same time instead of serially.
//
// Below CC15 there are just two chains - `combat` (every fighting unit) and
// `special` (recon + overseer) - which is exactly the legacy {regular, overseer}
// behaviour, unchanged. At CC15 (COMMAND_VETERAN_THRESHOLD) the combat chain
// splits into the three counter classes (mobile / armor / fire). This is purely
// additive: sub-veterans keep their old single combat chain and their old slot
// count; veterans gain parallelism, not a nerf.
//
// `special` mirrors TROOP_CLASS in combatMath.ts (recon + overseer are the only
// non-combat units). Kept as a local map so this constants module stays
// dependency-free; if a troop's class changes there, change its chain here.
export type TrainingChain = 'mobile' | 'armor' | 'fire' | 'special' | 'combat';

// Per-chain slot budget BEFORE the CC18/19 bonus.
//   - Pre-veteran (CC<15): 5, unchanged from the historical single-queue base.
//   - Veteran (CC>=15): 2 per chain. Deliberately tight: parallel chains are a
//     capability win (produce a balanced army in one pass) without becoming an
//     army-regeneration-speed win (which would feed snowballing). This is the
//     single knob to loosen if veterans feel too slot-starved.
export const PRE_VETERAN_QUEUE_BASE = 5;
export const VETERAN_CHAIN_QUEUE_BASE = 2;

// Per-chain max training slots for a nexus at the given Command Core level,
// including the CC18/19 veteran bonus. Below CC15 this is the legacy 5 (+bonus
// never applies pre-CC15 anyway). At/after CC15 it's VETERAN_CHAIN_QUEUE_BASE
// plus the standard +1/+2 ramp.
export function getMaxTrainingQueueSlots(commandLevel: number): number {
	const base =
		(commandLevel || 0) >= COMMAND_VETERAN_THRESHOLD
			? VETERAN_CHAIN_QUEUE_BASE
			: PRE_VETERAN_QUEUE_BASE;
	return base + getCommandTrainingQueueBonus(commandLevel);
}

// ── Stationing eligibility (support + transfer share one rule) ──────────────
// Stationing troops at ANOTHER nexus - whether an ally's (support mission) or
// your own (troop transfer) - is the same operation: it parks a defensive
// garrison. Only DEFENSIVE units may be stationed. Offensive units only ever
// leave a nexus via an attack; Recon is scout-only; Overseer is a conquest tool;
// Plasma Turret is stationary. Single source of truth for both code paths
// (attackService support branch + troopTransferController) so they never drift.
export const STATIONABLE_TROOPS: readonly string[] = [
	'assaultTrooper',
	'lancerDrone',
	'siegeMech',
	'bulwarkGuard'
];
const STATIONABLE_TROOP_SET = new Set<string>(STATIONABLE_TROOPS);

export function isStationableTroop(troopType: string): boolean {
	return STATIONABLE_TROOP_SET.has(troopType);
}

const TROOP_COMBAT_CLASS: Record<string, 'mobile' | 'armor' | 'fire' | 'special'> = {
	lancerDrone: 'fire',
	assaultTrooper: 'armor',
	breakerUnit: 'mobile',
	reconOperative: 'special',
	skimmerBike: 'mobile',
	bulwarkGuard: 'armor',
	suppressorTeam: 'fire',
	disruptorUnit: 'fire',
	interceptorBike: 'mobile',
	siegeMech: 'armor',
	annihilatorPlatform: 'fire',
	voidStalker: 'mobile',
	plasmaTurret: 'fire',
	overseer: 'special'
};

// Which chains a nexus has, given its Command Core level. Order is fixed so the
// UI renders lanes consistently (combat triangle first, special last).
export function getTrainingChains(commandLevel: number): TrainingChain[] {
	return (commandLevel || 0) >= COMMAND_VETERAN_THRESHOLD
		? ['mobile', 'armor', 'fire', 'special']
		: ['combat', 'special'];
}

// Which chain a given troop type trains in, for the nexus's current CC tier.
// Pre-veteran, every combat class collapses into the single `combat` chain.
export function trainingChainFor(troopType: string, commandLevel: number): TrainingChain {
	const cls = TROOP_COMBAT_CLASS[troopType] ?? 'special';
	if (cls === 'special') return 'special';
	return (commandLevel || 0) >= COMMAND_VETERAN_THRESHOLD ? cls : 'combat';
}

// Effective per-tier multiplier when a building cost is computed from level 1 → targetLevel.
// Levels 2-5 use early, 6-10 mid, 11+ late. Cost and time use their respective tables.
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
// The first 3 nexuses use the base cost from TROOP_COSTS.
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

// Which building's level reduces a troop's training time AND gates its
// production. Mobile/fire/armor map to their class building; specials (recon,
// overseer) train from Command Core. Single source of truth so call sites can
// derive both the gate check and the train-time factor from the troop type.
const TROOP_TRAINING_BUILDING: Record<string, string> = {
	lancerDrone: 'plasmaForge',
	assaultTrooper: 'armorFoundry',
	breakerUnit: 'hangarBay',
	reconOperative: 'commandCore',
	skimmerBike: 'hangarBay',
	bulwarkGuard: 'armorFoundry',
	suppressorTeam: 'plasmaForge',
	disruptorUnit: 'plasmaForge',
	interceptorBike: 'hangarBay',
	siegeMech: 'armorFoundry',
	annihilatorPlatform: 'plasmaForge',
	voidStalker: 'hangarBay',
	plasmaTurret: 'plasmaForge',
	overseer: 'commandCore'
};

export function trainingBuildingFor(troopType: string): string {
	return TROOP_TRAINING_BUILDING[troopType] ?? 'commandCore';
}

// Per-unit train time in seconds, before the Nexus-type training multiplier.
// Overseer and Recon Operative train at base time regardless of Command Core
// level - specials are not eligible for class-building speedups.
export function getTrainTimeSeconds(troopType: string, classBuildingLevel: number): number {
	const baseTime = TROOP_COSTS[troopType].time;
	if (troopType === 'overseer' || troopType === 'reconOperative') return baseTime;
	const factor = getClassBuildingTrainFactor(classBuildingLevel);
	return Math.max(1, Math.floor(baseTime * factor));
}

// Applies the Nexus-type training multiplier (Military Outpost = 0.5x base / 0.25x doubled),
// preserving the existing rule that overseer is exempt from type bonuses.
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

// ── Stealth Array (defensive concealment) ───────────────────────────────────
// Stealth Array has two effects:
//   1. Scout-fail chance: incoming Recon Operative scouts fail outright with
//      this probability. On failure, the attacker loses the operatives sent
//      and no intel is returned. Low % by design - intel must stay a reliable
//      strategic tool. 1.5%/level, hard-capped at 22.5% at Lv15 (max level).
//   2. Hidden vault: the first N units of each resource are stored in a
//      hidden vault. Raids can't loot the hidden portion, and scout reports
//      show only the visible (non-hidden) portion. Curve calibrated to land
//      ~49k per resource at Lv15 (~1% of the 5M max storage cap) - a war
//      recovery fund, not a raid-proofing trick. floor(550 * 1.35^L).
export const STEALTH_SCOUT_FAIL_PER_LEVEL = 0.015;
export const STEALTH_SCOUT_FAIL_CAP = 0.225;

// Same growth rate (1.35) as the resource production curve so vault scaling
// tracks the rest of the economy. Base 550 yields ~49k at L15 (the max level).
export const STEALTH_VAULT_BASE = 550;
export const STEALTH_VAULT_GROWTH = 1.35;

export function getStealthScoutFailChance(stealthArrayLevel: number): number {
	const lvl = Math.max(0, stealthArrayLevel || 0);
	return Math.min(STEALTH_SCOUT_FAIL_CAP, lvl * STEALTH_SCOUT_FAIL_PER_LEVEL);
}

// Hidden cap per resource (biomass / alloy / ore separately). Returns 0 when
// Stealth Array is not built.
export function getStealthVaultPerResource(stealthArrayLevel: number): number {
	const lvl = Math.max(0, stealthArrayLevel || 0);
	if (lvl <= 0) return 0;
	return Math.floor(STEALTH_VAULT_BASE * Math.pow(STEALTH_VAULT_GROWTH, lvl));
}

// Splits a single-resource stockpile into visible (lootable, scout-visible)
// and hidden portions given the defender's Stealth Array level. Hidden fills
// first up to the per-resource cap; everything above the cap is visible.
export function partitionStealthVault(
	stockpile: number,
	stealthArrayLevel: number
): { visible: number; hidden: number } {
	const total = Math.max(0, Math.floor(stockpile || 0));
	const cap = getStealthVaultPerResource(stealthArrayLevel);
	const hidden = Math.min(total, cap);
	return { visible: total - hidden, hidden };
}
