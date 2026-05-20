import type { Response } from 'express';
import { invalidateAuthCache } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import * as galaxyService from '../services/galaxyService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';

function serializeGalaxy(g: { id: number; name: string; status: string; endedAt?: Date | null; winnerUserId?: number | null; winnerFactionId?: number | null; createdAt: Date }, opts: { isJoined?: boolean } = {}) {
  return { id: g.id, name: g.name, status: g.status, endedAt: g.endedAt ?? null, winnerUserId: g.winnerUserId ?? null, winnerFactionId: g.winnerFactionId ?? null, createdAt: g.createdAt, isJoined: opts.isJoined ?? false };
}

const GALAXY_WIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function listGalaxies(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [galaxies, myPlayers] = await Promise.all([
      galaxyService.getAllGalaxies(),
      galaxyService.getMyGalaxyPlayers(req.userId),
    ]);
    const joined = new Set(myPlayers.map((p) => p.galaxyId));
    const cutoff = new Date(Date.now() - GALAXY_WIN_WINDOW_MS);
    const visible = galaxies.filter(
      (g) => g.status === 'active' || (g.endedAt && new Date(g.endedAt) >= cutoff),
    );
    res.json(visible.map((g) => serializeGalaxy(g, { isJoined: joined.has(g.id) })));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'galaxyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getGalaxyWinResults(req: AuthRequest, res: Response): Promise<void> {
  try {
    const galaxyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(galaxyId)) { res.status(400).json({ error: 'Invalid galaxy id' }); return; }
    const galaxy = await galaxyService.getGalaxyById(galaxyId);
    if (!galaxy) { res.status(404).json({ error: 'Galaxy not found' }); return; }
    if (galaxy.status !== 'ended') { res.status(400).json({ error: 'Galaxy has not ended' }); return; }

    const [factions, players] = await Promise.all([
      prisma.faction.findMany({
        where: { galaxyId },
        select: {
          id: true, name: true, tag: true,
          members: { where: { galaxyId }, select: { userId: true } },
        },
      }),
      prisma.galaxyPlayer.findMany({
        where: { galaxyId },
        select: { userId: true, points: true, user: { select: { username: true, isSupporter: true } } },
        orderBy: { points: 'desc' },
      }),
    ]);

    const nexusCounts = await prisma.nexus.groupBy({
      by: ['ownerId'],
      where: { galaxyId, ownerId: { not: null } },
      _count: { id: true },
    });
    const nexusByOwner = new Map(nexusCounts.map((r) => [r.ownerId!, r._count.id]));

    const userFactionMap = new Map<number, number>();
    for (const f of factions) {
      for (const m of f.members) userFactionMap.set(m.userId, f.id);
    }

    const factionPoints = new Map<number, number>();
    const factionNexuses = new Map<number, number>();
    for (const p of players) {
      const fId = userFactionMap.get(p.userId);
      if (fId) {
        factionPoints.set(fId, (factionPoints.get(fId) || 0) + p.points);
        factionNexuses.set(fId, (factionNexuses.get(fId) || 0) + (nexusByOwner.get(p.userId) || 0));
      }
    }

    const factionLeaderboard = factions
      .map((f) => ({ id: f.id, name: f.name, tag: f.tag, points: factionPoints.get(f.id) || 0, nexuses: factionNexuses.get(f.id) || 0, isWinner: f.id === galaxy.winnerFactionId }))
      .sort((a, b) => b.points - a.points);

    res.json({ galaxy: serializeGalaxy(galaxy), factionLeaderboard, topPlayers: players.slice(0, 20).map((p) => ({ userId: p.userId, username: p.user?.username ?? 'Unknown', isSupporter: p.user?.isSupporter ?? false, points: p.points, nexuses: nexusByOwner.get(p.userId) || 0, factionId: userFactionMap.get(p.userId) ?? null })) });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'galaxyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMyGalaxy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await galaxyService.getUserWithGalaxy(req.userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ activeGalaxy: user.activeGalaxy ? serializeGalaxy(user.activeGalaxy, { isJoined: true }) : null });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'galaxyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function leaveGalaxy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const galaxyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(galaxyId)) { res.status(400).json({ error: 'Invalid galaxy id' }); return; }
    const galaxy = await galaxyService.getGalaxyById(galaxyId);
    if (!galaxy) { res.status(404).json({ error: 'Galaxy not found' }); return; }
    if (galaxy.status !== 'active') { res.status(400).json({ error: 'Cannot leave an ended galaxy' }); return; }
    await galaxyService.leaveGalaxy(req.userId, galaxyId);
    invalidateAuthCache(req.userId);
    res.json({ success: true });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    if (status >= 500) {
      logError('unhandled_controller_error', { message: (error as Error).message, file: 'galaxyController.ts' });
      res.status(status).json({ error: 'Internal server error' });
    } else {
      res.status(status).json({ error: (error as Error).message });
    }
  }
}

export async function selectGalaxy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const galaxyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(galaxyId)) { res.status(400).json({ error: 'Invalid galaxy id' }); return; }
    const galaxy = await galaxyService.getGalaxyById(galaxyId);
    if (!galaxy) { res.status(404).json({ error: 'Galaxy not found' }); return; }
    if (galaxy.status !== 'active') { res.status(400).json({ error: 'Cannot select an ended galaxy as active' }); return; }
    const user = await galaxyService.getUserById(req.userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const result = await galaxyService.selectGalaxy(req.userId, user.username, galaxyId);
    invalidateAuthCache(req.userId);
    res.json({ success: true, joined: result.joined, activeGalaxy: serializeGalaxy(galaxy, { isJoined: true }) });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'galaxyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
