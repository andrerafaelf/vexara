import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { refreshResources, serializeVillage } from '../models/Node.js';

const router = express.Router();

// Create a new village
router.post('/create', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    const village = await prisma.village.create({
      data: {
        name: req.body.name || `${user.username}'s Village`,
        ownerId: user.id,
        x: Math.floor(Math.random() * 100),
        y: Math.floor(Math.random() * 100),
      },
    });

    res.json(serializeVillage(village));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's villages
router.get('/my-villages', auth, async (req, res) => {
  try {
    const villages = await prisma.village.findMany({ where: { ownerId: req.userId } });

    // Update resources and recalculate points for all villages
    const updated = await Promise.all(villages.map((v) => refreshResources(v)));

    // Recalculate total user points
    const totalPoints = updated.reduce((sum, v) => sum + v.points, 0);
    await prisma.user.update({ where: { id: req.userId }, data: { points: totalPoints } });

    res.json(updated.map((v) => serializeVillage(v)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific village
router.get('/:villageId', auth, async (req, res) => {
  try {
    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    if (village.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await refreshResources(village);

    res.json(serializeVillage(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
