import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { applyCompletedQueues, applyQuestRewards, computeResourceUpdate, serializeNexus } from '../models/Nexus.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { parsePositiveInt } from '../utils/validation.js';
import { sendPushToUser, NOTIF } from '../utils/push.js';

const router = express.Router();
const MAX_TRAINING_QUEUE = 5;

// Recruitment Core reduces training time for non-Overseer troops by 8% per level.
// Lv0 = 100% (1.0), Lv15 ≈ 28.6%. Overseer is unaffected and stays at base time.
const RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL = 0.92;

// Training times (seconds per unit).
// Early troops: ~1 min. Mid-tier: 5–30 min. Heavy: 1 h / 4 h / 8 h.
const TROOP_COSTS = {
  lancerDrone: { biomass: 150, alloy: 150, ore: 200, population: 1, time: 53 },
  assaultTrooper: { biomass: 150, alloy: 150, ore: 350, population: 1, time: 79 },
  breakerUnit: { biomass: 250, alloy: 150, ore: 300, population: 1, time: 74 },
  reconOperative: { biomass: 400, alloy: 150, ore: 400, population: 1, time: 180 }, // 3 min
  skimmerBike: { biomass: 625, alloy: 500, ore: 750, population: 3, time: 600 }, // 10 min
  bulwarkGuard: { biomass: 400, alloy: 600, ore: 500, population: 2, time: 480 }, // 8 min
  suppressorTeam: { biomass: 450, alloy: 400, ore: 450, population: 2, time: 480 }, // 8 min
  disruptorUnit: { biomass: 550, alloy: 750, ore: 650, population: 2, time: 660 }, // 11 min
  interceptorBike: { biomass: 750, alloy: 600, ore: 900, population: 3, time: 900 }, // 15 min
  siegeMech: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: 3600 }, // 1 hour
  annihilatorPlatform: { biomass: 2000, alloy: 1750, ore: 3000, population: 5, time: 7200 }, // 2 hours
  overseer: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 }, // 4 hours
};

function getTrainTimeSeconds(troopType, recruitmentLevel) {
  const baseTime = TROOP_COSTS[troopType].time;
  if (troopType === 'overseer') return baseTime;
  const factor = Math.pow(RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL, Math.max(0, recruitmentLevel || 0));
  return Math.max(1, Math.floor(baseTime * factor));
}

