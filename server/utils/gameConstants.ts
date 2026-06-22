// Single source of truth for building / troop costs and time math.
// Mirrored verbatim in client/src/realtime/gameConstants.shared.ts -
// same convention as economy.ts / economy.shared.ts. If you change a
// number or formula here, change it in the client mirror in the same commit.

// A nexus is shown to OTHER players as "active" (online) for this long after its
// owner's last deliberate action (train/build/cancel/decommission). Mirrors the
// familiar 15-minute "recent activity" window from games like OGame.
export const NEXUS_ACTIVE_WINDOW_MS = 15 * 60 * 1000;

// Return trips (post-combat attack survivors, scouts heading home, bounced
// support, and recalled transfers) take this fraction of the original ONE-WAY
// travel time. 1 = the return leg takes exactly as long as the outbound leg, so
// a strike is a full, symmetric round trip (the distance there is the distance
// back). Set to 0 for near-instant returns (returnsAt collapses to "now", troops
// land on the next process_combat / process_transfers tick); values between 0
// and 1 give a discounted return.
export const RETURN_TRAVEL_MULTIPLIER = 1;

// ── Post-protection vulnerability taper ─────────────────────────────────────
// Newbie protection (NEWBIE_PROTECTION_DURATION_MS in starterNexus.ts) used to
// end on a hard cliff: full wipe risk the instant the timer expired. That cliff
// is exactly the window where a veteran could annihilate a days-old defender's
// entire garrison risk-free, repeatedly. Instead of removing the cliff, we
// soften it: for PROTECTION_TAPER_DURATION_MS after protection ends, a
// defender who loses keeps a shrinking minimum fraction of their garrison
// (PROTECTION_TAPER_START_SURVIVOR_PCT at taper start, decaying linearly to 0
// — the normal floor — by the end of the window). This only ever raises the
// loser's survivor floor; it never helps the defender WIN, and it never
// applies to the attacker side, so raiding a taper-window defender is still
// rational, just not free.
export const PROTECTION_TAPER_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const PROTECTION_TAPER_START_SURVIVOR_PCT = 0.25;

// Returns the minimum survivor fraction a losing defender is guaranteed right
// now, given when their nexus's protection ended. 0 outside the taper window
// (including "never protected" / already long-expired nexuses) — combatMath's
// existing loserLossRate floor applies unmodified in that case.
export function getProtectionTaperSurvivorFloor(
	protectionEndsAt: Date | null | undefined,
	now: Date = new Date()
): number {
	if (!protectionEndsAt) return 0;
	const elapsedSinceProtectionEnded = now.getTime() - protectionEndsAt.getTime();
	if (elapsedSinceProtectionEnded < 0) return 0; // still under hard protection — attack is blocked elsewhere
	if (elapsedSinceProtectionEnded >= PROTECTION_TAPER_DURATION_MS) return 0;
	const remaining = 1 - elapsedSinceProtectionEnded / PROTECTION_TAPER_DURATION_MS;
	return PROTECTION_TAPER_START_SURVIVOR_PCT * remaining;
}

// ── Standing defensive orders ────────────────────────────────────────────────
// A standing order auto-transfers troops (existing rails, see
// troopTransferService.sendTroopsTransaction) from a reserve nexus to its
// protected nexus the moment that nexus receives an incoming attack. Without a
// cooldown, a multi-wave raid (or repeated raids) would re-fire the same order
// on every single inbound attack and strip the source nexus's reserve in
// minutes. This is a flat per-order cooldown, independent of how many distinct
// attackers hit the protected nexus in the window.
export const STANDING_ORDER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Minimum incoming attack size (total units) that fires standing orders. The
// cooldown caps RE-firing, but the FIRST trigger was free and fully
// deterministic: an attacker who scouted the source could send a throwaway
// 1-troop "attack" purely to bait the order into pulling a known reserve into
// transit, then strike the now-lighter SOURCE nexus on a timer. Ignoring
// sub-threshold pokes makes the bait cost a credible force instead of one unit,
// while a real raid (which is what the feature is meant to answer) clears it
// trivially. Counts every unit including non-combat escorts — the gate is
// "is this a serious commitment", not "how much damage will it do".
export const STANDING_ORDER_MIN_TRIGGER_UNITS = 5;

