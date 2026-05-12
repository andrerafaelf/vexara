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

export const NOTIF = {
  ATTACK_INCOMING:   'attackIncoming',
  ATTACK_RESOLVED:   'attackResolved',
  TROOPS_RETURNED:   'troopsReturned',
  BUILDING_COMPLETE: 'buildingComplete',
  TROOP_COMPLETE:    'troopComplete',
  RESOURCES_FULL:    'resourcesFull',
  TROOP_TRANSFER:    'troopTransfer',
} as const;

export type NotifCategory = (typeof NOTIF)[keyof typeof NOTIF];

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: { url?: string; [key: string]: unknown };
}

export async function sendPushToUser(
  userId: number,
  category: string,
  payload: PushPayload,
): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    const [subscriptions, prefs] = await Promise.all([
      prisma.pushSubscription.findMany({ where: { userId } }),
      prisma.notificationPreferences.findUnique({ where: { userId } }),
    ]);

    if (!subscriptions.length) return;

    const allowed = prefs ? (prefs as Record<string, unknown>)[category] !== false : true;
    if (!allowed) return;

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/logo192.png',
      badge: '/logo192.png',
      tag: payload.tag || category,
      data: { url: payload.data?.url || '/', ...payload.data },
    });

    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
          );
        } catch (err: unknown) {
          const e = err as { statusCode?: number; message?: string };
          if (e.statusCode === 410 || e.statusCode === 404) {
            staleEndpoints.push(sub.endpoint);
          } else {
            logError('push_send_error', { userId, endpoint: sub.endpoint, message: e.message });
          }
        }
      }),
    );

    if (staleEndpoints.length) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: staleEndpoints } } });
      logInfo('push_stale_removed', { userId, count: staleEndpoints.length });
    }
  } catch (err: unknown) {
    logError('push_notify_error', { userId, category, message: (err as Error).message });
  }
}
