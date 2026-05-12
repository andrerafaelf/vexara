import type { Response } from 'express';
import { applyCompletedQueues, applyQuestRewards, computeResourceUpdate, serializeNexus } from '../models/Nexus.js';
import * as troopService from '../services/troopService.js';
import type { AuthRequest } from '../types/index.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { parsePositiveInt } from '../utils/validation.js';

const MAX_TRAINING_QUEUE = 5;
const RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL = 0.92;

const TROOP_COSTS: Record<string, { biomass: number; alloy: number; ore: number; population: number; time: number }> = {
  lancerDrone:          { biomass: 150,    alloy: 150,    ore: 200,    population: 1, time: 53    },
  assaultTrooper:       { biomass: 150,    alloy: 150,    ore: 350,    population: 1, time: 79    },
  breakerUnit:          { biomass: 250,    alloy: 150,    ore: 300,    population: 1, time: 74    },
  reconOperative:       { biomass: 400,    alloy: 150,    ore: 400,    population: 1, time: 180   },
  skimmerBike:          { biomass: 625,    alloy: 500,    ore: 750,    population: 3, time: 600   },
  bulwarkGuard:         { biomass: 400,    alloy: 600,    ore: 500,    population: 2, time: 480   },
  suppressorTeam:       { biomass: 450,    alloy: 400,    ore: 450,    population: 2, time: 480   },
  disruptorUnit:        { biomass: 550,    alloy: 750,    ore: 650,    population: 2, time: 660   },
  interceptorBike:      { biomass: 750,    alloy: 600,    ore: 900,    population: 3, time: 900   },
  siegeMech:            { biomass: 1250,   alloy: 1000,   ore: 2000,   population: 4, time: 3600  },
  annihilatorPlatform:  { biomass: 2000,   alloy: 1750,   ore: 3000,   population: 5, time: 7200  },
  overseer:             { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 },
};

const TROOP_REQUIREMENTS: Record<string, { buildings: Record<string, number>; maxPerNexus?: number }> = {
  assaultTrooper:      { buildings: { recruitmentCore: 1 } },
  lancerDrone:         { buildings: { recruitmentCore: 2 } },
  breakerUnit:         { buildings: { recruitmentCore: 3, oreExtractor: 3 } },
  reconOperative:      { buildings: { recruitmentCore: 4, commandCore: 3 } },
  skimmerBike:         { buildings: { recruitmentCore: 5, alloyForge: 4 } },
  bulwarkGuard:        { buildings: { recruitmentCore: 5, lifeSupport: 5 } },
  suppressorTeam:      { buildings: { recruitmentCore: 7, commandCore: 6 } },
  disruptorUnit:       { buildings: { recruitmentCore: 7, oreExtractor: 6 } },
  interceptorBike:     { buildings: { recruitmentCore: 8, alloyForge: 7 } },
  siegeMech:           { buildings: { recruitmentCore: 10, oreExtractor: 9, commandCore: 8 } },
  annihilatorPlatform: { buildings: { recruitmentCore: 12, commandCore: 10, shieldGrid: 10 } },
  overseer:            { buildings: { recruitmentCore: 14, commandCore: 14, shieldGrid: 13 }, maxPerNexus: 3 },
};

const BUILDING_NAMES: Record<string, string> = {
  commandCore: 'Command Core', recruitmentCore: 'Recruitment Core', lifeSupport: 'Life Support',
  storageVault: 'Storage Vault', biomassFarm: 'Biomass Farm', alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor', shieldGrid: 'Shield Grid',
};

const TROOP_NAMES: Record<string, string> = {
  lancerDrone: 'Lancer Drone', assaultTrooper: 'Assault Trooper', breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative', skimmerBike: 'Skimmer Bike', siegeMech: 'Siege Mech',
  bulwarkGuard: 'Bulwark Guard', suppressorTeam: 'Suppressor Team', disruptorUnit: 'Disruptor Unit',
  interceptorBike: 'Interceptor Bike', annihilatorPlatform: 'Annihilator Platform', overseer: 'Overseer',
};

function getTrainTimeSeconds(troopType: string, recruitmentLevel: number) {
  const baseTime = TROOP_COSTS[troopType].time;
  if (troopType === 'overseer') return baseTime;
  const factor = Math.pow(RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL, Math.max(0, recruitmentLevel || 0));
  return Math.max(1, Math.floor(baseTime * factor));
}

