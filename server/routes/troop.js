import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { applyQuestRewards, computeResourceUpdate, serializeNexus } from '../models/Nexus.js';
import { parsePositiveInt } from '../utils/validation.js';

const router = express.Router();
const MAX_TRAINING_QUEUE = 5;

// Training times (seconds per unit).
// Early troops: ~1 min. Mid-tier: 5–30 min. Heavy: 1 h / 4 h / 8 h.
const TROOP_COSTS = {
  lancerDrone:          { biomass: 50,  alloy: 30,  ore: 10,  population: 1, time: 53   },
  assaultTrooper:       { biomass: 30,  alloy: 30,  ore: 70,  population: 1, time: 79   },
  breakerUnit:          { biomass: 60,  alloy: 30,  ore: 40,  population: 1, time: 74   },
  reconOperative:       { biomass: 100, alloy: 30,  ore: 60,  population: 1, time: 180  },  // 3 min
  skimmerBike:          { biomass: 125, alloy: 100, ore: 150, population: 3, time: 600  },  // 10 min
  bulwarkGuard:         { biomass: 80,  alloy: 120, ore: 100, population: 2, time: 480  },  // 8 min
  suppressorTeam:       { biomass: 90,  alloy: 80,  ore: 90,  population: 2, time: 480  },  // 8 min
  disruptorUnit:        { biomass: 110, alloy: 150, ore: 130, population: 2, time: 660  },  // 11 min
  interceptorBike:      { biomass: 150, alloy: 120, ore: 180, population: 3, time: 900  },  // 15 min
  siegeMech:            { biomass: 250, alloy: 200, ore: 400, population: 4, time: 3600 },  // 1 hour
  annihilatorPlatform:  { biomass: 400, alloy: 350, ore: 600, population: 5, time: 7200 },  // 2 hours
  overseer:             { biomass: 600, alloy: 500, ore: 400, population: 5, time: 28800 }, // 8 hours
};

const TROOP_REQUIREMENTS = {
  assaultTrooper:      { buildings: { troopFabricator: 1 } },
  lancerDrone:         { buildings: { troopFabricator: 2 } },
  breakerUnit:         { buildings: { troopFabricator: 3, oreExtractor: 3 } },
  reconOperative:      { buildings: { troopFabricator: 4, commandCore: 3 } },
  skimmerBike:         { buildings: { troopFabricator: 5, alloyForge: 4 } },
  bulwarkGuard:        { buildings: { troopFabricator: 5, lifeSupport: 5 } },
  suppressorTeam:      { buildings: { troopFabricator: 7, commandCore: 6 } },
  disruptorUnit:       { buildings: { troopFabricator: 7, oreExtractor: 6 } },
  interceptorBike:     { buildings: { troopFabricator: 8, alloyForge: 7 } },
  siegeMech:           { buildings: { troopFabricator: 10, oreExtractor: 9, commandCore: 8 } },
  annihilatorPlatform: { buildings: { troopFabricator: 12, commandCore: 10, shieldGrid: 10 } },
  overseer:            { buildings: { troopFabricator: 14, commandCore: 14, shieldGrid: 13 }, maxPerNexus: 3 },
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

    if (requirements.maxPerNexus) {
      const queuedAmount = (Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [])
        .filter((entry) => entry.troopType === troopType)
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const inFlightAttacks = await prisma.attack.findMany({
        where: { attackerNexusId: nexus.id, status: 'traveling' },
        select: { troops: true },
      });
      const inFlightAmount = inFlightAttacks.reduce((sum, a) => sum + ((a.troops?.[troopType]) || 0), 0);
      const currentPlusQueued = (nexus[troopType] || 0) + queuedAmount + inFlightAmount;
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
    const rewardApplied = await applyQuestRewards(updated);

    res.json({ success: true, completesAt, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a training queue item with 85% resource refund
router.post('/cancel-queue', auth, async (req, res) => {
  try {
    const { nexusId, index } = req.body;
    const parsedIndex = parseInt(index, 10);

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const trainingQueue = Array.isArray(nexus.trainingQueue) ? [...nexus.trainingQueue] : [];
    if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= trainingQueue.length) {
      return res.status(400).json({ error: 'Invalid queue index' });
    }

    const item = trainingQueue[parsedIndex];
    const cost = TROOP_COSTS[item.troopType];
    if (!cost) {
      return res.status(400).json({ error: 'Invalid troop type in queue' });
    }

    const totalCost = {
      biomass: cost.biomass * item.amount,
      alloy: cost.alloy * item.amount,
      ore: cost.ore * item.amount,
      population: cost.population * item.amount,
    };

    const refund = {
      biomass: Math.floor(totalCost.biomass * 0.85),
      alloy: Math.floor(totalCost.alloy * 0.85),
      ore: Math.floor(totalCost.ore * 0.85),
    };

    const itemCompletesAt = new Date(item.completesAt).getTime();
    const newQueue = trainingQueue.filter((_, i) => i !== parsedIndex);

    if (parsedIndex === 0 && newQueue.length > 0) {
      const remaining = Math.max(0, itemCompletesAt - Date.now());
      for (let i = 0; i < newQueue.length; i++) {
        const oldAt = new Date(newQueue[i].completesAt).getTime();
        newQueue[i] = { ...newQueue[i], completesAt: new Date(oldAt - remaining) };
      }
    } else if (parsedIndex > 0) {
      const prevAt = new Date(trainingQueue[parsedIndex - 1].completesAt).getTime();
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
        populationCurrent: Math.max(0, nexus.populationCurrent - totalCost.population),
        trainingQueue: newQueue,
      },
    });

    res.json({ success: true, refund, nexus: serializeNexus(updated) });
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

    while (trainingQueue.length > 0) {
      const entry = trainingQueue[0];
      const cost = TROOP_COSTS[entry.troopType];
      if (!cost) { trainingQueue.shift(); continue; }

      const completesAtMs = new Date(entry.completesAt).getTime();
      const perUnitMs = cost.time * 1000;
      const startedAtMs = completesAtMs - entry.amount * perUnitMs;
      const elapsedMs = now.getTime() - startedAtMs;

      if (elapsedMs < perUnitMs) break;

      const unitsCompleted = Math.min(entry.amount, Math.floor(elapsedMs / perUnitMs));
      troopUpdates[entry.troopType] =
        (troopUpdates[entry.troopType] || nexus[entry.troopType] || 0) + unitsCompleted;
      completed = true;

      if (unitsCompleted >= entry.amount) {
        trainingQueue.shift();
      } else {
        trainingQueue[0] = { ...entry, amount: entry.amount - unitsCompleted };
        break;
      }
    }

    const resourceUpdate = computeResourceUpdate(nexus);
    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: { ...resourceUpdate, ...troopUpdates, trainingQueue },
    });
    const rewardApplied = await applyQuestRewards(updated);

    res.json({ completed, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
