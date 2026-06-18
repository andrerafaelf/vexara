import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';
// Syntactically valid but throwaway VAPID keypair, generated locally purely
// to satisfy webpush.setVapidDetails's format check at module load time —
// sendNotification itself is monkeypatched below, so it's never actually used.
process.env.VAPID_PUBLIC_KEY ??=
	'BKuZl8NZA4sqeiHKoGPzhlUB9CjQi-ALN3bqM6uVTlmABJTMZ0DwhBFEsFSNqxc0ew93Qn7UYkpMiwAK-sXP_Rc';
process.env.VAPID_PRIVATE_KEY ??= 'tGxnJjzfTcZB4DqEZfRaotnpsDjtq8xM9b2Uj0_i-Ks';

const prisma = (await import('../lib/prisma.js')).default;
const webpush = (await import('web-push')).default;
const { NOTIF, sendPushToUser } = await import('../utils/push.js');

function withPatched(t, target, patches) {
	const originals = {};
	for (const key of Object.keys(patches)) {
		originals[key] = target[key];
		target[key] = patches[key];
	}
	t.after(() => {
		for (const key of Object.keys(originals)) target[key] = originals[key];
	});
}

test('sendPushToUser includes actions in the web-push message payload when provided', async (t) => {
	const calls = {};
	withPatched(t, prisma.pushSubscription, {
		findMany: async () => [{ endpoint: 'https://example.com/ep', p256dh: 'p', auth: 'a' }]
	});
	withPatched(t, prisma.notificationPreferences, { findUnique: async () => null });
	withPatched(t, webpush, {
		sendNotification: async (_sub, message) => {
			calls.message = message;
		}
	});

	await sendPushToUser(1, NOTIF.TROOP_COMPLETE, {
		title: 'Training Complete',
		body: '10x Assault Trooper ready at Nexus.',
		tag: 'troop-1-assaultTrooper-123',
		data: { url: '/nexus/1?tab=troops' },
		actions: [
			{ action: 'retrain', title: 'Train Again', url: '/nexus/1?tab=troops&retrain=assaultTrooper:10' }
		]
	});

	const parsed = JSON.parse(calls.message);
	assert.deepEqual(parsed.actions, [
		{ action: 'retrain', title: 'Train Again', url: '/nexus/1?tab=troops&retrain=assaultTrooper:10' }
	]);
	assert.equal(parsed.data.url, '/nexus/1?tab=troops');
});

test('sendPushToUser omits actions when none are provided', async (t) => {
	const calls = {};
	withPatched(t, prisma.pushSubscription, {
		findMany: async () => [{ endpoint: 'https://example.com/ep', p256dh: 'p', auth: 'a' }]
	});
	withPatched(t, prisma.notificationPreferences, { findUnique: async () => null });
	withPatched(t, webpush, {
		sendNotification: async (_sub, message) => {
			calls.message = message;
		}
	});

	await sendPushToUser(1, NOTIF.FRIEND_REQUEST, {
		title: 'Friend request',
		body: 'Someone wants to be your friend.',
		data: { url: '/friends' }
	});

	const parsed = JSON.parse(calls.message);
	assert.equal(parsed.actions, undefined);
});
