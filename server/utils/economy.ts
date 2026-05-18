import type { ResourceAmounts } from '../types/index.js';

interface NexusTypeBonuses {
  productionMultiplier?: number;
  storageMultiplier?: number;
  shieldEfficiencyMultiplier?: number;
  trainingTimeMultiplier?: number;
  buildTimeMultiplier?: number;
  label: string;
}

export const NEXUS_TYPE_BONUSES: Record<string, NexusTypeBonuses> = {
  'Resource Depot':    { productionMultiplier: 2, label: '2x Resource Production' },
  'Supply Cache':      { storageMultiplier: 2, label: '2x Storage Capacity' },
  'Military Outpost':  { shieldEfficiencyMultiplier: 1.25, trainingTimeMultiplier: 0.75, label: '+50% Shield Efficiency, 25% Faster Training' },
  'Reclaimed Outpost': { buildTimeMultiplier: 0.80, label: '20% Faster Construction' },
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
  const baseProduction = 600;
  const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.productionMultiplier ?? 1;
  const productionMultiplier = rawMultiplier === 1
    ? 1
    : 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
  return {
    biomass: baseProduction * Math.pow(1.35, nexus.biomassFarm - 1) * productionMultiplier * (storm?.biomass ?? 1),
    alloy:   baseProduction * Math.pow(1.35, nexus.alloyForge - 1)  * productionMultiplier * (storm?.alloy   ?? 1),
    ore:     baseProduction * Math.pow(1.35, nexus.oreExtractor - 1) * productionMultiplier * (storm?.ore     ?? 1),
  };
}

export function getMaxStorage(nexus: NexusForEconomy): number {
  const rawMultiplier = NEXUS_TYPE_BONUSES[nexus.nexusType ?? '']?.storageMultiplier ?? 1;
  const storageMultiplier = rawMultiplier === 1
    ? 1
    : 1 + (rawMultiplier - 1) * getDoubleScale(nexus);
  return 1000 * Math.pow(1.5, nexus.storageVault) * storageMultiplier;
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
      ? 1 - (1 - base.trainingTimeMultiplier) * scale : undefined,
    buildTimeMultiplier: base.buildTimeMultiplier !== undefined
      ? 1 - (1 - base.buildTimeMultiplier) * scale : undefined,
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

export function calculatePoints(nexus: NexusForEconomy & Partial<Record<string, unknown>>): number {
  let points = 0;
  const buildingPoints: Record<string, number> = {
    commandCore: 10, recruitmentCore: 16, lifeSupport: 5,
    storageVault: 6, biomassFarm: 6, alloyForge: 6, oreExtractor: 6, shieldGrid: 8, armory: 12,
  };
  for (const [building, pts] of Object.entries(buildingPoints)) {
    points += pts * (Number(nexus[building]) || 0);
  }
  const troopPoints: Record<string, number> = {
    lancerDrone: 1, assaultTrooper: 2, breakerUnit: 1, reconOperative: 2,
    skimmerBike: 3, siegeMech: 4, voidStalker: 4, plasmaTurret: 5,
  };
  for (const [troopType, pts] of Object.entries(troopPoints)) {
    points += pts * (Number(nexus[troopType]) || 0);
  }
  return Math.floor(points);
}
