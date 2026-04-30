export interface User {
  id: string;
  username: string;
  email: string;
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
  control?: number;
  controlLevel?: number;
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
    nexus: {
      _id: string;
      name: string;
      x: number;
      y: number;
      buildings?: {
        shieldGrid?: number;
      };
    };
  };
  defender: {
    user: {
      _id: string;
      username: string;
    };
    nexus: {
      _id: string;
      name: string;
      x: number;
      y: number;
      buildings?: {
        shieldGrid?: number;
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
    victory: boolean;
    conquered?: boolean;
    controlReduced?: boolean;
    remainingControl?: number;
    nexusLifeReduced?: boolean;
    remainingNexusLife?: number;
  };
}
