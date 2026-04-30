import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get map data (villages in range)
router.get('/area/:x/:y', auth, async (req, res) => {
  try {
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);
    const range = 10;

    const villages = await prisma.village.findMany({
      where: {
        x: { gte: x - range, lte: x + range },
        y: { gte: y - range, lte: y + range },
      },
      include: {
        owner: { select: { id: true, username: true, points: true } },
      },
    });

    const result = villages.map((v) => ({
      _id: v.id,
      id: v.id,
      name: v.name,
      x: v.x,
      y: v.y,
      points: v.points,
      owner: v.owner ? { _id: v.owner.id, id: v.owner.id, username: v.owner.username, points: v.owner.points } : null,
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get village details (for other players)
router.get('/village/:villageId', auth, async (req, res) => {
  try {
    const village = await prisma.village.findUnique({
      where: { id: parseInt(req.params.villageId) },
      include: {
        owner: { select: { id: true, username: true, points: true } },
      },
    });

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    const publicData = {
      _id: village.id,
      id: village.id,
      name: village.name,
      x: village.x,
      y: village.y,
      points: village.points,
      owner: village.owner
        ? {
            _id: village.owner.id,
            id: village.owner.id,
            username: village.owner.username,
            points: village.owner.points,
          }
        : null,
      buildings: { shieldGrid: village.shieldGrid },
    };

    res.json(publicData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
