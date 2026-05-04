import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { computeResourceUpdate, serializeNexus } from '../models/Nexus.js';
import { parsePositiveInt } from '../utils/validation.js';

const router = express.Router();
const MAX_TRAINING_QUEUE = 100;

// Troop costs
const TROOP_COSTS = {
  lancerDrone: { biomass: 50, alloy: 30, ore: 10, population: 1, time: 600 },
  assaultTrooper: { biomass: 30, alloy: 30, ore: 70, population: 1, time: 900 },
  breakerUnit: { biomass: 60, alloy: 30, ore: 40, population: 1, time: 840 },
  reconOperative: { biomass: 100, alloy: 30, ore: 60, population: 1, time: 960 },
  skimmerBike: { biomass: 125, alloy: 100, ore: 150, population: 3, time: 1500 },
  siegeMech: { biomass: 125, alloy: 100, ore: 250, population: 4, time: 1800 },
  bulwarkGuard: { biomass: 80, alloy: 120, ore: 100, population: 2, time: 1200 },
  suppressorTeam: { biomass: 90, alloy: 80, ore: 90, population: 2, time: 1300 },
  disruptorUnit: { biomass: 110, alloy: 150, ore: 130, population: 2, time: 1400 },
  interceptorBike: { biomass: 150, alloy: 120, ore: 180, population: 3, time: 1600 },
  annihilatorPlatform: { biomass: 200, alloy: 180, ore: 300, population: 5, time: 2400 },
  overseer: { biomass: 300, alloy: 250, ore: 200, population: 5, time: 3000 },
};

const TROOP_REQUIREMENTS = {
  assaultTrooper: { buildings: { troopFabricator: 1 } },
  lancerDrone: { buildings: { troopFabricator: 2 }, troops: { assaultTrooper: 5 } },
  breakerUnit: { buildings: { troopFabricator: 2, oreExtractor: 2 }, troops: { assaultTrooper: 10 } },
  reconOperative: { buildings: { troopFabricator: 3 }, troops: { assaultTrooper: 5, lancerDrone: 5 } },
  skimmerBike: { buildings: { troopFabricator: 3, alloyForge: 3 }, troops: { assaultTrooper: 20, lancerDrone: 10 } },
  siegeMech: { buildings: { troopFabricator: 4, oreExtractor: 4 }, troops: { assaultTrooper: 30, breakerUnit: 10 } },
  bulwarkGuard: { buildings: { troopFabricator: 3, lifeSupport: 5 } },
  suppressorTeam: { buildings: { troopFabricator: 3, commandCore: 3 } },
  disruptorUnit: { buildings: { troopFabricator: 4 } },
  interceptorBike: { buildings: { troopFabricator: 4 }, troops: { skimmerBike: 50 } },
  annihilatorPlatform: { buildings: { troopFabricator: 6, commandCore: 6 } },
  overseer: { buildings: { troopFabricator: 5, commandCore: 3, shieldGrid: 2 }, maxPerNexus: 1 },
};

const BUILDING_NAMES = {
  commandCore: 'Command Core',
  troopFabricator: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
};

const TROOP_NAMES = {
  lancerDrone: 'Lancer Drone',
  assaultTrooper: 'Assault Trooper',
  breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative',
  skimmerBike: 'Skimmer Bike',
  siegeMech: 'Siege Mech',
  bulwarkGuard: 'Bulwark Guard',
  suppressorTeam: 'Suppressor Team',
  disruptorUnit: 'Disruptor Unit',
  interceptorBike: 'Interceptor Bike',
  annihilatorPlatform: 'Annihilator Platform',
  overseer: 'Overseer',
};

