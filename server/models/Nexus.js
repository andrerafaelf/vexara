import prisma from '../lib/prisma.js';

// --- Pure computation helpers ---

export function getResourceProduction(nexus) {
  const baseProduction = 30;
  return {
    biomass: baseProduction * Math.pow(1.2, nexus.biomassFarm - 1),
    alloy: baseProduction * Math.pow(1.2, nexus.alloyForge - 1),
    ore: baseProduction * Math.pow(1.2, nexus.oreExtractor - 1),
  };
}

export function getMaxStorage(nexus) {
  return 1000 * Math.pow(1.3, nexus.storageVault);
}

export function computeResourceUpdate(nexus) {
  const now = new Date();
  const hoursSinceLastUpdate = (now - nexus.lastResourceUpdate) / (1000 * 60 * 60);
  const production = getResourceProduction(nexus);
  const maxStorage = getMaxStorage(nexus);
  return {
    biomass: Math.min(nexus.biomass + production.biomass * hoursSinceLastUpdate, maxStorage),
    alloy: Math.min(nexus.alloy + production.alloy * hoursSinceLastUpdate, maxStorage),
    ore: Math.min(nexus.ore + production.ore * hoursSinceLastUpdate, maxStorage),
    lastResourceUpdate: now,
  };
}

export function calculatePoints(nexus) {
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
    points += pts * (nexus[building] || 0);
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
    points += pts * (nexus[troopType] || 0);
  }
  return Math.floor(points);
}

// --- DB helpers ---

/** Refresh resource counts in DB and return updated nexus */
export async function refreshResources(nexus) {
  const resourceUpdate = computeResourceUpdate(nexus);
  const points = calculatePoints({ ...nexus, ...resourceUpdate });
  return prisma.nexus.update({
    where: { id: nexus.id },
    data: { ...resourceUpdate, points },
  });
}

/** Bulk-update resources for all nexuses (called on interval) */
export async function updateAllResources() {
  try {
    const nexuses = await prisma.nexus.findMany();
    for (const nexus of nexuses) {
      const resourceUpdate = computeResourceUpdate(nexus);
      const points = calculatePoints({ ...nexus, ...resourceUpdate });
      await prisma.nexus.update({
        where: { id: nexus.id },
        data: { ...resourceUpdate, points },
      });
    }
  } catch (err) {
    console.error('Error updating resources:', err);
  }
}

// --- Serialization: maps flat Prisma row → nested shape the frontend expects ---

export function serializeNexus(v, opts = {}) {
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
      nexus: a.attackerNexusId,
      ...(a.attackerNexus
        ? {
            nexusData: {
              _id: a.attackerNexus.id,
              name: a.attackerNexus.name,
              x: a.attackerNexus.x,
              y: a.attackerNexus.y,
            },
          }
        : {}),
    },
    defender: {
      user: a.defenderUserId,
      nexus: a.defenderNexusId,
      ...(a.defenderNexus
        ? {
            nexusData: {
              _id: a.defenderNexus.id,
              name: a.defenderNexus.name,
              x: a.defenderNexus.x,
              y: a.defenderNexus.y,
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
export default { serializeNexus, serializeAttack, updateAllResources };
