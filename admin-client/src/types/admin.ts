export interface AllUser {
	_id: string;
	username: string;
	email: string;
	createdAt: string;
	emailVerified: boolean;
	hasPendingToken: boolean;
	galaxyCount: number;
	isFlagged?: boolean;
	flagReason?: string | null;
	flaggedAt?: string | null;
	registrationIp?: string | null;
}

export const BUILDING_KEYS = [
	'commandCore',
	'hangarBay',
	'plasmaForge',
	'armorFoundry',
	'lifeSupport',
	'storageVault',
	'biomassFarm',
	'alloyForge',
	'oreExtractor',
	'shieldGrid',
	'armory',
	'stealthArray'
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
	'voidStalker',
	'plasmaTurret',
	'annihilatorPlatform',
	'overseer'
] as const;
export type TroopKey = (typeof TROOP_KEYS)[number];

export type UserNexus = {
	_id: string;
	id?: number;
	name: string;
	x?: number;
	y?: number;
	conqueredAt?: string | null;
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
	factionCount: number;
	topUsers: TopUser[];
}

export type AttackType = 'attack' | 'scout' | 'support' | 'transfer';

export interface Attack {
	_id: string;
	attacker: { user: { username: string } };
	defender: { user: { username: string } };
	troops: Record<string, number>;
	arrivesAt: string;
	type: AttackType;
	status?: string;
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

export type FactionRole = 'leader' | 'officer' | 'member';

export interface FactionMember {
	_id: string;
	id: number;
	userId: number;
	username: string;
	email: string;
	role: FactionRole;
	joinedAt: string;
	points: number;
	nexusCount: number;
}

export interface AdminFaction {
	_id: string;
	id: number;
	galaxyId: number;
	name: string;
	tag: string;
	description: string | null;
	motd: string | null;
	createdAt: string;
	dominanceSince: string | null;
	memberCount: number;
	inviteCount: number;
	joinRequestCount: number;
	targetCount: number;
	activeWarCount: number;
	pendingWarCount: number;
	activeTreatyCount: number;
	totalPoints: number;
	nexusCount: number;
	members: FactionMember[];
}
