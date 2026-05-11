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

// Leave a galaxy — pre-alpha hard-leave. Player's nexuses are turned into
// unowned NPCs so other players can conquer them; resources/buildings/troops
// stay intact. The user's outgoing attacks, troop transfers, and market
// listings originating from those nexuses are cancelled, and their
// GalaxyPlayer row (quests, dominance, groups) is deleted. activeGalaxyId is
// cleared if it matched, bouncing the user back to the picker.
router.post('/:id/leave', authNoGalaxy, async (req, res) => {
  try {
    const galaxyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(galaxyId)) return res.status(400).json({ error: 'Invalid galaxy id' });

    const galaxy = await prisma.galaxy.findUnique({ where: { id: galaxyId } });
    if (!galaxy) return res.status(404).json({ error: 'Galaxy not found' });
    if (galaxy.status !== 'active') {
      return res.status(400).json({ error: 'Cannot leave an ended galaxy' });
    }

    await prisma.$transaction(async (tx) => {
      const player = await tx.galaxyPlayer.findUnique({
        where: { userId_galaxyId: { userId: req.userId, galaxyId } },
        select: { id: true },
      });
      if (!player) {
        const err = new Error('Not a member of this galaxy');
        err.status = 400;
        throw err;
      }

      const ownedNexuses = await tx.nexus.findMany({
        where: { galaxyId, ownerId: req.userId },
        select: { id: true },
      });
      const nexusIds = ownedNexuses.map((n) => n.id);

      if (nexusIds.length > 0) {
        // Outgoing attacks from the user's nexuses — neutrals don't attack.
        await tx.attack.deleteMany({
          where: { galaxyId, attackerNexusId: { in: nexusIds } },
        });
        // Troop transfers the user owned (sent from their nexuses).
        await tx.troopTransfer.deleteMany({
          where: { galaxyId, ownerNexusId: { in: nexusIds } },
        });
        // Troops other players had stationed at the user's nexuses also need
        // to disappear, since the host is becoming an NPC.
        await tx.troopTransfer.deleteMany({
          where: { galaxyId, hostNexusId: { in: nexusIds } },
        });
        // Market listings posted from the user's nexuses.
        await tx.marketListing.deleteMany({
          where: { galaxyId, sellerNexusId: { in: nexusIds } },
        });
        // Convert each nexus to an unowned NPC. Resources, buildings, and
        // troops are intentionally left as-is so other players can conquer
        // and inherit them.
        await tx.nexus.updateMany({
          where: { id: { in: nexusIds } },
          data: { ownerId: null, nexusType: 'Reclaimed Outpost' },
        });
      }

      // Drop quest progress, dominance, and nexus-group state for this galaxy.
      await tx.galaxyPlayer.delete({ where: { id: player.id } });

      // If this galaxy was the user's active one, clear it so they go back to
      // the picker on next request.
      await tx.user.updateMany({
        where: { id: req.userId, activeGalaxyId: galaxyId },
        data: { activeGalaxyId: null },
      });
    });

    res.json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
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
