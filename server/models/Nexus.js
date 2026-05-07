import prisma from '../lib/prisma.js';
import {
  calculatePoints as calculatePointsBase,
  computeResourceUpdate as computeResourceUpdateBase,
  getMaxStorage as getMaxStorageBase,
  getResourceProduction as getResourceProductionBase,
} from '../utils/economy.js';
import { getPopulationMax } from '../utils/population.js';

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
    quests: [
      { id: 'build_command_core_1', check: ({ nexus }) => nexus.commandCore >= 1 },
      { id: 'build_troop_fab_1', check: ({ nexus }) => nexus.recruitmentCore >= 1 },
      { id: 'build_storage_vault_2', check: ({ nexus }) => nexus.storageVault >= 2 },
      { id: 'train_assault_trooper_5', check: ({ nexus }) => nexus.assaultTrooper >= 5 },
    ],
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
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('intro'),
    quests: [
      { id: 'build_command_core_3', check: ({ nexus }) => nexus.commandCore >= 3 },
      { id: 'build_shield_grid_1', check: ({ nexus }) => nexus.shieldGrid >= 1 },
      { id: 'build_biomass_farm_2', check: ({ nexus }) => nexus.biomassFarm >= 2 },
      { id: 'build_alloy_forge_2', check: ({ nexus }) => nexus.alloyForge >= 2 },
      { id: 'train_recon_operative_1', check: ({ nexus }) => nexus.reconOperative >= 1 },
    ],
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
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('intermediate'),
    quests: [
      { id: 'build_command_core_4', check: ({ nexus }) => nexus.commandCore >= 4 },
      { id: 'build_ore_extractor_4', check: ({ nexus }) => nexus.oreExtractor >= 4 },
      { id: 'build_shield_grid_2', check: ({ nexus }) => nexus.shieldGrid >= 2 },
      { id: 'train_skimmer_bike_5', check: ({ nexus }) => nexus.skimmerBike >= 5 },
      { id: 'send_first_strike', check: ({ hasOutgoingStrike }) => hasOutgoingStrike },
    ],
    reward: {
      biomass: 2500,
      alloy: 2500,
      ore: 2500,
      populationCurrent: 80,
      troops: { skimmerBike: 20, siegeMech: 5 },
    },
  },
  {
    id: 'veteran',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('advanced'),
    quests: [
      { id: 'build_command_core_6', check: ({ nexus }) => nexus.commandCore >= 6 },
      { id: 'build_troop_fab_5', check: ({ nexus }) => nexus.recruitmentCore >= 5 },
      { id: 'build_life_support_4', check: ({ nexus }) => nexus.lifeSupport >= 4 },
      { id: 'train_siege_mech_3', check: ({ nexus }) => nexus.siegeMech >= 3 },
      { id: 'train_disruptor_unit_5', check: ({ nexus }) => nexus.disruptorUnit >= 5 },
    ],
    reward: {
      biomass: 5000,
      alloy: 5000,
      ore: 5000,
      populationCurrent: 50,
      troops: { siegeMech: 10, disruptorUnit: 5 },
    },
  },
  {
    id: 'conqueror',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('veteran'),
    quests: [
      { id: 'build_command_core_8', check: ({ nexus }) => nexus.commandCore >= 8 },
      { id: 'build_ore_extractor_8', check: ({ nexus }) => nexus.oreExtractor >= 8 },
      { id: 'build_shield_grid_5', check: ({ nexus }) => nexus.shieldGrid >= 5 },
      { id: 'train_annihilator_1', check: ({ nexus }) => nexus.annihilatorPlatform >= 1 },
      { id: 'complete_attack', check: ({ hasCompletedAttack }) => hasCompletedAttack },
    ],
    reward: {
      biomass: 10000,
      alloy: 10000,
      ore: 10000,
      populationCurrent: 100,
      troops: { annihilatorPlatform: 1, siegeMech: 10 },
    },
  },
];

export { QUEST_REWARD_BATCHES };

