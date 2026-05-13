import type { Response } from 'express';
import { invalidateAuthCache } from '../middleware/auth.js';
import * as galaxyService from '../services/galaxyService.js';
import type { AuthRequest } from '../types/index.js';

function serializeGalaxy(g: { id: number; name: string; status: string; endedAt?: Date | null; winnerUserId?: number | null; createdAt: Date }, opts: { isJoined?: boolean } = {}) {
  return { id: g.id, name: g.name, status: g.status, endedAt: g.endedAt ?? null, winnerUserId: g.winnerUserId ?? null, createdAt: g.createdAt, isJoined: opts.isJoined ?? false };
}

export async function listGalaxies(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [galaxies, myPlayers] = await Promise.all([
      galaxyService.getAllGalaxies(),
      galaxyService.getMyGalaxyPlayers(req.userId),
    ]);
    const joined = new Set(myPlayers.map((p) => p.galaxyId));
    res.json(galaxies.map((g) => serializeGalaxy(g, { isJoined: joined.has(g.id) })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getMyGalaxy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await galaxyService.getUserWithGalaxy(req.userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ activeGalaxy: user.activeGalaxy ? serializeGalaxy(user.activeGalaxy, { isJoined: true }) : null });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.status((error as { status?: number }).status || 500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
  }
}
