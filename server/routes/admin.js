import express from 'express';
import prisma from '../lib/prisma.js';
import { serializeVillage } from '../models/Node.js';
import { processArrivedAttacks } from '../utils/combat.js';

const router = express.Router();

// Get all users (admin only, no auth check for dev)
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, points: true, createdAt: true, villages: true },
      orderBy: { createdAt: 'desc' },
    });
    const result = users.map((u) => ({
      ...u,
      _id: u.id,
      villages: u.villages.map((v) => serializeVillage(v)),
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const [userCount, villageCount, attackCount, topUsers] = await Promise.all([
      prisma.user.count(),
      prisma.village.count(),
      prisma.attack.count(),
      prisma.user.findMany({
        select: { id: true, username: true, points: true },
        orderBy: { points: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      userCount,
      villageCount,
      attackCount,
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

    // Delete attacks and villages in the right order (FK constraints)
    const userVillages = await prisma.village.findMany({ where: { ownerId: userId }, select: { id: true } });
    const villageIds = userVillages.map((v) => v.id);

    await prisma.attack.deleteMany({
      where: {
        OR: [{ attackerVillageId: { in: villageIds } }, { defenderVillageId: { in: villageIds } }],
      },
    });
    await prisma.village.deleteMany({ where: { ownerId: userId } });
    await prisma.user.delete({ where: { id: userId } });

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Give resources to village
router.post('/villages/:villageId/resources', async (req, res) => {
  try {
    const { biomass, alloy, ore } = req.body;
    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    const updated = await prisma.village.update({
      where: { id: village.id },
      data: {
        biomass: village.biomass + (biomass || 0),
        alloy: village.alloy + (alloy || 0),
        ore: village.ore + (ore || 0),
      },
    });

    res.json({ success: true, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add troops to village
router.post('/villages/:villageId/troops', async (req, res) => {
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

    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });
    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
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

    const updated = await prisma.village.update({
      where: { id: village.id },
      data: {
        lancerDrone: village.lancerDrone + lancerDrone,
        assaultTrooper: village.assaultTrooper + assaultTrooper,
        breakerUnit: village.breakerUnit + breakerUnit,
        reconOperative: village.reconOperative + reconOperative,
        skimmerBike: village.skimmerBike + skimmerBike,
        siegeMech: village.siegeMech + siegeMech,
        bulwarkGuard: village.bulwarkGuard + bulwarkGuard,
        suppressorTeam: village.suppressorTeam + suppressorTeam,
        disruptorUnit: village.disruptorUnit + disruptorUnit,
        interceptorBike: village.interceptorBike + interceptorBike,
        annihilatorPlatform: village.annihilatorPlatform + annihilatorPlatform,
        overseer: village.overseer + overseer,
        populationCurrent: village.populationCurrent + troopsAdded,
      },
    });

    res.json({ success: true, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add building levels to village
router.post('/villages/:villageId/buildings', async (req, res) => {
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

    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });
    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    const newLifeSupport = village.lifeSupport + lifeSupport;

    const updated = await prisma.village.update({
      where: { id: village.id },
      data: {
        commandCore: village.commandCore + commandCore,
        troopFabricator: village.troopFabricator + troopFabricator,
        lifeSupport: newLifeSupport,
        storageVault: village.storageVault + storageVault,
        biomassFarm: village.biomassFarm + biomassFarm,
        alloyForge: village.alloyForge + alloyForge,
        oreExtractor: village.oreExtractor + oreExtractor,
        shieldGrid: village.shieldGrid + shieldGrid,
        populationMax: Math.floor(24 * Math.pow(1.17, newLifeSupport)),
      },
    });

    res.json({ success: true, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete build queue instantly
router.post('/villages/:villageId/complete-build', async (req, res) => {
  try {
    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });
    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    const buildQueue = Array.isArray(village.buildQueue) ? village.buildQueue : [];
    if (buildQueue.length === 0) {
      return res.status(400).json({ error: 'No building in queue' });
    }

    const [build, ...remainingQueue] = buildQueue;
    const data = {
      [build.building]: build.targetLevel,
      buildQueue: remainingQueue,
    };
    if (build.building === 'lifeSupport') {
      data.populationMax = Math.floor(24 * Math.pow(1.17, build.targetLevel));
    }

    const updated = await prisma.village.update({ where: { id: village.id }, data });
    res.json({ success: true, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete training queue instantly
router.post('/villages/:villageId/complete-training', async (req, res) => {
  try {
    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });
    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    const trainingQueue = Array.isArray(village.trainingQueue) ? village.trainingQueue : [];
    if (trainingQueue.length === 0) {
      return res.status(400).json({ error: 'No troops in training' });
    }

    const [training, ...remainingQueue] = trainingQueue;
    const updated = await prisma.village.update({
      where: { id: village.id },
      data: {
        [training.troopType]: (village[training.troopType] || 0) + training.amount,
        populationCurrent: village.populationCurrent + training.amount,
        trainingQueue: remainingQueue,
      },
    });

    res.json({ success: true, village: serializeVillage(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete village
router.delete('/villages/:villageId', async (req, res) => {
  try {
    const villageId = parseInt(req.params.villageId);
    const village = await prisma.village.findUnique({ where: { id: villageId } });
    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    await prisma.attack.deleteMany({
      where: { OR: [{ attackerVillageId: villageId }, { defenderVillageId: villageId }] },
    });
    await prisma.village.delete({ where: { id: villageId } });

    res.json({ success: true, message: 'Village deleted' });
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
        attackerVillage: { select: { id: true, name: true, x: true, y: true } },
        defenderVillage: { select: { id: true, name: true, x: true, y: true } },
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