// When a standing order fires, never drain the SOURCE nexus below this many
// units of self-defense. Even past the trigger gate, a baited order should not
// be able to strip its source to zero and leave it a free conquest. The drain
// takes only the surplus above this floor; if the source is already at/below
// the floor the order sends nothing this trigger (and stays active for later).
export const STANDING_ORDER_SOURCE_GARRISON_FLOOR = 10;

// Hard cap on how many standing orders one user may have, to bound the work
// done per incoming attack (every active order targeting the defender nexus is
// evaluated) and to keep the UI list manageable.
export const MAX_STANDING_ORDERS_PER_USER = 20;

// ── Queue templates ──────────────────────────────────────────────────────────
// Named, reusable training-queue presets a player can save and replay (roadmap
// Phase 3). Bounds the per-user list size shown in the UI; replaying a
// template still goes through troopController.trainTroops's full validation.
export const MAX_QUEUE_TEMPLATES_PER_USER = 30;

// ── Auto-requeue rules ───────────────────────────────────────────────────────
// Per-nexus rules that re-queue a training batch or building upgrade each time
// the previous one drains (roadmap Phase 6). Bounds per-user list size and the
// work done per drain cycle in processCompletedQueuesAndNotify.
export const MAX_AUTO_REQUEUE_RULES_PER_USER = 30;

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
	hangarBay: { biomass: 170, alloy: 150, ore: 80, time: 180 },
	plasmaForge: { biomass: 170, alloy: 150, ore: 80, time: 180 },
	armorFoundry: { biomass: 170, alloy: 150, ore: 80, time: 180 },
	lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 150 },
	storageVault: { biomass: 60, alloy: 50, ore: 70, time: 120 },
	biomassFarm: { biomass: 50, alloy: 60, ore: 60, time: 120 },
	alloyForge: { biomass: 65, alloy: 40, ore: 60, time: 120 },
	oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 150 },
	shieldGrid: { biomass: 50, alloy: 100, ore: 60, time: 180 },
	targetingCore: { biomass: 115, alloy: 170, ore: 135, time: 210 },
	stealthArray: { biomass: 100, alloy: 150, ore: 180, time: 210 }
};

export interface TroopCost {
	biomass: number;
	alloy: number;
	ore: number;
	population: number;
	time: number;
}

// v0.22 economy overhaul: STRIKER resource costs (biomass/alloy/ore) re-tuned so
// atk-per-1k-res lands in monotonic tier bands — the cost curve now reinforces
// the combat tier invariant instead of fighting it (pre-rework the elite Siege
// Colossus was the LEAST resource-efficient striker in the game). Per-resource
// SPLITS preserve each unit's prior ratio; only totals moved. Stats and train
// `time` are FROZEN (combat-owned). The ONE population change is Siege Colossus
// 5→4 (see below). Full rationale + bands: server/ECONOMY_BALANCE.md §3.4 / §3.6.
//
// ANVILS DELIBERATELY UNCHANGED. A proposed anvil def-per-resource re-pricing
// (assaultTrooper / bulwarkGuard / aegisSkirmisher / arcDisruptor / siegeMech /
// plasmaTurret) was DROPPED: it moved the canonical equal-resource ratios the
// combat doc documents (COMBAT_BALANCE §2.1: r≈0.54→0.30) and anvil cost trades
// off directly against that ratio, so there's no version that cuts anvils without
// perturbing combat's equilibrium — and anvils weren't a fault. See
// ECONOMY_BALANCE §8.1. Anvil rows below are at their pre-rework values.
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
	// Siege Colossus - tier-3 Armor striker, the siege hammer. v0.22: population
	// 5→4. It was the worst T3 striker on BOTH resource- and population-efficiency
	// (atk/pop 60, below Void Stalker's 72); the pop-5 tax buried the flagship.
	// pop 4 lifts atk/pop to 75 (above Void Stalker, below Annihilator — coherent).
	// Combat resolution is pop-blind (pop only drives housing), verified against
	// the COMBAT_BALANCE §2 sims (ECONOMY_BALANCE §3.6 / §5.6). Heaviest single
	// unit, slowest speed 6, longest train time. The hammer of the late-game army.
	// Resource total 6200 (softened from the first 5150 draft): keeps Fault C fixed
	// (eff 48.4 > T1's 45.7) AND restores the COMBAT_BALANCE §2.1 colossus→aegis
	// ratio to ~0.50 (the 5150 draft pushed it to 0.63). Same softening applied to
	// Annihilator (6400). See ECONOMY_BALANCE §8.
	siegeColossus: { biomass: 1550, alloy: 1890, ore: 2760, population: 4, time: 3000 },
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

