import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { notifyFactionUpdated } from '../services/warRoomSocket.js';

const NOTE_MAX = 128;

async function getCallerFaction(userId: number, galaxyId: number): Promise<{ factionId: number; role: string } | null> {
  const member = await prisma.factionMember.findUnique({
    where: { userId_galaxyId: { userId, galaxyId } },
    select: { factionId: true, role: true },
  });
  return member ?? null;
}

export async function markTarget(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parseInt(req.params.nexusId);
    if (isNaN(nexusId)) { res.status(400).json({ error: 'Invalid nexus id' }); return; }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { activeGalaxyId: true } });
    if (!user?.activeGalaxyId) { res.status(409).json({ error: 'No active galaxy' }); return; }

    const membership = await getCallerFaction(req.userId, user.activeGalaxyId);
    if (!membership) { res.status(403).json({ error: 'You are not in a faction' }); return; }

    const nexus = await prisma.nexus.findFirst({
      where: { id: nexusId, galaxyId: user.activeGalaxyId },
      select: { id: true, ownerId: true },
    });
    if (!nexus) { res.status(404).json({ error: 'Nexus not found' }); return; }
    if (nexus.ownerId === req.userId) { res.status(400).json({ error: 'Cannot mark your own nexus' }); return; }

    const rawNote = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
    const note = rawNote && rawNote.length > 0 ? rawNote.slice(0, NOTE_MAX) : null;

    const target = await prisma.factionTarget.upsert({
      where: { factionId_nexusId: { factionId: membership.factionId, nexusId } },
      create: { factionId: membership.factionId, galaxyId: user.activeGalaxyId, nexusId, markedById: req.userId, note },
      update: { markedById: req.userId, note },
    });

    notifyFactionUpdated(membership.factionId);
    res.json({ target: { id: target.id, nexusId, note: target.note } });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTargetController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function unmarkTarget(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parseInt(req.params.nexusId);
    if (isNaN(nexusId)) { res.status(400).json({ error: 'Invalid nexus id' }); return; }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { activeGalaxyId: true } });
    if (!user?.activeGalaxyId) { res.status(409).json({ error: 'No active galaxy' }); return; }

    const membership = await getCallerFaction(req.userId, user.activeGalaxyId);
    if (!membership) { res.status(403).json({ error: 'You are not in a faction' }); return; }

    await prisma.factionTarget.deleteMany({
      where: { factionId: membership.factionId, nexusId },
    });

    notifyFactionUpdated(membership.factionId);
    res.json({ ok: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTargetController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listTargets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { activeGalaxyId: true } });
    if (!user?.activeGalaxyId) { res.json([]); return; }

    const membership = await getCallerFaction(req.userId, user.activeGalaxyId);
    if (!membership) { res.json([]); return; }

    const targets = await prisma.factionTarget.findMany({
      where: { factionId: membership.factionId, galaxyId: user.activeGalaxyId },
      select: { id: true, nexusId: true, note: true, createdAt: true, markedById: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(targets);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTargetController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
