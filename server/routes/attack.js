import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { applyQuestRewards, serializeAttack } from '../models/Nexus.js';
import { normalizeTroopPayload, parsePositiveInt } from '../utils/validation.js';
import { TROOP_STATS } from '../utils/combatMath.js';

const router = express.Router();

const TROOP_KEYS = [
  'lancerDrone',
  'assaultTrooper',
  'breakerUnit',
  'reconOperative',
  'skimmerBike',
  'siegeMech',
  'bulwarkGuard',
  'suppressorTeam',
  'disruptorUnit',
  'interceptorBike',
  'annihilatorPlatform',
  'overseer',
];

const SUPPORTED_ATTACK_TYPES = new Set(['attack', 'scout']);

// Send attack
router.post('/send', auth, async (req, res) => {
  try {
    const { fromNexusId, toNexusId, troops, type = 'attack' } = req.body;
    const parsedFromNexusId = parsePositiveInt(fromNexusId);
    const parsedToNexusId = parsePositiveInt(toNexusId);

    if (!parsedFromNexusId || !parsedToNexusId) {
      return res.status(400).json({ error: 'Invalid nexus IDs' });
    }

    if (!SUPPORTED_ATTACK_TYPES.has(type)) {
      return res.status(400).json({ error: 'Unsupported mission type' });
    }

    const normalizedPayload = normalizeTroopPayload(troops, TROOP_KEYS);
    if (normalizedPayload.error) {
      return res.status(400).json({ error: normalizedPayload.error });
    }

    const normalizedTroops = normalizedPayload.normalized;

    const [attackerNexus, defenderNexus] = await Promise.all([
      prisma.nexus.findUnique({ where: { id: parsedFromNexusId } }),
      prisma.nexus.findUnique({ where: { id: parsedToNexusId } }),
    ]);

    if (!attackerNexus || attackerNexus.ownerId !== req.userId || attackerNexus.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!defenderNexus) {
      return res.status(404).json({ error: 'Target nexus not found' });
    }

    if (defenderNexus.galaxyId !== req.galaxyId) {
      return res.status(400).json({ error: 'Cannot attack a nexus in a different galaxy' });
    }

    if (defenderNexus.ownerId && defenderNexus.ownerId === req.userId) {
      return res.status(400).json({ error: 'Cannot attack your own nexus' });
    }

    if (defenderNexus.newbieProtectionEndsAt && new Date(defenderNexus.newbieProtectionEndsAt) > new Date()) {
      return res.status(403).json({ error: 'This nexus is under newbie protection and cannot be attacked yet', protectedUntil: defenderNexus.newbieProtectionEndsAt });
    }

    const totalTroopsRequested = Object.values(normalizedTroops).reduce((sum, amount) => sum + amount, 0);
    if (totalTroopsRequested <= 0) {
      return res.status(400).json({ error: 'Select at least one troop' });
    }

    const isScoutMission = type === 'scout';
    if (isScoutMission) {
      const reconOperatives = normalizedTroops.reconOperative || 0;
      const nonScoutTroops = TROOP_KEYS.filter((troopType) => troopType !== 'reconOperative').some(
        (troopType) => normalizedTroops[troopType] > 0,
      );

      if (reconOperatives <= 0 || nonScoutTroops) {
        return res.status(400).json({ error: 'Scout missions require Recon Operatives only' });
      }
    }

    if ((normalizedTroops.overseer || 0) > 1) {
      return res.status(400).json({ error: 'Maximum 1 Overseer per strike' });
    }

    // Check troop availability
    for (const [troopType, amount] of Object.entries(normalizedTroops)) {
      if ((attackerNexus[troopType] || 0) < amount) {
        return res.status(400).json({ error: `Insufficient ${troopType}` });
      }
    }

    // Deduct troops and population from attacker nexus
    let totalTroopsSent = 0;
    const troopDeductions = {};
    for (const [troopType, amount] of Object.entries(normalizedTroops)) {
      troopDeductions[troopType] = (attackerNexus[troopType] || 0) - amount;
      totalTroopsSent += amount;
    }

    const distance = Math.sqrt(
      Math.pow(defenderNexus.x - attackerNexus.x, 2) + Math.pow(defenderNexus.y - attackerNexus.y, 2),
    );

    // Travel time scales with the slowest troop in the group.
    // Overseer is treated as speed 6 (slower than any combat unit) since it's a command unit.
    // Multiplier range: interceptorBike (28) → ×4.0 min/dist, overseer (6) → ×6.2 min/dist.
    let travelTimeMinutes;
    if (isScoutMission) {
      travelTimeMinutes = distance * 4;
    } else {
      const OVERSEER_EFFECTIVE_SPEED = 6;
      let minSpeed = Infinity;
      for (const [troopType, amount] of Object.entries(normalizedTroops)) {
        if (amount > 0 && TROOP_STATS[troopType]) {
          const speed = troopType === 'overseer' ? OVERSEER_EFFECTIVE_SPEED : TROOP_STATS[troopType].speed;
          if (speed < minSpeed) minSpeed = speed;
        }
      }
      travelTimeMinutes = distance * (4 + (28 - minSpeed) / 10);
    }
    const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

    const [attack, updatedAttackerNexus] = await prisma.$transaction([
      prisma.attack.create({
        data: {
          galaxyId: req.galaxyId,
          attackerUserId: req.userId,
          attackerNexusId: parsedFromNexusId,
          defenderUserId: defenderNexus.ownerId ?? null,
          defenderNexusId: parsedToNexusId,
          troops: normalizedTroops,
          arrivesAt,
          type,
        },
      }),
      prisma.nexus.update({
        where: { id: attackerNexus.id },
        data: troopDeductions,
      }),
    ]);
    await applyQuestRewards(updatedAttackerNexus, { hasOutgoingStrike: true });

    res.json({ success: true, attack: serializeAttack(attack) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get incoming attacks
router.get('/incoming/:nexusId', auth, async (req, res) => {
  try {
    const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
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
        return serializeAttack({ ...a, attackerUsername: attackerUser?.username });
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
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await prisma.attack.findMany({
      where: { attackerNexusId: nexus.id, status: { in: ['traveling', 'returning'] } },
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
        return serializeAttack({ ...a, defenderUsername: defenderUser?.username });
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
