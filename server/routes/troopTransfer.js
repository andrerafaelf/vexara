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

function serializeTransfer(t) {
  return {
    _id: String(t.id),
    ownerNexusId: String(t.ownerNexusId),
    hostNexusId: String(t.hostNexusId),
    troops: t.troops,
    createdAt: t.createdAt,
    ownerNexus: t.ownerNexus ? { _id: String(t.ownerNexus.id), name: t.ownerNexus.name } : undefined,
    hostNexus:  t.hostNexus  ? { _id: String(t.hostNexus.id),  name: t.hostNexus.name  } : undefined,
  };
}

// Send troops from one own nexus to another own nexus
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

    // Deduct from sender, create transfer record
    const deductData = {};
    for (const field of TROOP_FIELDS) {
      if (sending[field] > 0) deductData[field] = (from[field] ?? 0) - sending[field];
    }

    const [updatedFrom, transfer] = await prisma.$transaction([
      prisma.nexus.update({ where: { id: from.id }, data: deductData }),
      prisma.troopTransfer.create({
        data: { ownerNexusId: from.id, hostNexusId: to.id, troops: sending },
        include: { ownerNexus: { select: { id: true, name: true } }, hostNexus: { select: { id: true, name: true } } },
      }),
    ]);

    res.json({ from: serializeNexus(updatedFrom), transfer: serializeTransfer(transfer) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recall troops (owner calls this) — returns troops to owner nexus
router.post('/:transferId/recall', auth, async (req, res) => {
  try {
    const transfer = await prisma.troopTransfer.findUnique({
      where: { id: parseInt(req.params.transferId) },
      include: { ownerNexus: true },
    });

    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.ownerNexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const troops = transfer.troops;
    const returnData = {};
    for (const field of TROOP_FIELDS) {
      if (troops[field] > 0) returnData[field] = (transfer.ownerNexus[field] ?? 0) + troops[field];
    }

    const [updatedOwner] = await prisma.$transaction([
      prisma.nexus.update({ where: { id: transfer.ownerNexusId }, data: returnData }),
      prisma.troopTransfer.delete({ where: { id: transfer.id } }),
    ]);

    res.json({ nexus: serializeNexus(updatedOwner) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send back troops (host calls this) — returns troops to owner nexus
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

    const troops = transfer.troops;
    const returnData = {};
    for (const field of TROOP_FIELDS) {
      if (troops[field] > 0) returnData[field] = (transfer.ownerNexus[field] ?? 0) + troops[field];
    }

    const [updatedOwner] = await prisma.$transaction([
      prisma.nexus.update({ where: { id: transfer.ownerNexusId }, data: returnData }),
      prisma.troopTransfer.delete({ where: { id: transfer.id } }),
    ]);

    res.json({ nexus: serializeNexus(updatedOwner) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all transfers for a nexus (both sent and hosted)
router.get('/nexus/:nexusId', auth, async (req, res) => {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!nexus || nexus.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const transfers = await prisma.troopTransfer.findMany({
      where: { OR: [{ ownerNexusId: nexusId }, { hostNexusId: nexusId }] },
      include: {
        ownerNexus: { select: { id: true, name: true } },
        hostNexus:  { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transfers.map(serializeTransfer));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
