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
        galaxyId: req.galaxyId,
        x: { gte: x - range, lte: x + range },
        y: { gte: y - range, lte: y + range },
      },
      include: {
        owner: { select: { id: true, username: true } },
      },
    });

    // Look up per-galaxy points for every owner referenced in the view
    const ownerIds = [...new Set(nexuses.map((v) => v.ownerId).filter((id) => id != null))];
    const ownerPlayers = ownerIds.length
      ? await prisma.galaxyPlayer.findMany({
          where: { galaxyId: req.galaxyId, userId: { in: ownerIds } },
          select: { userId: true, points: true },
        })
      : [];
    const pointsByOwnerId = new Map(ownerPlayers.map((p) => [p.userId, p.points]));

    const now = new Date();
    const result = nexuses.map((v) => ({
      _id: String(v.id),
      id: String(v.id),
      name: v.name,
      x: v.x,
      y: v.y,
      points: v.points,
      owner: v.owner
        ? {
            _id: String(v.owner.id),
            id: String(v.owner.id),
            username: v.owner.username,
            points: pointsByOwnerId.get(v.owner.id) ?? 0,
          }
        : null,
      intelLevel: v.ownerId === req.userId ? 'owned' : 'public',
      newbieProtectionEndsAt: v.newbieProtectionEndsAt && v.newbieProtectionEndsAt > now ? v.newbieProtectionEndsAt : null,
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get nexus details (for other players)
router.get('/nexus/:nexusId', auth, async (req, res) => {
  try {
    const nexus = await getNexusIntelForUser(req.userId, parseInt(req.params.nexusId), req.galaxyId);

    if (!nexus) {
      return res.status(404).json({ error: 'Nexus not found' });
    }

    res.json(nexus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
