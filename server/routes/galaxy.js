import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { createStarterNexus } from '../utils/starterNexus.js';

const router = express.Router();

function serializeGalaxy(g, { isJoined = false } = {}) {
  return {
    id: g.id,
    name: g.name,
    status: g.status,
    endedAt: g.endedAt ?? null,
    winnerUserId: g.winnerUserId ?? null,
    createdAt: g.createdAt,
    isJoined,
  };
}

// Auth that does NOT require an active galaxy — needed for the picker itself
function authNoGalaxy(req, res, next) {
  req.activeGalaxyOptional = true;
  return auth(req, res, next);
}

// List all galaxies + which ones the current user has joined
router.get('/', authNoGalaxy, async (req, res) => {
  try {
    const [galaxies, myPlayers] = await Promise.all([
      prisma.galaxy.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.galaxyPlayer.findMany({
        where: { userId: req.userId },
        select: { galaxyId: true },
      }),
    ]);
    const joined = new Set(myPlayers.map((p) => p.galaxyId));
    res.json(galaxies.map((g) => serializeGalaxy(g, { isJoined: joined.has(g.id) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Current galaxy context for the authenticated user
router.get('/me', authNoGalaxy, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { activeGalaxyId: true, activeGalaxy: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      activeGalaxy: user.activeGalaxy ? serializeGalaxy(user.activeGalaxy, { isJoined: true }) : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Select a galaxy — joins it (creates GalaxyPlayer + starter nexus) on first select
router.post('/:id/select', authNoGalaxy, async (req, res) => {
  try {
    const galaxyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(galaxyId)) return res.status(400).json({ error: 'Invalid galaxy id' });

    const galaxy = await prisma.galaxy.findUnique({ where: { id: galaxyId } });
    if (!galaxy) return res.status(404).json({ error: 'Galaxy not found' });
    if (galaxy.status !== 'active') {
      return res.status(400).json({ error: 'Cannot select an ended galaxy as active' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.galaxyPlayer.findUnique({
        where: { userId_galaxyId: { userId: user.id, galaxyId } },
        select: { id: true },
      });

      if (!existing) {
        await tx.galaxyPlayer.create({ data: { userId: user.id, galaxyId } });
        await createStarterNexus(tx, { userId: user.id, username: user.username, galaxyId });
      }

      await tx.user.update({
        where: { id: user.id },
        data: { activeGalaxyId: galaxyId },
      });

      return { joined: !existing };
    });

    res.json({
      success: true,
      joined: result.joined,
      activeGalaxy: serializeGalaxy(galaxy, { isJoined: true }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
