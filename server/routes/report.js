import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { serializeAttack } from '../models/Node.js';

const router = express.Router();

// Get attack reports
router.get('/reports/:villageId', auth, async (req, res) => {
  try {
    const villageId = parseInt(req.params.villageId);
    const village = await prisma.village.findUnique({ where: { id: villageId } });
    if (!village || village.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const reports = await prisma.attack.findMany({
      where: {
        OR: [{ attackerVillageId: villageId }, { defenderVillageId: villageId }],
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        attackerVillage: { select: { id: true, name: true, x: true, y: true } },
        defenderVillage: { select: { id: true, name: true, x: true, y: true } },
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
        return {
          ...serializeAttack(r),
          attackerUsername: attackerUser?.username,
          defenderUsername: defenderUser?.username,
        };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