export async function trainTroops(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { nexusId, troopType, amount } = req.body as { nexusId?: unknown; troopType?: string; amount?: unknown };
    const parsedNexusId = parsePositiveInt(nexusId);
    const parsedAmount = parsePositiveInt(amount);
    if (!parsedNexusId) { res.status(400).json({ error: 'Invalid nexus ID' }); return; }
    if (!parsedAmount || parsedAmount > 1000) { res.status(400).json({ error: 'Amount must be an integer between 1 and 1000' }); return; }

    const rawNexus = await troopService.getNexusById(parsedNexusId);
    if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const nexus = await applyCompletedQueues(rawNexus);
    if (!troopType || !TROOP_COSTS[troopType]) { res.status(400).json({ error: 'Invalid troop type' }); return; }
    if (nexus.recruitmentCore === 0) { res.status(400).json({ error: 'Recruitment Core required' }); return; }

    const requirements = TROOP_REQUIREMENTS[troopType] || {};
    if (requirements.buildings) {
      for (const [building, requiredLevel] of Object.entries(requirements.buildings)) {
        if (((nexus as unknown as Record<string, number>)[building] || 0) < requiredLevel) {
          res.status(400).json({ error: `Requires ${BUILDING_NAMES[building] || building} Level ${requiredLevel}` });
          return;
        }
      }
    }

    if (requirements.maxPerNexus) {
      const queuedAmount = (Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [])
        .filter((e: { troopType: string }) => e.troopType === troopType)
        .reduce((sum: number, e: { amount: number }) => sum + (Number(e.amount) || 0), 0);
      const inFlight = await troopService.getInFlightTroops(nexus.id);
      const inFlightAmount = inFlight.reduce((sum, a) => sum + ((a.troops as Record<string, number>)?.[troopType] || 0), 0);
      const current = ((nexus as unknown as Record<string, number>)[troopType] || 0) + queuedAmount + inFlightAmount;
      if (current + parsedAmount > requirements.maxPerNexus) {
        res.status(400).json({ error: `Maximum ${requirements.maxPerNexus} ${TROOP_NAMES[troopType] || troopType} per nexus` });
        return;
      }
    }

    const resourceUpdate = computeResourceUpdate(nexus);
    const current = { ...nexus, ...resourceUpdate } as unknown as Record<string, number>;
    const cost = TROOP_COSTS[troopType];
    const totalCost = { biomass: cost.biomass * parsedAmount, alloy: cost.alloy * parsedAmount, ore: cost.ore * parsedAmount, population: cost.population * parsedAmount };
    if (current.biomass < totalCost.biomass || current.alloy < totalCost.alloy || current.ore < totalCost.ore) {
      res.status(400).json({ error: 'Insufficient resources' }); return;
    }
    if (nexus.populationCurrent + totalCost.population > nexus.populationMax) {
      res.status(400).json({ error: 'Insufficient population capacity' }); return;
    }

    const trainingQueue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
    const isOverseer = troopType === 'overseer';
    const sameChainQueue = trainingQueue.filter((e: { troopType: string }) =>
      isOverseer ? e.troopType === 'overseer' : e.troopType !== 'overseer',
    );
    if (sameChainQueue.length >= MAX_TRAINING_QUEUE) {
      res.status(400).json({ error: `Training queue is full (${MAX_TRAINING_QUEUE}/${MAX_TRAINING_QUEUE})` }); return;
    }

    const nexusTimeFactor = troopType === 'overseer' ? 1 : ((NEXUS_TYPE_BONUSES as Record<string, { trainingTimeMultiplier?: number }>)[nexus.nexusType as string]?.trainingTimeMultiplier ?? 1);
    const perUnitSeconds = Math.max(1, Math.floor(getTrainTimeSeconds(troopType, nexus.recruitmentCore) * nexusTimeFactor));
    const queueStart = sameChainQueue.length > 0
      ? new Date(sameChainQueue[sameChainQueue.length - 1].completesAt as string).getTime()
      : Date.now();
    const completesAt = new Date(queueStart + perUnitSeconds * parsedAmount * 1000);
    const newQueue = [...trainingQueue, { troopType, amount: parsedAmount, completesAt, perUnitSeconds }];

    const updated = await troopService.updateNexus(nexus.id, {
      ...resourceUpdate,
      biomass: current.biomass - totalCost.biomass,
      alloy: current.alloy - totalCost.alloy,
      ore: current.ore - totalCost.ore,
      populationCurrent: nexus.populationCurrent + totalCost.population,
      trainingQueue: newQueue,
    });
    const rewardApplied = await applyQuestRewards(updated);
    res.json({ success: true, completesAt, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function cancelTrainingQueue(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { nexusId, index } = req.body as { nexusId?: unknown; index?: unknown };
    const parsedIndex = parseInt(String(index), 10);
    const nexus = await troopService.getNexusById(parseInt(String(nexusId)));
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const trainingQueue = Array.isArray(nexus.trainingQueue) ? [...nexus.trainingQueue] : [];
    if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= trainingQueue.length) {
      res.status(400).json({ error: 'Invalid queue index' }); return;
    }
    const item = trainingQueue[parsedIndex] as { troopType: string; amount: number; completesAt: string | Date };
    const cost = TROOP_COSTS[item.troopType];
    if (!cost) { res.status(400).json({ error: 'Invalid troop type in queue' }); return; }
    const totalCost = { biomass: cost.biomass * item.amount, alloy: cost.alloy * item.amount, ore: cost.ore * item.amount, population: cost.population * item.amount };
    const refund = { biomass: Math.floor(totalCost.biomass * 0.85), alloy: Math.floor(totalCost.alloy * 0.85), ore: Math.floor(totalCost.ore * 0.85) };
    const itemCompletesAt = new Date(item.completesAt).getTime();
    const isOverseerItem = item.troopType === 'overseer';
    const sameChainPredicate = (entry: { troopType: string }) =>
      isOverseerItem ? entry.troopType === 'overseer' : entry.troopType !== 'overseer';
    const newQueue = trainingQueue.filter((_, i) => i !== parsedIndex) as Array<{ troopType: string; amount: number; completesAt: string | Date; perUnitSeconds?: number }>;
    const sameChainPrevEntry = (() => {
      for (let i = parsedIndex - 1; i >= 0; i--) {
        if (sameChainPredicate(trainingQueue[i] as { troopType: string })) return trainingQueue[i] as { completesAt: string | Date };
      }
      return null;
    })();
    const isHeadOfChain = sameChainPrevEntry === null;
    const shiftAmount = isHeadOfChain
      ? Math.max(0, itemCompletesAt - Date.now())
      : itemCompletesAt - new Date(sameChainPrevEntry!.completesAt).getTime();
    if (shiftAmount > 0) {
      for (let i = 0; i < newQueue.length; i++) {
        const entry = newQueue[i];
        if (!sameChainPredicate(entry)) continue;
        const entryOldAt = new Date(entry.completesAt).getTime();
        const wasAfter = entryOldAt > itemCompletesAt || (isHeadOfChain && entryOldAt >= itemCompletesAt);
        if (!wasAfter) continue;
        newQueue[i] = { ...entry, completesAt: new Date(entryOldAt - shiftAmount) };
      }
    }
    const resourceUpdate = computeResourceUpdate(nexus);
    const current = { ...nexus, ...resourceUpdate } as unknown as Record<string, number>;
    const updated = await troopService.updateNexus(nexus.id, {
      ...resourceUpdate,
      biomass: current.biomass + refund.biomass,
      alloy: current.alloy + refund.alloy,
      ore: current.ore + refund.ore,
      populationCurrent: Math.max(0, nexus.populationCurrent - totalCost.population),
      trainingQueue: newQueue,
    });
    res.json({ success: true, refund, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function checkTrainingQueue(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { nexusId } = req.body as { nexusId?: unknown };
    const nexus = await troopService.getNexusById(parseInt(String(nexusId)));
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const now = new Date();
    const trainingQueue = Array.isArray(nexus.trainingQueue) ? [...nexus.trainingQueue] : [];
    const troopUpdates: Record<string, number> = {};
    let completed = false;
    const nexusRecord = nexus as unknown as Record<string, number>;
    const advanceChain = (predicate: (e: { troopType: string }) => boolean) => {
      while (true) {
        const idx = trainingQueue.findIndex(predicate as (e: unknown) => boolean);
        if (idx === -1) break;
        const entry = trainingQueue[idx] as { troopType: string; amount: number; completesAt: string | Date; perUnitSeconds?: number };
        const cost = TROOP_COSTS[entry.troopType];
        if (!cost) { trainingQueue.splice(idx, 1); continue; }
        const completesAtMs = new Date(entry.completesAt).getTime();
        const perUnitSeconds = entry.perUnitSeconds || getTrainTimeSeconds(entry.troopType, nexus.recruitmentCore);
        const perUnitMs = perUnitSeconds * 1000;
        const startedAtMs = completesAtMs - entry.amount * perUnitMs;
        const elapsedMs = now.getTime() - startedAtMs;
        if (elapsedMs < perUnitMs) break;
        const unitsCompleted = Math.min(entry.amount, Math.floor(elapsedMs / perUnitMs));
        troopUpdates[entry.troopType] = (troopUpdates[entry.troopType] || nexusRecord[entry.troopType] || 0) + unitsCompleted;
        completed = true;
        if (unitsCompleted >= entry.amount) {
          trainingQueue.splice(idx, 1);
        } else {
          trainingQueue[idx] = { ...entry, amount: entry.amount - unitsCompleted };
          break;
        }
      }
    };
    advanceChain((e: { troopType: string }) => e.troopType !== 'overseer');
    advanceChain((e: { troopType: string }) => e.troopType === 'overseer');
    const resourceUpdate = computeResourceUpdate(nexus);
    const updated = await troopService.updateNexus(nexus.id, { ...resourceUpdate, ...troopUpdates, trainingQueue });
    const rewardApplied = await applyQuestRewards(updated);
    res.json({ completed, nexus: serializeNexus(rewardApplied) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
