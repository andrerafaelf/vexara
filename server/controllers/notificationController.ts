import type { Request, Response } from 'express';
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

export async function getPreferences(req: AuthRequest, res: Response): Promise<void> {
  try {
    const prefs = await notifService.getPreferences(req.userId);
    res.json(prefs || {
      attackIncoming: true, attackResolved: true, troopsReturned: true, buildingComplete: true,
      troopComplete: true, resourcesFull: true, troopTransfer: true,
    });
  } catch (err) {
    logError('get_prefs_error', { userId: req.userId, message: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
}

export async function updatePreferences(req: AuthRequest, res: Response): Promise<void> {
  const allowed = ['attackIncoming', 'attackResolved', 'troopsReturned', 'buildingComplete', 'troopComplete', 'resourcesFull', 'troopTransfer'];
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
