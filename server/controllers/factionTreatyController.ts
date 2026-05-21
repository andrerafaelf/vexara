import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from '../services/warRoomSocket.js';

const TREATY_LABELS: Record<string, string> = {
  nap: 'Non-Aggression Pact',
  trade: 'Trade Agreement',
  vassal: 'Vassalage',
};

async function notifyDiplomacyLeaders(
  factionId: number,
  galaxyId: number,
  title: string,
  body: string,
  tag: string,
) {
  const leaders = await prisma.factionMember.findMany({
    where: { factionId, galaxyId, role: { in: ['leader', 'officer'] } },
    select: { userId: true },
  });
  for (const l of leaders) {
    void sendPushToUser(l.userId, NOTIF.FACTION_DIPLOMACY, {
      title,
      body,
      tag,
      data: { url: '/factions' },
    });
    notifyBadgeUpdate(l.userId);
  }
}

const VALID_TREATY_TYPES = ['nap', 'trade', 'vassal'] as const;
type TreatyType = (typeof VALID_TREATY_TYPES)[number];

const MAX_DURATION_DAYS = 90;
const MIN_DURATION_DAYS = 1;

async function getUserFaction(userId: number, galaxyId: number) {
  const member = await prisma.factionMember.findFirst({
    where: { userId, galaxyId },
    include: { faction: true },
  });
  return member;
}

