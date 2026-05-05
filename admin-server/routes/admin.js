import express from 'express';
import prisma from '../../server/lib/prisma.js';
import { serializeNexus } from '../../server/models/Nexus.js';
import { hashPassword } from '../../server/models/User.js';
import { processArrivedAttacks } from '../../server/utils/combat.js';
import { getPopulationMax } from '../../server/utils/population.js';

const router = express.Router();

const TROOP_KEYS = [
  'lancerDrone',
  'assaultTrooper',
  'breakerUnit',
  'reconOperative',
  'skimmerBike',
  'siegeMech',
  'bulwarkGuard',
  'suppressorTeam',
  'disruptorUnit',
  'interceptorBike',
  'annihilatorPlatform',
  'overseer',
];

const BUILDING_KEYS = [
  'commandCore',
  'troopFabricator',
  'lifeSupport',
  'storageVault',
  'biomassFarm',
  'alloyForge',
  'oreExtractor',
  'shieldGrid',
];

const STARTER_NEXUS_DATA = {
  commandCore: 0,
  troopFabricator: 0,
  lifeSupport: 1,
  storageVault: 1,
  biomassFarm: 1,
  alloyForge: 1,
  oreExtractor: 1,
  shieldGrid: 0,
};

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function findTargetNexus(userId, nexusId) {
  if (nexusId) {
    return prisma.nexus.findFirst({
      where: { id: toInt(nexusId), ownerId: userId },
    });
  }

  return prisma.nexus.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
  });
}

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        points: true,
        createdAt: true,
        nexuses: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const result = users.map((u) => ({
      ...u,
      _id: u.id,
      nexuses: u.nexuses.map((v) => ({
        _id: v.id,
        id: v.id,
        name: v.name,
      })),
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
      prisma.nexus.count(),
      prisma.attack.count({ where: { status: 'traveling' } }),
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

// Create user
router.post('/users', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password are required' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: String(email).toLowerCase() }] },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with that username or email' });
    }

    const hashedPassword = await hashPassword(password);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email: String(email).toLowerCase(),
          password: hashedPassword,
        },
      });

      const nexus = await tx.nexus.create({
        data: {
          name: `${username}'s Nexus`,
          ownerId: user.id,
          x: Math.floor(Math.random() * 35),
          y: Math.floor(Math.random() * 35),
          populationMax: getPopulationMax(1),
        },
      });

      return { user, nexus };
    });

    res.json({
      success: true,
      user: {
        _id: created.user.id,
        id: created.user.id,
        username: created.user.username,
        email: created.user.email,
      },
      nexus: serializeNexus(created.nexus),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user email/password
router.patch('/users/:userId', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const data = {};

    if (email) {
      const normalizedEmail = String(email).toLowerCase();
      const emailOwner = await prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          NOT: { id: userId },
        },
      });

      if (emailOwner) {
        return res.status(400).json({ error: 'Email is already in use' });
      }

      data.email = normalizedEmail;
    }

    if (password) {
      data.password = await hashPassword(password);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });
    res.json({
      success: true,
      user: {
        _id: updated.id,
        id: updated.id,
        username: updated.username,
        email: updated.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add resources to a user's nexus
router.post('/users/:userId/resources', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const nexus = await findTargetNexus(userId, req.body.nexusId);

    if (!nexus) {
      return res.status(404).json({ error: 'No nexus found for this user' });
    }

    const biomass = Math.max(0, Number(req.body.biomass) || 0);
    const alloy = Math.max(0, Number(req.body.alloy) || 0);
    const ore = Math.max(0, Number(req.body.ore) || 0);

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        biomass: nexus.biomass + biomass,
        alloy: nexus.alloy + alloy,
        ore: nexus.ore + ore,
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add troops to a user's nexus
router.post('/users/:userId/troops', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const nexus = await findTargetNexus(userId, req.body.nexusId);

    if (!nexus) {
      return res.status(404).json({ error: 'No nexus found for this user' });
    }

    const troopType = req.body.troopType;
    const amount = Math.max(0, toInt(req.body.amount));

    if (!TROOP_KEYS.includes(troopType)) {
      return res.status(400).json({ error: 'Invalid troop type' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        [troopType]: (nexus[troopType] || 0) + amount,
        populationCurrent: nexus.populationCurrent + amount,
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modify a building level on a user's nexus
router.post('/users/:userId/buildings', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const nexus = await findTargetNexus(userId, req.body.nexusId);

    if (!nexus) {
      return res.status(404).json({ error: 'No nexus found for this user' });
    }

    const building = req.body.building;
    const level = Math.max(0, toInt(req.body.level));

    if (!BUILDING_KEYS.includes(building)) {
      return res.status(400).json({ error: 'Invalid building' });
    }

    const data = {
      [building]: level,
    };

    if (building === 'lifeSupport') {
      const populationMax = getPopulationMax(level);
      data.populationMax = populationMax;
      data.populationCurrent = Math.min(nexus.populationCurrent, populationMax);
    }

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data,
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete earliest active outgoing strike for a user
router.post('/users/:userId/complete-strike', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const attack = await prisma.attack.findFirst({
      where: {
        attackerUserId: userId,
        status: 'traveling',
      },
      orderBy: { arrivesAt: 'asc' },
    });

    if (!attack) {
      return res.status(404).json({ error: 'No active outgoing strike for this user' });
    }

    await prisma.attack.update({
      where: { id: attack.id },
      data: { arrivesAt: new Date() },
    });

    await processArrivedAttacks();

    res.json({ success: true, message: 'User active strike completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete current build queue item for a user's nexus
router.post('/users/:userId/complete-build', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const nexus = await findTargetNexus(userId, req.body.nexusId);

    if (!nexus) {
      return res.status(404).json({ error: 'No nexus found for this user' });
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
      data.populationCurrent = Math.min(nexus.populationCurrent, data.populationMax);
    }

    const updated = await prisma.nexus.update({ where: { id: nexus.id }, data });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete all troop training queue entries for a user's nexus
router.post('/users/:userId/complete-training', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const nexus = await findTargetNexus(userId, req.body.nexusId);

    if (!nexus) {
      return res.status(404).json({ error: 'No nexus found for this user' });
    }

    const trainingQueue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
    if (trainingQueue.length === 0) {
      return res.status(400).json({ error: 'No troops in training' });
    }

    const troopUpdates = {};
    let totalPopulationAdded = 0;

    for (const training of trainingQueue) {
      const amount = toInt(training.amount);
      if (amount <= 0) {
        continue;
      }
      troopUpdates[training.troopType] = (troopUpdates[training.troopType] || nexus[training.troopType] || 0) + amount;
      totalPopulationAdded += amount;
    }

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        ...troopUpdates,
        populationCurrent: nexus.populationCurrent + totalPopulationAdded,
        trainingQueue: [],
      },
    });

    res.json({ success: true, nexus: serializeNexus(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset user account to starter game state
router.post('/users/:userId/reset-account', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resetResult = await prisma.$transaction(async (tx) => {
      const userNexuses = await tx.nexus.findMany({ where: { ownerId: userId }, select: { id: true } });
      const nexusIds = userNexuses.map((n) => n.id);

      if (nexusIds.length > 0) {
        await tx.attack.deleteMany({
          where: {
            OR: [{ attackerNexusId: { in: nexusIds } }, { defenderNexusId: { in: nexusIds } }],
          },
        });
      }

      await tx.attack.deleteMany({
        where: {
          OR: [{ attackerUserId: userId }, { defenderUserId: userId }],
        },
      });

      await tx.nexus.deleteMany({ where: { ownerId: userId } });

      await tx.user.update({
        where: { id: userId },
        data: { points: 0 },
      });

      const starterNexus = await tx.nexus.create({
        data: {
          name: `${user.username}'s Nexus`,
          ownerId: user.id,
          x: Math.floor(Math.random() * 25),
          y: Math.floor(Math.random() * 25),
          ...STARTER_NEXUS_DATA,
          buildQueue: [],
          trainingQueue: [],
          populationCurrent: 5,
          populationMax: getPopulationMax(STARTER_NEXUS_DATA.lifeSupport),
          biomass: 500,
          alloy: 500,
          ore: 500,
          controlLevel: 100,
          points: 5,
          lastResourceUpdate: new Date(),
        },
      });

      return starterNexus;
    });

    res.json({ success: true, message: 'Account reset to starter state', nexus: serializeNexus(resetResult) });
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

    const troopUpdates = {};
    let totalPopulationAdded = 0;

    for (const training of trainingQueue) {
      const amount = toInt(training.amount);
      if (amount <= 0) {
        continue;
      }
      troopUpdates[training.troopType] = (troopUpdates[training.troopType] || nexus[training.troopType] || 0) + amount;
      totalPopulationAdded += amount;
    }

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        ...troopUpdates,
        populationCurrent: nexus.populationCurrent + totalPopulationAdded,
        trainingQueue: [],
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

    const userIds = [...new Set(attacks.flatMap((a) => [a.attackerUserId, a.defenderUserId].filter(Boolean)))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userById = new Map(users.map((u) => [u.id, u.username]));

    res.json(
      attacks.map((a) => ({
        ...a,
        _id: a.id,
        attacker: {
          user: { username: userById.get(a.attackerUserId) || 'Unknown' },
        },
        defender: {
          user: { username: userById.get(a.defenderUserId) || 'Neutral' },
        },
      })),
    );
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
