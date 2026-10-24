import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';
process.env.KOFI_VERIFICATION_TOKEN = 'test-token';

const prisma = (await import('../lib/prisma.js')).default;
const { handleKofiWebhook } = await import('../controllers/kofiWebhookController.js');

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

// In-memory stand-in for the tables the webhook touches. The claim table honours
// its unique key like Postgres does (createMany + skipDuplicates).
function makeDb(t, userOverrides = {}) {
	const db = {
		user: {
			id: 7,
			username: 'buyer',
			isSupporter: false,
			supporterTier: null,
			isFounder: false,
			earnedTitles: [],
			vexPoints: 0,
			...userOverrides
		},
		claims: new Set(),
		tokens: [],
		userUpdates: 0
	};
	const tx = {
		kofiWebhookEvent: {
			createMany: async ({ data }) => {
				let count = 0;
				for (const row of data) {
					if (db.claims.has(row.transactionId)) continue;
					db.claims.add(row.transactionId);
					count++;
				}
				return { count };
			}
		},
		user: {
			findUnique: async () => ({ earnedTitles: db.user.earnedTitles }),
			update: async ({ data }) => {
				db.userUpdates++;
				for (const [k, v] of Object.entries(data)) {
					if (v && typeof v === 'object' && 'increment' in v) db.user[k] += v.increment;
					else db.user[k] = v;
				}
				return db.user;
			}
		},
		milestoneToken: {
			createMany: async ({ data }) => {
				let count = 0;
				for (const row of data) {
					if (db.tokens.some((r) => r.kofiTransactionId === row.kofiTransactionId)) continue;
					db.tokens.push(row);
					count++;
				}
				return { count };
			}
		}
	};
	withPatched(t, prisma, {
		$transaction: async (fn) => fn(tx)
	});
	withPatched(t, prisma.user, { findUnique: async () => ({ ...db.user }) });
	return db;
}

function deliver(payload) {
	const req = {
		body: {
			data: JSON.stringify({
				verification_token: 'test-token',
				email: 'buyer@example.com',
				...payload
			})
		}
	};
	const out = { status: null, body: null };
	const res = {
		status(code) {
			out.status = code;
			return this;
		},
		json(b) {
			out.body = b;
			return this;
		}
	};
	return handleKofiWebhook(req, res).then(() => out);
}

const VP_ORDER = {
	type: 'Shop Order',
	kofi_transaction_id: 'tx-vp-1',
	amount: '10.00',
	shop_items: [{ variation_name: 'Commander Pack — 2,500 VP', quantity: 1 }]
};

test('first VP shop order delivery credits VP once', async (t) => {
	const db = makeDb(t);
	const out = await deliver(VP_ORDER);
	assert.equal(out.status, 200);
	assert.equal(db.user.vexPoints, 2500);
	assert.equal(db.tokens.length, 0);
});

test('duplicate delivery grants nothing and returns 200 duplicate', async (t) => {
	const db = makeDb(t);
	await deliver(VP_ORDER);
	const second = await deliver(VP_ORDER);
	assert.equal(second.status, 200);
	assert.equal(second.body.duplicate, true);
	assert.equal(db.user.vexPoints, 2500);
});

test('missing transaction id grants nothing', async (t) => {
	const db = makeDb(t);
	const { kofi_transaction_id: _drop, ...noId } = VP_ORDER;
	const out = await deliver(noId);
	assert.equal(out.status, 200);
	assert.equal(db.user.vexPoints, 0);
	assert.equal(db.claims.size, 0);
});

test('supporter shop item (35e981fe6e) grants vanguard + 8 tokens exactly once', async (t) => {
	const db = makeDb(t);
	const order = {
		type: 'Shop Order',
		kofi_transaction_id: 'tx-sup-1',
		amount: '25.00',
		shop_items: [{ direct_link_code: '35e981fe6e', quantity: 1 }]
	};
	const first = await deliver(order);
	assert.equal(first.status, 200);
	assert.equal(db.user.supporterTier, 'vanguard');
	assert.ok(db.user.earnedTitles.includes('Vanguard'));
	assert.equal(db.tokens.length, 8);

	const second = await deliver(order);
	assert.equal(second.body.duplicate, true);
	assert.equal(db.tokens.length, 8);
});
