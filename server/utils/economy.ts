import type { ResourceAmounts } from '../types/index.js';

interface NexusTypeBonuses {
	productionMultiplier?: number;
	storageMultiplier?: number;
	shieldEfficiencyMultiplier?: number;
	trainingTimeMultiplier?: number;
	buildTimeMultiplier?: number;
	travelTimeMultiplier?: number;
	lootProtection?: number;
	label: string;
}

export const NEXUS_TYPE_BONUSES: Record<string, NexusTypeBonuses> = {
	'Resource Depot': { productionMultiplier: 2, label: '2x Resource Production' },
	'Supply Cache': {
		storageMultiplier: 2,
		lootProtection: 0.4,
		label: '2x Storage · 40% Loot Protection'
	},
	'Military Outpost': {
		shieldEfficiencyMultiplier: 2.0,
		trainingTimeMultiplier: 0.5,
		label: '+100% Shield Efficiency, 50% Faster Training'
	},
	'Forward Base': {
		travelTimeMultiplier: 0.75,
		buildTimeMultiplier: 0.8,
		label: '25% Faster Travel · 20% Faster Construction'
	}
};

export function getNexusTypeBonuses(nexusType: string | null): NexusTypeBonuses | null {
	if (!nexusType) return null;
	return NEXUS_TYPE_BONUSES[nexusType] || null;
}

interface NexusForEconomy {
	nexusType?: string | null;
	nexusTypeDoubled?: boolean;
	isDerelict?: boolean;
	biomassFarm: number;
	alloyForge: number;
	oreExtractor: number;
	storageVault: number;
	biomass: number;
	alloy: number;
	ore: number;
	lastResourceUpdate: Date;
	commandCore?: number;
	hangarBay?: number;
	plasmaForge?: number;
	armorFoundry?: number;
	lifeSupport?: number;
	shieldGrid?: number;
	targetingCore?: number;
	[key: string]: unknown;
}

function getDoubleScale(nexus: NexusForEconomy): number {
	return nexus.nexusTypeDoubled ? 2 : 1;
}

// Derelict Ship gives 3x base production, 4x once Command Core reaches 15.
// Independent of nexusType so it stacks with nothing else (it's the only modifier
// the derelict multiplier looks at). When the derelict is also nexusTypeDoubled,
// the doubling rule does not apply — the CC-15 step is the only progression.
function getDerelictMultiplier(nexus: NexusForEconomy): number {
	return (nexus.commandCore ?? 0) >= 15 ? 4 : 3;
}

export interface StormBonus {
	biomass?: number;
	alloy?: number;
	ore?: number;
}

export function getResourceProduction(nexus: NexusForEconomy, storm?: StormBonus): ResourceAmounts {
	const baseProduction = 800;
	const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.productionMultiplier ?? 1;
	const productionMultiplier = nexus.isDerelict
		? getDerelictMultiplier(nexus)
		: rawMultiplier === 1
			? 1
			: 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
	// Growth 1.35 (v0.22 economy overhaul, was 1.32). Lifts mid-late production so
	// the resource axis actually binds — see server/ECONOMY_BALANCE.md §3.1. Base
	// 800 unchanged, so early game is identical. 1.35 is the disciplined ceiling:
	// an earlier flat-1.35 build drew "too much production" complaints, but that
	// was a no-resource-sink economy; this pass adds sinks (storage flatten +
	// unit-cost re-tune) so 1.35 now feeds an economy that consumes it. 1.36 was
	// tested and overshoots (re-trivializes resources at the top end).
	const prod = (level: number, stormMult: number) =>
		level <= 0 ? 0 : baseProduction * Math.pow(1.35, level - 1) * productionMultiplier * stormMult;
	return {
		biomass: prod(nexus.biomassFarm, storm?.biomass ?? 1),
		alloy: prod(nexus.alloyForge, storm?.alloy ?? 1),
		ore: prod(nexus.oreExtractor, storm?.ore ?? 1)
	};
}

export function getMaxStorage(nexus: NexusForEconomy): number {
	const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.storageMultiplier ?? 1;
	const storageMultiplier =
		rawMultiplier === 1 ? 1 : 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
	// Base 1500 means Lv1 caps at ~2,220, so the buffed 1500 starting stockpile
	// has headroom from spawn instead of capping farms instantly.
	// Growth 1.48 (v0.22 economy overhaul, was 1.50): a mild flatten that closes
	// the runaway storage-vs-production gap (fill-time at Lv20 drops 31.9h→15.9h)
	// while keeping storage ahead of production at every level so raiding still
	// pays. See server/ECONOMY_BALANCE.md §3.2–3.3.
	return 1500 * Math.pow(1.48, nexus.storageVault) * storageMultiplier;
}

