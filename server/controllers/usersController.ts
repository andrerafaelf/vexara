import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import * as friendsService from '../services/friendsService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';

type FriendshipStatus = 'self' | 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

export async function getPublicProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) { res.status(400).json({ error: 'Username required' }); return; }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, isSupporter: true, createdAt: true, activeGalaxyId: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const players = await prisma.galaxyPlayer.findMany({
      where: { userId: user.id },
      select: {
        points: true,
        finalPoints: true,
        joinedAt: true,
        galaxy: {
          select: {
            id: true,
            name: true,
            status: true,
            startsAt: true,
            endedAt: true,
            winnerUserId: true,
            winnerFactionId: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const factionMemberships = await prisma.factionMember.findMany({
      where: { userId: user.id },
      select: {
        galaxyId: true,
        role: true,
        faction: { select: { id: true, name: true, tag: true } },
      },
    });
    const factionByGalaxy = new Map(factionMemberships.map((m) => [m.galaxyId, m]));

    let totalInfluence = 0;
    let bestSingleGalaxy = 0;
    let galaxiesWon = 0;
    const galaxies = players.map((p) => {
      const fm = factionByGalaxy.get(p.galaxy.id);
      const isFactionWinner = !!(p.galaxy.winnerFactionId && fm && fm.faction.id === p.galaxy.winnerFactionId);
      const isLeaderWinner = p.galaxy.winnerUserId === user.id;
      const isWinner = isFactionWinner || isLeaderWinner;
      const isEnded = p.galaxy.status === 'ended';
      // Live points while active, snapshot once ended. finalPoints is null for non-winners.
      const effectivePoints = isEnded ? (p.finalPoints ?? 0) : p.points;
      totalInfluence += effectivePoints;
      if (effectivePoints > bestSingleGalaxy) bestSingleGalaxy = effectivePoints;
      if (isEnded && isWinner) galaxiesWon++;
      return {
        galaxyId: p.galaxy.id,
        galaxyName: p.galaxy.name,
        status: p.galaxy.status,
        startsAt: p.galaxy.startsAt,
        endedAt: p.galaxy.endedAt,
        joinedAt: p.joinedAt,
        livePoints: p.points,
        finalPoints: p.finalPoints,
        effectivePoints,
        isWinner,
        isCurrent: p.galaxy.id === user.activeGalaxyId,
        faction: fm ? { id: fm.faction.id, name: fm.faction.name, tag: fm.faction.tag, role: fm.role } : null,
      };
    });

    let friendship: { status: FriendshipStatus; requestId?: number } = { status: 'none' };
    if (user.id === req.userId) {
      friendship = { status: 'self' };
    } else {
      const { userAId, userBId } = friendsService.pairKey(req.userId, user.id);
      const existing = await friendsService.getFriendship(userAId, userBId);
      if (existing) {
        friendship = { status: 'friends' };
      } else {
        const outgoing = await friendsService.getPendingRequestBetween(req.userId, user.id);
        if (outgoing) {
          friendship = { status: 'pending_outgoing', requestId: outgoing.id };
        } else {
          const incoming = await friendsService.getPendingRequestBetween(user.id, req.userId);
          if (incoming) friendship = { status: 'pending_incoming', requestId: incoming.id };
        }
      }
    }

    const accountAgeDays = Math.max(1, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

    res.json({
      userId: user.id,
      username: user.username,
      isSupporter: user.isSupporter,
      createdAt: user.createdAt,
      accountAgeDays,
      totalInfluence,
      bestSingleGalaxy,
      galaxiesWon,
      galaxiesPlayed: galaxies.length,
      galaxies,
      friendship,
    });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'usersController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
