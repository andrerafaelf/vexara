export interface AllUser {
  _id: string;
  username: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  hasPendingToken: boolean;
  galaxyCount: number;
}

export interface UserNexus {
  _id: string;
  name: string;
}

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