// First-build acceleration (beta): a brand-new player's very first build is the
// Command Core 0 -> 1 upgrade, which at base is 120s with no Command discount
// (getCommandTimeFactor(0) = 1.0). That ~2-minute dead-time on a player's first
// session is an onboarding drop-off risk, so we collapse JUST that one build to
// a short fixed time. The trigger (commandCore at level 0) is one-time by
// construction — a nexus can only sit at CC0 before its first build — so this
// needs no extra DB column and can never re-fire on later upgrades.
//
// IMPORTANT: build-queue only. This must never touch troop/training/combat
// timing — early-raid viability is a tuned balance lever and combat is
// pop-blind, so accelerating anything but this single build risks the meta.
export const FIRST_BUILD_BUILDING = 'commandCore';
export const FIRST_BUILD_TIME_SECONDS = 25;

// True only for the single Command-Core-0->1 upgrade that is a nexus's first
// build. Shared shape with the client mirror in gameConstants.shared.ts.
export function isFirstBuild(building: string, currentLevel: number): boolean {
	return building === FIRST_BUILD_BUILDING && currentLevel === 0;
}

// Onboarding troop discount: during the guided tutorial the player must train
// 5 Assault Troopers, but they haven't had time to accumulate real resources.
// We collapse the cost to 1/1/1 and the train time to 5s per unit so the step
// is instant and doesn't block the flow. Applies ONLY while beginnerTipsEnabled
// is true and the player hasn't yet completed the 'train_troops' step.
// The train-troops step itself marks completion, so after that first queue the
// player is on normal costs for all future sessions.
export const ONBOARDING_TROOP_TYPE = 'assaultTrooper';
export const ONBOARDING_TROOP_COST: Pick<TroopCost, 'biomass' | 'alloy' | 'ore'> = {
	biomass: 1,
	alloy: 1,
	ore: 1
};
export const ONBOARDING_TRAIN_TIME_SECONDS = 5;

// The set of onboarding step ids that come BEFORE the player has trained their
// first batch of troops. Once any of these is the last completed step (or none
// is yet completed) AND beginnerTipsEnabled is true, we apply the discount.
// Steps at or after 'train_troops' get normal costs.
const ONBOARDING_STEPS_BEFORE_TRAIN = new Set([
	'create_nexus',
	'upgrade_building',
	'while_you_build',
	'reinforce_command',
	'build_production',
	'counter_triangle'
]);

// ── Onboarding discount taper ────────────────────────────────────────────
// The step-gate above used to be a hard cliff: full discount right up until
// the 'train_troops' step is marked complete, then instantly gone. A player
// who pauses mid-tutorial and comes back days later hit that cliff exactly
// as hard as one who finished in five minutes, even though by then they've
// had plenty of time to accumulate real resources. We soften it the same way
// PROTECTION_TAPER_DURATION_MS softens the post-protection cliff: once the
// step-gate would still grant the discount, scale it down linearly by
// account age, fully gone by ONBOARDING_TAPER_DURATION_MS after signup. A
// fast tutorial completion (the common case) never reaches the taper window,
// so this only ever affects slow/returning players, and only ever shrinks
// the discount — it can't extend eligibility past the step-gate.
export const ONBOARDING_TAPER_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

