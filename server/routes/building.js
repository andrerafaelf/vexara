import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { applyQuestRewards, computeResourceUpdate, normalizeBuildQueue, serializeNexus } from '../models/Nexus.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { getPopulationMax } from '../utils/population.js';

const router = express.Router();
const MAX_BUILD_QUEUE = 5;

// Building costs and requirements
const BUILDING_COSTS = {
  commandCore: { biomass: 90, alloy: 80, ore: 70, time: 45 },
  recruitmentCore: { biomass: 200, alloy: 170, ore: 90, time: 75 },
  lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 60 },
  storageVault: { biomass: 60, alloy: 50, ore: 40, time: 45 },
  biomassFarm: { biomass: 50, alloy: 60, ore: 40, time: 45 },
  alloyForge: { biomass: 65, alloy: 40, ore: 40, time: 45 },
  oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 60 },
  shieldGrid: { biomass: 50, alloy: 100, ore: 20, time: 75 },
};

const BUILDING_RULES = {
  commandCore: {
    maxLevel: 20,
    unlock: null,
    milestones: [
      { level: 4, requires: [{ building: 'lifeSupport', level: 2 }] },
      { level: 6, requires: [{ building: 'shieldGrid', level: 2 }] },
      { level: 10, requires: [{ building: 'storageVault', level: 5 }] },
    ],
  },
  recruitmentCore: {
    maxLevel: 15,
    unlock: { building: 'commandCore', level: 2 },
    milestones: [
      { level: 4, requires: [{ building: 'biomassFarm', level: 2 }] },
      { level: 6, requires: [{ building: 'alloyForge', level: 2 }] },
      { level: 10, requires: [{ building: 'lifeSupport', level: 5 }] },
    ],
  },
  lifeSupport: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 2 },
    milestones: [
      { level: 4, requires: [{ building: 'biomassFarm', level: 2 }] },
      { level: 8, requires: [{ building: 'storageVault', level: 4 }] },
    ],
  },
  storageVault: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 2 },
    milestones: [
      { level: 4, requires: [{ building: 'oreExtractor', level: 2 }] },
      { level: 6, requires: [{ building: 'alloyForge', level: 2 }] },
      { level: 10, requires: [{ building: 'commandCore', level: 8 }] },
    ],
  },
  biomassFarm: {
    maxLevel: 20,
    unlock: { building: 'lifeSupport', level: 1 },
    milestones: [
      { level: 6, requires: [{ building: 'recruitmentCore', level: 2 }] },
      { level: 10, requires: [{ building: 'lifeSupport', level: 5 }] },
    ],
  },
  alloyForge: {
    maxLevel: 20,
    unlock: { building: 'oreExtractor', level: 2 },
    milestones: [
      { level: 6, requires: [{ building: 'commandCore', level: 4 }] },
      { level: 10, requires: [{ building: 'oreExtractor', level: 8 }] },
    ],
  },
  oreExtractor: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 1 },
    milestones: [{ level: 8, requires: [{ building: 'alloyForge', level: 4 }] }],
  },
  shieldGrid: {
    maxLevel: 15,
    unlock: { building: 'commandCore', level: 3 },
    milestones: [
      { level: 4, requires: [{ building: 'storageVault', level: 3 }] },
      { level: 8, requires: [{ building: 'alloyForge', level: 5 }] },
    ],
  },
};

const COST_SCALING = {
  early: 1.5,
  mid: 1.65,
  late: 1.8,
};

const TIME_SCALING = {
  early: 1.25,
  mid: 1.35,
  late: 1.45,
};

// Command Core reduces building time by 5% per level (compounding).
// Lv0 = 100%, Lv20 ≈ 35.8%. Applies to every building, including itself.
const COMMAND_BUILD_TIME_FACTOR_PER_LEVEL = 0.95;

function getCommandTimeFactor(commandLevel) {
  return Math.pow(COMMAND_BUILD_TIME_FACTOR_PER_LEVEL, Math.max(0, commandLevel || 0));
}

const BUILDING_NAMES = {
  commandCore: 'Command Core',
  recruitmentCore: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
};

