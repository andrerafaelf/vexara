import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { getNexusIntelForUser } from '../utils/scouting.js';

const router = express.Router();

// Get map data (nexuses in range)
router.get('/area/:x/:y', auth, async (req, res) => {
  try {
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);
    const range = 10;

    const nexuses = await prisma.nexus.findMany({
      where: {
        x: { gte: x - range, lte: x + range },
        y: { gte: y - range, lte: y + range },
      },
      include: {
        owner: { select: { id: true, username: true, points: true } },
      },
    });

    const result = nexuses.map((v) => ({
      _id: v.id,
      id: v.id,
      name: v.name,
      x: v.x,
      y: v.y,
      points: v.points,
      owner: v.owner ? { _id: v.owner.id, id: v.owner.id, username: v.owner.username, points: v.owner.points } : null,
      intelLevel: v.ownerId === req.userId ? 'owned' : 'public',
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get nexus details (for other players)
router.get('/nexus/:nexusId', auth, async (req, res) => {
  try {
    const nexus = await getNexusIntelForUser(req.userId, parseInt(req.params.nexusId));

    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    res.json(nexus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