// Returns the discount fraction (1 = full discount, 0 = none) for an account
// of the given age. 1 for the first half of the window, then decays linearly
// to 0 by the end of it — same shape as getProtectionTaperSurvivorFloor, just
// starting at full strength instead of a reduced one (this is a discount
// fading away, not a survivor floor rising).
export function getOnboardingTaperFraction(
	createdAt: Date | string | null | undefined,
	now: Date = new Date()
): number {
	if (!createdAt) return 1;
	const accountAgeMs = now.getTime() - new Date(createdAt).getTime();
	if (accountAgeMs <= 0) return 1;
	if (accountAgeMs >= ONBOARDING_TAPER_DURATION_MS) return 0;
	return 1 - accountAgeMs / ONBOARDING_TAPER_DURATION_MS;
}

export function isOnboardingTrainEligible(
	troopType: string,
	beginnerTipsEnabled: boolean,
	lastCompletedStep: string | null | undefined
): boolean {
	if (!beginnerTipsEnabled) return false;
	if (troopType !== ONBOARDING_TROOP_TYPE) return false;
	// null means no step completed yet — player is at the very beginning
	if (!lastCompletedStep) return true;
	return ONBOARDING_STEPS_BEFORE_TRAIN.has(lastCompletedStep);
}

// Onboarding build-time overrides: the two builds between CC Lv0→1 (already
// collapsed by FIRST_BUILD_TIME_SECONDS) and being able to train troops are
// CC Lv1→2 and Armor Foundry Lv0→1. Without acceleration these are ~150s and
// ~180s respectively — dead time that kills first-session momentum. We collapse
// each to 20s when beginnerTipsEnabled is true and the player hasn't yet passed
// the 'build_production' step. Only applies once per build (one-time by
// construction: CC can only hit Lv1 once, Foundry can only be at Lv0 once).
export const ONBOARDING_BUILD_TIME_SECONDS = 20;

// Builds eligible for the accelerated-onboarding time override.
// Key: `${building}@${currentLevel}` (the level BEFORE the upgrade starts).
const ONBOARDING_BUILD_OVERRIDES = new Set([
	'commandCore@1', // CC Lv1 → Lv2
	'armorFoundry@0' // Armor Foundry Lv0 → Lv1
]);

const ONBOARDING_STEPS_BEFORE_BUILD = new Set([
	'create_nexus',
	'upgrade_building',
	'while_you_build',
	'reinforce_command'
	// 'build_production' is the step that queues the foundry; once it's queued
	// (step completed) the override already fired, so no need to list it here.
]);

