// Pure resource economy math, kept numerically identical to server/utils/economy.ts.
// Duplicated by design: client and server are separate TS projects with different
// module systems, and a workspace package isn't worth the build-system risk yet.
// If you change a formula here, change it in server/utils/economy.ts the same commit.

export interface ResourceAmounts {
	biomass: number;
	alloy: number;
	ore: number;
}

export interface StormBonus {
	biomass?: number;
	alloy?: number;
	ore?: number;
}

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

export interface EconomyNexus {
	nexusType?: string | null;
	nexusTypeDoubled?: boolean;
	isDerelict?: boolean;
	commandCore?: number;
	biomassFarm: number;
	alloyForge: number;
	oreExtractor: number;
	storageVault: number;
}

function getDoubleScale(nexus: Pick<EconomyNexus, 'nexusTypeDoubled'>): number {
	return nexus.nexusTypeDoubled ? 2 : 1;
}

function getDerelictMultiplier(nexus: Pick<EconomyNexus, 'commandCore'>): number {
	return (nexus.commandCore ?? 0) >= 15 ? 4 : 3;
}

export function getResourceProduction(nexus: EconomyNexus, storm?: StormBonus): ResourceAmounts {
	const baseProduction = 800;
	const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.productionMultiplier ?? 1;
	const productionMultiplier = nexus.isDerelict
		? getDerelictMultiplier(nexus)
		: rawMultiplier === 1
			? 1
			: 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
	const prod = (level: number, stormMult: number) =>
		level <= 0 ? 0 : baseProduction * Math.pow(1.32, level - 1) * productionMultiplier * stormMult;
	return {
		biomass: prod(nexus.biomassFarm, storm?.biomass ?? 1),
		alloy: prod(nexus.alloyForge, storm?.alloy ?? 1),
		ore: prod(nexus.oreExtractor, storm?.ore ?? 1)
	};
}

export function getMaxStorage(nexus: EconomyNexus): number {
	const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.storageMultiplier ?? 1;
	const storageMultiplier =
		rawMultiplier === 1 ? 1 : 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
	return 1500 * Math.pow(1.5, nexus.storageVault) * storageMultiplier;
}

// Pure client-side interpolation against a server-anchored snapshot.
// Server uses Date and mutates lastResourceUpdate; client just needs the projected
// values at a given moment, so this takes an explicit `nowMs` and `anchorMs` instead.
export function interpolateResources(
	base: ResourceAmounts,
	production: ResourceAmounts,
	storageMax: number,
	anchorMs: number,
	nowMs: number
): ResourceAmounts {
	const hours = Math.max(0, (nowMs - anchorMs) / 3_600_000);
	return {
		biomass: Math.min(base.biomass + production.biomass * hours, storageMax),
		alloy: Math.min(base.alloy + production.alloy * hours, storageMax),
		ore: Math.min(base.ore + production.ore * hours, storageMax)
	};
}
