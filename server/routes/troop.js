import express from 'express';
import auth from '../middleware/auth.js';
import Node from '../models/Node.js';

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

    const village = await Node.findById(villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!TROOP_COSTS[troopType]) {
      return res.status(400).json({ error: 'Invalid troop type' });
    }

    if (village.buildings.troopFabricator === 0) {
      return res.status(400).json({ error: 'Recruitment Core required' });
    }

    village.updateResources();

    const cost = TROOP_COSTS[troopType];
    const totalCost = {
      biomass: cost.biomass * amount,
      alloy: cost.alloy * amount,
      ore: cost.ore * amount,
      population: cost.population * amount,
    };

    // Check resources
    if (
      village.resources.biomass < totalCost.biomass ||
      village.resources.alloy < totalCost.alloy ||
      village.resources.ore < totalCost.ore
    ) {
      return res.status(400).json({ error: 'Insufficient resources' });
    }

    // Check population
    if (village.population.current + totalCost.population > village.population.max) {
      return res.status(400).json({ error: 'Insufficient population capacity' });
    }

    // Deduct resources
    village.resources.biomass -= totalCost.biomass;
    village.resources.alloy -= totalCost.alloy;
    village.resources.ore -= totalCost.ore;
    village.population.current += totalCost.population;

    // Add to training queue
    const completesAt = new Date(Date.now() + cost.time * amount * 1000);
    village.trainingQueue.push({
      troopType,
      amount,
      completesAt,
    });

    await village.save();
    res.json({ success: true, completesAt, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check training queue
router.post('/check-queue', auth, async (req, res) => {
  try {
    const { villageId } = req.body;

    const village = await Node.findById(villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const now = new Date();
    let completed = false;

    while (village.trainingQueue.length > 0 && village.trainingQueue[0].completesAt <= now) {
      const training = village.trainingQueue.shift();
      village.troops[training.troopType] += training.amount;
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
