export type SupporterTier = 'recruit' | 'officer' | 'commander';

export interface User {
	id: string;
	username: string;
	email: string;
	isSupporter?: boolean;
	supporterTier?: SupporterTier | null;
	isFounder?: boolean;
	avatarUrl?: string | null;
	avatarUrlSm?: string | null;
}

export interface TimelineDay {
	date: string;
	attacksLaunched: number;
	attacksDefended: number;
	troopsKilled: number;
	troopsLost: number;
	resourcesStolen: number;
	resourcesLost: number;
	biomassProduced: number;
	alloyProduced: number;
	oreProduced: number;
}

export interface UserStats {
	username: string;
	isSupporter?: boolean;
	supporterTier?: SupporterTier | null;
	isFounder?: boolean;
	avatarUrl?: string | null;
	avatarUrlSm?: string | null;
	points: number;
	accountAgeDays: number;
	nexusCount: number;
	totalTroops: number;
	combat: {
		attacksLaunched: number;
		attacksDefended: number;
		victories: number;
		defeats: number;
		troopsLost: number;
		troopsKilled: number;
		resourcesStolen: { biomass: number; alloy: number; ore: number };
		resourcesLost: { biomass: number; alloy: number; ore: number };
	};
	resources: {
		current: { biomass: number; alloy: number; ore: number };
		productionPerHour: { biomass: number; alloy: number; ore: number };
		avgPerDay: { biomass: number; alloy: number; ore: number };
	};
}

export interface NexusGroup {
	id: string;
	name: string;
	nexusIds: string[];
}

export interface TroopTransfer {
	_id: string;
	ownerNexusId: string;
	hostNexusId: string;
	troops: Record<string, number>;
	status: 'traveling' | 'stationed' | 'returning';
	arrivesAt?: string | null;
	returnsAt?: string | null;
	createdAt: string;
	ownerNexus?: { _id: string; name: string };
	hostNexus?: { _id: string; name: string };
}

export interface Nexus {
	_id: string;
	name: string;
	owner: string;
	x: number;
	y: number;
	resources: {
		biomass: number;
		alloy: number;
		ore: number;
	};
	buildings: {
		commandCore: number;
		hangarBay: number;
		plasmaForge: number;
		armorFoundry: number;
		lifeSupport: number;
		storageVault: number;
		biomassFarm: number;
		alloyForge: number;
		oreExtractor: number;
		shieldGrid: number;
		armory: number;
		stealthArray: number;
	};
	troops: {
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
	};
	population: {
		current: number;
		max: number;
	};
	buildQueue: BuildQueueItem[];
	trainingQueue: TrainingQueueItem[];
	questRewardClaims?: string[];
	completedQuestIds?: string[];
	troopsTrained?: Record<string, number>;
	lastResourceUpdate: Date;
	points: number;
	control?: number;
	controlLevel?: number;
	nexusType?: string | null;
	nexusTypeDoubled?: boolean;
	isDerelict?: boolean;
	nexusTypeLockedAt?: string | null;
	newbieProtectionEndsAt?: string | null;
	relocationTokenAvailable?: boolean;
	relocationTokenUsedAt?: string | null;
	createdAt?: string;
	conqueredAt?: string | null;
	intelLevel?: 'public' | 'scouted' | 'owned';
	scoutedAt?: string;
}

export interface MarketListing {
	id: number;
	sellerNexusId: number;
	sellerNexus: {
		id: number;
		name: string;
		x: number;
		y: number;
	};
	sellerUsername?: string;
	offerResource: 'biomass' | 'alloy' | 'ore';
	offerAmount: number;
	wantResource: 'biomass' | 'alloy' | 'ore';
	wantAmount: number;
	createdAt: string;
	hasTreaty?: boolean;
}

export interface BuildQueueItem {
	building: string;
	targetLevel: number;
	completesAt: Date;
}

export interface TrainingQueueItem {
	troopType: string;
	amount: number;
	completesAt: Date;
}

export interface Attack {
	_id: string;
	attacker: {
		user: {
			_id: string;
			username: string;
			isSupporter?: boolean;
			supporterTier?: SupporterTier | null;
		};
		nexus: {
			_id: string;
			name: string;
			x: number;
			y: number;
			buildings?: {
				shieldGrid?: number;
			};
			resources?: {
				biomass: number;
				alloy: number;
				ore: number;
			};
		};
	};
	defender: {
		user: {
			_id: string;
			username: string;
			isSupporter?: boolean;
			supporterTier?: SupporterTier | null;
		};
		nexus: {
			_id: string;
			name: string;
			x: number;
			y: number;
			buildings?: {
				shieldGrid?: number;
			};
			resources?: {
				biomass: number;
				alloy: number;
				ore: number;
			};
		};
	};
	troops: {
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
		[key: string]: number;
	};
	arrivesAt: Date;
	type: 'attack' | 'support' | 'scout';
	status: 'traveling' | 'completed' | 'cancelled';
	result: {
		attackerLosses: {
			lancerDrone?: number;
			assaultTrooper?: number;
			breakerUnit?: number;
			reconOperative?: number;
			skimmerBike?: number;
			siegeMech?: number;
			bulwarkGuard?: number;
			suppressorTeam?: number;
			disruptorUnit?: number;
			interceptorBike?: number;
			annihilatorPlatform?: number;
			overseer?: number;
			[key: string]: number | undefined;
		};
		defenderLosses: {
			lancerDrone?: number;
			assaultTrooper?: number;
			breakerUnit?: number;
			reconOperative?: number;
			skimmerBike?: number;
			siegeMech?: number;
			bulwarkGuard?: number;
			suppressorTeam?: number;
			disruptorUnit?: number;
			interceptorBike?: number;
			annihilatorPlatform?: number;
			overseer?: number;
			[key: string]: number | undefined;
		};
		resourcesStolen: {
			biomass: number;
			alloy: number;
			ore: number;
		};
		remainingResources?: {
			biomass: number;
			alloy: number;
			ore: number;
		};
		attackerInitial?: Record<string, number>;
		defenderInitial?: Record<string, number>;
		defenderSurvivors?: Record<string, number>;
		attackerPower?: number;
		defenderPower?: number;
		combatSeed?: number;
		victory: boolean;
		conquered?: boolean;
		controlReduced?: boolean;
		remainingControl?: number;
		nexusLifeReduced?: boolean;
		remainingNexusLife?: number;
		buildingDamage?: { building: string; from: number; to: number }[];
		alliedContributions?: {
			ownerNexusId: number;
			ownerNexusName: string;
			ownerUsername: string | null;
			initial: Record<string, number>;
			losses: Record<string, number>;
			survivors: Record<string, number>;
		}[];
		alliedNexusIds?: number[];
		mission?: 'scout';
		// Scout-attack outcome. True when defender's Stealth Array intercepted
		// the scout - operatives lost, no intel returned (Stage 2c).
		scoutFailed?: boolean;
		intel?: {
			resources: {
				biomass: number;
				alloy: number;
				ore: number;
			};
			buildings: {
				commandCore: number;
				hangarBay: number;
				plasmaForge: number;
				armorFoundry: number;
				lifeSupport: number;
				storageVault: number;
				biomassFarm: number;
				alloyForge: number;
				oreExtractor: number;
				shieldGrid: number;
				armory: number;
				stealthArray: number;
			};
			troops: {
				[key: string]: number;
			};
			population: {
				current: number;
				max: number;
			};
			controlLevel: number;
		};
	};
}
