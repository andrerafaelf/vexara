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
  'Resource Depot':  { productionMultiplier: 2, label: '2x Resource Production' },
  'Supply Cache':    { storageMultiplier: 2, lootProtection: 0.40, label: '2x Storage · 40% Loot Protection' },
  'Military Outpost': { shieldEfficiencyMultiplier: 2.0, trainingTimeMultiplier: 0.5, label: '+100% Shield Efficiency, 50% Faster Training' },
  'Forward Base':    { travelTimeMultiplier: 0.75, buildTimeMultiplier: 0.80, label: '25% Faster Travel · 20% Faster Construction' },
};

export function getNexusTypeBonuses(nexusType: string | null): NexusTypeBonuses | null {
  if (!nexusType) return null;
  return NEXUS_TYPE_BONUSES[nexusType] || null;
}

interface NexusForEconomy {
  nexusType?: string | null;
  nexusTypeDoubled?: boolean;
  biomassFarm: number;
  alloyForge: number;
  oreExtractor: number;
  storageVault: number;
  biomass: number;
  alloy: number;
  ore: number;
  lastResourceUpdate: Date;
  commandCore?: number;
  recruitmentCore?: number;
  lifeSupport?: number;
  shieldGrid?: number;
  armory?: number;
  [key: string]: unknown;
}

function getDoubleScale(nexus: NexusForEconomy): number {
  return nexus.nexusTypeDoubled ? 2 : 1;
}

export interface StormBonus {
  biomass?: number;
  alloy?: number;
  ore?: number;
}

export function getResourceProduction(nexus: NexusForEconomy, storm?: StormBonus): ResourceAmounts {
  // 800/h base lets a Lv1 farm tick about 13/min, enough that the opening
  // sequence (CC Lv1-3 → RC Lv1 → first troops) flows without dead time.
  const baseProduction = 800;
  const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.productionMultiplier ?? 1;
  const productionMultiplier = rawMultiplier === 1
    ? 1
    : 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
  const prod = (level: number, stormMult: number) =>
    level <= 0 ? 0 : baseProduction * Math.pow(1.35, level - 1) * productionMultiplier * stormMult;
  return {
    biomass: prod(nexus.biomassFarm,  storm?.biomass ?? 1),
    alloy:   prod(nexus.alloyForge,   storm?.alloy   ?? 1),
    ore:     prod(nexus.oreExtractor, storm?.ore     ?? 1),
  };
}

export function getMaxStorage(nexus: NexusForEconomy): number {
  const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.storageMultiplier ?? 1;
  const storageMultiplier = rawMultiplier === 1
    ? 1
    : 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
  // Base 1500 means Lv1 caps at 2250, so the buffed 1500 starting stockpile
  // has headroom from spawn instead of capping farms instantly.
  return 1500 * Math.pow(1.5, nexus.storageVault) * storageMultiplier;
}

export function getNexusTypeEffectiveMultipliers(nexus: NexusForEconomy): NexusTypeBonuses | null {
  const base = NEXUS_TYPE_BONUSES[nexus.nexusType ?? ''];
  if (!base) return null;
  if (!nexus.nexusTypeDoubled) return base;
  const scale = getDoubleScale(nexus);
  return {
    ...base,
    productionMultiplier: base.productionMultiplier !== undefined
      ? 1 + (base.productionMultiplier - 1) * scale : undefined,
    storageMultiplier: base.storageMultiplier !== undefined
      ? 1 + (base.storageMultiplier - 1) * scale : undefined,
    shieldEfficiencyMultiplier: base.shieldEfficiencyMultiplier !== undefined
      ? 1 + (base.shieldEfficiencyMultiplier - 1) * scale : undefined,
    trainingTimeMultiplier: base.trainingTimeMultiplier !== undefined
      ? Math.pow(base.trainingTimeMultiplier, scale) : undefined,
    buildTimeMultiplier: base.buildTimeMultiplier !== undefined
      ? Math.pow(base.buildTimeMultiplier, scale) : undefined,
    travelTimeMultiplier: base.travelTimeMultiplier !== undefined
      ? Math.pow(base.travelTimeMultiplier, scale) : undefined,
    lootProtection: base.lootProtection !== undefined
      ? Math.min(0.80, base.lootProtection * scale) : undefined,
    label: nexus.nexusTypeDoubled ? `[DOUBLED] ${base.label}` : base.label,
  };
}

export function computeResourceUpdate(nexus: NexusForEconomy, storm?: StormBonus): ResourceAmounts & { lastResourceUpdate: Date } {
  const now = new Date();
  const hoursSinceLastUpdate = (now.getTime() - nexus.lastResourceUpdate.getTime()) / (1000 * 60 * 60);
  const production = getResourceProduction(nexus, storm);
  const maxStorage = getMaxStorage(nexus);
  return {
    biomass: Math.min(nexus.biomass + production.biomass * hoursSinceLastUpdate, maxStorage),
    alloy:   Math.min(nexus.alloy   + production.alloy   * hoursSinceLastUpdate, maxStorage),
    ore:     Math.min(nexus.ore     + production.ore     * hoursSinceLastUpdate, maxStorage),
    lastResourceUpdate: now,
  };
}

export const TROOP_INFLUENCE_POINTS: Record<string, number> = {
  lancerDrone: 1, assaultTrooper: 1, breakerUnit: 1, reconOperative: 2,
  suppressorTeam: 3, bulwarkGuard: 3,
  skimmerBike: 4, disruptorUnit: 4,
  interceptorBike: 5, voidStalker: 5,
  siegeMech: 8, plasmaTurret: 10, annihilatorPlatform: 13,
  overseer: 50,
};

export function calculateTroopInfluence(troops: Record<string, number | undefined | null>): number {
  let points = 0;
  for (const [troopType, pts] of Object.entries(TROOP_INFLUENCE_POINTS)) {
    points += pts * (Number(troops[troopType]) || 0);
  }
  return points;
}

export function calculatePoints(nexus: NexusForEconomy & Partial<Record<string, unknown>>): number {
  let points = 0;
  const buildingPoints: Record<string, number> = {
    commandCore: 10, recruitmentCore: 16, lifeSupport: 5,
    storageVault: 6, biomassFarm: 6, alloyForge: 6, oreExtractor: 6, shieldGrid: 8, armory: 12,
  };
  for (const [building, pts] of Object.entries(buildingPoints)) {
    points += pts * (Number(nexus[building]) || 0);
  }
  points += calculateTroopInfluence(nexus as Record<string, number | undefined | null>);
  return Math.floor(points);
}
