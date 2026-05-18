import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import * as mapService from '../services/mapService.js';
import type { AuthRequest } from '../types/index.js';
import { getNexusIntelForUser } from '../utils/scouting.js';

export async function getArea(req: AuthRequest, res: Response): Promise<void> {
  try {
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);
    const range = 10;
    const nexuses = await mapService.getNexusesInArea(req.galaxyId, x, y, range);
    const ownerIds = [...new Set(nexuses.map((v) => v.ownerId).filter((id): id is number => id != null))];
    const ownerPlayers = await mapService.getGalaxyPlayerPoints(req.galaxyId, ownerIds);
    const pointsByOwnerId = new Map(ownerPlayers.map((p) => [p.userId, p.points]));
    const now = new Date();
    const result = nexuses.map((v) => ({
      _id: String(v.id), id: String(v.id), name: v.name, x: v.x, y: v.y, points: v.points,
      owner: v.owner
        ? { _id: String(v.owner.id), id: String(v.owner.id), username: v.owner.username, points: pointsByOwnerId.get(v.owner.id) ?? 0 }
        : null,
      intelLevel: v.ownerId === req.userId ? 'owned' : 'public',
      newbieProtectionEndsAt: v.newbieProtectionEndsAt && v.newbieProtectionEndsAt > now ? v.newbieProtectionEndsAt : null,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getNexusIntel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexus = await getNexusIntelForUser(req.userId, parseInt(req.params.nexusId), req.galaxyId);
    if (!nexus) { res.status(404).json({ error: 'Nexus not found' }); return; }
    res.json(nexus);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getGalaxyEvents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { getActiveGalaxyEvents } = await import('../utils/galaxyEvents.js');
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { activeGalaxyId: true } });
    if (!user?.activeGalaxyId) { res.status(409).json({ error: 'No active galaxy' }); return; }
    const events = await getActiveGalaxyEvents(user.activeGalaxyId);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
