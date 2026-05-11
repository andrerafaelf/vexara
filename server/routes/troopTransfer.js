import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { serializeNexus } from '../models/Nexus.js';

const router = express.Router();

const TROOP_FIELDS = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative',
  'skimmerBike', 'siegeMech', 'bulwarkGuard', 'suppressorTeam',
  'disruptorUnit', 'interceptorBike', 'annihilatorPlatform', 'overseer',
];

// Same speed as a regular attack
const TRAVEL_MINUTES_PER_UNIT = 5;

function calcArrivesAt(fromNexus, toNexus) {
  const distance = Math.sqrt(
    Math.pow(toNexus.x - fromNexus.x, 2) + Math.pow(toNexus.y - fromNexus.y, 2),
  );
  const travelMs = distance * TRAVEL_MINUTES_PER_UNIT * 60 * 1000;
  return new Date(Date.now() + travelMs);
}

function serializeTransfer(t) {
  return {
    _id: String(t.id),
    ownerNexusId: String(t.ownerNexusId),
    hostNexusId: String(t.hostNexusId),
    troops: t.troops,
    status: t.status,
    arrivesAt: t.arrivesAt ?? null,
    returnsAt: t.returnsAt ?? null,
    createdAt: t.createdAt,
    ownerNexus: t.ownerNexus ? { _id: String(t.ownerNexus.id), name: t.ownerNexus.name, x: t.ownerNexus.x, y: t.ownerNexus.y } : undefined,
    hostNexus:  t.hostNexus  ? { _id: String(t.hostNexus.id),  name: t.hostNexus.name,  x: t.hostNexus.x,  y: t.hostNexus.y  } : undefined,
  };
}

// Send troops — troops leave immediately, arrive after travel time
router.post('/send', auth, async (req, res) => {
  try {
    const { fromNexusId, toNexusId, troops } = req.body;

    if (!fromNexusId || !toNexusId || String(fromNexusId) === String(toNexusId)) {
      return res.status(400).json({ error: 'Invalid nexus selection' });
    }

    const [from, to] = await Promise.all([
      prisma.nexus.findUnique({ where: { id: parseInt(fromNexusId) } }),
      prisma.nexus.findUnique({ where: { id: parseInt(toNexusId) } }),
    ]);

    if (!from || !to) return res.status(404).json({ error: 'Nexus not found' });
    if (from.ownerId !== req.userId || to.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (from.galaxyId !== req.galaxyId || to.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Nexus is in a different galaxy' });
    }

    // Validate and clamp troop amounts
    const sending = {};
    let total = 0;
    for (const field of TROOP_FIELDS) {
      const requested = Math.max(0, Math.floor(Number(troops?.[field] ?? 0)));
      const available = from[field] ?? 0;
      const amount = Math.min(requested, available);
      sending[field] = amount;
      total += amount;
    }

    if (total === 0) return res.status(400).json({ error: 'No troops to send' });

    const arrivesAt = calcArrivesAt(from, to);

    // Deduct troops from sender immediately; they are in transit until arrivesAt
    const deductData = {};
    for (const field of TROOP_FIELDS) {
      if (sending[field] > 0) deductData[field] = (from[field] ?? 0) - sending[field];
    }

    const [updatedFrom, transfer] = await prisma.$transaction([
      prisma.nexus.update({ where: { id: from.id }, data: deductData }),
      prisma.troopTransfer.create({
        data: {
          galaxyId: req.galaxyId,
          ownerNexusId: from.id,
          hostNexusId: to.id,
          troops: sending,
          status: 'traveling',
          arrivesAt,
        },
        include: {
          ownerNexus: { select: { id: true, name: true, x: true, y: true } },
          hostNexus:  { select: { id: true, name: true, x: true, y: true } },
        },
      }),
    ]);

    res.json({ from: serializeNexus(updatedFrom), transfer: serializeTransfer(transfer) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recall troops (owner calls this)
// - If still traveling: cancel immediately and return troops to owner nexus
// - If stationed: start return trip (troops leave host, arrive at owner after travel time)
router.post('/:transferId/recall', auth, async (req, res) => {
  try {
    const transfer = await prisma.troopTransfer.findUnique({
      where: { id: parseInt(req.params.transferId) },
      include: {
        ownerNexus: true,
        hostNexus: true,
      },
    });

    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.ownerNexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (transfer.status === 'returning') {
      return res.status(400).json({ error: 'Troops are already returning' });
    }

    if (transfer.status === 'traveling') {
      // Troops are mid-flight: time already elapsed = distance already covered.
      // Return trip takes the same amount of time as they've been traveling.
      const now = Date.now();
      const totalMs = transfer.arrivesAt.getTime() - transfer.createdAt.getTime();
      const elapsedMs = Math.min(now - transfer.createdAt.getTime(), totalMs);
      const returnsAt = new Date(now + elapsedMs);

      const updated = await prisma.troopTransfer.update({
        where: { id: transfer.id },
        data: { status: 'returning', returnsAt, arrivesAt: null },
        include: {
          ownerNexus: { select: { id: true, name: true, x: true, y: true } },
          hostNexus:  { select: { id: true, name: true, x: true, y: true } },
        },
      });
      return res.json({ transfer: serializeTransfer(updated) });
    }

    // stationed — start return trip
    const returnsAt = calcArrivesAt(transfer.hostNexus, transfer.ownerNexus);
    const updated = await prisma.troopTransfer.update({
      where: { id: transfer.id },
      data: { status: 'returning', returnsAt, arrivesAt: null },
      include: {
        ownerNexus: { select: { id: true, name: true, x: true, y: true } },
        hostNexus:  { select: { id: true, name: true, x: true, y: true } },
      },
    });

    res.json({ transfer: serializeTransfer(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send back troops (host calls this) — starts return trip to owner
router.post('/:transferId/send-back', auth, async (req, res) => {
  try {
    const transfer = await prisma.troopTransfer.findUnique({
      where: { id: parseInt(req.params.transferId) },
      include: { ownerNexus: true, hostNexus: true },
    });

    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.hostNexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (transfer.status !== 'stationed') {
      return res.status(400).json({ error: 'Troops are not currently stationed here' });
    }

    const returnsAt = calcArrivesAt(transfer.hostNexus, transfer.ownerNexus);
    const updated = await prisma.troopTransfer.update({
      where: { id: transfer.id },
      data: { status: 'returning', returnsAt, arrivesAt: null },
      include: {
        ownerNexus: { select: { id: true, name: true, x: true, y: true } },
        hostNexus:  { select: { id: true, name: true, x: true, y: true } },
      },
    });

    res.json({ transfer: serializeTransfer(updated) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all transfers for a nexus (sent, hosted, or returning)
router.get('/nexus/:nexusId', auth, async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const transfers = await prisma.troopTransfer.findMany({
      where: {
        galaxyId: req.galaxyId,
        OR: [{ ownerNexusId: nexusId }, { hostNexusId: nexusId }],
      },
      include: {
        ownerNexus: { select: { id: true, name: true, x: true, y: true } },
        hostNexus:  { select: { id: true, name: true, x: true, y: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transfers.map(serializeTransfer));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
