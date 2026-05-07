import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { serializeAttack } from '../models/Nexus.js';

const router = express.Router();

// Get attack reports
router.get('/reports/:nexusId', auth, async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const reports = await prisma.attack.findMany({
      where: {
        OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }],
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        attackerNexus: { select: { id: true, name: true, x: true, y: true } },
        defenderNexus: { select: { id: true, name: true, x: true, y: true } },
      },
    });

    const enriched = await Promise.all(
      reports.map(async (r) => {
        const [attackerUser, defenderUser] = await Promise.all([
          prisma.user.findUnique({ where: { id: r.attackerUserId }, select: { id: true, username: true } }),
          r.defenderUserId
            ? prisma.user.findUnique({ where: { id: r.defenderUserId }, select: { id: true, username: true } })
            : null,
        ]);
        return serializeAttack({
          ...r,
          attackerUsername: attackerUser?.username,
          defenderUsername: defenderUser?.username,
        });
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark a report as read
router.post('/read/:attackId', auth, async (req, res) => {
  try {
    const attackId = parseInt(req.params.attackId);
    const attack = await prisma.attack.findUnique({ where: { id: attackId } });
    if (!attack) return res.status(404).json({ error: 'Report not found' });

    // Only attacker or defender may mark as read
    const nexuses = await prisma.nexus.findMany({ where: { ownerId: req.userId }, select: { id: true } });
    const ownedIds = new Set(nexuses.map((n) => n.id));
    if (!ownedIds.has(attack.attackerNexusId) && !ownedIds.has(attack.defenderNexusId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.reportRead.upsert({
      where: { userId_attackId: { userId: req.userId, attackId } },
      create: { userId: req.userId, attackId },
      update: { readAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all reports for a nexus as read
router.post('/read-all/:nexusId', auth, async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await prisma.attack.findMany({
      where: {
        OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }],
        status: 'completed',
      },
      select: { id: true },
    });

    if (attacks.length === 0) return res.json({ success: true, count: 0 });

    const now = new Date();
    await prisma.$transaction(
      attacks.map((a) =>
        prisma.reportRead.upsert({
          where: { userId_attackId: { userId: req.userId, attackId: a.id } },
          create: { userId: req.userId, attackId: a.id },
          update: { readAt: now },
        }),
      ),
    );

    res.json({ success: true, count: attacks.length, ids: attacks.map((a) => String(a.id)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get set of read attack IDs for the current user (for a given nexus)
router.get('/read-ids/:nexusId', auth, async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const reads = await prisma.reportRead.findMany({
      where: { userId: req.userId },
      select: { attackId: true },
    });

    res.json(reads.map((r) => String(r.attackId)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get read IDs across ALL own nexuses (for the dot indicator)
router.get('/read-ids', auth, async (req, res) => {
  try {
    const reads = await prisma.reportRead.findMany({
      where: { userId: req.userId },
      select: { attackId: true },
    });
    res.json(reads.map((r) => String(r.attackId)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