export async function applyQuestRewards(nexus, options = {}) {
  // Quests are tracked per-user, not per-nexus. Skip for neutral nexuses.
  if (!nexus.ownerId) return nexus;

  const user = await prisma.user.findUnique({
    where: { id: nexus.ownerId },
    select: { id: true, questRewardClaims: true, completedQuestIds: true },
  });
  if (!user) return nexus;

  const claimedRewards = new Set(
    Array.isArray(user.questRewardClaims) ? user.questRewardClaims.filter((v) => typeof v === 'string') : [],
  );
  const completedQuestIds = new Set(
    Array.isArray(user.completedQuestIds) ? user.completedQuestIds.filter((v) => typeof v === 'string') : [],
  );

  const hasOutgoingStrike =
    options.hasOutgoingStrike ??
    Boolean(
      await prisma.attack.findFirst({
        where: { attackerNexusId: nexus.id, status: 'traveling' },
        select: { id: true },
      }),
    );
  const hasCompletedAttack =
    options.hasCompletedAttack ??
    Boolean(
      await prisma.attack.findFirst({
        where: { attackerNexusId: nexus.id, status: 'completed' },
        select: { id: true },
      }),
    );

  const ctx = { nexus, hasOutgoingStrike, hasCompletedAttack };

  // Permanently record each individual quest condition the first time it's met
  for (const batch of QUEST_REWARD_BATCHES) {
    for (const quest of batch.quests) {
      if (!completedQuestIds.has(quest.id) && quest.check(ctx)) {
        completedQuestIds.add(quest.id);
      }
    }
  }

  // A batch is fully complete when all its quests are permanently completed
  const completedBatchIds = new Set();
  for (const batch of QUEST_REWARD_BATCHES) {
    if (batch.quests.every((q) => completedQuestIds.has(q.id))) {
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
    if (
      !batch.isUnlocked({ completedBatchIds, claimedRewards }) ||
      !completedBatchIds.has(batch.id) ||
      claimedRewards.has(batch.id)
    ) {
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

  const updatedCompletedIds = Array.from(completedQuestIds);
  const updatedClaimedRewards = Array.from(claimedRewards);
  const questIdsChanged =
    updatedCompletedIds.length !== (Array.isArray(user.completedQuestIds) ? user.completedQuestIds.length : 0);

  // Attach quest fields as virtual properties so serializeNexus can read them
  if (newlyClaimedRewards.length === 0 && !questIdsChanged) {
    return { ...nexus, questRewardClaims: updatedClaimedRewards, completedQuestIds: updatedCompletedIds };
  }

  // Persist quest progress to user (user-level, not nexus-level)
  await prisma.user.update({
    where: { id: user.id },
    data: { questRewardClaims: updatedClaimedRewards, completedQuestIds: updatedCompletedIds },
  });

  // Apply resource/troop rewards to the nexus
  data.points = calculatePoints({ ...nexus, ...data });
  const updatedNexus = await prisma.nexus.update({
    where: { id: nexus.id },
    data,
  });

  return { ...updatedNexus, questRewardClaims: updatedClaimedRewards, completedQuestIds: updatedCompletedIds };
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
      updates.populationMax = getPopulationMax(build.targetLevel);
    }
  }

  const effectiveLifeSupport = updates.lifeSupport ?? nexus.lifeSupport;
  const recalculatedPopulationMax = getPopulationMax(effectiveLifeSupport);
  const effectivePopulationMax = updates.populationMax ?? nexus.populationMax;
  const effectivePopulationCurrent = updates.populationCurrent ?? nexus.populationCurrent;

  if (effectivePopulationMax !== recalculatedPopulationMax) {
    updates.populationMax = recalculatedPopulationMax;
  }

  if (effectivePopulationCurrent > recalculatedPopulationMax) {
    updates.populationCurrent = recalculatedPopulationMax;
  }

  updates.buildQueue = buildQueue;

  // Overseer trains in an independent chain — scan the whole queue rather than
  // stopping at the head, so a finished overseer doesn't wait behind a still-
  // training non-overseer entry (and vice versa).
  for (let i = 0; i < trainingQueue.length; ) {
    const entry = trainingQueue[i];
    if (new Date(entry.completesAt) <= now) {
      updates[entry.troopType] = (updates[entry.troopType] || nexus[entry.troopType] || 0) + entry.amount;
      trainingQueue.splice(i, 1);
    } else {
      i += 1;
    }
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

const CONTROL_RECOVERY_AMOUNT = 10;

/** Gradually recover controlLevel for owned nexuses below 100 (+10 per tick, tick fires every 30 min) */
export async function recoverControlLevels() {
  try {
    // Every tick, add 10 to all owned nexuses with controlLevel < 100
    const nexuses = await prisma.nexus.findMany({
      where: {
        ownerId: { not: null },
        controlLevel: { lt: 100 },
      },
    });
    for (const nexus of nexuses) {
      const newLevel = Math.min(nexus.controlLevel + CONTROL_RECOVERY_AMOUNT, 100);
      await prisma.nexus.update({
        where: { id: nexus.id },
        data: { controlLevel: newLevel },
      });
    }
  } catch (err) {
    console.error('Error recovering control levels:', err);
  }
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
    _id: String(v.id),
    id: String(v.id),
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
      recruitmentCore: v.recruitmentCore,
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
    completedQuestIds: v.completedQuestIds,
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
  const normalizedResult = a.result ? { ...a.result } : a.result;
  if (normalizedResult?.conquered && (a?.troops?.overseer || 0) > 0) {
    normalizedResult.attackerLosses = {
      ...(normalizedResult.attackerLosses || {}),
      overseer: a.troops.overseer || 0,
    };
  }

  return {
    _id: String(a.id),
    id: String(a.id),
    attacker: {
      user: {
        _id: a.attackerUserId != null ? String(a.attackerUserId) : a.attackerUserId,
        id: a.attackerUserId != null ? String(a.attackerUserId) : a.attackerUserId,
        username: a.attackerUsername,
      },
      nexus: a.attackerNexus
        ? {
            _id: String(a.attackerNexus.id),
            id: String(a.attackerNexus.id),
            name: a.attackerNexus.name,
            x: a.attackerNexus.x,
            y: a.attackerNexus.y,
            buildings:
              a.attackerNexus.shieldGrid !== undefined ? { shieldGrid: a.attackerNexus.shieldGrid } : undefined,
          }
        : {
            _id: a.attackerNexusId != null ? String(a.attackerNexusId) : a.attackerNexusId,
            id: a.attackerNexusId != null ? String(a.attackerNexusId) : a.attackerNexusId,
          },
    },
    defender: {
      user: {
        _id: a.defenderUserId != null ? String(a.defenderUserId) : a.defenderUserId,
        id: a.defenderUserId != null ? String(a.defenderUserId) : a.defenderUserId,
        username: a.defenderUsername,
      },
      nexus: a.defenderNexus
        ? {
            _id: String(a.defenderNexus.id),
            id: String(a.defenderNexus.id),
            name: a.defenderNexus.name,
            x: a.defenderNexus.x,
            y: a.defenderNexus.y,
            buildings:
              a.defenderNexus.shieldGrid !== undefined ? { shieldGrid: a.defenderNexus.shieldGrid } : undefined,
          }
        : {
            _id: a.defenderNexusId != null ? String(a.defenderNexusId) : a.defenderNexusId,
            id: a.defenderNexusId != null ? String(a.defenderNexusId) : a.defenderNexusId,
          },
    },
    troops: a.troops,
    arrivesAt: a.arrivesAt,
    type: a.type,
    status: a.status,
    result: normalizedResult,
    createdAt: a.createdAt,
  };
}

// Dummy export to satisfy any leftover default imports during transition
export default { serializeNexus, serializeAttack, updateAllResources };
