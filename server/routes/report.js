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
      take: 20,
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

export default router;