const TROOP_REQUIREMENTS = {
  assaultTrooper: { buildings: { recruitmentCore: 1 } },
  lancerDrone: { buildings: { recruitmentCore: 2 } },
  breakerUnit: { buildings: { recruitmentCore: 3, oreExtractor: 3 } },
  reconOperative: { buildings: { recruitmentCore: 4, commandCore: 3 } },
  skimmerBike: { buildings: { recruitmentCore: 5, alloyForge: 4 } },
  bulwarkGuard: { buildings: { recruitmentCore: 5, lifeSupport: 5 } },
  suppressorTeam: { buildings: { recruitmentCore: 7, commandCore: 6 } },
  disruptorUnit: { buildings: { recruitmentCore: 7, oreExtractor: 6 } },
  interceptorBike: { buildings: { recruitmentCore: 8, alloyForge: 7 } },
  siegeMech: { buildings: { recruitmentCore: 10, oreExtractor: 9, commandCore: 8 } },
  annihilatorPlatform: { buildings: { recruitmentCore: 12, commandCore: 10, shieldGrid: 10 } },
  overseer: { buildings: { recruitmentCore: 14, commandCore: 14, shieldGrid: 13 }, maxPerNexus: 3 },
};

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

    const rawNexus = await prisma.nexus.findUnique({ where: { id: parsedNexusId } });
    if (!rawNexus || rawNexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const nexus = await applyCompletedQueues(rawNexus);

    if (!TROOP_COSTS[troopType]) {
      return res.status(400).json({ error: 'Invalid troop type' });
    }

    if (nexus.recruitmentCore === 0) {
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
      const inFlightAmount = inFlightAttacks.reduce((sum, a) => sum + (a.troops?.[troopType] || 0), 0);
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

    // Overseer trains in its own independent chain so it doesn't block other troops.
    const isOverseer = troopType === 'overseer';
    const sameChainQueue = trainingQueue.filter((entry) =>
      isOverseer ? entry.troopType === 'overseer' : entry.troopType !== 'overseer',
    );

    if (sameChainQueue.length >= MAX_TRAINING_QUEUE) {
      return res.status(400).json({ error: `Training queue is full (${MAX_TRAINING_QUEUE}/${MAX_TRAINING_QUEUE})` });
    }

    const nexusTrainingTimeFactor = troopType === 'overseer' ? 1 : (NEXUS_TYPE_BONUSES[nexus.nexusType]?.trainingTimeMultiplier ?? 1);
    const perUnitSeconds = Math.max(1, Math.floor(getTrainTimeSeconds(troopType, nexus.recruitmentCore) * nexusTrainingTimeFactor));
    const queueStart =
      sameChainQueue.length > 0
        ? new Date(sameChainQueue[sameChainQueue.length - 1].completesAt).getTime()
        : Date.now();
    const completesAt = new Date(queueStart + perUnitSeconds * parsedAmount * 1000);
    const newQueue = [
      ...trainingQueue,
      {
        troopType,
        amount: parsedAmount,
        completesAt,
        perUnitSeconds,
      },
    ];

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
    const isOverseerItem = item.troopType === 'overseer';
    const sameChainPredicate = (entry) =>
      isOverseerItem ? entry.troopType === 'overseer' : entry.troopType !== 'overseer';
    const newQueue = trainingQueue.filter((_, i) => i !== parsedIndex);

    // Find the previous same-chain entry (if any) and shift only same-chain
    // followers — the other chain's timeline is unaffected.
    const sameChainPrevEntry = (() => {
      for (let i = parsedIndex - 1; i >= 0; i -= 1) {
        if (sameChainPredicate(trainingQueue[i])) return trainingQueue[i];
      }
      return null;
    })();

    const isHeadOfChain = sameChainPrevEntry === null;
    const shiftAmount = isHeadOfChain
      ? Math.max(0, itemCompletesAt - Date.now())
      : itemCompletesAt - new Date(sameChainPrevEntry.completesAt).getTime();

    if (shiftAmount > 0) {
      for (let i = 0; i < newQueue.length; i += 1) {
        const entry = newQueue[i];
        if (!sameChainPredicate(entry)) continue;
        const entryOldAt = new Date(entry.completesAt).getTime();
        // Only shift entries that come after the cancelled item in the same chain.
        const wasAfter = entryOldAt > itemCompletesAt || (isHeadOfChain && entryOldAt >= itemCompletesAt);
        if (!wasAfter) continue;
        newQueue[i] = { ...entry, completesAt: new Date(entryOldAt - shiftAmount) };
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
    const completedCounts = {};
    let completed = false;

    // Process the Overseer chain and the non-Overseer chain independently —
    // they advance in parallel because each has its own completesAt timeline.
    const advanceChain = (predicate) => {
      while (true) {
        const idx = trainingQueue.findIndex(predicate);
        if (idx === -1) break;
        const entry = trainingQueue[idx];
        const cost = TROOP_COSTS[entry.troopType];
        if (!cost) {
          trainingQueue.splice(idx, 1);
          continue;
        }

        const completesAtMs = new Date(entry.completesAt).getTime();
        const perUnitSeconds = entry.perUnitSeconds || getTrainTimeSeconds(entry.troopType, nexus.recruitmentCore);
        const perUnitMs = perUnitSeconds * 1000;
        const startedAtMs = completesAtMs - entry.amount * perUnitMs;
        const elapsedMs = now.getTime() - startedAtMs;

        if (elapsedMs < perUnitMs) break;

        const unitsCompleted = Math.min(entry.amount, Math.floor(elapsedMs / perUnitMs));
        troopUpdates[entry.troopType] = (troopUpdates[entry.troopType] || nexus[entry.troopType] || 0) + unitsCompleted;
        completedCounts[entry.troopType] = (completedCounts[entry.troopType] || 0) + unitsCompleted;
        completed = true;

        if (unitsCompleted >= entry.amount) {
          trainingQueue.splice(idx, 1);
        } else {
          trainingQueue[idx] = { ...entry, amount: entry.amount - unitsCompleted };
          break;
        }
      }
    };

    advanceChain((entry) => entry.troopType !== 'overseer');
    advanceChain((entry) => entry.troopType === 'overseer');

    const resourceUpdate = computeResourceUpdate(nexus);
    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: { ...resourceUpdate, ...troopUpdates, trainingQueue },
    });
    const rewardApplied = await applyQuestRewards(updated);

    if (nexus.ownerId) {
      for (const [troopType, amount] of Object.entries(completedCounts)) {
        const label = troopType.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        void sendPushToUser(nexus.ownerId, NOTIF.TROOP_COMPLETE, {
          title: 'Training Complete',
          body: `${amount}x ${label} ready at ${nexus.name}.`,
          tag: `troop-${nexus.id}-${troopType}`,
          data: { url: '/' },
        });
      }
    }

    res.json({ completed, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
