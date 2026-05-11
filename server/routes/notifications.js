import express from 'express';
import auth from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { logError } from '../utils/logger.js';

const router = express.Router();

// GET /api/notifications/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  res.json({ vapidPublicKey: key });
});

// POST /api/notifications/subscribe
// Body: { endpoint, keys: { p256dh, auth } }
router.post('/subscribe', auth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.userId },
      create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    // Ensure prefs row exists with defaults
    await prisma.notificationPreferences.upsert({
      where: { userId: req.userId },
      update: {},
      create: { userId: req.userId },
    });

    res.json({ success: true });
  } catch (err) {
    logError('subscribe_error', { userId: req.userId, message: err.message });
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// DELETE /api/notifications/subscribe
// Body: { endpoint }
router.delete('/subscribe', auth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.userId },
    });
    res.json({ success: true });
  } catch (err) {
    logError('unsubscribe_error', { userId: req.userId, message: err.message });
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// GET /api/notifications/preferences
router.get('/preferences', auth, async (req, res) => {
  try {
    const prefs = await prisma.notificationPreferences.findUnique({
      where: { userId: req.userId },
    });

    // Return defaults if no record yet
    res.json(prefs || {
      attackIncoming: true,
      attackResolved: true,
      troopsReturned: true,
      buildingComplete: true,
      troopComplete: true,
      resourcesFull: true,
      troopTransfer: true,
    });
  } catch (err) {
    logError('get_prefs_error', { userId: req.userId, message: err.message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PATCH /api/notifications/preferences
// Body: partial { attackIncoming, attackResolved, troopsReturned, buildingComplete, troopComplete, resourcesFull, report, troopTransfer }
router.patch('/preferences', auth, async (req, res) => {
  const allowed = [
    'attackIncoming', 'attackResolved', 'troopsReturned', 'buildingComplete',
    'troopComplete', 'resourcesFull', 'troopTransfer',
  ];

  const updates = {};
  for (const key of allowed) {
    if (typeof req.body[key] === 'boolean') updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid preference fields provided' });
  }

  try {
    const prefs = await prisma.notificationPreferences.upsert({
      where: { userId: req.userId },
      update: updates,
      create: { userId: req.userId, ...updates },
    });
    res.json(prefs);
  } catch (err) {
    logError('update_prefs_error', { userId: req.userId, message: err.message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
