export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Village {
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
    troopFabricator: number;
    lifeSupport: number;
    storageVault: number;
    biomassFarm: number;
    alloyForge: number;
    oreExtractor: number;
    shieldGrid: number;
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
    overseer: number;
  };
  population: {
    current: number;
    max: number;
  };
  buildQueue: BuildQueueItem[];
  trainingQueue: TrainingQueueItem[];
  lastResourceUpdate: Date;
  points: number;
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
    };
    village: {
      _id: string;
      name: string;
      x: number;
      y: number;
    };
  };
  defender: {
    user: {
      _id: string;
      username: string;
    };
    village: {
      _id: string;
      name: string;
      x: number;
      y: number;
    };
  };
  troops: {
    lancerDrone: number;
    assaultTrooper: number;
    breakerUnit: number;
    reconDrone: number;
    skimmerBike: number;
    siegeMech: number;
  };
  arrivesAt: Date;
  type: 'attack' | 'support' | 'scout';
  status: 'traveling' | 'completed' | 'cancelled';
  result: {
    attackerLosses: {
      lancerDrone?: number;
      assaultTrooper?: number;
      breakerUnit?: number;
      reconDrone?: number;
      skimmerBike?: number;
      siegeMech?: number;
    };
    defenderLosses: {
      lancerDrone?: number;
      assaultTrooper?: number;
      breakerUnit?: number;
      reconDrone?: number;
      skimmerBike?: number;
      siegeMech?: number;
    };
    resourcesStolen: {
      biomass: number;
      alloy: number;
      ore: number;
    };
    victory: boolean;
  };
}
