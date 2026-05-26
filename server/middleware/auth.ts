import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Short-lived in-process cache keyed by userId.
// Entries expire after 30 s, galaxy switches are reflected quickly,
// and we avoid a DB hit on every API call for active players.
const TTL_MS = 30_000;
// lastPlayedAt is written at most once per this interval per user to avoid
// a DB write on every single API request.
const LAST_PLAYED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
interface CacheEntry {
  activeGalaxyId: number | null;
  galaxyStatus: string | null;
  expiresAt: number;
  lastPlayedWrittenAt: number;
}
const userCache = new Map<number, CacheEntry>();

// Prune stale entries periodically so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of userCache) {
    if (v.expiresAt < now) userCache.delete(k);
  }
}, 60_000).unref();

const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'No authentication token' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    const userId = decoded.userId;
    (req as AuthRequest).userId = userId;

    const now = Date.now();
    let cached = userCache.get(userId);

    if (!cached || cached.expiresAt < now) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { activeGalaxyId: true, activeGalaxy: { select: { id: true, status: true } } },
      });

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      cached = {
        activeGalaxyId: user.activeGalaxyId ?? null,
        galaxyStatus: user.activeGalaxy?.status ?? null,
        expiresAt: now + TTL_MS,
        lastPlayedWrittenAt: 0,
      };
      userCache.set(userId, cached);
    }

    const authReq = req as AuthRequest;

    if (authReq.activeGalaxyOptional !== true && cached.activeGalaxyId == null) {
      res.status(409).json({ error: 'No active galaxy selected', code: 'no_active_galaxy' });
      return;
    }

    authReq.galaxyId = cached.activeGalaxyId ?? (null as unknown as number);
    authReq.galaxyStatus = cached.galaxyStatus as 'active' | 'ended' | null;

    if (authReq.galaxyStatus === 'ended' && !READ_METHODS.has(req.method)) {
      res.status(423).json({ error: 'This galaxy has ended and is read-only', code: 'galaxy_ended' });
      return;
    }

    // Fire-and-forget lastPlayedAt update, throttled to once per 5 min per user.
    if (now - cached.lastPlayedWrittenAt > LAST_PLAYED_UPDATE_INTERVAL_MS) {
      cached.lastPlayedWrittenAt = now;
      void prisma.user.update({ where: { id: userId }, data: { lastPlayedAt: new Date(now) } }).catch(() => {});
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Call this after any operation that changes a user's active galaxy
// so the next request sees the updated value immediately.
export function invalidateAuthCache(userId: number): void {
  userCache.delete(userId);
}

export default auth;