export function isOnboardingBuildEligible(
	building: string,
	currentLevel: number,
	beginnerTipsEnabled: boolean,
	lastCompletedStep: string | null | undefined
): boolean {
	if (!beginnerTipsEnabled) return false;
	if (!ONBOARDING_BUILD_OVERRIDES.has(`${building}@${currentLevel}`)) return false;
	if (!lastCompletedStep) return true;
	return ONBOARDING_STEPS_BEFORE_BUILD.has(lastCompletedStep);
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
// The five ANVILS, one per tier/class niche. v0.22: the list now tracks the
// rebalanced roles rather than the old hand-picked set. Sentinel Lancer left
// (it became a Fire striker, atk34/def14 - no longer a defender), and Arc
// Disruptor joined (reworked into the Fire-class anvil, def95) so the Fire class
// finally has a lendable mobile-stopping garrison unit.
export const STATIONABLE_TROOPS: readonly string[] = [
	'assaultTrooper',
	'bulwarkGuard',
	'siegeMech',
	'aegisSkirmisher',
	'arcDisruptor'
];
const STATIONABLE_TROOP_SET = new Set<string>(STATIONABLE_TROOPS);

// STATIONABLE_TROOPS above stays the canonical "anvils" list used by combat
// balance docs/tuning. It is NO LONGER the deployment gate. Players may station
// ANY combat troop at another nexus (support to an ally or transfer to your own
// nexus) - offensive units make poor garrisons but you can still send them if
// you want. Only these are non-deployable:
//   - overseer:       a finite offensive conquest tool, inert on defense
//   - plasmaTurret:   a stationary emplacement; it cannot relocate at all
//   - reconOperative: scout-only, has no combat (garrison) role
// canStationTroop is the single deployment gate shared by the support branch
// (attackService) and troopTransferController so they can never drift again.
export const NON_STATIONABLE_TROOPS: readonly string[] = [
	'overseer',
	'plasmaTurret',
	'reconOperative'
];
const NON_STATIONABLE_TROOP_SET = new Set<string>(NON_STATIONABLE_TROOPS);

export function isStationableTroop(troopType: string): boolean {
	return STATIONABLE_TROOP_SET.has(troopType);
}

/** Deployment gate for support + transfer: any troop except the non-deployables. */
export function canStationTroop(troopType: string): boolean {
	return !NON_STATIONABLE_TROOP_SET.has(troopType);
}

const TROOP_COMBAT_CLASS: Record<string, 'mobile' | 'armor' | 'fire' | 'special'> = {
	sentinelLancer: 'fire',
	assaultTrooper: 'armor',
	vanguardBreaker: 'mobile',
	reconOperative: 'special',
	wraithSkimmer: 'mobile',
	bulwarkGuard: 'armor',
	pyreSuppressor: 'fire',
	arcDisruptor: 'fire',
	phantomLance: 'mobile',
	siegeMech: 'armor',
	annihilatorPlatform: 'fire',
	voidStalker: 'mobile',
	plasmaTurret: 'fire',
	overseer: 'special',
	siegeColossus: 'armor',
	aegisSkirmisher: 'mobile'
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
	sentinelLancer: 'plasmaForge',
	assaultTrooper: 'armorFoundry',
	vanguardBreaker: 'hangarBay',
	reconOperative: 'commandCore',
	wraithSkimmer: 'hangarBay',
	bulwarkGuard: 'armorFoundry',
	pyreSuppressor: 'plasmaForge',
	arcDisruptor: 'plasmaForge',
	phantomLance: 'hangarBay',
	siegeMech: 'armorFoundry',
	annihilatorPlatform: 'plasmaForge',
	voidStalker: 'hangarBay',
	plasmaTurret: 'plasmaForge',
	overseer: 'commandCore',
	siegeColossus: 'armorFoundry',
	aegisSkirmisher: 'hangarBay'
};

export function trainingBuildingFor(troopType: string): string {
	return TROOP_TRAINING_BUILDING[troopType] ?? 'commandCore';
}

// Per-unit train time in seconds, before the Nexus-type training multiplier.
// Overseer trains at base time regardless of buildings.
// Recon Operative benefits from Stealth Array level (same curve as class buildings).
export function getTrainTimeSeconds(
	troopType: string,
	classBuildingLevel: number,
	stealthArrayLevel = 0
): number {
	const baseTime = TROOP_COSTS[troopType].time;
	if (troopType === 'overseer') return baseTime;
	if (troopType === 'reconOperative') {
		const factor = getClassBuildingTrainFactor(stealthArrayLevel);
		return Math.max(1, Math.floor(baseTime * factor));
	}
	const factor = getClassBuildingTrainFactor(classBuildingLevel);
	return Math.max(1, Math.floor(baseTime * factor));
}

// Applies the Nexus-type training multiplier (Military Outpost = 0.5x base / 0.25x doubled),
// preserving the existing rule that overseer is exempt from type bonuses.
export function getEffectiveTrainTimeSeconds(
	troopType: string,
	classBuildingLevel: number,
	nexusType: string | null | undefined,
	nexusTypeDoubled: boolean,
	stealthArrayLevel = 0
): number {
	const perUnit = getTrainTimeSeconds(troopType, classBuildingLevel, stealthArrayLevel);
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
	// First-ever build is collapsed to a short fixed time so new players aren't
	// stuck watching a ~2-minute timer in their first session. One-time by
	// construction (only fires at Command Core level 0). See isFirstBuild.
	if (isFirstBuild(building, currentLevel)) return FIRST_BUILD_TIME_SECONDS;
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