export function getNexusTypeEffectiveMultipliers(nexus: NexusForEconomy): NexusTypeBonuses | null {
	const base = NEXUS_TYPE_BONUSES[nexus.nexusType ?? ''];
	if (!base) return null;
	if (nexus.isDerelict) {
		const dm = getDerelictMultiplier(nexus);
		return {
			...base,
			productionMultiplier: dm,
			label: `${dm}x Resource Production (Derelict Ship)`
		};
	}
	if (!nexus.nexusTypeDoubled) return base;
	const scale = getDoubleScale(nexus);
	return {
		...base,
		productionMultiplier:
			base.productionMultiplier !== undefined
				? 1 + (base.productionMultiplier - 1) * scale
				: undefined,
		storageMultiplier:
			base.storageMultiplier !== undefined ? 1 + (base.storageMultiplier - 1) * scale : undefined,
		shieldEfficiencyMultiplier:
			base.shieldEfficiencyMultiplier !== undefined
				? 1 + (base.shieldEfficiencyMultiplier - 1) * scale
				: undefined,
		trainingTimeMultiplier:
			base.trainingTimeMultiplier !== undefined
				? Math.pow(base.trainingTimeMultiplier, scale)
				: undefined,
		buildTimeMultiplier:
			base.buildTimeMultiplier !== undefined
				? Math.pow(base.buildTimeMultiplier, scale)
				: undefined,
		travelTimeMultiplier:
			base.travelTimeMultiplier !== undefined
				? Math.pow(base.travelTimeMultiplier, scale)
				: undefined,
		lootProtection:
			base.lootProtection !== undefined ? Math.min(0.8, base.lootProtection * scale) : undefined,
		label: nexus.nexusTypeDoubled ? `[DOUBLED] ${base.label}` : base.label
	};
}

export function computeResourceUpdate(
	nexus: NexusForEconomy,
	storm?: StormBonus
): ResourceAmounts & { lastResourceUpdate: Date } {
	const now = new Date();
	const hoursSinceLastUpdate =
		(now.getTime() - nexus.lastResourceUpdate.getTime()) / (1000 * 60 * 60);
	const production = getResourceProduction(nexus, storm);
	const maxStorage = getMaxStorage(nexus);
	return {
		biomass: Math.min(nexus.biomass + production.biomass * hoursSinceLastUpdate, maxStorage),
		alloy: Math.min(nexus.alloy + production.alloy * hoursSinceLastUpdate, maxStorage),
		ore: Math.min(nexus.ore + production.ore * hoursSinceLastUpdate, maxStorage),
		lastResourceUpdate: now
	};
}

export const TROOP_INFLUENCE_POINTS: Record<string, number> = {
	sentinelLancer: 1,
	assaultTrooper: 1,
	vanguardBreaker: 1,
	reconOperative: 2,
	pyreSuppressor: 3,
	bulwarkGuard: 3,
	// Aegis Skirmisher (Stage 2d): Mobile defender peer to Bulwark - same
	// 3 points so it competes as a defensive investment rather than a
	// strictly better/worse one.
	aegisSkirmisher: 3,
	wraithSkimmer: 4,
	arcDisruptor: 4,
	phantomLance: 5,
	voidStalker: 5,
	siegeMech: 8,
	plasmaTurret: 10,
	annihilatorPlatform: 13,
	// Siege Colossus (Stage 2d): elite Armor attacker - sits between
	// Annihilator (fire endgame, 13) and Overseer (conquest, 50). 15 reflects
	// the heaviest single non-special unit.
	siegeColossus: 15,
	overseer: 50
};

export function calculateTroopInfluence(troops: Record<string, number | undefined | null>): number {
	let points = 0;
	for (const [troopType, pts] of Object.entries(TROOP_INFLUENCE_POINTS)) {
		points += pts * (Number(troops[troopType]) || 0);
	}
	return points;
}

// Influence is reported to players as a single "Influence" number. It was
// scaling a touch too aggressively, so we trim the headline total by a flat
// ~15%. Every nexus is scaled by the same factor, so relative ordering between
// players is unchanged — only the magnitude is dialed back slightly. Building/
// troop weights below keep their original relative balance.
export const INFLUENCE_SCALE = 0.85;

export function calculatePoints(nexus: NexusForEconomy & Partial<Record<string, unknown>>): number {
	let points = 0;
	const buildingPoints: Record<string, number> = {
		commandCore: 10,
		// The retired Recruitment Core was worth 16. The three class buildings
		// each contribute 8: a single-class specialist who levels only one
		// building scores under the old RC (modest cost for the per-class
		// trade-off), while a player who invests in all three scores 24 -
		// a 1.5x reward for the broader building investment.
		hangarBay: 8,
		plasmaForge: 8,
		armorFoundry: 8,
		lifeSupport: 5,
		storageVault: 6,
		biomassFarm: 6,
		alloyForge: 6,
		oreExtractor: 6,
		shieldGrid: 8,
		targetingCore: 12
	};
	for (const [building, pts] of Object.entries(buildingPoints)) {
		points += pts * (Number(nexus[building]) || 0);
	}
	points += calculateTroopInfluence(nexus as Record<string, number | undefined | null>);
	return Math.floor(points * INFLUENCE_SCALE);
}
