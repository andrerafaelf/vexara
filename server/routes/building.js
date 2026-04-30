import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { computeResourceUpdate, serializeNexus } from '../models/Nexus.js';

const router = express.Router();

// Building costs and requirements
const BUILDING_COSTS = {
  commandCore: { biomass: 90, alloy: 80, ore: 70, time: 180, factor: 1.26 },
  troopFabricator: { biomass: 200, alloy: 170, ore: 90, time: 300, factor: 1.28 },
  lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 240, factor: 1.3 },
  storageVault: { biomass: 60, alloy: 50, ore: 40, time: 180, factor: 1.27 },
  biomassFarm: { biomass: 50, alloy: 60, ore: 40, time: 180, factor: 1.25 },
  alloyForge: { biomass: 65, alloy: 40, ore: 40, time: 180, factor: 1.25 },
  oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 240, factor: 1.25 },
  shieldGrid: { biomass: 50, alloy: 100, ore: 20, time: 300, factor: 1.32 },
};

// Calculate building cost for specific level
function getBuildingCost(building, currentLevel) {
  const base = BUILDING_COSTS[building];
  const factor = Math.pow(base.factor, currentLevel);

  return {
    biomass: Math.floor(base.biomass * factor),
    alloy: Math.floor(base.alloy * factor),
    ore: Math.floor(base.ore * factor),
    time: Math.floor(base.time * factor),
  };
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

    // Apply resource tick
    const resourceUpdate = computeResourceUpdate(nexus);
    const currentVillage = { ...nexus, ...resourceUpdate };

    const currentLevel = nexus[building];
    const cost = getBuildingCost(building, currentLevel);

    // Check resources
    if (currentVillage.biomass < cost.biomass || currentVillage.alloy < cost.alloy || currentVillage.ore < cost.ore) {
      return res.status(400).json({ error: 'Insufficient resources' });
    }

    // Check if already building
    const buildQueue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
    if (buildQueue.length > 0) {
      return res.status(400).json({ error: 'Already building something' });
    }

    // Deduct resources and add to queue
    const completesAt = new Date(Date.now() + cost.time * 1000);
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

    res.json({ success: true, completesAt, nexus: serializeNexus(updated) });
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
    const buildQueue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
    let completed = false;
    const data = {};

    if (buildQueue.length > 0 && new Date(buildQueue[0].completesAt) <= now) {
      const [build, ...remainingQueue] = buildQueue;
      data[build.building] = build.targetLevel;
      data.buildQueue = remainingQueue;
      completed = true;

      // Update max population if life support was upgraded
      if (build.building === 'lifeSupport') {
        data.populationMax = Math.floor(24 * Math.pow(1.17, build.targetLevel));
      }
    }

    // Apply resource tick
    const resourceUpdate = computeResourceUpdate(nexus);
    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: { ...resourceUpdate, ...data },
    });

    res.json({ completed, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
