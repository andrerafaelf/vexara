import express from 'express';
import auth from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { computeResourceUpdate, serializeVillage } from '../models/Node.js';

const router = express.Router();

// Troop costs
const TROOP_COSTS = {
  lancerDrone: { biomass: 50, alloy: 30, ore: 10, population: 1, time: 600 },
  assaultTrooper: { biomass: 30, alloy: 30, ore: 70, population: 1, time: 900 },
  breakerUnit: { biomass: 60, alloy: 30, ore: 40, population: 1, time: 840 },
  reconDrone: { biomass: 100, alloy: 30, ore: 60, population: 1, time: 960 },
  skimmerBike: { biomass: 125, alloy: 100, ore: 150, population: 3, time: 1500 },
  siegeMech: { biomass: 125, alloy: 100, ore: 250, population: 4, time: 1800 },
};

// Train troops
router.post('/train', auth, async (req, res) => {
  try {
    const { villageId, troopType, amount } = req.body;

    const village = await prisma.village.findUnique({ where: { id: parseInt(villageId) } });
    if (!village || village.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!TROOP_COSTS[troopType]) {
      return res.status(400).json({ error: 'Invalid troop type' });
    }

    if (village.troopFabricator === 0) {
      return res.status(400).json({ error: 'Recruitment Core required' });
    }

    // Apply resource tick
    const resourceUpdate = computeResourceUpdate(village);
    const currentVillage = { ...village, ...resourceUpdate };

    const cost = TROOP_COSTS[troopType];
    const totalCost = {
      biomass: cost.biomass * amount,
      alloy: cost.alloy * amount,
      ore: cost.ore * amount,
      population: cost.population * amount,
    };

    if (
      currentVillage.biomass < totalCost.biomass ||
      currentVillage.alloy < totalCost.alloy ||
      currentVillage.ore < totalCost.ore
    ) {
      return res.status(400).json({ error: 'Insufficient resources' });
    }

    if (village.populationCurrent + totalCost.population > village.populationMax) {
      return res.status(400).json({ error: 'Insufficient population capacity' });
    }

    const completesAt = new Date(Date.now() + cost.time * amount * 1000);
    const trainingQueue = Array.isArray(village.trainingQueue) ? village.trainingQueue : [];
    const newQueue = [...trainingQueue, { troopType, amount, completesAt }];

    const updated = await prisma.village.update({
      where: { id: village.id },
      data: {
        ...resourceUpdate,
        biomass: currentVillage.biomass - totalCost.biomass,
        alloy: currentVillage.alloy - totalCost.alloy,
        ore: currentVillage.ore - totalCost.ore,
        populationCurrent: village.populationCurrent + totalCost.population,
        trainingQueue: newQueue,
      },
    });

    res.json({ success: true, completesAt, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check training queue
router.post('/check-queue', auth, async (req, res) => {
  try {
    const { villageId } = req.body;

    const village = await prisma.village.findUnique({ where: { id: parseInt(villageId) } });
    if (!village || village.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const now = new Date();
    const trainingQueue = Array.isArray(village.trainingQueue) ? [...village.trainingQueue] : [];
    const troopUpdates = {};
    let completed = false;

    while (trainingQueue.length > 0 && new Date(trainingQueue[0].completesAt) <= now) {
      const training = trainingQueue.shift();
      troopUpdates[training.troopType] = (troopUpdates[training.troopType] || village[training.troopType] || 0) + training.amount;
      completed = true;
    }

    const resourceUpdate = computeResourceUpdate(village);
    const updated = await prisma.village.update({
      where: { id: village.id },
      data: { ...resourceUpdate, ...troopUpdates, trainingQueue },
    });

    res.json({ completed, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
