import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { serializeAttack } from '../models/Node.js';

const router = express.Router();

// Send attack
router.post('/send', auth, async (req, res) => {
  try {
    const { fromVillageId, toVillageId, troops, type = 'attack' } = req.body;

    const [attackerVillage, defenderVillage] = await Promise.all([
      prisma.village.findUnique({ where: { id: parseInt(fromVillageId) } }),
      prisma.village.findUnique({ where: { id: parseInt(toVillageId) } }),
    ]);

    if (!attackerVillage || attackerVillage.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!defenderVillage) {
      return res.status(404).json({ error: 'Target village not found' });
    }

    if (defenderVillage.ownerId && defenderVillage.ownerId === req.userId) {
      return res.status(400).json({ error: 'Cannot attack your own village' });
    }

    if (defenderVillage.ownerId) {
      return res.status(400).json({ error: 'Cannot attack conquered nodes' });
    }

    // Check troop availability
    for (const [troopType, amount] of Object.entries(troops)) {
      if ((attackerVillage[troopType] || 0) < amount) {
        return res.status(400).json({ error: `Insufficient ${troopType}` });
      }
    }

    // Deduct troops and population from attacker village
    let totalTroopsSent = 0;
    const troopDeductions = {};
    for (const [troopType, amount] of Object.entries(troops)) {
      troopDeductions[troopType] = (attackerVillage[troopType] || 0) - amount;
      totalTroopsSent += amount;
    }

    const distance = Math.sqrt(
      Math.pow(defenderVillage.x - attackerVillage.x, 2) + Math.pow(defenderVillage.y - attackerVillage.y, 2),
    );
    const travelTimeMinutes = distance * 5;
    const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

    const [attack] = await prisma.$transaction([
      prisma.attack.create({
        data: {
          attackerUserId: req.userId,
          attackerVillageId: parseInt(fromVillageId),
          defenderUserId: defenderVillage.ownerId ?? null,
          defenderVillageId: parseInt(toVillageId),
          troops,
          arrivesAt,
          type,
        },
      }),
      prisma.village.update({
        where: { id: attackerVillage.id },
        data: {
          ...troopDeductions,
          populationCurrent: Math.max(0, attackerVillage.populationCurrent - totalTroopsSent),
        },
      }),
    ]);

    res.json({ success: true, attack: serializeAttack(attack) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get incoming attacks
router.get('/incoming/:villageId', auth, async (req, res) => {
  try {
    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });
    if (!village || village.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await prisma.attack.findMany({
      where: { defenderVillageId: village.id, status: 'traveling' },
      include: {
        attackerVillage: { select: { id: true, name: true, x: true, y: true } },
      },
    });

    // Enrich with attacker username
    const enriched = await Promise.all(
      attacks.map(async (a) => {
        const attackerUser = await prisma.user.findUnique({
          where: { id: a.attackerUserId },
          select: { id: true, username: true },
        });
        return { ...serializeAttack(a), attackerUsername: attackerUser?.username };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get outgoing attacks
router.get('/outgoing/:villageId', auth, async (req, res) => {
  try {
    const village = await prisma.village.findUnique({ where: { id: parseInt(req.params.villageId) } });
    if (!village || village.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await prisma.attack.findMany({
      where: { attackerVillageId: village.id, status: 'traveling' },
      include: {
        defenderVillage: { select: { id: true, name: true, x: true, y: true } },
      },
    });

    const enriched = await Promise.all(
      attacks.map(async (a) => {
        const defenderUser = a.defenderUserId
          ? await prisma.user.findUnique({
              where: { id: a.defenderUserId },
              select: { id: true, username: true },
            })
          : null;
        return { ...serializeAttack(a), defenderUsername: defenderUser?.username };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
