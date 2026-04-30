import prisma from '../lib/prisma.js';

function buildPublicNexusData(nexus) {
  return {
    _id: nexus.id,
    id: nexus.id,
    name: nexus.name,
    x: nexus.x,
    y: nexus.y,
    points: nexus.points,
    owner: nexus.owner
      ? {
          _id: nexus.owner.id,
          id: nexus.owner.id,
          username: nexus.owner.username,
          points: nexus.owner.points,
        }
      : null,
    intelLevel: 'public',
  };
}

export function buildDetailedScoutIntel(nexus) {
  return {
    resources: {
      biomass: Math.floor(nexus.biomass),
      alloy: Math.floor(nexus.alloy),
      ore: Math.floor(nexus.ore),
    },
    buildings: {
      commandCore: nexus.commandCore,
      troopFabricator: nexus.troopFabricator,
      lifeSupport: nexus.lifeSupport,
      storageVault: nexus.storageVault,
      biomassFarm: nexus.biomassFarm,
      alloyForge: nexus.alloyForge,
      oreExtractor: nexus.oreExtractor,
      shieldGrid: nexus.shieldGrid,
    },
    troops: {
      lancerDrone: nexus.lancerDrone,
      assaultTrooper: nexus.assaultTrooper,
      breakerUnit: nexus.breakerUnit,
      reconOperative: nexus.reconOperative,
      skimmerBike: nexus.skimmerBike,
      siegeMech: nexus.siegeMech,
      bulwarkGuard: nexus.bulwarkGuard,
      suppressorTeam: nexus.suppressorTeam,
      disruptorUnit: nexus.disruptorUnit,
      interceptorBike: nexus.interceptorBike,
      annihilatorPlatform: nexus.annihilatorPlatform,
      overseer: nexus.overseer,
    },
    population: {
      current: nexus.populationCurrent,
      max: nexus.populationMax,
    },
    controlLevel: nexus.controlLevel,
  };
}

export async function getNexusIntelForUser(userId, nexusId) {
  const nexus = await prisma.nexus.findUnique({
    where: { id: nexusId },
    include: {
      owner: { select: { id: true, username: true, points: true } },
    },
  });

  if (!nexus) {
    return null;
  }

  const publicData = buildPublicNexusData(nexus);

  if (nexus.ownerId === userId) {
    return {
      ...publicData,
      ...buildDetailedScoutIntel(nexus),
      intelLevel: 'owned',
      scoutedAt: new Date().toISOString(),
    };
  }

  const scoutReport = await prisma.attack.findFirst({
    where: {
      attackerUserId: userId,
      defenderNexusId: nexusId,
      type: 'scout',
      status: 'completed',
    },
    orderBy: { arrivesAt: 'desc' },
  });

  if (!scoutReport?.result?.intel) {
    return publicData;
  }

  return {
    ...publicData,
    ...scoutReport.result.intel,
    intelLevel: 'scouted',
    scoutedAt: scoutReport.arrivesAt,
  };
}