// Calculate building cost for specific level
function getBuildingCost(building, currentLevel) {
  const base = BUILDING_COSTS[building];
  const targetLevel = currentLevel + 1;

  let biomass = base.biomass;
  let alloy = base.alloy;
  let ore = base.ore;
  let time = base.time;

  for (let level = 2; level <= targetLevel; level += 1) {
    const costMultiplier = getCostMultiplierForLevel(level);
    const timeMultiplier = getTimeMultiplierForLevel(level);
    biomass *= costMultiplier;
    alloy *= costMultiplier;
    ore *= costMultiplier;
    time *= timeMultiplier;
  }

  return {
    biomass: Math.floor(biomass),
    alloy: Math.floor(alloy),
    ore: Math.floor(ore),
    time: Math.floor(time),
  };
}

function getCostMultiplierForLevel(level) {
  if (level <= 5) return COST_SCALING.early;
  if (level <= 10) return COST_SCALING.mid;
  return COST_SCALING.late;
}

function getTimeMultiplierForLevel(level) {
  if (level <= 5) return TIME_SCALING.early;
  if (level <= 10) return TIME_SCALING.mid;
  return TIME_SCALING.late;
}

function getRequirementsForTargetLevel(building, targetLevel) {
  const rule = BUILDING_RULES[building];
  if (!rule) return [];

  const merged = new Map();

  if (building !== 'commandCore' && targetLevel >= 1) {
    merged.set('commandCore', 1);
  }

  if (rule.unlock && targetLevel >= 1) {
    merged.set(rule.unlock.building, rule.unlock.level);
  }

  for (const milestone of rule.milestones) {
    if (targetLevel >= milestone.level) {
      for (const requirement of milestone.requires) {
        const existing = merged.get(requirement.building) || 0;
        merged.set(requirement.building, Math.max(existing, requirement.level));
      }
    }
  }

  return Array.from(merged.entries()).map(([requiredBuilding, level]) => ({ building: requiredBuilding, level }));
}

function getMissingRequirements(nexus, building, targetLevel) {
  const requirements = getRequirementsForTargetLevel(building, targetLevel);

  return requirements.filter(({ building: requiredBuilding, level }) => (nexus[requiredBuilding] || 0) < level);
}

function getPlannedBuildingLevels(nexus) {
  const planned = {
    commandCore: nexus.commandCore,
    recruitmentCore: nexus.recruitmentCore,
    lifeSupport: nexus.lifeSupport,
    storageVault: nexus.storageVault,
    biomassFarm: nexus.biomassFarm,
    alloyForge: nexus.alloyForge,
    oreExtractor: nexus.oreExtractor,
    shieldGrid: nexus.shieldGrid,
  };

  const buildQueue = normalizeBuildQueue(nexus.buildQueue);
  for (const queued of buildQueue) {
    planned[queued.building] = Math.max(planned[queued.building] || 0, queued.targetLevel);
  }

  return planned;
}

