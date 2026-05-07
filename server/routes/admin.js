import express from 'express';
import prisma from '../lib/prisma.js';
import { serializeNexus } from '../models/Nexus.js';
import { processArrivedAttacks } from '../utils/combat.js';
import { getPopulationMax } from '../utils/population.js';

const router = express.Router();

// Get all users (admin only, no auth check for dev)
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, points: true, createdAt: true, nexuses: true },
      orderBy: { createdAt: 'desc' },
    });
    const result = users.map((u) => ({
      ...u,
      _id: u.id,
      nexuses: u.nexuses.map((v) => serializeNexus(v)),
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userCount,
      villageCount,
      travelingAttackCount,
      totalAttackCount,
      newUsersThisWeek,
      zeroNexusCount,
      topUsers,
      troopAgg,
      pointsAgg,
      marketCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.nexus.count(),
      prisma.attack.count({ where: { status: 'traveling' } }),
      prisma.attack.count(),
      prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      prisma.user.count({ where: { nexuses: { none: {} } } }),
      prisma.user.findMany({
        select: { id: true, username: true, points: true },
        orderBy: { points: 'desc' },
        take: 10,
      }),
      prisma.nexus.aggregate({
        _sum: {
          lancerDrone: true, assaultTrooper: true, breakerUnit: true,
          reconOperative: true, skimmerBike: true, siegeMech: true,
          bulwarkGuard: true, suppressorTeam: true, disruptorUnit: true,
          interceptorBike: true, annihilatorPlatform: true, overseer: true,
        },
      }),
      prisma.user.aggregate({ _avg: { points: true } }),
      prisma.marketListing.count(),
    ]);

    const troopSum = troopAgg._sum;
    const totalTroops = Object.values(troopSum).reduce(
      (acc, v) => acc + (v ?? 0), 0
    );

    res.json({
      userCount,
      villageCount,
      travelingAttackCount,
      totalAttackCount,
      newUsersThisWeek,
      zeroNexusCount,
      totalTroops,
      avgPoints: Math.round(pointsAgg._avg.points ?? 0),
      marketCount,
      topUsers: topUsers.map((u) => ({ ...u, _id: u.id })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete attacks and nexuses in the right order (FK constraints)
    const userVillages = await prisma.nexus.findMany({ where: { ownerId: userId }, select: { id: true } });
    const villageIds = userVillages.map((v) => v.id);

    await prisma.attack.deleteMany({
      where: {
        OR: [{ attackerNexusId: { in: villageIds } }, { defenderNexusId: { in: villageIds } }],
      },
    });
    await prisma.nexus.deleteMany({ where: { ownerId: userId } });
    await prisma.user.delete({ where: { id: userId } });

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Give resources to nexus
router.post('/nexuses/:nexusId/resources', async (req, res) => {
  try {
    const { biomass, alloy, ore } = req.body;
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });

    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        biomass: nexus.biomass + (biomass || 0),
        alloy: nexus.alloy + (alloy || 0),
        ore: nexus.ore + (ore || 0),
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add troops to nexus
router.post('/nexuses/:nexusId/troops', async (req, res) => {
  try {
    const {
      lancerDrone = 0,
      assaultTrooper = 0,
      breakerUnit = 0,
      reconOperative = 0,
      skimmerBike = 0,
      siegeMech = 0,
      bulwarkGuard = 0,
      suppressorTeam = 0,
      disruptorUnit = 0,
      interceptorBike = 0,
      annihilatorPlatform = 0,
      overseer = 0,
    } = req.body;

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    const troopsAdded =
      lancerDrone +
      assaultTrooper +
      breakerUnit +
      reconOperative +
      skimmerBike +
      siegeMech +
      bulwarkGuard +
      suppressorTeam +
      disruptorUnit +
      interceptorBike +
      annihilatorPlatform +
      overseer;

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        lancerDrone: nexus.lancerDrone + lancerDrone,
        assaultTrooper: nexus.assaultTrooper + assaultTrooper,
        breakerUnit: nexus.breakerUnit + breakerUnit,
        reconOperative: nexus.reconOperative + reconOperative,
        skimmerBike: nexus.skimmerBike + skimmerBike,
        siegeMech: nexus.siegeMech + siegeMech,
        bulwarkGuard: nexus.bulwarkGuard + bulwarkGuard,
        suppressorTeam: nexus.suppressorTeam + suppressorTeam,
        disruptorUnit: nexus.disruptorUnit + disruptorUnit,
        interceptorBike: nexus.interceptorBike + interceptorBike,
        annihilatorPlatform: nexus.annihilatorPlatform + annihilatorPlatform,
        overseer: nexus.overseer + overseer,
        populationCurrent: nexus.populationCurrent + troopsAdded,
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add building levels to nexus
router.post('/nexuses/:nexusId/buildings', async (req, res) => {
  try {
    const {
      commandCore = 0,
      troopFabricator = 0,
      lifeSupport = 0,
      storageVault = 0,
      biomassFarm = 0,
      alloyForge = 0,
      oreExtractor = 0,
      shieldGrid = 0,
    } = req.body;

    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    const newLifeSupport = nexus.lifeSupport + lifeSupport;

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        commandCore: nexus.commandCore + commandCore,
        troopFabricator: nexus.troopFabricator + troopFabricator,
        lifeSupport: newLifeSupport,
        storageVault: nexus.storageVault + storageVault,
        biomassFarm: nexus.biomassFarm + biomassFarm,
        alloyForge: nexus.alloyForge + alloyForge,
        oreExtractor: nexus.oreExtractor + oreExtractor,
        shieldGrid: nexus.shieldGrid + shieldGrid,
        populationMax: getPopulationMax(newLifeSupport),
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset all troops to 0
router.post('/nexuses/:nexusId/troops/reset', async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus) return res.status(404).json({ error: 'Nexus not found' });

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        lancerDrone: 0, assaultTrooper: 0, breakerUnit: 0, reconOperative: 0,
        skimmerBike: 0, siegeMech: 0, bulwarkGuard: 0, suppressorTeam: 0,
        disruptorUnit: 0, interceptorBike: 0, annihilatorPlatform: 0, overseer: 0,
        populationCurrent: 0,
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset all buildings to 0
router.post('/nexuses/:nexusId/buildings/reset', async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus) return res.status(404).json({ error: 'Nexus not found' });

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        commandCore: 0, troopFabricator: 0, lifeSupport: 0,
        storageVault: 0, biomassFarm: 0, alloyForge: 0,
        oreExtractor: 0, shieldGrid: 0,
        populationMax: getPopulationMax(0),
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete build queue instantly
router.post('/nexuses/:nexusId/complete-build', async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    const buildQueue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
    if (buildQueue.length === 0) {
      return res.status(400).json({ error: 'No building in queue' });
    }

    const [build, ...remainingQueue] = buildQueue;
    const data = {
      [build.building]: build.targetLevel,
      buildQueue: remainingQueue,
    };
    if (build.building === 'lifeSupport') {
      data.populationMax = getPopulationMax(build.targetLevel);
    }

    const updated = await prisma.nexus.update({ where: { id: nexus.id }, data });
    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete training queue instantly
router.post('/nexuses/:nexusId/complete-training', async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    const trainingQueue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
    if (trainingQueue.length === 0) {
      return res.status(400).json({ error: 'No troops in training' });
    }

    const [training, ...remainingQueue] = trainingQueue;
    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        [training.troopType]: (nexus[training.troopType] || 0) + training.amount,
        populationCurrent: nexus.populationCurrent + training.amount,
        trainingQueue: remainingQueue,
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete nexus
router.delete('/nexuses/:nexusId', async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    await prisma.attack.deleteMany({
      where: { OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }] },
    });
    await prisma.nexus.delete({ where: { id: nexusId } });

    res.json({ success: true, message: 'Nexus deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all traveling attacks
router.get('/attacks', async (req, res) => {
  try {
    const attacks = await prisma.attack.findMany({
      where: { status: 'traveling' },
      include: {
        attackerNexus: { select: { id: true, name: true, x: true, y: true } },
        defenderNexus: { select: { id: true, name: true, x: true, y: true } },
      },
      orderBy: { arrivesAt: 'asc' },
    });

    res.json(attacks.map((a) => ({ ...a, _id: a.id })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete attack instantly
router.post('/attacks/:attackId/complete', async (req, res) => {
  try {
    const attackId = parseInt(req.params.attackId);
    const attack = await prisma.attack.findUnique({ where: { id: attackId } });

    if (!attack) {
      return res.status(404).json({ error: 'Attack not found' });
    }

    if (attack.status !== 'traveling') {
      return res.status(400).json({ error: 'Attack already completed or cancelled' });
    }

    await prisma.attack.update({ where: { id: attackId }, data: { arrivesAt: new Date() } });
    await processArrivedAttacks();

    res.json({ success: true, message: 'Attack completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
