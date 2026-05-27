// Single source of truth for building / troop costs and time math.
// Mirrored verbatim in server/utils/gameConstants.ts - same convention as
// economy.ts / economy.shared.ts. If you change a number or formula here,
// change it in the server mirror in the same commit.

export interface BuildingCost {
  biomass: number;
  alloy: number;
  ore: number;
  time: number;
}

export const BUILDING_COSTS: Record<string, BuildingCost> = {
  commandCore:     { biomass: 90,  alloy: 80,  ore: 70,  time: 120 },
  recruitmentCore: { biomass: 180, alloy: 150, ore: 80,  time: 180 },
  lifeSupport:     { biomass: 80,  alloy: 100, ore: 70,  time: 150 },
  storageVault:    { biomass: 60,  alloy: 50,  ore: 70,  time: 120 },
  biomassFarm:     { biomass: 50,  alloy: 60,  ore: 60,  time: 120 },
  alloyForge:      { biomass: 65,  alloy: 40,  ore: 60,  time: 120 },
  oreExtractor:    { biomass: 75,  alloy: 65,  ore: 70,  time: 150 },
  shieldGrid:      { biomass: 50,  alloy: 100, ore: 60,  time: 180 },
  armory:          { biomass: 120, alloy: 180, ore: 140, time: 210 },
  stealthArray:    { biomass: 100, alloy: 150, ore: 180, time: 210 },
};

export interface TroopCost {
  biomass: number;
  alloy: number;
  ore: number;
  population: number;
  time: number;
}

export const TROOP_COSTS: Record<string, TroopCost> = {
  lancerDrone:          { biomass: 150,    alloy: 150,    ore: 200,    population: 1, time: 53    },
  assaultTrooper:       { biomass: 150,    alloy: 150,    ore: 350,    population: 1, time: 79    },
  breakerUnit:          { biomass: 250,    alloy: 150,    ore: 300,    population: 1, time: 160   },
  reconOperative:       { biomass: 400,    alloy: 150,    ore: 400,    population: 1, time: 180   },
  suppressorTeam:       { biomass: 450,    alloy: 400,    ore: 450,    population: 2, time: 540   },
  skimmerBike:          { biomass: 625,    alloy: 500,    ore: 750,    population: 3, time: 720   },
  bulwarkGuard:         { biomass: 400,    alloy: 600,    ore: 500,    population: 2, time: 720   },
  disruptorUnit:        { biomass: 550,    alloy: 750,    ore: 650,    population: 2, time: 840   },
  interceptorBike:      { biomass: 750,    alloy: 600,    ore: 900,    population: 3, time: 1080  },
  voidStalker:          { biomass: 900,    alloy: 700,    ore: 1100,   population: 3, time: 1440  },
  siegeMech:            { biomass: 1250,   alloy: 1000,   ore: 2000,   population: 4, time: 2400  },
  plasmaTurret:         { biomass: 1500,   alloy: 1200,   ore: 2500,   population: 2, time: 3000  },
  annihilatorPlatform:  { biomass: 2000,   alloy: 1750,   ore: 3000,   population: 5, time: 5400  },
  overseer:             { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 },
};

export const COST_SCALING = { early: 1.5, mid: 1.65, late: 1.8 };
export const TIME_SCALING = { early: 1.25, mid: 1.35, late: 1.45 };

export const COMMAND_BUILD_TIME_FACTOR_PER_LEVEL = 0.95;
export const RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL = 0.92;

export function getCommandTimeFactor(commandLevel: number): number {
  return Math.pow(COMMAND_BUILD_TIME_FACTOR_PER_LEVEL, Math.max(0, commandLevel || 0));
}

export function getBuildingCost(building: string, currentLevel: number): BuildingCost {
  const base = BUILDING_COSTS[building];
  const targetLevel = currentLevel + 1;
  let { biomass, alloy, ore, time } = base;
  for (let level = 2; level <= targetLevel; level += 1) {
    const cm = level <= 5 ? COST_SCALING.early : level <= 10 ? COST_SCALING.mid : COST_SCALING.late;
    const tm = level <= 5 ? TIME_SCALING.early : level <= 10 ? TIME_SCALING.mid : TIME_SCALING.late;
    biomass *= cm; alloy *= cm; ore *= cm; time *= tm;
  }
  return { biomass: Math.floor(biomass), alloy: Math.floor(alloy), ore: Math.floor(ore), time: Math.floor(time) };
}

export function getTrainTimeSeconds(troopType: string, recruitmentLevel: number): number {
  const baseTime = TROOP_COSTS[troopType].time;
  if (troopType === 'overseer') return baseTime;
  const factor = Math.pow(RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL, Math.max(0, recruitmentLevel || 0));
  return Math.max(1, Math.floor(baseTime * factor));
}

export function getEffectiveTrainTimeSeconds(
  troopType: string,
  recruitmentLevel: number,
  nexusType: string | null | undefined,
  nexusTypeDoubled: boolean,
): number {
  const perUnit = getTrainTimeSeconds(troopType, recruitmentLevel);
  if (troopType === 'overseer') return perUnit;
  const baseTrainMult = NEXUS_TYPE_TRAINING_MULTIPLIERS[nexusType ?? ''];
  if (baseTrainMult === undefined) return perUnit;
  const effective = nexusTypeDoubled ? Math.pow(baseTrainMult, 2) : baseTrainMult;
  return Math.max(1, Math.floor(perUnit * effective));
}

export function getEffectiveBuildTimeSeconds(
  building: string,
  currentLevel: number,
  commandCoreLevel: number,
  nexusType: string | null | undefined,
  nexusTypeDoubled: boolean,
): number {
  const cost = getBuildingCost(building, currentLevel);
  const baseBuildMult = NEXUS_TYPE_BUILD_TIME_MULTIPLIERS[nexusType ?? ''];
  const nexusFactor = baseBuildMult === undefined
    ? 1
    : (nexusTypeDoubled ? Math.pow(baseBuildMult, 2) : baseBuildMult);
  return Math.max(1, Math.floor(cost.time * getCommandTimeFactor(commandCoreLevel) * nexusFactor));
}

export const NEXUS_TYPE_TRAINING_MULTIPLIERS: Record<string, number> = {
  'Military Outpost': 0.5,
};

export const NEXUS_TYPE_BUILD_TIME_MULTIPLIERS: Record<string, number> = {
  'Reclaimed Outpost': 0.8,
};
