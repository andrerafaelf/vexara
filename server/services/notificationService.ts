import prisma from '../lib/prisma.js';

export function getVapidPublicKey() {
	return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function upsertSubscription(userId: number, endpoint: string, p256dh: string, auth: string) {
	return prisma.pushSubscription.upsert({
		where: { endpoint },
		update: { p256dh, auth, userId },
		create: { userId, endpoint, p256dh, auth }
	});
}

export function ensurePrefsExist(userId: number) {
	return prisma.notificationPreferences.upsert({
		where: { userId },
		update: {},
		create: { userId }
	});
}

export function deleteSubscription(endpoint: string, userId: number) {
	return prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

export function getPreferences(userId: number) {
	return prisma.notificationPreferences.findUnique({ where: { userId } });
}

export function upsertPreferences(userId: number, updates: Record<string, boolean>) {
	return prisma.notificationPreferences.upsert({
		where: { userId },
		update: updates,
		create: { userId, ...updates }
	});
}
