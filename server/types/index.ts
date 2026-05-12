import type { Request } from 'express';

export interface AuthRequest extends Request {
  userId: number;
  galaxyId: number;
  galaxyStatus: string | null;
  requestId?: string;
  activeGalaxyOptional?: boolean;
}

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
  overseer: number;
}

export type TroopKey = keyof TroopCounts;

export interface BuildingLevels {
  commandCore: number;
  recruitmentCore: number;
  lifeSupport: number;
  storageVault: number;
  biomassFarm: number;
  alloyForge: number;
  oreExtractor: number;
  shieldGrid: number;
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
  lastResourceUpdate: Date;
  points: number;
  controlLevel: number;
  nexusType: string | null;
  newbieProtectionEndsAt: Date | null;
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
