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
        troopFabricator: 0,
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