// Train troops
router.post('/train', auth, async (req, res) => {
  try {
    const { nexusId, troopType, amount } = req.body;
    const parsedNexusId = parsePositiveInt(nexusId);
    const parsedAmount = parsePositiveInt(amount);

    if (!parsedNexusId) {
      return res.status(400).json({ error: 'Invalid nexus ID' });
    }

    if (!parsedAmount || parsedAmount > 1000) {
      return res.status(400).json({ error: 'Amount must be an integer between 1 and 1000' });
    }

    const nexus = await prisma.nexus.findUnique({ where: { id: parsedNexusId } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!TROOP_COSTS[troopType]) {
      return res.status(400).json({ error: 'Invalid troop type' });
    }

    if (nexus.troopFabricator === 0) {
      return res.status(400).json({ error: 'Recruitment Core required' });
    }

    const requirements = TROOP_REQUIREMENTS[troopType] || {};
    if (requirements.buildings) {
      for (const [building, requiredLevel] of Object.entries(requirements.buildings)) {
        if ((nexus[building] || 0) < requiredLevel) {
          return res
            .status(400)
            .json({ error: `Requires ${BUILDING_NAMES[building] || building} Level ${requiredLevel}` });
        }
      }
    }

    if (requirements.troops) {
      for (const [requiredTroopType, requiredCount] of Object.entries(requirements.troops)) {
        if ((nexus[requiredTroopType] || 0) < requiredCount) {
          return res.status(400).json({
            error: `Requires ${requiredCount}x ${TROOP_NAMES[requiredTroopType] || requiredTroopType} in this nexus`,
          });
        }
      }
    }

    if (requirements.maxPerNexus) {
      const queuedAmount = (Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [])
        .filter((entry) => entry.troopType === troopType)
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const currentPlusQueued = (nexus[troopType] || 0) + queuedAmount;
      if (currentPlusQueued + parsedAmount > requirements.maxPerNexus) {
        return res.status(400).json({
          error: `Maximum ${requirements.maxPerNexus} ${TROOP_NAMES[troopType] || troopType} per nexus`,
        });
      }
    }

    // Apply resource tick
    const resourceUpdate = computeResourceUpdate(nexus);
    const currentVillage = { ...nexus, ...resourceUpdate };

    const cost = TROOP_COSTS[troopType];
    const totalCost = {
      biomass: cost.biomass * parsedAmount,
      alloy: cost.alloy * parsedAmount,
      ore: cost.ore * parsedAmount,
      population: cost.population * parsedAmount,
    };

    if (
      currentVillage.biomass < totalCost.biomass ||
      currentVillage.alloy < totalCost.alloy ||
      currentVillage.ore < totalCost.ore
    ) {
      return res.status(400).json({ error: 'Insufficient resources' });
    }

    if (nexus.populationCurrent + totalCost.population > nexus.populationMax) {
      return res.status(400).json({ error: 'Insufficient population capacity' });
    }

    const trainingQueue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
    if (trainingQueue.length >= MAX_TRAINING_QUEUE) {
      return res.status(400).json({ error: `Training queue is full (${MAX_TRAINING_QUEUE}/${MAX_TRAINING_QUEUE})` });
    }

    const queueStart =
      trainingQueue.length > 0 ? new Date(trainingQueue[trainingQueue.length - 1].completesAt).getTime() : Date.now();
    const completesAt = new Date(queueStart + cost.time * parsedAmount * 1000);
    const newQueue = [...trainingQueue, { troopType, amount: parsedAmount, completesAt }];

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        ...resourceUpdate,
        biomass: currentVillage.biomass - totalCost.biomass,
        alloy: currentVillage.alloy - totalCost.alloy,
        ore: currentVillage.ore - totalCost.ore,
        populationCurrent: nexus.populationCurrent + totalCost.population,
        trainingQueue: newQueue,
      },
    });

    res.json({ success: true, completesAt, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check training queue
router.post('/check-queue', auth, async (req, res) => {
  try {
    const { nexusId } = req.body;

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const now = new Date();
    const trainingQueue = Array.isArray(nexus.trainingQueue) ? [...nexus.trainingQueue] : [];
    const troopUpdates = {};
    let completed = false;

    while (trainingQueue.length > 0 && new Date(trainingQueue[0].completesAt) <= now) {
      const training = trainingQueue.shift();
      troopUpdates[training.troopType] =
        (troopUpdates[training.troopType] || nexus[training.troopType] || 0) + training.amount;
      completed = true;
    }

    const resourceUpdate = computeResourceUpdate(nexus);
    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: { ...resourceUpdate, ...troopUpdates, trainingQueue },
    });

    res.json({ completed, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
