import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { isTokenRevoked } from '../utils/sessionRevocation.js';

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
	passwordChangedAt: Date | null;
	expiresAt: number;
	lastPlayedWrittenAt: number;
}
const userCache = new Map<number, CacheEntry>();

// Prune stale entries periodically so the map doesn't grow unbounded.
setInterval(() => {
	const now = Date.now();
	for (const [k, v] of userCache) {
		// Keep an expired entry until its lastPlayedAt throttle window has also passed,
		// otherwise the next rebuild would forget it and write again immediately.
		if (v.expiresAt < now && now - v.lastPlayedWrittenAt > LAST_PLAYED_UPDATE_INTERVAL_MS) {
			userCache.delete(k);
		}
	}
}, 60_000).unref();

const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '');
		if (!token) {
			res.status(401).json({ error: 'No authentication token' });
			return;
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number; iat?: number };
		const userId = decoded.userId;
		(req as AuthRequest).userId = userId;

		const now = Date.now();
		let cached = userCache.get(userId);

		if (!cached || cached.expiresAt < now) {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: {
						activeGalaxyId: true,
						passwordChangedAt: true,
						activeGalaxy: { select: { id: true, status: true } }
					}
			});

			if (!user) {
				res.status(401).json({ error: 'User not found' });
				return;
			}

			cached = {
				activeGalaxyId: user.activeGalaxyId ?? null,
				galaxyStatus: user.activeGalaxy?.status ?? null,
				passwordChangedAt: user.passwordChangedAt ?? null,
				expiresAt: now + TTL_MS,
				// Carry the throttle stamp over from the entry being rebuilt, or the
				// 5-minute write throttle resets every TTL and writes ~every 30s.
				lastPlayedWrittenAt: cached?.lastPlayedWrittenAt ?? 0
			};
			userCache.set(userId, cached);
		}

		// Tokens issued before the last password change/reset are revoked (same response
		// shape as an invalid token).
		if (isTokenRevoked(decoded.iat, cached.passwordChangedAt)) {
			res.status(401).json({ error: 'Invalid token' });
			return;
		}

		const authReq = req as AuthRequest;

		if (authReq.activeGalaxyOptional !== true && cached.activeGalaxyId == null) {
			res.status(409).json({ error: 'No active galaxy selected', code: 'no_active_galaxy' });
			return;
		}

		authReq.galaxyId = cached.activeGalaxyId ?? (null as unknown as number);
		authReq.galaxyStatus = cached.galaxyStatus as 'active' | 'ended' | null;

		if (authReq.galaxyStatus === 'ended' && !READ_METHODS.has(req.method)) {
			res
				.status(423)
				.json({ error: 'This galaxy has ended and is read-only', code: 'galaxy_ended' });
			return;
		}

		// Fire-and-forget lastPlayedAt update, throttled to once per 5 min per user.
		if (now - cached.lastPlayedWrittenAt > LAST_PLAYED_UPDATE_INTERVAL_MS) {
			cached.lastPlayedWrittenAt = now;
			void prisma.user
				.update({ where: { id: userId }, data: { lastPlayedAt: new Date(now) } })
				.catch(() => {});
		}

		next();
	} catch {
		res.status(401).json({ error: 'Invalid token' });
	}
};

// Call this after any operation that changes a user's active galaxy
// so the next request sees the updated value immediately.
export function invalidateAuthCache(userId: number): void {
	// Expire rather than delete so the lastPlayedAt write throttle survives.
	const entry = userCache.get(userId);
	if (entry) entry.expiresAt = 0;
}

export default auth;
