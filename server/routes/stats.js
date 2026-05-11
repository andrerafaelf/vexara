import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { getResourceProduction } from '../utils/economy.js';

const router = express.Router();

const TROOP_KEYS = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative',
  'skimmerBike', 'siegeMech', 'bulwarkGuard', 'suppressorTeam',
  'disruptorUnit', 'interceptorBike', 'annihilatorPlatform', 'overseer',
];

function sumTroops(troopObj) {
  if (!troopObj || typeof troopObj !== 'object') return 0;
  return TROOP_KEYS.reduce((sum, k) => sum + (Number(troopObj[k]) || 0), 0);
}

// GET /api/stats/me — aggregate stats for the authenticated user
router.get('/me', auth, async (req, res) => {
  try {
    const userId = req.userId;

    const [user, nexuses, completedAttacks] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, points: true, createdAt: true } }),
      prisma.nexus.findMany({ where: { ownerId: userId } }),
      prisma.attack.findMany({
        where: { status: 'completed', OR: [{ attackerUserId: userId }, { defenderUserId: userId }] },
        select: {
          attackerUserId: true,
          defenderUserId: true,
          type: true,
          result: true,
          createdAt: true,
        },
      }),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // --- Combat stats ---
    let attacksLaunched = 0;
    let attacksDefended = 0;
    let victories = 0;
    let defeats = 0;
    let troopsTrained = 0; // approximated from training queue completions is not stored; use losses instead
    let troopsLost = 0;
    let troopsKilled = 0;
    let resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
    let resourcesLost = { biomass: 0, alloy: 0, ore: 0 };

    for (const attack of completedAttacks) {
      const result = attack.result;
      if (!result) continue;

      const isAttacker = attack.attackerUserId === userId;
      const isDefender = attack.defenderUserId === userId;
      const won = result.victory === true;

      if (isAttacker) {
        attacksLaunched++;
        if (won) victories++;
        else defeats++;
        troopsLost += sumTroops(result.attackerLosses);
        troopsKilled += sumTroops(result.defenderLosses);
        if (won && result.resourcesStolen) {
          resourcesStolen.biomass += result.resourcesStolen.biomass || 0;
          resourcesStolen.alloy += result.resourcesStolen.alloy || 0;
          resourcesStolen.ore += result.resourcesStolen.ore || 0;
        }
      }

      if (isDefender) {
        attacksDefended++;
        if (!won) {
          // defender lost
          troopsLost += sumTroops(result.defenderLosses);
          troopsKilled += sumTroops(result.attackerLosses);
          if (result.resourcesStolen) {
            resourcesLost.biomass += result.resourcesStolen.biomass || 0;
            resourcesLost.alloy += result.resourcesStolen.alloy || 0;
            resourcesLost.ore += result.resourcesStolen.ore || 0;
          }
        } else {
          troopsLost += sumTroops(result.defenderLosses);
          troopsKilled += sumTroops(result.attackerLosses);
        }
      }
    }

    // --- Resource production stats ---
    // Current production rate (per hour across all nexuses)
    let totalProductionPerHour = { biomass: 0, alloy: 0, ore: 0 };
    let totalCurrentResources = { biomass: 0, alloy: 0, ore: 0 };
    let totalTroops = 0;
    let nexusCount = nexuses.length;

    for (const nexus of nexuses) {
      const prod = getResourceProduction(nexus);
      totalProductionPerHour.biomass += prod.biomass;
      totalProductionPerHour.alloy += prod.alloy;
      totalProductionPerHour.ore += prod.ore;
      totalCurrentResources.biomass += nexus.biomass;
      totalCurrentResources.alloy += nexus.alloy;
      totalCurrentResources.ore += nexus.ore;
      for (const k of TROOP_KEYS) totalTroops += nexus[k] || 0;
    }

    // Average resources/day = production per hour * 24
    const avgResourcesPerDay = {
      biomass: Math.round(totalProductionPerHour.biomass * 24),
      alloy: Math.round(totalProductionPerHour.alloy * 24),
      ore: Math.round(totalProductionPerHour.ore * 24),
    };

    // Account age in days
    const accountAgeDays = Math.max(1, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

    res.json({
      username: user.username,
      points: user.points,
      accountAgeDays,
      nexusCount,
      totalTroops,
      combat: {
        attacksLaunched,
        attacksDefended,
        victories,
        defeats,
        troopsLost,
        troopsKilled,
        resourcesStolen,
        resourcesLost,
      },
      resources: {
        current: totalCurrentResources,
        productionPerHour: {
          biomass: Math.round(totalProductionPerHour.biomass),
          alloy: Math.round(totalProductionPerHour.alloy),
          ore: Math.round(totalProductionPerHour.ore),
        },
        avgPerDay: avgResourcesPerDay,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats/timeline?days=7|30|90
// Returns one bucket per calendar day within the window.
// Each bucket aggregates attack events (as attacker or defender) that completed
// in that day, plus a snapshot of the user's current production rate.
router.get('/timeline', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [nexuses, attacks] = await Promise.all([
      prisma.nexus.findMany({ where: { ownerId: userId } }),
      prisma.attack.findMany({
        where: {
          status: 'completed',
          createdAt: { gte: since },
          OR: [{ attackerUserId: userId }, { defenderUserId: userId }],
        },
        select: {
          attackerUserId: true,
          defenderUserId: true,
          result: true,
          createdAt: true,
        },
      }),
    ]);

    // Current production per hour (used as a flat rate for every day in the window)
    let prodPerHour = { biomass: 0, alloy: 0, ore: 0 };
    for (const nexus of nexuses) {
      const p = getResourceProduction(nexus);
      prodPerHour.biomass += p.biomass;
      prodPerHour.alloy += p.alloy;
      prodPerHour.ore += p.ore;
    }
    const prodPerDay = {
      biomass: Math.round(prodPerHour.biomass * 24),
      alloy: Math.round(prodPerHour.alloy * 24),
      ore: Math.round(prodPerHour.ore * 24),
    };

    // Build a map keyed by YYYY-MM-DD
    const buckets = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = {
        date: key,
        attacksLaunched: 0,
        attacksDefended: 0,
        troopsKilled: 0,
        troopsLost: 0,
        resourcesStolen: 0,
        resourcesLost: 0,
        biomassProduced: prodPerDay.biomass,
        alloyProduced: prodPerDay.alloy,
        oreProduced: prodPerDay.ore,
      };
    }

    for (const attack of attacks) {
      const key = new Date(attack.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      const b = buckets[key];
      const result = attack.result;
      if (!result) continue;

      const isAttacker = attack.attackerUserId === userId;
      const isDefender = attack.defenderUserId === userId;
      const won = result.victory === true;

      if (isAttacker) {
        b.attacksLaunched++;
        b.troopsLost += sumTroops(result.attackerLosses);
        b.troopsKilled += sumTroops(result.defenderLosses);
        if (won && result.resourcesStolen) {
          b.resourcesStolen +=
            (result.resourcesStolen.biomass || 0) +
            (result.resourcesStolen.alloy || 0) +
            (result.resourcesStolen.ore || 0);
        }
      }
      if (isDefender) {
        b.attacksDefended++;
        b.troopsLost += sumTroops(result.defenderLosses);
        b.troopsKilled += sumTroops(result.attackerLosses);
        if (!won && result.resourcesStolen) {
          b.resourcesLost +=
            (result.resourcesStolen.biomass || 0) +
            (result.resourcesStolen.alloy || 0) +
            (result.resourcesStolen.ore || 0);
        }
      }
    }

    res.json(Object.values(buckets));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
