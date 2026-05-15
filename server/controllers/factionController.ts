import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';

const FACTION_NAME_MIN = 3;
const FACTION_NAME_MAX = 32;
const FACTION_TAG_MIN = 2;
const FACTION_TAG_MAX = 6;
const FACTION_DESC_MAX = 256;
const INVITE_EXPIRY_HOURS = 48;

function validateFactionName(name?: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= FACTION_NAME_MIN && trimmed.length <= FACTION_NAME_MAX && /^[a-zA-Z0-9\s]+$/.test(trimmed);
}

function validateFactionTag(tag?: string): boolean {
  if (!tag || typeof tag !== 'string') return false;
  const trimmed = tag.trim();
  return trimmed.length >= FACTION_TAG_MIN && trimmed.length <= FACTION_TAG_MAX && /^[a-zA-Z0-9]+$/.test(trimmed);
}

export async function getMyFaction(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { activeGalaxyId: true },
    });
    if (!user?.activeGalaxyId) {
      res.json({ faction: null });
      return;
    }

    const member = await prisma.factionMember.findUnique({
      where: { userId_galaxyId: { userId: req.userId, galaxyId: user.activeGalaxyId } },
      select: {
        factionId: true,
        role: true,
        faction: {
          select: {
            id: true,
            name: true,
            tag: true,
            description: true,
            createdAt: true,
            members: {
              select: { id: true, userId: true, role: true, user: { select: { username: true } } },
            },
          },
        },
      },
    });

    if (!member) {
      res.json({ faction: null });
      return;
    }

    res.json({
      faction: {
        ...member.faction,
        myRole: member.role,
        members: member.faction.members.map((m: any) => ({
          id: m.id,
          userId: m.userId,
          username: m.user.username,
          role: m.role,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getFaction(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.id, 10);
    if (!Number.isFinite(factionId)) {
      res.status(400).json({ error: 'Invalid faction id' });
      return;
    }

    const faction = await prisma.faction.findUnique({
      where: { id: factionId },
      select: {
        id: true,
        name: true,
        tag: true,
        description: true,
        createdAt: true,
        galaxyId: true,
        members: {
          select: { id: true, userId: true, role: true, user: { select: { username: true } } },
        },
      },
    });

    if (!faction) {
      res.status(404).json({ error: 'Faction not found' });
      return;
    }

    res.json({
      ...faction,
      members: faction.members.map((m: any) => ({ id: m.id, userId: m.userId, username: m.user.username, role: m.role })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function listFactionsInGalaxy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { activeGalaxyId: true },
    });
    if (!user?.activeGalaxyId) {
      res.status(409).json({ error: 'No active galaxy' });
      return;
    }

    const factions = await prisma.faction.findMany({
      where: { galaxyId: user.activeGalaxyId },
      select: {
        id: true,
        name: true,
        tag: true,
        description: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(factions.map((f: any) => ({ ...f, memberCount: f._count.members })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function createFaction(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, tag, description } = req.body as { name?: string; tag?: string; description?: string };

    if (!validateFactionName(name)) {
      res.status(400).json({ error: `Faction name must be ${FACTION_NAME_MIN}-${FACTION_NAME_MAX} characters, alphanumeric + spaces only` });
      return;
    }
    if (!validateFactionTag(tag)) {
      res.status(400).json({ error: `Faction tag must be ${FACTION_TAG_MIN}-${FACTION_TAG_MAX} characters, alphanumeric only` });
      return;
    }
    if (description && typeof description === 'string' && description.length > FACTION_DESC_MAX) {
      res.status(400).json({ error: `Faction description must be ${FACTION_DESC_MAX} characters or less` });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { activeGalaxyId: true },
    });
    if (!user?.activeGalaxyId) {
      res.status(409).json({ error: 'No active galaxy' });
      return;
    }

    const existing = await prisma.factionMember.findUnique({
      where: { userId_galaxyId: { userId: req.userId, galaxyId: user.activeGalaxyId } },
    });
    if (existing) {
      res.status(400).json({ error: 'You are already in a faction' });
      return;
    }

    const faction = await prisma.faction.create({
      data: {
        galaxyId: user.activeGalaxyId,
        name: name!.trim(),
        tag: tag!.trim().toUpperCase(),
        description: description?.trim() || null,
        members: {
          create: {
            userId: req.userId,
            galaxyId: user.activeGalaxyId,
            role: 'leader',
          },
        },
      },
      select: { id: true, name: true, tag: true, description: true, createdAt: true },
    });

    res.status(201).json(faction);
  } catch (error) {
    const err = error as any;
    if (err?.code === 'P2002') {
      const field = err.meta?.target?.[2] === 'tag' ? 'tag' : 'name';
      res.status(400).json({ error: `A faction with that ${field} already exists in this galaxy` });
      return;
    }
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function inviteToFaction(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.id, 10);
    const { username } = req.body as { username?: string };

    if (!Number.isFinite(factionId)) {
      res.status(400).json({ error: 'Invalid faction id' });
      return;
    }
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username required' });
      return;
    }

    const faction = await prisma.faction.findUnique({
      where: { id: factionId },
      select: { galaxyId: true, members: { select: { userId: true, role: true } } },
    });
    if (!faction) {
      res.status(404).json({ error: 'Faction not found' });
      return;
    }

    const member = faction.members.find((m: any) => m.userId === req.userId);
    if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
      res.status(403).json({ error: 'Only leader and officers can invite' });
      return;
    }

    const invitedUser = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: { id: true },
    });
    if (!invitedUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const existing = await prisma.factionMember.findUnique({
      where: { userId_galaxyId: { userId: invitedUser.id, galaxyId: faction.galaxyId } },
    });
    if (existing) {
      res.status(400).json({ error: 'User is already in a faction in this galaxy' });
      return;
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITE_EXPIRY_HOURS);

    const invite = await prisma.factionInvite.create({
      data: {
        factionId,
        invitedUserId: invitedUser.id,
        invitedByUserId: req.userId,
        galaxyId: faction.galaxyId,
        expiresAt,
      },
    });

    res.status(201).json({ id: invite.id, expiresAt: invite.expiresAt });
  } catch (error) {
    const err = error as any;
    if (err?.code === 'P2002') {
      res.status(400).json({ error: 'Invite already pending for this user' });
      return;
    }
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getMyInvites(req: AuthRequest, res: Response): Promise<void> {
  try {
    const invites = await prisma.factionInvite.findMany({
      where: {
        invitedUserId: req.userId,
        expiresAt: { gt: new Date() },
      },
      include: {
        faction: { select: { name: true, tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const invitesWithUsers = await Promise.all(
      invites.map(async (i: any) => {
        const invitedBy = await prisma.user.findUnique({
          where: { id: i.invitedByUserId },
          select: { username: true },
        });
        return {
          id: i.id,
          factionId: i.factionId,
          galaxyId: i.galaxyId,
          factionName: i.faction.name,
          factionTag: i.faction.tag,
          invitedByUsername: invitedBy?.username || 'unknown',
          expiresAt: i.expiresAt,
        };
      })
    );

    res.json(invitesWithUsers);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function acceptInvite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const inviteId = parseInt(req.params.inviteId, 10);
    if (!Number.isFinite(inviteId)) {
      res.status(400).json({ error: 'Invalid invite id' });
      return;
    }

    const invite = await prisma.factionInvite.findUnique({
      where: { id: inviteId },
      select: { invitedUserId: true, factionId: true, galaxyId: true, expiresAt: true },
    });
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (invite.invitedUserId !== req.userId) {
      res.status(403).json({ error: 'This invite is not for you' });
      return;
    }
    if (new Date() > invite.expiresAt) {
      res.status(400).json({ error: 'Invite expired' });
      return;
    }

    const existing = await prisma.factionMember.findUnique({
      where: { userId_galaxyId: { userId: req.userId, galaxyId: invite.galaxyId } },
    });
    if (existing) {
      res.status(400).json({ error: 'You are already in a faction in this galaxy' });
      return;
    }

    await Promise.all([
      prisma.factionMember.create({
        data: {
          factionId: invite.factionId,
          userId: req.userId,
          galaxyId: invite.galaxyId,
        },
      }),
      prisma.factionInvite.delete({ where: { id: inviteId } }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function declineInvite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const inviteId = parseInt(req.params.inviteId, 10);
    if (!Number.isFinite(inviteId)) {
      res.status(400).json({ error: 'Invalid invite id' });
      return;
    }

    const invite = await prisma.factionInvite.findUnique({
      where: { id: inviteId },
      select: { invitedUserId: true },
    });
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (invite.invitedUserId !== req.userId) {
      res.status(403).json({ error: 'This invite is not for you' });
      return;
    }

    await prisma.factionInvite.delete({ where: { id: inviteId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function setMemberRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const { role } = req.body as { role?: string };

    if (!Number.isFinite(factionId) || !Number.isFinite(targetUserId)) {
      res.status(400).json({ error: 'Invalid faction or user id' });
      return;
    }
    if (!['leader', 'officer', 'member'].includes(role || '')) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const faction = await prisma.faction.findUnique({
      where: { id: factionId },
      select: { members: { select: { userId: true, role: true } } },
    });
    if (!faction) {
      res.status(404).json({ error: 'Faction not found' });
      return;
    }

    const caller = faction.members.find((m: any) => m.userId === req.userId);
    if (!caller || caller.role !== 'leader') {
      res.status(403).json({ error: 'Only leaders can change roles' });
      return;
    }

    const target = faction.members.find((m: any) => m.userId === targetUserId);
    if (!target) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    await prisma.factionMember.updateMany({
      where: { factionId, userId: targetUserId },
      data: { role: role as any },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function kickMember(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    if (!Number.isFinite(factionId) || !Number.isFinite(targetUserId)) {
      res.status(400).json({ error: 'Invalid faction or user id' });
      return;
    }

    const faction = await prisma.faction.findUnique({
      where: { id: factionId },
      select: { members: { select: { userId: true, role: true } } },
    });
    if (!faction) {
      res.status(404).json({ error: 'Faction not found' });
      return;
    }

    const caller = faction.members.find((m: any) => m.userId === req.userId);
    if (!caller || (caller.role !== 'leader' && caller.role !== 'officer')) {
      res.status(403).json({ error: 'Only leaders and officers can kick' });
      return;
    }

    const target = faction.members.find((m: any) => m.userId === targetUserId);
    if (!target) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    if (target.role === 'leader') {
      res.status(400).json({ error: 'Cannot kick the leader' });
      return;
    }

    if (caller.role === 'officer' && target.role === 'officer') {
      res.status(403).json({ error: 'Officers cannot kick other officers' });
      return;
    }

    await prisma.factionMember.deleteMany({
      where: { factionId, userId: targetUserId },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function leaveFaction(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.id, 10);
    if (!Number.isFinite(factionId)) {
      res.status(400).json({ error: 'Invalid faction id' });
      return;
    }

    const member = await prisma.factionMember.findFirst({
      where: { factionId, userId: req.userId },
      select: { role: true },
    });
    if (!member) {
      res.status(404).json({ error: 'You are not in this faction' });
      return;
    }

    if (member.role === 'leader') {
      res.status(400).json({ error: 'Leader cannot leave. Disband the faction or transfer leadership first.' });
      return;
    }

    await prisma.factionMember.deleteMany({
      where: { factionId, userId: req.userId },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function disbandFaction(req: AuthRequest, res: Response): Promise<void> {
  try {
    const factionId = parseInt(req.params.id, 10);
    if (!Number.isFinite(factionId)) {
      res.status(400).json({ error: 'Invalid faction id' });
      return;
    }

    const faction = await prisma.faction.findUnique({
      where: { id: factionId },
      select: { members: { select: { userId: true, role: true } } },
    });
    if (!faction) {
      res.status(404).json({ error: 'Faction not found' });
      return;
    }

    const member = faction.members.find((m: any) => m.userId === req.userId);
    if (!member || member.role !== 'leader') {
      res.status(403).json({ error: 'Only the leader can disband the faction' });
      return;
    }

    await prisma.faction.delete({ where: { id: factionId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
