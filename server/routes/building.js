import express from 'express';
import auth from '../middleware/auth.js';
import Node from '../models/Node.js';

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
    const { villageId, building } = req.body;

    const village = await Node.findById(villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!BUILDING_COSTS[building]) {
      return res.status(400).json({ error: 'Invalid building' });
    }

    // Update resources
    village.updateResources();

    const currentLevel = village.buildings[building];
    const cost = getBuildingCost(building, currentLevel);

    // Check resources
    if (
      village.resources.biomass < cost.biomass ||
      village.resources.alloy < cost.alloy ||
      village.resources.ore < cost.ore
    ) {
      return res.status(400).json({ error: 'Insufficient resources' });
    }

    // Check if already building
    if (village.buildQueue.length > 0) {
      return res.status(400).json({ error: 'Already building something' });
    }

    // Deduct resources
    village.resources.biomass -= cost.biomass;
    village.resources.alloy -= cost.alloy;
    village.resources.ore -= cost.ore;

    // Add to build queue
    const completesAt = new Date(Date.now() + cost.time * 1000);
    village.buildQueue.push({
      building,
      targetLevel: currentLevel + 1,
      completesAt,
    });

    await village.save();
    res.json({ success: true, completesAt, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check build queue completion
router.post('/check-queue', auth, async (req, res) => {
  try {
    const { villageId } = req.body;

    const village = await Node.findById(villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const now = new Date();
    let completed = false;

    if (village.buildQueue.length > 0 && village.buildQueue[0].completesAt <= now) {
      const build = village.buildQueue.shift();
      village.buildings[build.building] = build.targetLevel;

      // Update max population if life support was upgraded
      if (build.building === 'lifeSupport') {
        village.population.max = 24 * Math.pow(1.17, village.buildings.lifeSupport);
      }

      completed = true;
    }

    village.updateResources();
    await village.save();

    res.json({ completed, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
