import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { serializeAttack } from '../models/Nexus.js';

const router = express.Router();

// Send attack
router.post('/send', auth, async (req, res) => {
  try {
    const { fromNexusId, toNexusId, troops, type = 'attack' } = req.body;

    const [attackerNexus, defenderNexus] = await Promise.all([
      prisma.nexus.findUnique({ where: { id: parseInt(fromNexusId) } }),
      prisma.nexus.findUnique({ where: { id: parseInt(toNexusId) } }),
    ]);

    if (!attackerNexus || attackerNexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!defenderNexus) {
      return res.status(404).json({ error: 'Target nexus not found' });
    }

    if (defenderNexus.ownerId && defenderNexus.ownerId === req.userId) {
      return res.status(400).json({ error: 'Cannot attack your own nexus' });
    }

    if (defenderNexus.ownerId) {
      return res.status(400).json({ error: 'Cannot attack conquered nexuses' });
    }

    // Check troop availability
    for (const [troopType, amount] of Object.entries(troops)) {
      if ((attackerNexus[troopType] || 0) < amount) {
        return res.status(400).json({ error: `Insufficient ${troopType}` });
      }
    }

    // Deduct troops and population from attacker nexus
    let totalTroopsSent = 0;
    const troopDeductions = {};
    for (const [troopType, amount] of Object.entries(troops)) {
      troopDeductions[troopType] = (attackerNexus[troopType] || 0) - amount;
      totalTroopsSent += amount;
    }

    const distance = Math.sqrt(
      Math.pow(defenderNexus.x - attackerNexus.x, 2) + Math.pow(defenderNexus.y - attackerNexus.y, 2),
    );
    const travelTimeMinutes = distance * 5;
    const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

    const [attack] = await prisma.$transaction([
      prisma.attack.create({
        data: {
          attackerUserId: req.userId,
          attackerNexusId: parseInt(fromNexusId),
          defenderUserId: defenderNexus.ownerId ?? null,
          defenderNexusId: parseInt(toNexusId),
          troops,
          arrivesAt,
          type,
        },
      }),
      prisma.nexus.update({
        where: { id: attackerNexus.id },
        data: {
          ...troopDeductions,
          populationCurrent: Math.max(0, attackerNexus.populationCurrent - totalTroopsSent),
        },
      }),
    ]);

    res.json({ success: true, attack: serializeAttack(attack) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get incoming attacks
router.get('/incoming/:nexusId', auth, async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await prisma.attack.findMany({
      where: { defenderNexusId: nexus.id, status: 'traveling' },
      include: {
        attackerNexus: { select: { id: true, name: true, x: true, y: true } },
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
router.get('/outgoing/:nexusId', auth, async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await prisma.attack.findMany({
      where: { attackerNexusId: nexus.id, status: 'traveling' },
      include: {
        defenderNexus: { select: { id: true, name: true, x: true, y: true } },
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
