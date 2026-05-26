export interface AllUser {
  _id: string;
  username: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  hasPendingToken: boolean;
  galaxyCount: number;
}

export const BUILDING_KEYS = [
  'commandCore',
  'recruitmentCore',
  'lifeSupport',
  'storageVault',
  'biomassFarm',
  'alloyForge',
  'oreExtractor',
  'shieldGrid',
  'armory',
  'stealthArray',
] as const;
export type BuildingKey = (typeof BUILDING_KEYS)[number];

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
  'overseer',
] as const;
export type TroopKey = (typeof TROOP_KEYS)[number];

export type UserNexus = {
  _id: string;
  id?: number;
  name: string;
  x?: number;
  y?: number;
  biomass: number;
  alloy: number;
  ore: number;
  populationCurrent: number;
  populationMax: number;
} & Record<BuildingKey, number> &
  Record<TroopKey, number>;

export interface GalaxyUser {
  _id: string;
  username: string;
  email: string;
  points: number;
  createdAt: string;
  nexuses: UserNexus[];
}

export interface TopUser {
  _id: string;
  username: string;
  points: number;
}

export interface GalaxyStats {
  userCount: number;
  villageCount: number;
  travelingAttackCount: number;
  totalAttackCount: number;
  newUsersThisWeek: number;
  zeroNexusCount: number;
  totalTroops: number;
  avgPoints: number;
  marketCount: number;
  topUsers: TopUser[];
}

export interface Attack {
  _id: string;
  attacker: { user: { username: string } };
  defender: { user: { username: string } };
  troops: Record<string, number>;
  arrivesAt: string;
}

export interface Galaxy {
  _id: number;
  id: number;
  name: string;
  status: 'active' | 'ended';
  startsAt: string | null;
  endedAt: string | null;
  winnerUserId: number | null;
  createdAt: string;
  playerCount: number;
  nexusCount: number;
}

export type AdminFetch = (url: string, options?: RequestInit) => Promise<Response>;