// Upgrade building
router.post('/upgrade', auth, async (req, res) => {
  try {
    const { nexusId, building } = req.body;

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!BUILDING_COSTS[building]) {
      return res.status(400).json({ error: 'Invalid building' });
    }

    const buildQueue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
    if (buildQueue.length >= MAX_BUILD_QUEUE) {
      return res.status(400).json({ error: `Build queue is full (${MAX_BUILD_QUEUE}/${MAX_BUILD_QUEUE})` });
    }

    const plannedLevels = getPlannedBuildingLevels(nexus);
    const currentLevel = plannedLevels[building] || nexus[building] || 0;
    const targetLevel = currentLevel + 1;
    const rule = BUILDING_RULES[building];

    if (rule && currentLevel >= rule.maxLevel) {
      return res.status(400).json({ error: `${BUILDING_NAMES[building]} is already at max level (${rule.maxLevel})` });
    }

    const missingRequirements = getMissingRequirements(nexus, building, targetLevel);
    if (missingRequirements.length > 0) {
      const requirementText = missingRequirements
        .map(
          ({ building: requiredBuilding, level }) =>
            `${BUILDING_NAMES[requiredBuilding] || requiredBuilding} level ${level}`,
        )
        .join(', ');

      return res.status(400).json({ error: `Requirements not met: ${requirementText}` });
    }

    // Apply resource tick
    const resourceUpdate = computeResourceUpdate(nexus);
    const currentVillage = { ...nexus, ...resourceUpdate };

    const cost = getBuildingCost(building, currentLevel);

    // Check resources
    if (currentVillage.biomass < cost.biomass || currentVillage.alloy < cost.alloy || currentVillage.ore < cost.ore) {
      return res.status(400).json({ error: 'Insufficient resources' });
    }

    // Check if already building
    // Deduct resources and add to queue
    const queueStart =
      buildQueue.length > 0 ? new Date(buildQueue[buildQueue.length - 1].completesAt).getTime() : Date.now();
    const nexusBuildTimeFactor = NEXUS_TYPE_BONUSES[nexus.nexusType]?.buildTimeMultiplier ?? 1;
    const buildSeconds = Math.max(1, Math.floor(cost.time * getCommandTimeFactor(nexus.commandCore) * nexusBuildTimeFactor));
    const completesAt = new Date(queueStart + buildSeconds * 1000);
    const newQueue = [...buildQueue, { building, targetLevel: currentLevel + 1, completesAt }];

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        ...resourceUpdate,
        biomass: currentVillage.biomass - cost.biomass,
        alloy: currentVillage.alloy - cost.alloy,
        ore: currentVillage.ore - cost.ore,
        buildQueue: newQueue,
      },
    });
    const rewardApplied = await applyQuestRewards(updated);

    res.json({ success: true, completesAt, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a build queue item with 85% resource refund
router.post('/cancel-queue', auth, async (req, res) => {
  try {
    const { nexusId, index } = req.body;
    const parsedIndex = parseInt(index, 10);

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const buildQueue = normalizeBuildQueue(nexus.buildQueue);
    if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= buildQueue.length) {
      return res.status(400).json({ error: 'Invalid queue index' });
    }

    const item = buildQueue[parsedIndex];
    const cost = getBuildingCost(item.building, item.targetLevel - 1);
    const refund = {
      biomass: Math.floor(cost.biomass * 0.85),
      alloy: Math.floor(cost.alloy * 0.85),
      ore: Math.floor(cost.ore * 0.85),
    };

    const itemCompletesAt = new Date(item.completesAt).getTime();
    const newQueue = buildQueue.filter((_, i) => i !== parsedIndex);

    if (parsedIndex === 0 && newQueue.length > 0) {
      // Cancelled the active item — shift remaining items to start from now
      const remaining = Math.max(0, itemCompletesAt - Date.now());
      for (let i = 0; i < newQueue.length; i++) {
        const oldAt = new Date(newQueue[i].completesAt).getTime();
        newQueue[i] = { ...newQueue[i], completesAt: new Date(oldAt - remaining) };
      }
    } else if (parsedIndex > 0) {
      // Cancelled a waiting item — shift subsequent items back by its duration
      const prevAt = new Date(buildQueue[parsedIndex - 1].completesAt).getTime();
      const duration = itemCompletesAt - prevAt;
      for (let i = parsedIndex; i < newQueue.length; i++) {
        const oldAt = new Date(newQueue[i].completesAt).getTime();
        newQueue[i] = { ...newQueue[i], completesAt: new Date(oldAt - duration) };
      }
    }

    const resourceUpdate = computeResourceUpdate(nexus);
    const currentVillage = { ...nexus, ...resourceUpdate };

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        ...resourceUpdate,
        biomass: currentVillage.biomass + refund.biomass,
        alloy: currentVillage.alloy + refund.alloy,
        ore: currentVillage.ore + refund.ore,
        buildQueue: newQueue,
      },
    });

    res.json({ success: true, refund, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check build queue completion
router.post('/check-queue', auth, async (req, res) => {
  try {
    const { nexusId } = req.body;

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const now = new Date();
    const buildQueue = normalizeBuildQueue(nexus.buildQueue);
    let completed = false;
    const data = {};

    while (buildQueue.length > 0 && new Date(buildQueue[0].completesAt) <= now) {
      const build = buildQueue.shift();
      data[build.building] = build.targetLevel;
      completed = true;

      // Update max population if life support was upgraded
      if (build.building === 'lifeSupport') {
        data.populationMax = getPopulationMax(build.targetLevel);
      }
    }

    data.buildQueue = buildQueue;

    // Apply resource tick
    const resourceUpdate = computeResourceUpdate(nexus);
    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: { ...resourceUpdate, ...data },
    });
    const rewardApplied = await applyQuestRewards(updated);

    res.json({ completed, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
