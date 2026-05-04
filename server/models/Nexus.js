import prisma from '../lib/prisma.js';
import {
  calculatePoints as calculatePointsBase,
  computeResourceUpdate as computeResourceUpdateBase,
  getMaxStorage as getMaxStorageBase,
  getResourceProduction as getResourceProductionBase,
} from '../utils/economy.js';

// --- Pure computation helpers ---

export function getResourceProduction(nexus) {
  return getResourceProductionBase(nexus);
}

export function getMaxStorage(nexus) {
  return getMaxStorageBase(nexus);
}

export function computeResourceUpdate(nexus) {
  return computeResourceUpdateBase(nexus);
}

export function calculatePoints(nexus) {
  return calculatePointsBase(nexus);
}

const QUEST_REWARD_BATCHES = [
  {
    id: 'intro',
    isUnlocked: () => true,
    isCompleted: ({ nexus }) =>
      nexus.commandCore >= 1 && nexus.troopFabricator >= 1 && nexus.storageVault >= 2 && nexus.assaultTrooper >= 5,
    reward: {
      biomass: 250,
      alloy: 250,
      ore: 250,
      populationCurrent: 5,
      troops: { assaultTrooper: 5 },
    },
  },
  {
    id: 'intermediate',
    isUnlocked: ({ completedBatchIds }) => completedBatchIds.has('intro'),
    isCompleted: ({ nexus }) =>
      nexus.commandCore >= 2 &&
      nexus.shieldGrid >= 1 &&
      nexus.biomassFarm >= 2 &&
      nexus.alloyForge >= 2 &&
      nexus.reconOperative >= 1,
    reward: {
      biomass: 900,
      alloy: 900,
      ore: 900,
      populationCurrent: 10,
      troops: { reconOperative: 10 },
    },
  },
  {
    id: 'advanced',
    isUnlocked: ({ completedBatchIds }) => completedBatchIds.has('intro') && completedBatchIds.has('intermediate'),
    isCompleted: ({ nexus, hasOutgoingStrike }) =>
      nexus.commandCore >= 4 &&
      nexus.oreExtractor >= 4 &&
      nexus.shieldGrid >= 2 &&
      nexus.skimmerBike >= 5 &&
      hasOutgoingStrike,
    reward: {
      biomass: 2500,
      alloy: 2500,
      ore: 2500,
      populationCurrent: 80,
      troops: { skimmerBike: 20, siegeMech: 5 },
    },
  },
];

function getQuestRewardClaims(nexus) {
  return Array.isArray(nexus.questRewardClaims)
    ? nexus.questRewardClaims.filter((value) => typeof value === 'string')
    : [];
}

export async function applyQuestRewards(nexus, options = {}) {
  const claimedRewards = new Set(getQuestRewardClaims(nexus));
  const hasOutgoingStrike =
    options.hasOutgoingStrike ??
    Boolean(
      await prisma.attack.findFirst({
        where: { attackerNexusId: nexus.id, status: 'traveling' },
        select: { id: true },
      }),
    );

  const completedBatchIds = new Set();
  for (const batch of QUEST_REWARD_BATCHES) {
    if (batch.isCompleted({ nexus, hasOutgoingStrike })) {
      completedBatchIds.add(batch.id);
    }
  }

  const newlyClaimedRewards = [];
  const data = {
    biomass: nexus.biomass,
    alloy: nexus.alloy,
    ore: nexus.ore,
    populationCurrent: nexus.populationCurrent,
  };

  for (const batch of QUEST_REWARD_BATCHES) {
    if (!batch.isUnlocked({ completedBatchIds }) || !completedBatchIds.has(batch.id) || claimedRewards.has(batch.id)) {
      continue;
    }

    const reward = batch.reward;
    data.biomass += reward.biomass || 0;
    data.alloy += reward.alloy || 0;
    data.ore += reward.ore || 0;
    data.populationCurrent += reward.populationCurrent || 0;

    for (const [troopType, amount] of Object.entries(reward.troops || {})) {
      data[troopType] = (data[troopType] || nexus[troopType] || 0) + amount;
    }

    claimedRewards.add(batch.id);
    newlyClaimedRewards.push(batch.id);
  }

  if (newlyClaimedRewards.length === 0) {
    return nexus;
  }

  data.questRewardClaims = Array.from(claimedRewards);
  data.points = calculatePoints({ ...nexus, ...data });

  return prisma.nexus.update({
    where: { id: nexus.id },
    data,
  });
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

export async function applyCompletedQueues(nexus) {
  const now = new Date();
  const buildQueue = Array.isArray(nexus.buildQueue) ? [...nexus.buildQueue] : [];
  const trainingQueue = Array.isArray(nexus.trainingQueue) ? [...nexus.trainingQueue] : [];
  const updates = {};

  while (buildQueue.length > 0 && new Date(buildQueue[0].completesAt) <= now) {
    const build = buildQueue.shift();
    updates[build.building] = build.targetLevel;

    if (build.building === 'lifeSupport') {
      updates.populationMax = Math.floor(24 * Math.pow(1.17, build.targetLevel));
    }
  }

  updates.buildQueue = buildQueue;

  while (trainingQueue.length > 0 && new Date(trainingQueue[0].completesAt) <= now) {
    const training = trainingQueue.shift();
    updates[training.troopType] = (updates[training.troopType] || nexus[training.troopType] || 0) + training.amount;
  }

  updates.trainingQueue = trainingQueue;

  if (Object.keys(updates).length === 1 && updates.trainingQueue === trainingQueue && !updates.buildQueue) {
    return nexus;
  }

  return prisma.nexus.update({
    where: { id: nexus.id },
    data: updates,
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
    questRewardClaims: v.questRewardClaims,
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
      user: {
        _id: a.attackerUserId,
        id: a.attackerUserId,
        username: a.attackerUsername,
      },
      nexus: a.attackerNexus
        ? {
            _id: a.attackerNexus.id,
            id: a.attackerNexus.id,
            name: a.attackerNexus.name,
            x: a.attackerNexus.x,
            y: a.attackerNexus.y,
            buildings:
              a.attackerNexus.shieldGrid !== undefined ? { shieldGrid: a.attackerNexus.shieldGrid } : undefined,
          }
        : {
            _id: a.attackerNexusId,
            id: a.attackerNexusId,
          },
    },
    defender: {
      user: {
        _id: a.defenderUserId,
        id: a.defenderUserId,
        username: a.defenderUsername,
      },
      nexus: a.defenderNexus
        ? {
            _id: a.defenderNexus.id,
            id: a.defenderNexus.id,
            name: a.defenderNexus.name,
            x: a.defenderNexus.x,
            y: a.defenderNexus.y,
            buildings:
              a.defenderNexus.shieldGrid !== undefined ? { shieldGrid: a.defenderNexus.shieldGrid } : undefined,
          }
        : {
            _id: a.defenderNexusId,
            id: a.defenderNexusId,
          },
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
