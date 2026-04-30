import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { applyCompletedQueues, refreshResources, serializeNexus } from '../models/Nexus.js';

const router = express.Router();

// Create a new nexus
router.post('/create', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    const nexus = await prisma.nexus.create({
      data: {
        name: req.body.name || `${user.username}'s Nexus`,
        ownerId: user.id,
        x: Math.floor(Math.random() * 100),
        y: Math.floor(Math.random() * 100),
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
    const nexuses = await prisma.nexus.findMany({ where: { ownerId: req.userId } });

    // Update resources and recalculate points for all nexuses
    const updated = await Promise.all(
      nexuses.map(async (v) => {
        const queueApplied = await applyCompletedQueues(v);
        return refreshResources(queueApplied);
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

    const updated = await refreshResources(await applyCompletedQueues(nexus));

    res.json(serializeNexus(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