// ---- proposeTreaty ----
export async function proposeTreaty(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.factionId);
    const { targetFactionId, type, durationDays } = req.body as {
      targetFactionId?: unknown; type?: string; durationDays?: unknown;
    };

    if (!targetFactionId || isNaN(Number(targetFactionId))) { res.status(400).json({ error: 'Invalid targetFactionId' }); return; }
    if (!type || !(VALID_TREATY_TYPES as readonly string[]).includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_TREATY_TYPES.join(', ')}` }); return;
    }

    const parsedTarget = Number(targetFactionId);
    if (parsedTarget === factionId) { res.status(400).json({ error: 'Cannot propose a treaty with yourself' }); return; }

    const member = await getUserFaction(req.userId, req.galaxyId);
    if (!member || member.factionId !== factionId) { res.status(403).json({ error: 'You are not a member of this faction' }); return; }
    if (member.role !== 'leader' && member.role !== 'officer') { res.status(403).json({ error: 'Only faction leaders and officers can propose treaties' }); return; }

    const targetFaction = await prisma.faction.findFirst({ where: { id: parsedTarget, galaxyId: req.galaxyId } });
    if (!targetFaction) { res.status(404).json({ error: 'Target faction not found' }); return; }

    const existingActive = await prisma.factionTreaty.findFirst({
      where: {
        galaxyId: req.galaxyId,
        type: type as TreatyType,
        status: { in: ['pending', 'active'] },
        OR: [
          { proposerFactionId: factionId, targetFactionId: parsedTarget },
          { proposerFactionId: parsedTarget, targetFactionId: factionId },
        ],
      },
    });
    if (existingActive) { res.status(409).json({ error: 'A treaty of this type is already pending or active between these factions' }); return; }

    let durDays: number | null = null;
    if (durationDays != null) {
      durDays = Math.floor(Number(durationDays));
      if (isNaN(durDays) || durDays < MIN_DURATION_DAYS || durDays > MAX_DURATION_DAYS) {
        res.status(400).json({ error: `durationDays must be between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS}` }); return;
      }
    }

    const treaty = await prisma.factionTreaty.create({
      data: {
        galaxyId: req.galaxyId,
        type: type as TreatyType,
        status: 'pending',
        proposerFactionId: factionId,
        targetFactionId: parsedTarget,
        proposedByUserId: req.userId,
        durationDays: durDays,
      },
    });

    void notifyDiplomacyLeaders(
      parsedTarget,
      req.galaxyId,
      'Treaty proposed',
      `[${member.faction.tag}] ${member.faction.name} proposed a ${TREATY_LABELS[type] ?? type}. Awaiting your response.`,
      `treaty-proposed-${treaty.id}`,
    );

    res.json(treaty);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTreatyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- acceptTreaty ----
export async function acceptTreaty(req: AuthRequest, res: Response): Promise<void> {
  try {
    const treatyId = parseInt(req.params.treatyId);

    const treaty = await prisma.factionTreaty.findFirst({ where: { id: treatyId, galaxyId: req.galaxyId } });
    if (!treaty) { res.status(404).json({ error: 'Treaty not found' }); return; }
    if (treaty.status !== 'pending') { res.status(400).json({ error: 'Treaty is not pending' }); return; }

    const member = await getUserFaction(req.userId, req.galaxyId);
    if (!member || member.factionId !== treaty.targetFactionId) {
      res.status(403).json({ error: 'Only the target faction can accept this treaty' }); return;
    }
    if (member.role !== 'leader' && member.role !== 'officer') {
      res.status(403).json({ error: 'Only faction leaders and officers can accept treaties' }); return;
    }

    const now = new Date();
    const expiresAt = treaty.durationDays ? new Date(now.getTime() + treaty.durationDays * 86400000) : null;

    const updated = await prisma.factionTreaty.update({
      where: { id: treatyId },
      data: {
        status: 'active',
        acceptedByUserId: req.userId,
        startsAt: now,
        expiresAt,
        updatedAt: now,
      },
    });

    void notifyDiplomacyLeaders(
      treaty.proposerFactionId,
      req.galaxyId,
      'Treaty accepted',
      `[${member.faction.tag}] ${member.faction.name} accepted your ${TREATY_LABELS[treaty.type] ?? treaty.type}.`,
      `treaty-accepted-${treaty.id}`,
    );

    res.json(updated);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTreatyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- cancelTreaty ----
export async function cancelTreaty(req: AuthRequest, res: Response): Promise<void> {
  try {
    const treatyId = parseInt(req.params.treatyId);

    const treaty = await prisma.factionTreaty.findFirst({ where: { id: treatyId, galaxyId: req.galaxyId } });
    if (!treaty) { res.status(404).json({ error: 'Treaty not found' }); return; }
    if (treaty.status !== 'pending' && treaty.status !== 'active') {
      res.status(400).json({ error: 'Treaty cannot be cancelled' }); return;
    }

    const member = await getUserFaction(req.userId, req.galaxyId);
    if (!member || (member.factionId !== treaty.proposerFactionId && member.factionId !== treaty.targetFactionId)) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    if (member.role !== 'leader' && member.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can cancel treaties' }); return;
    }

    const updated = await prisma.factionTreaty.update({
      where: { id: treatyId },
      data: { status: 'cancelled', updatedAt: new Date() },
    });

    res.json(updated);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTreatyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- getActiveTreaties ----
export async function getActiveTreaties(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.factionId);

    const faction = await prisma.faction.findFirst({ where: { id: factionId, galaxyId: req.galaxyId } });
    if (!faction) { res.status(404).json({ error: 'Faction not found' }); return; }

    // Auto-expire overdue treaties
    await prisma.factionTreaty.updateMany({
      where: {
        galaxyId: req.galaxyId,
        status: 'active',
        expiresAt: { not: null, lte: new Date() },
      },
      data: { status: 'expired', updatedAt: new Date() },
    });

    const treaties = await prisma.factionTreaty.findMany({
      where: {
        galaxyId: req.galaxyId,
        status: { in: ['pending', 'active'] },
        OR: [{ proposerFactionId: factionId }, { targetFactionId: factionId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with faction names
    const factionIds = new Set<number>();
    treaties.forEach((t) => { factionIds.add(t.proposerFactionId); factionIds.add(t.targetFactionId); });
    const factions = await prisma.faction.findMany({
      where: { id: { in: Array.from(factionIds) } },
      select: { id: true, name: true, tag: true },
    });
    const factionMap = new Map(factions.map((f) => [f.id, f]));

    const enriched = treaties.map((t) => ({
      ...t,
      proposerFaction: factionMap.get(t.proposerFactionId),
      targetFaction: factionMap.get(t.targetFactionId),
    }));

    res.json(enriched);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTreatyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- getGalaxyDiplomacy ----
// Public board: all active treaties in the galaxy
export async function getGalaxyDiplomacy(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.factionTreaty.updateMany({
      where: {
        galaxyId: req.galaxyId,
        status: 'active',
        expiresAt: { not: null, lte: new Date() },
      },
      data: { status: 'expired', updatedAt: new Date() },
    });

    const treaties = await prisma.factionTreaty.findMany({
      where: { galaxyId: req.galaxyId, status: { in: ['pending', 'active'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const factionIds = new Set<number>();
    treaties.forEach((t) => { factionIds.add(t.proposerFactionId); factionIds.add(t.targetFactionId); });
    const factions = await prisma.faction.findMany({
      where: { id: { in: Array.from(factionIds) } },
      select: { id: true, name: true, tag: true },
    });
    const factionMap = new Map(factions.map((f) => [f.id, f]));

    const enriched = treaties.map((t) => ({
      ...t,
      proposerFaction: factionMap.get(t.proposerFactionId),
      targetFaction: factionMap.get(t.targetFactionId),
    }));

    res.json(enriched);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'factionTreatyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
