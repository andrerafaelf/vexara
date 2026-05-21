import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import * as notifService from '../services/notificationService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';

export function getVapidPublicKey(req: Request, res: Response): void {
  const key = notifService.getVapidPublicKey();
  if (!key) { res.status(503).json({ error: 'Push notifications not configured' }); return; }
  res.json({ vapidPublicKey: key });
}

export async function subscribe(req: AuthRequest, res: Response): Promise<void> {
  const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription object' }); return;
  }
  try {
    await notifService.upsertSubscription(req.userId, endpoint, keys.p256dh, keys.auth);
    await notifService.ensurePrefsExist(req.userId);
    res.json({ success: true });
  } catch (err) {
    logError('subscribe_error', { userId: req.userId, message: (err as Error).message });
    res.status(500).json({ error: 'Failed to save subscription' });
  }
}

export async function unsubscribe(req: AuthRequest, res: Response): Promise<void> {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: 'endpoint required' }); return; }
  try {
    await notifService.deleteSubscription(endpoint, req.userId);
    res.json({ success: true });
  } catch (err) {
    logError('unsubscribe_error', { userId: req.userId, message: (err as Error).message });
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
}

const PREF_KEYS = [
  'attackIncoming', 'attackResolved', 'troopsReturned', 'buildingComplete',
  'troopComplete', 'resourcesFull', 'troopTransfer',
  'factionInvite', 'factionPromotion', 'factionWar', 'factionDiplomacy',
  'friendRequest', 'friendMessage',
  'nearbyGalaxyEvent', 'protectionExpiring', 'tokenGranted',
] as const;

export async function getPreferences(req: AuthRequest, res: Response): Promise<void> {
  try {
    const prefs = await notifService.getPreferences(req.userId);
    const defaults = Object.fromEntries(PREF_KEYS.map((k) => [k, true]));
    res.json(prefs || defaults);
  } catch (err) {
    logError('get_prefs_error', { userId: req.userId, message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
}

/**
 * Aggregate badge counts for the top nav: tokens awaiting redemption, plus whether
 * the user has a faction action pending (an unanswered invite, or a treaty proposal
 * directed at a faction they lead/officer for).
 */
export async function getBadges(req: AuthRequest, res: Response): Promise<void> {
  try {
    const now = new Date();

    const [referralTokenCount, milestoneTokenCount, factionInvites, leadership, allMemberships, user] = await Promise.all([
      prisma.referralToken.count({ where: { referrerId: req.userId, redeemedAt: null } }),
      prisma.milestoneToken.count({ where: { userId: req.userId, redeemedAt: null } }),
      prisma.factionInvite.count({ where: { invitedUserId: req.userId, expiresAt: { gt: now } } }),
      prisma.factionMember.findMany({
        where: { userId: req.userId, role: { in: ['leader', 'officer'] } },
        select: { factionId: true, galaxyId: true },
      }),
      prisma.factionMember.findMany({
        where: { userId: req.userId },
        select: { factionId: true, galaxyId: true },
      }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { lastSeenWarsAt: true } }),
    ]);

    let pendingTreaties = 0;
    if (leadership.length > 0) {
      pendingTreaties = await prisma.factionTreaty.count({
        where: {
          status: 'pending',
          OR: leadership.map((l) => ({ targetFactionId: l.factionId, galaxyId: l.galaxyId })),
        },
      });
    }

    let unseenWars = 0;
    if (allMemberships.length > 0) {
      unseenWars = await prisma.factionWar.count({
        where: {
          status: { in: ['active', 'ceasefire_pending'] },
          declaredAt: user?.lastSeenWarsAt ? { gt: user.lastSeenWarsAt } : undefined,
          OR: allMemberships.flatMap((m) => [
            { targetFactionId: m.factionId, galaxyId: m.galaxyId },
            { declarerFactionId: m.factionId, galaxyId: m.galaxyId },
          ]),
        },
      });
    }

    const tokensAvailable = referralTokenCount + milestoneTokenCount;
    const factionAttention = factionInvites + pendingTreaties + unseenWars;

    res.json({ tokensAvailable, factionAttention });
  } catch (err) {
    logError('badges_error', { userId: req.userId, message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
}

export async function updatePreferences(req: AuthRequest, res: Response): Promise<void> {
  const allowed = PREF_KEYS as readonly string[];
  const updates: Record<string, boolean> = {};
  for (const key of allowed) {
    if (typeof (req.body as Record<string, unknown>)[key] === 'boolean') updates[key] = (req.body as Record<string, boolean>)[key];
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: 'No valid preference fields provided' }); return; }
  try {
    const prefs = await notifService.upsertPreferences(req.userId, updates);
    res.json(prefs);
  } catch (err) {
    logError('update_prefs_error', { userId: req.userId, message: (err as Error).message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
}
