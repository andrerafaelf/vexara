import prisma from '../lib/prisma.js';

// --- Pure computation helpers ---

export function getResourceProduction(village) {
  const baseProduction = 30;
  return {
    biomass: baseProduction * Math.pow(1.2, village.biomassFarm - 1),
    alloy: baseProduction * Math.pow(1.2, village.alloyForge - 1),
    ore: baseProduction * Math.pow(1.2, village.oreExtractor - 1),
  };
}

export function getMaxStorage(village) {
  return 1000 * Math.pow(1.3, village.storageVault);
}

export function computeResourceUpdate(village) {
  const now = new Date();
  const hoursSinceLastUpdate = (now - village.lastResourceUpdate) / (1000 * 60 * 60);
  const production = getResourceProduction(village);
  const maxStorage = getMaxStorage(village);
  return {
    biomass: Math.min(village.biomass + production.biomass * hoursSinceLastUpdate, maxStorage),
    alloy: Math.min(village.alloy + production.alloy * hoursSinceLastUpdate, maxStorage),
    ore: Math.min(village.ore + production.ore * hoursSinceLastUpdate, maxStorage),
    lastResourceUpdate: now,
  };
}

export function calculatePoints(village) {
  let points = 0;
  const buildingPoints = {
    commandCore: 10,
    troopFabricator: 16,
    lifeSupport: 5,
    storageVault: 6,
    biomassFarm: 6,
    alloyForge: 6,
    oreExtractor: 6,
    shieldGrid: 8,
  };
  for (const [building, pts] of Object.entries(buildingPoints)) {
    points += pts * (village[building] || 0);
  }
  const troopPoints = {
    lancerDrone: 1,
    assaultTrooper: 2,
    breakerUnit: 1,
    reconOperative: 2,
    skimmerBike: 3,
    siegeMech: 4,
  };
  for (const [troopType, pts] of Object.entries(troopPoints)) {
    points += pts * (village[troopType] || 0);
  }
  return Math.floor(points);
}

// --- DB helpers ---

/** Refresh resource counts in DB and return updated village */
export async function refreshResources(village) {
  const resourceUpdate = computeResourceUpdate(village);
  const points = calculatePoints({ ...village, ...resourceUpdate });
  return prisma.village.update({
    where: { id: village.id },
    data: { ...resourceUpdate, points },
  });
}

/** Bulk-update resources for all villages (called on interval) */
export async function updateAllResources() {
  try {
    const villages = await prisma.village.findMany();
    for (const village of villages) {
      const resourceUpdate = computeResourceUpdate(village);
      const points = calculatePoints({ ...village, ...resourceUpdate });
      await prisma.village.update({
        where: { id: village.id },
        data: { ...resourceUpdate, points },
      });
    }
  } catch (err) {
    console.error('Error updating resources:', err);
  }
}

// --- Serialization: maps flat Prisma row → nested shape the frontend expects ---

export function serializeVillage(v, opts = {}) {
  const base = {
    _id: v.id,
    id: v.id,
    name: v.name,
    owner: v.ownerId,
    x: v.x,
    y: v.y,
    resources: {
      biomass: v.biomass,
      alloy: v.alloy,
      ore: v.ore,
    },
    buildings: {
      commandCore: v.commandCore,
      troopFabricator: v.troopFabricator,
      lifeSupport: v.lifeSupport,
      storageVault: v.storageVault,
      biomassFarm: v.biomassFarm,
      alloyForge: v.alloyForge,
      oreExtractor: v.oreExtractor,
      shieldGrid: v.shieldGrid,
    },
    troops: {
      lancerDrone: v.lancerDrone,
      assaultTrooper: v.assaultTrooper,
      breakerUnit: v.breakerUnit,
      reconOperative: v.reconOperative,
      skimmerBike: v.skimmerBike,
      siegeMech: v.siegeMech,
      bulwarkGuard: v.bulwarkGuard,
      suppressorTeam: v.suppressorTeam,
      disruptorUnit: v.disruptorUnit,
      interceptorBike: v.interceptorBike,
      annihilatorPlatform: v.annihilatorPlatform,
      overseer: v.overseer,
    },
    population: {
      current: v.populationCurrent,
      max: v.populationMax,
    },
    buildQueue: v.buildQueue,
    trainingQueue: v.trainingQueue,
    lastResourceUpdate: v.lastResourceUpdate,
    points: v.points,
    controlLevel: v.controlLevel,
    createdAt: v.createdAt,
  };

  if (opts.ownerData) {
    base.owner = opts.ownerData;
  }

  return base;
}

export function serializeAttack(a) {
  return {
    _id: a.id,
    id: a.id,
    attacker: {
      user: a.attackerUserId,
      village: a.attackerVillageId,
      ...(a.attackerVillage
        ? {
            villageData: {
              _id: a.attackerVillage.id,
              name: a.attackerVillage.name,
              x: a.attackerVillage.x,
              y: a.attackerVillage.y,
            },
          }
        : {}),
    },
    defender: {
      user: a.defenderUserId,
      village: a.defenderVillageId,
      ...(a.defenderVillage
        ? {
            villageData: {
              _id: a.defenderVillage.id,
              name: a.defenderVillage.name,
              x: a.defenderVillage.x,
              y: a.defenderVillage.y,
            },
          }
        : {}),
    },
    troops: a.troops,
    arrivesAt: a.arrivesAt,
    type: a.type,
    status: a.status,
    result: a.result,
    createdAt: a.createdAt,
  };
}

// Dummy export to satisfy any leftover default imports during transition
export default { serializeVillage, serializeAttack, updateAllResources };
