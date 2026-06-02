import type { Request } from 'express';

export interface AuthRequest extends Request {
	userId: number;
	galaxyId: number;
	galaxyStatus: string | null;
	requestId?: string;
	activeGalaxyOptional?: boolean;
}

// ── Single source of truth for troop types ──────────────────────────────────
// Every place that needs to iterate troop types (sum garrisons, build scout /
// espionage intel, validate payloads, etc.) must use TROOP_KEYS rather than
// hand-listing the fields. Hand-rolled lists drift: a new unit gets added to
// the schema but forgotten in one of a dozen literals, and that unit silently
// vanishes from a report or a total. The two assertions below make the array
// and the TroopCounts type provably equivalent — add a troop to one without the
// other and the build fails, so they can never disagree again.
export const TROOP_KEYS = [
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
	'voidStalker',
	'plasmaTurret',
	'overseer'
] as const;

export type TroopKey = (typeof TROOP_KEYS)[number];

export interface TroopCounts {
	lancerDrone: number;
	assaultTrooper: number;
	breakerUnit: number;
	reconOperative: number;
	skimmerBike: number;
	siegeMech: number;
	bulwarkGuard: number;
	suppressorTeam: number;
	disruptorUnit: number;
	interceptorBike: number;
	annihilatorPlatform: number;
	voidStalker: number;
	plasmaTurret: number;
	overseer: number;
}

// Compile-time proof that TROOP_KEYS and keyof TroopCounts are the same set.
// If a troop is added to one but not the other, one of these lines fails to
// compile (the unmatched key becomes `never` and the assignment errors).
type _AssertKeysCoverCounts = TroopKey extends keyof TroopCounts ? true : never;
type _AssertCountsCoverKeys = keyof TroopCounts extends TroopKey ? true : never;
const _troopKeyParity: [_AssertKeysCoverCounts, _AssertCountsCoverKeys] = [true, true];
void _troopKeyParity;

export interface BuildingLevels {
	commandCore: number;
	recruitmentCore: number;
	lifeSupport: number;
	storageVault: number;
	biomassFarm: number;
	alloyForge: number;
	oreExtractor: number;
	shieldGrid: number;
	armory: number;
	stealthArray: number;
}

export type BuildingKey = keyof BuildingLevels;

export interface ResourceAmounts {
	biomass: number;
	alloy: number;
	ore: number;
}

export type ResourceKey = keyof ResourceAmounts;

export interface SerializedNexus {
	_id: string;
	id: string;
	name: string;
	owner: number | null | object;
	x: number;
	y: number;
	resources: ResourceAmounts;
	buildings: BuildingLevels;
	troops: TroopCounts;
	population: { current: number; max: number };
	buildQueue: unknown[];
	trainingQueue: unknown[];
	questRewardClaims: string[] | null;
	completedQuestIds: string[] | null;
	troopsTrained: Record<string, number>;
	lastResourceUpdate: Date;
	points: number;
	controlLevel: number;
	nexusType: string | null;
	nexusTypeDoubled: boolean;
	isDerelict: boolean;
	nexusTypeLockedAt: Date | null;
	newbieProtectionEndsAt: Date | null;
	relocationTokenAvailable: boolean;
	relocationTokenUsedAt: Date | null;
	createdAt: Date;
	conqueredAt: Date | null;
}

export interface CombatResult {
	attackerLosses: Partial<TroopCounts>;
	defenderLosses: Partial<TroopCounts>;
	resourcesStolen: ResourceAmounts;
	survivingTroops: Partial<TroopCounts>;
	victory: boolean;
	conquered: boolean;
	remainingControl: number;
}

export interface TroopStat {
	attack: number;
	defense: number;
	speed: number;
	carry: number;
}
