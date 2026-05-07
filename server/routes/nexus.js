import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { applyCompletedQueues, applyQuestRewards, refreshResources, serializeNexus } from '../models/Nexus.js';
import { getPopulationMax } from '../utils/population.js';

const router = express.Router();

const MAX_NEXUSES_PER_USER = 10;

// Create a new nexus
router.post('/create', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    const existingCount = await prisma.nexus.count({ where: { ownerId: user.id } });
    if (existingCount >= MAX_NEXUSES_PER_USER) {
      return res.status(400).json({ error: `Maximum of ${MAX_NEXUSES_PER_USER} nexuses allowed per player` });
    }

    const nexus = await prisma.nexus.create({
      data: {
        name: req.body.name || `${user.username}'s Nexus`,
        ownerId: user.id,
        x: Math.floor(Math.random() * 35),
        y: Math.floor(Math.random() * 35),
        commandCore: 0,
        recruitmentCore: 0,
        lifeSupport: 1,
        storageVault: 1,
        biomassFarm: 1,
        alloyForge: 1,
        oreExtractor: 1,
        shieldGrid: 0,
        populationMax: getPopulationMax(1),
      },
    });

    res.json(serializeNexus(nexus));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's nexuses
router.get('/my-nexuses', auth, async (req, res) => {
  try {
    const nexuses = await prisma.nexus.findMany({
      where: { ownerId: req.userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const outgoingAttacks = await prisma.attack.findMany({
      where: {
        attackerNexusId: { in: nexuses.map((nexus) => nexus.id) },
        status: 'traveling',
      },
      select: { attackerNexusId: true },
    });
    const nexusesWithOutgoingAttacks = new Set(outgoingAttacks.map((attack) => attack.attackerNexusId));

    // Update resources and recalculate points for all nexuses
    const updated = await Promise.all(
      nexuses.map(async (v) => {
        const queueApplied = await applyCompletedQueues(v);
        const refreshed = await refreshResources(queueApplied);
        return applyQuestRewards(refreshed, { hasOutgoingStrike: nexusesWithOutgoingAttacks.has(v.id) });
      }),
    );

    // Recalculate total user points
    const totalPoints = updated.reduce((sum, v) => sum + v.points, 0);
    await prisma.user.update({ where: { id: req.userId }, data: { points: totalPoints } });

    res.json(updated.map((v) => serializeNexus(v)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get nexus groups
router.get('/groups', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    res.json(user.nexusGroups ?? []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a nexus group
router.post('/groups', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 32) {
      return res.status(400).json({ error: 'Group name must be between 1 and 32 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const groups = Array.isArray(user.nexusGroups) ? user.nexusGroups : [];
    if (groups.length >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 groups allowed' });
    }
    const newGroup = { id: Date.now().toString(), name: name.trim(), nexusIds: [] };
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { nexusGroups: [...groups, newGroup] },
    });
    res.json(updated.nexusGroups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rename a nexus group
router.patch('/groups/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 32) {
      return res.status(400).json({ error: 'Group name must be between 1 and 32 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const groups = Array.isArray(user.nexusGroups) ? user.nexusGroups : [];
    const groupIndex = groups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) return res.status(404).json({ error: 'Group not found' });
    groups[groupIndex] = { ...groups[groupIndex], name: name.trim() };
    const updated = await prisma.user.update({ where: { id: req.userId }, data: { nexusGroups: groups } });
    res.json(updated.nexusGroups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a nexus group
router.delete('/groups/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const groups = Array.isArray(user.nexusGroups) ? user.nexusGroups : [];
    const filtered = groups.filter((g) => g.id !== groupId);
    if (filtered.length === groups.length) return res.status(404).json({ error: 'Group not found' });
    const updated = await prisma.user.update({ where: { id: req.userId }, data: { nexusGroups: filtered } });
    res.json(updated.nexusGroups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set nexuses assigned to a group
router.put('/groups/:groupId/nexuses', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { nexusIds } = req.body;
    if (!Array.isArray(nexusIds)) return res.status(400).json({ error: 'nexusIds must be an array' });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const groups = Array.isArray(user.nexusGroups) ? user.nexusGroups : [];
    const groupIndex = groups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) return res.status(404).json({ error: 'Group not found' });

    // Verify all nexusIds belong to this user
    const ownedNexuses = await prisma.nexus.findMany({ where: { ownerId: req.userId }, select: { id: true } });
    const ownedIds = new Set(ownedNexuses.map((n) => String(n.id)));
    const validIds = nexusIds.filter((id) => ownedIds.has(String(id)));

    groups[groupIndex] = { ...groups[groupIndex], nexusIds: validIds.map(String) };
    const updated = await prisma.user.update({ where: { id: req.userId }, data: { nexusGroups: groups } });
    res.json(updated.nexusGroups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transfer resources between own nexuses
router.post('/transfer-resources', auth, async (req, res) => {
  try {
    const { fromNexusId, toNexusId, biomass = 0, alloy = 0, ore = 0 } = req.body;

    if (!fromNexusId || !toNexusId || String(fromNexusId) === String(toNexusId)) {
      return res.status(400).json({ error: 'Invalid nexus selection' });
    }

    const [from, to] = await Promise.all([
      prisma.nexus.findUnique({ where: { id: parseInt(fromNexusId) } }),
      prisma.nexus.findUnique({ where: { id: parseInt(toNexusId) } }),
    ]);

    if (!from || !to) return res.status(404).json({ error: 'Nexus not found' });
    if (from.ownerId !== req.userId || to.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const sendBiomass = Math.min(Math.max(0, Math.floor(biomass)), Math.floor(from.biomass));
    const sendAlloy = Math.min(Math.max(0, Math.floor(alloy)), Math.floor(from.alloy));
    const sendOre = Math.min(Math.max(0, Math.floor(ore)), Math.floor(from.ore));

    if (sendBiomass === 0 && sendAlloy === 0 && sendOre === 0) {
      return res.status(400).json({ error: 'Nothing to transfer' });
    }

    const [updatedFrom, updatedTo] = await prisma.$transaction([
      prisma.nexus.update({
        where: { id: from.id },
        data: { biomass: from.biomass - sendBiomass, alloy: from.alloy - sendAlloy, ore: from.ore - sendOre },
      }),
      prisma.nexus.update({
        where: { id: to.id },
        data: { biomass: to.biomass + sendBiomass, alloy: to.alloy + sendAlloy, ore: to.ore + sendOre },
      }),
    ]);

    res.json({ from: serializeNexus(updatedFrom), to: serializeNexus(updatedTo) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rename a nexus
router.patch('/:nexusId/name', auth, async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (name.length < 3 || name.length > 32) {
      return res.status(400).json({ error: 'Nexus name must be between 3 and 32 characters' });
    }

    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    if (nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.nexus.update({
      where: { id: nexus.id },
      data: { name },
    });

    res.json(serializeNexus(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific nexus
router.get('/:nexusId', auth, async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });

    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    if (nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const refreshed = await refreshResources(await applyCompletedQueues(nexus));
    const updated = await applyQuestRewards(refreshed);

    res.json(serializeNexus(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
