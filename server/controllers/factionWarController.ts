import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';

async function getMembership(userId: number, galaxyId: number) {
  return prisma.factionMember.findUnique({
    where: { userId_galaxyId: { userId, galaxyId } },
    select: { factionId: true, role: true },
  });
}

function canManageWars(role: string) {
  return role === 'leader' || role === 'officer';
}

export async function declareWar(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetFactionId = parseInt(req.params.targetFactionId);
    if (!targetFactionId) { res.status(400).json({ error: 'Invalid target faction' }); return; }

    const membership = await getMembership(req.userId!, req.galaxyId!);
    if (!membership) { res.status(403).json({ error: 'Not in a faction' }); return; }
    if (!canManageWars(membership.role)) { res.status(403).json({ error: 'Only leaders and officers can declare war' }); return; }
    if (membership.factionId === targetFactionId) { res.status(400).json({ error: 'Cannot declare war on your own faction' }); return; }

    const targetFaction = await prisma.faction.findFirst({ where: { id: targetFactionId, galaxyId: req.galaxyId! } });
    if (!targetFaction) { res.status(404).json({ error: 'Target faction not found' }); return; }

    const existing = await prisma.factionWar.findFirst({
      where: {
        galaxyId: req.galaxyId!,
        status: { in: ['pending', 'active', 'ceasefire_pending'] },
        OR: [
          { declarerFactionId: membership.factionId, targetFactionId },
          { declarerFactionId: targetFactionId, targetFactionId: membership.factionId },
        ],
      },
    });
    if (existing) { res.status(400).json({ error: 'A war or war declaration already exists between these factions' }); return; }

    const war = await prisma.factionWar.create({
      data: {
        galaxyId: req.galaxyId!,
        declarerFactionId: membership.factionId,
        targetFactionId,
        status: 'pending',
      },
      include: { declarerFaction: { select: { name: true, tag: true } }, targetFaction: { select: { name: true, tag: true } } },
    });

    await prisma.factionEvent.createMany({
      data: [
        { factionId: membership.factionId, type: 'war_declared', targetName: targetFaction.name, meta: String(war.id) },
        { factionId: targetFactionId, type: 'war_declared_received', targetName: null, actorName: war.declarerFaction.name, meta: String(war.id) },
      ],
    });

    res.json({ war: serializeWar(war) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function acceptWar(req: AuthRequest, res: Response): Promise<void> {
  try {
    const warId = parseInt(req.params.warId);
    const membership = await getMembership(req.userId!, req.galaxyId!);
    if (!membership) { res.status(403).json({ error: 'Not in a faction' }); return; }
    if (!canManageWars(membership.role)) { res.status(403).json({ error: 'Only leaders and officers can accept war declarations' }); return; }

    const war = await prisma.factionWar.findFirst({
      where: { id: warId, galaxyId: req.galaxyId!, targetFactionId: membership.factionId, status: 'pending' },
      include: { declarerFaction: { select: { name: true } }, targetFaction: { select: { name: true } } },
    });
    if (!war) { res.status(404).json({ error: 'War declaration not found' }); return; }

    const updated = await prisma.factionWar.update({
      where: { id: warId },
      data: { status: 'active', acceptedAt: new Date() },
      include: { declarerFaction: { select: { name: true, tag: true } }, targetFaction: { select: { name: true, tag: true } } },
    });

    await prisma.factionEvent.createMany({
      data: [
        { factionId: war.declarerFactionId, type: 'war_accepted', targetName: war.targetFaction.name, meta: String(warId) },
        { factionId: membership.factionId, type: 'war_accepted', targetName: war.declarerFaction.name, meta: String(warId) },
      ],
    });

    res.json({ war: serializeWar(updated) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function declineWar(req: AuthRequest, res: Response): Promise<void> {
  try {
    const warId = parseInt(req.params.warId);
    const membership = await getMembership(req.userId!, req.galaxyId!);
    if (!membership) { res.status(403).json({ error: 'Not in a faction' }); return; }
    if (!canManageWars(membership.role)) { res.status(403).json({ error: 'Only leaders and officers can decline war declarations' }); return; }

    const war = await prisma.factionWar.findFirst({
      where: { id: warId, galaxyId: req.galaxyId!, targetFactionId: membership.factionId, status: 'pending' },
    });
    if (!war) { res.status(404).json({ error: 'War declaration not found' }); return; }

    await prisma.factionWar.delete({ where: { id: warId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function proposeCeasefire(req: AuthRequest, res: Response): Promise<void> {
  try {
    const warId = parseInt(req.params.warId);
    const membership = await getMembership(req.userId!, req.galaxyId!);
    if (!membership) { res.status(403).json({ error: 'Not in a faction' }); return; }
    if (!canManageWars(membership.role)) { res.status(403).json({ error: 'Only leaders and officers can propose a ceasefire' }); return; }

    const war = await prisma.factionWar.findFirst({
      where: {
        id: warId,
        galaxyId: req.galaxyId!,
        status: 'active',
        OR: [{ declarerFactionId: membership.factionId }, { targetFactionId: membership.factionId }],
      },
      include: { declarerFaction: { select: { name: true } }, targetFaction: { select: { name: true } } },
    });
    if (!war) { res.status(404).json({ error: 'Active war not found' }); return; }

    const updated = await prisma.factionWar.update({
      where: { id: warId },
      data: { status: 'ceasefire_pending', ceasefireProposerFactionId: membership.factionId },
      include: { declarerFaction: { select: { name: true, tag: true } }, targetFaction: { select: { name: true, tag: true } } },
    });

    const otherFactionId = war.declarerFactionId === membership.factionId ? war.targetFactionId : war.declarerFactionId;
    const myName = war.declarerFactionId === membership.factionId ? war.declarerFaction.name : war.targetFaction.name;
    const otherName = war.declarerFactionId === membership.factionId ? war.targetFaction.name : war.declarerFaction.name;

    await prisma.factionEvent.createMany({
      data: [
        { factionId: membership.factionId, type: 'ceasefire_proposed', targetName: otherName, meta: String(warId) },
        { factionId: otherFactionId, type: 'ceasefire_received', actorName: myName, meta: String(warId) },
      ],
    });

    res.json({ war: serializeWar(updated) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function acceptCeasefire(req: AuthRequest, res: Response): Promise<void> {
  try {
    const warId = parseInt(req.params.warId);
    const membership = await getMembership(req.userId!, req.galaxyId!);
    if (!membership) { res.status(403).json({ error: 'Not in a faction' }); return; }
    if (!canManageWars(membership.role)) { res.status(403).json({ error: 'Only leaders and officers can accept a ceasefire' }); return; }

    const war = await prisma.factionWar.findFirst({
      where: {
        id: warId,
        galaxyId: req.galaxyId!,
        status: 'ceasefire_pending',
        OR: [{ declarerFactionId: membership.factionId }, { targetFactionId: membership.factionId }],
      },
      include: { declarerFaction: { select: { name: true } }, targetFaction: { select: { name: true } } },
    });
    if (!war) { res.status(404).json({ error: 'Pending ceasefire not found' }); return; }
    if (war.ceasefireProposerFactionId === membership.factionId) {
      res.status(400).json({ error: 'You proposed this ceasefire. Wait for the other faction to respond' }); return;
    }

    const updated = await prisma.factionWar.update({
      where: { id: warId },
      data: { status: 'ended', endedAt: new Date(), ceasefireProposerFactionId: null },
      include: { declarerFaction: { select: { name: true, tag: true } }, targetFaction: { select: { name: true, tag: true } } },
    });

    const otherFactionId = war.declarerFactionId === membership.factionId ? war.targetFactionId : war.declarerFactionId;
    const myName = war.declarerFactionId === membership.factionId ? war.declarerFaction.name : war.targetFaction.name;
    const otherName = war.declarerFactionId === membership.factionId ? war.targetFaction.name : war.declarerFaction.name;

    await prisma.factionEvent.createMany({
      data: [
        { factionId: membership.factionId, type: 'war_ended', targetName: otherName, meta: String(warId) },
        { factionId: otherFactionId, type: 'war_ended', actorName: myName, meta: String(warId) },
      ],
    });

    res.json({ war: serializeWar(updated) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function declineCeasefire(req: AuthRequest, res: Response): Promise<void> {
  try {
    const warId = parseInt(req.params.warId);
    const membership = await getMembership(req.userId!, req.galaxyId!);
    if (!membership) { res.status(403).json({ error: 'Not in a faction' }); return; }
    if (!canManageWars(membership.role)) { res.status(403).json({ error: 'Only leaders and officers can decline a ceasefire' }); return; }

    const war = await prisma.factionWar.findFirst({
      where: {
        id: warId,
        galaxyId: req.galaxyId!,
        status: 'ceasefire_pending',
        OR: [{ declarerFactionId: membership.factionId }, { targetFactionId: membership.factionId }],
      },
      include: { declarerFaction: { select: { name: true } }, targetFaction: { select: { name: true } } },
    });
    if (!war) { res.status(404).json({ error: 'Pending ceasefire not found' }); return; }
    if (war.ceasefireProposerFactionId === membership.factionId) {
      res.status(400).json({ error: 'You proposed this ceasefire. Wait for the other faction to respond' }); return;
    }

    const updated = await prisma.factionWar.update({
      where: { id: warId },
      data: { status: 'active', ceasefireProposerFactionId: null },
      include: { declarerFaction: { select: { name: true, tag: true } }, targetFaction: { select: { name: true, tag: true } } },
    });

    const otherFactionId = war.declarerFactionId === membership.factionId ? war.targetFactionId : war.declarerFactionId;
    const myName = war.declarerFactionId === membership.factionId ? war.declarerFaction.name : war.targetFaction.name;
    const otherName = war.declarerFactionId === membership.factionId ? war.targetFaction.name : war.declarerFaction.name;

    await prisma.factionEvent.createMany({
      data: [
        { factionId: membership.factionId, type: 'ceasefire_declined', targetName: otherName, meta: String(warId) },
        { factionId: otherFactionId, type: 'ceasefire_declined', actorName: myName, meta: String(warId) },
      ],
    });

    res.json({ war: serializeWar(updated) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getWars(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.factionId);
    const wars = await prisma.factionWar.findMany({
      where: {
        galaxyId: req.galaxyId!,
        OR: [{ declarerFactionId: factionId }, { targetFactionId: factionId }],
        status: { in: ['pending', 'active', 'ceasefire_pending'] },
      },
      include: { declarerFaction: { select: { name: true, tag: true } }, targetFaction: { select: { name: true, tag: true } } },
      orderBy: { declaredAt: 'desc' },
    });
    res.json(wars.map(serializeWar));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

function serializeWar(war: any) {
  return {
    id: war.id,
    status: war.status,
    declarerFactionId: war.declarerFactionId,
    targetFactionId: war.targetFactionId,
    declarerFaction: war.declarerFaction,
    targetFaction: war.targetFaction,
    declaredAt: war.declaredAt,
    acceptedAt: war.acceptedAt,
    endedAt: war.endedAt,
    ceasefireProposerFactionId: war.ceasefireProposerFactionId,
  };
}
