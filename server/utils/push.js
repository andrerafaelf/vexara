import webpush from 'web-push';
import prisma from '../lib/prisma.js';
import { logError, logInfo } from './logger.js';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@neon-dominion.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// Notification category keys matching NotificationPreferences model fields
export const NOTIF = {
  ATTACK_INCOMING: 'attackIncoming',
  ATTACK_RESOLVED: 'attackResolved',
  TROOPS_RETURNED: 'troopsReturned',
  BUILDING_COMPLETE: 'buildingComplete',
  TROOP_COMPLETE: 'troopComplete',
  RESOURCES_FULL: 'resourcesFull',
  TROOP_TRANSFER: 'troopTransfer',
};

/**
 * Send a push notification to all subscriptions of a user if their prefs allow it.
 * @param {number} userId
 * @param {string} category - one of NOTIF.*
 * @param {{ title: string, body: string, icon?: string, tag?: string, data?: object }} payload
 */
export async function sendPushToUser(userId, category, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    const [subscriptions, prefs] = await Promise.all([
      prisma.pushSubscription.findMany({ where: { userId } }),
      prisma.notificationPreferences.findUnique({ where: { userId } }),
    ]);

    if (!subscriptions.length) return;

    // Default all prefs to true if no record exists yet
    const allowed = prefs ? prefs[category] !== false : true;
    if (!allowed) return;

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/logo192.png',
      badge: '/logo192.png',
      tag: payload.tag || category,
      data: { url: payload.data?.url || '/', ...payload.data },
    });

    const staleEndpoints = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
          );
        } catch (err) {
          // 410 Gone or 404 = subscription expired, remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            staleEndpoints.push(sub.endpoint);
          } else {
            logError('push_send_error', { userId, endpoint: sub.endpoint, message: err.message });
          }
        }
      }),
    );

    if (staleEndpoints.length) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: staleEndpoints } } });
      logInfo('push_stale_removed', { userId, count: staleEndpoints.length });
    }
  } catch (err) {
    logError('push_notify_error', { userId, category, message: err.message });
  }
}
