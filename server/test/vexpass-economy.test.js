/**
 * Permanent Vex Pass: XP grant, purchase, gift, reward-table integrity and
 * source-level conservation guards (server/utils/battlePass.ts, the gift-pass
 * shop route).
 *
 * grantPassXp is a single raw-SQL UPDATE whose cap/ceiling/day-rollover logic
 * was verified separately on a real Postgres engine; here we only pin the call
 * contract (one $executeRaw, the right amount, never throws, never touches
 * GalaxyPlayer). Same prisma-monkey-patch harness as the rest of server/test/.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const bp = await import('../utils/battlePass.js');
const {
	PASS_COST_VP,
	PASS_XP,
	PASS_DAILY_XP_CAP,
	PASS_CACHE_BANK_CAP,
	PASS_MAX_XP,
	PASS_XP_PER_LEVEL,
	grantPassXp,
	purchasePaidPass,
	giftPaidPass,
	utcDayKey,
	REWARD_TABLE
} = bp;

const TRUE_ORIGINALS = new Map();
function withPatched(t, target, patches) {
	if (!TRUE_ORIGINALS.has(target)) TRUE_ORIGINALS.set(target, {});
	const saved = TRUE_ORIGINALS.get(target);
	for (const key of Object.keys(patches)) {
		if (!(key in saved)) saved[key] = target[key];
		target[key] = patches[key];
	}
	t.after(() => {
		for (const key of Object.keys(patches)) target[key] = saved[key];
	});
}

function silenceConsole(t) {
	const orig = { log: console.log, error: console.error, warn: console.warn };
	const lines = { log: [], error: [], warn: [] };
	for (const k of Object.keys(orig)) console[k] = (...a) => lines[k].push(a.join(' '));
	t.after(() => Object.assign(console, orig));
	return lines;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('pass constants are pinned', () => {
	assert.equal(bp.MAX_PASS_LEVEL, 50);
	assert.equal(PASS_XP_PER_LEVEL, 200);
	assert.equal(PASS_MAX_XP, 10_000);
	assert.equal(PASS_COST_VP, 1000);
	assert.equal(PASS_DAILY_XP_CAP, 800);
	assert.equal(PASS_CACHE_BANK_CAP, 10);
	assert.equal(bp.PASS_PACING_BASE_LEVELS, 10);
	assert.equal(bp.PASS_PACING_LEVELS_PER_DAY, 4);
	assert.equal(bp.PASS_CACHE_PACING_LEVEL, 50);
	assert.equal(bp.PASS_CLAIM_WASTE_TOLERANCE, 0.05);
	assert.equal(bp.PASS_CACHE_REWARD, 'resources:50000:50000:50000');
});

test('PASS_XP per-event amounts are pinned', () => {
	assert.deepEqual(
		{ ...PASS_XP },
		{
			QUEST_COMPLETE: 200,
			QUEST_STREAK_BONUS: 75,
			ATTACK_LAUNCHED: 25,
			ATTACK_WON: 100,
			NEXUS_CAPTURED: 150,
			DEFENSE_WON: 75,
			COORDINATED_ASSAULT: 120,
			FACTION_WAR_OP: 120,
			DIPLOMATIC_TREATY: 60
		}
	);
	// No single event can exceed the daily cap (so one event can never be a bypass).
	for (const [k, v] of Object.entries(PASS_XP)) assert.ok(v > 0 && v <= PASS_DAILY_XP_CAP, k);
});

// ---------------------------------------------------------------------------
// Reward table integrity
// ---------------------------------------------------------------------------

test('REWARD_TABLE: exactly levels 1..50 in order, every reward string well-formed', () => {
	assert.equal(REWARD_TABLE.length, 50);
	REWARD_TABLE.forEach((r, i) => assert.equal(r.level, i + 1));
	const part = /^(resources:\d+:\d+:\d+|boost:production:\d+:\d+|title:[A-Za-z ]+|badge:(bronze|silver|gold|platinum)|vexpoints:\d+|token:\d+)$/;
	for (const r of REWARD_TABLE) {
		assert.ok(r.free && r.paid, `L${r.level} must have both tracks`);
		for (const s of [r.free, r.paid]) {
			for (const p of s.split(',')) assert.match(p, part, `L${r.level}: ${p}`);
		}
	}
});

test('REWARD_TABLE: the paid track never carries resources (paid-only claims are never storage/pacing gated)', () => {
	for (const r of REWARD_TABLE) assert.ok(!r.paid.includes('resources:'), `L${r.level}`);
});

test('REWARD_TABLE: free resource packs are symmetric (biomass == alloy == ore) and non-decreasing', () => {
	let prev = 0;
	for (const r of REWARD_TABLE) {
		const m = /resources:(\d+):(\d+):(\d+)/.exec(r.free);
		if (!m) {
			assert.equal(r.level, 50, 'only L50 free has no resources');
			continue;
		}
		assert.equal(m[1], m[2]);
		assert.equal(m[2], m[3]);
		assert.ok(Number(m[1]) >= prev, `L${r.level} drops below the previous pack`);
		prev = Number(m[1]);
	}
});

test('L50: paid grants Protocol Ascendant; free has no resources so it is never gated', () => {
	const r50 = REWARD_TABLE.find((r) => r.level === 50);
	assert.ok(r50.paid.includes('title:Protocol Ascendant'));
	assert.ok(!r50.free.includes('resources:'));
	assert.ok(r50.free.includes('badge:platinum'));
});

// ---------------------------------------------------------------------------
// grantPassXp
// ---------------------------------------------------------------------------

function captureRaw(t, impl) {
	const calls = [];
	withPatched(t, prisma, {
		$executeRaw: async (strings, ...values) => {
			calls.push({ sql: strings.join('?'), values });
			if (impl) return impl();
			return 1;
		}
	});
	return calls;
}

test('grantPassXp: exactly one $executeRaw per grant, with the event amount, for every PASS_XP event', async (t) => {
	const calls = captureRaw(t);
	for (const [event, amount] of Object.entries(PASS_XP)) {
		calls.length = 0;
		await grantPassXp(42, 9, event);
		assert.equal(calls.length, 1, event);
		const { values } = calls[0];
		assert.equal(values[0], amount, `${event}: first bound value is the amount`);
		assert.equal(values[values.length - 1], 42, `${event}: last bound value is the user id`);
		assert.ok(values.includes(PASS_DAILY_XP_CAP), `${event}: daily cap bound`);
		assert.ok(values.includes(utcDayKey()), `${event}: UTC day key bound`);
		assert.ok(values.includes(PASS_MAX_XP + PASS_XP_PER_LEVEL * PASS_CACHE_BANK_CAP), `${event}: bank ceiling bound`);
		assert.ok(values.includes(PASS_XP_PER_LEVEL), `${event}: xp per level bound`);
	}
});

test('grantPassXp: the amount is a bound parameter, never interpolated into the SQL text', async (t) => {
	const calls = captureRaw(t);
	await grantPassXp(7, 1, 'QUEST_COMPLETE');
	const { sql } = calls[0];
	assert.ok(/UPDATE "User"/.test(sql));
	assert.ok(!/\b200\b/.test(sql) && !/\b800\b/.test(sql), 'no literal amounts/caps in SQL text');
	// atomic: increments the column from itself, never an absolute write of a JS-computed total
	assert.match(sql, /"passXp" = "passXp" \+/);
});

test('grantPassXp: touches only the User table (never GalaxyPlayer) and no other delegate', async (t) => {
	const calls = captureRaw(t);
	const touched = [];
	for (const model of ['galaxyPlayer', 'user', 'passClaim']) {
		const patches = {};
		for (const m of ['findUnique', 'findMany', 'update', 'updateMany', 'upsert', 'create', 'count']) {
			patches[m] = async () => {
				touched.push(`${model}.${m}`);
				return null;
			};
		}
		withPatched(t, prisma[model], patches);
	}
	await grantPassXp(1, 1, 'ATTACK_WON');
	assert.deepEqual(touched, []);
	assert.ok(!/GalaxyPlayer/i.test(calls[0].sql));
});

test('grantPassXp: DB errors are swallowed and logged, never thrown', async (t) => {
	const lines = silenceConsole(t);
	captureRaw(t, () => {
		throw new Error('deadlock detected');
	});
	await assert.doesNotReject(() => grantPassXp(5, 3, 'NEXUS_CAPTURED'));
	assert.equal(lines.error.length, 1);
	const log = JSON.parse(lines.error[0]);
	// The pass event travels as `passEvent` so it cannot clobber the log's own
	// `event` name (which made these errors unsearchable before).
	assert.equal(log.level, 'error');
	assert.equal(log.event, 'battle_pass_xp_error');
	assert.equal(log.passEvent, 'NEXUS_CAPTURED');
	assert.equal(log.message, 'deadlock detected');
	assert.equal(log.userId, 5);
	assert.equal(log.galaxyId, 3);
});

test('grantPassXp: safe fire-and-forget (void) even when the raw call rejects asynchronously', async (t) => {
	silenceConsole(t);
	withPatched(t, prisma, { $executeRaw: () => Promise.reject(new Error('conn lost')) });
	void grantPassXp(1, 1, 'DEFENSE_WON');
	await new Promise((r) => setImmediate(r));
	// reaching here without an unhandledRejection is the assertion
	assert.ok(true);
});

test('grantPassXp: an unknown event is a no-op (no SQL issued)', async (t) => {
	const calls = captureRaw(t);
	await grantPassXp(1, 1, 'NOT_AN_EVENT');
	assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// purchasePaidPass
// ---------------------------------------------------------------------------

function installPurchaseDb(t, users) {
	const updateManyCalls = [];
	const otherWrites = [];
	const match = (u, where) =>
		u.id === where.id &&
		(where.hasPaidPass === undefined || u.hasPaidPass === where.hasPaidPass) &&
		(where.vexPoints?.gte === undefined || u.vexPoints >= where.vexPoints.gte);
	withPatched(t, prisma.user, {
		updateMany: async ({ where, data }) => {
			updateManyCalls.push({ where, data });
			// Single-statement atomicity: check + write with no await between.
			const u = users[where.id];
			if (!u || !match(u, where)) return { count: 0 };
			if (data.hasPaidPass !== undefined) u.hasPaidPass = data.hasPaidPass;
			if (data.vexPoints?.decrement) u.vexPoints -= data.vexPoints.decrement;
			return { count: 1 };
		},
		findUnique: async ({ where }) => (users[where.id] ? { ...users[where.id] } : null),
		update: async (...a) => {
			otherWrites.push(['update', a]);
			return null;
		},
		upsert: async (...a) => {
			otherWrites.push(['upsert', a]);
			return null;
		}
	});
	return { updateManyCalls, otherWrites };
}

test('purchase: one conditional updateMany (hasPaidPass false AND vexPoints >= 1000), decrement 1000', async (t) => {
	const users = { 1: { id: 1, hasPaidPass: false, vexPoints: 1500 } };
	const { updateManyCalls, otherWrites } = installPurchaseDb(t, users);
	assert.equal(await purchasePaidPass(1), null);
	assert.equal(updateManyCalls.length, 1);
	assert.deepEqual(updateManyCalls[0].where, { id: 1, hasPaidPass: false, vexPoints: { gte: 1000 } });
	assert.deepEqual(updateManyCalls[0].data, { hasPaidPass: true, vexPoints: { decrement: 1000 } });
	assert.deepEqual(users[1], { id: 1, hasPaidPass: true, vexPoints: 500 });
	assert.deepEqual(otherWrites, []);
});

test('purchase: exactly 1000 VP succeeds and leaves 0; 999 fails with Not enough Vex Points', async (t) => {
	const users = {
		1: { id: 1, hasPaidPass: false, vexPoints: 1000 },
		2: { id: 2, hasPaidPass: false, vexPoints: 999 }
	};
	installPurchaseDb(t, users);
	assert.equal(await purchasePaidPass(1), null);
	assert.deepEqual(users[1], { id: 1, hasPaidPass: true, vexPoints: 0 });
	assert.equal(await purchasePaidPass(2), 'Not enough Vex Points');
	assert.deepEqual(users[2], { id: 2, hasPaidPass: false, vexPoints: 999 });
});

test('purchase: already owner -> Already purchased, VP untouched (even when rich)', async (t) => {
	const users = { 1: { id: 1, hasPaidPass: true, vexPoints: 5000 } };
	installPurchaseDb(t, users);
	assert.equal(await purchasePaidPass(1), 'Already purchased');
	assert.equal(users[1].vexPoints, 5000);
});

test('purchase: owner with too few VP still reports Already purchased (precedence)', async (t) => {
	const users = { 1: { id: 1, hasPaidPass: true, vexPoints: 0 } };
	installPurchaseDb(t, users);
	assert.equal(await purchasePaidPass(1), 'Already purchased');
});

test('purchase: unknown user -> User not found', async (t) => {
	installPurchaseDb(t, {});
	assert.equal(await purchasePaidPass(99), 'User not found');
});

test('purchase: N parallel purchases charge exactly once', async (t) => {
	const users = { 1: { id: 1, hasPaidPass: false, vexPoints: 5000 } };
	const { updateManyCalls } = installPurchaseDb(t, users);
	const results = await Promise.all(Array.from({ length: 10 }, () => purchasePaidPass(1)));
	assert.equal(results.filter((r) => r === null).length, 1);
	assert.equal(results.filter((r) => r === 'Already purchased').length, 9);
	assert.equal(users[1].vexPoints, 4000, 'charged once');
	assert.equal(updateManyCalls.length, 10);
});

test('purchase: parallel purchases with VP for only one still charge once and never go negative', async (t) => {
	const users = { 1: { id: 1, hasPaidPass: false, vexPoints: 1000 } };
	installPurchaseDb(t, users);
	const results = await Promise.all([purchasePaidPass(1), purchasePaidPass(1), purchasePaidPass(1)]);
	assert.equal(results.filter((r) => r === null).length, 1);
	assert.equal(users[1].vexPoints, 0);
});

// ---------------------------------------------------------------------------
// giftPaidPass
// ---------------------------------------------------------------------------

function installGiftDb(t, users, opts = {}) {
	const state = { users, purchases: [], pushes: 0 };
	const log = { txOpened: 0, shopInTx: [], galaxyTouched: false };
	let inTx = false;

	const snap = () => structuredClone({ users: state.users, purchases: state.purchases });

	const userDelegate = {
		findUnique: async ({ where }) => {
			const u = state.users[where.id];
			return u ? { ...u } : null;
		},
		findFirst: async ({ where }) => {
			const needle = where.username.equals.toLowerCase();
			const u = Object.values(state.users).find((x) => x.username.toLowerCase() === needle);
			return u ? { id: u.id, username: u.username } : null;
		},
		updateMany: async ({ where, data }) => {
			const u = state.users[where.id];
			if (!u) return { count: 0 };
			if (where.vexPoints?.gte !== undefined && u.vexPoints < where.vexPoints.gte) return { count: 0 };
			if (where.hasPaidPass !== undefined && u.hasPaidPass !== where.hasPaidPass) return { count: 0 };
			if (data.hasPaidPass !== undefined) u.hasPaidPass = data.hasPaidPass;
			if (data.vexPoints?.decrement) u.vexPoints -= data.vexPoints.decrement;
			return { count: 1 };
		}
	};
	const shopPurchase = {
		create: async ({ data }) => {
			log.shopInTx.push(inTx);
			if (opts.shopCreateFails) throw new Error('ledger insert failed');
			state.purchases.push(data);
			return data;
		}
	};

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			log.txOpened++;
			const before = snap();
			inTx = true;
			try {
				return await fn({ user: userDelegate, shopPurchase });
			} catch (err) {
				state.users = before.users;
				state.purchases = before.purchases;
				throw err;
			} finally {
				inTx = false;
			}
		}
	});
	withPatched(t, prisma.user, userDelegate);
	withPatched(t, prisma.shopPurchase, shopPurchase);
	withPatched(t, prisma.pushSubscription, { findMany: async () => [] });
	withPatched(t, prisma.galaxyPlayer, {
		findUnique: async () => {
			log.galaxyTouched = true;
			return null;
		},
		findFirst: async () => {
			log.galaxyTouched = true;
			return null;
		},
		findMany: async () => {
			log.galaxyTouched = true;
			return [];
		}
	});
	return { state, log };
}

const gifterRow = (over = {}) => ({ id: 1, username: 'Gifter', vexPoints: 2500, hasPaidPass: false, ...over });
const recipientRow = (over = {}) => ({ id: 2, username: 'Friend', vexPoints: 0, hasPaidPass: false, ...over });

test('gift: moves 1000 VP off the gifter, unlocks the recipient, case-insensitive username', async (t) => {
	silenceConsole(t);
	const { state, log } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	const r = await giftPaidPass(1, 'fRiEnD', 'battle_pass');
	assert.deepEqual(r, { ok: true, recipientUsername: 'Friend' });
	assert.equal(state.users[1].vexPoints, 1500);
	assert.equal(state.users[2].hasPaidPass, true);
	assert.equal(state.users[2].vexPoints, 0, 'recipient VP untouched');
	assert.equal(state.users[1].hasPaidPass, false, 'gifter pass state untouched');
	assert.equal(log.txOpened, 1);
	assert.equal(state.purchases.length, 0, 'battle_pass source writes no shop ledger row');
});

test('gift: a gifter who already owns the pass can still gift', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow({ hasPaidPass: true }), 2: recipientRow() });
	assert.equal((await giftPaidPass(1, 'Friend', 'battle_pass')).ok, true);
	assert.equal(state.users[1].hasPaidPass, true);
	assert.equal(state.users[1].vexPoints, 1500);
});

test('gift: no same-galaxy / membership requirement (GalaxyPlayer never consulted)', async (t) => {
	silenceConsole(t);
	const { log } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	assert.equal((await giftPaidPass(1, 'Friend', 'shop')).ok, true);
	assert.equal(log.galaxyTouched, false);
});

test('gift: shop source writes the ShopPurchase ledger row INSIDE the transaction', async (t) => {
	silenceConsole(t);
	const { state, log } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	assert.equal((await giftPaidPass(1, 'Friend', 'shop')).ok, true);
	assert.deepEqual(log.shopInTx, [true]);
	assert.equal(state.purchases.length, 1);
	assert.deepEqual(state.purchases[0], {
		userId: 1,
		itemKey: 'gift_pass',
		itemType: 'gift_pass',
		vpSpent: 1000,
		meta: { recipientId: 2, recipientUsername: 'Friend' }
	});
});

test('gift: recipient already owns the paid track -> 400, gifter decrement ROLLED BACK, no ledger row', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow({ hasPaidPass: true }) });
	for (const source of ['shop', 'battle_pass']) {
		const r = await giftPaidPass(1, 'Friend', source);
		assert.equal(r.ok, false);
		assert.equal(r.status, 400);
		assert.equal(r.error, 'That player already owns the Vex Pass paid track.');
		assert.equal(state.users[1].vexPoints, 2500, `${source}: no VP lost`);
		assert.equal(state.purchases.length, 0, `${source}: no ledger row`);
	}
});

test('gift: not enough VP -> 400 with need/have, nothing changes (999 fails, 1000 passes)', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow({ vexPoints: 999 }), 2: recipientRow() });
	const r = await giftPaidPass(1, 'Friend', 'shop');
	assert.deepEqual(r, { ok: false, status: 400, error: 'Not enough Vex Points (need 1000, have 999)' });
	assert.equal(state.users[2].hasPaidPass, false);
	assert.equal(state.purchases.length, 0);

	state.users[1].vexPoints = 1000;
	assert.equal((await giftPaidPass(1, 'Friend', 'shop')).ok, true);
	assert.equal(state.users[1].vexPoints, 0);
});

test('gift: self-gift rejected (any casing), before any transaction opens', async (t) => {
	const { state, log } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	for (const name of ['Gifter', 'gifter', 'GIFTER']) {
		const r = await giftPaidPass(1, name, 'shop');
		assert.deepEqual(r, { ok: false, status: 400, error: 'You cannot gift a pass to yourself' });
	}
	assert.equal(log.txOpened, 0);
	assert.equal(state.users[1].vexPoints, 2500);
});

test('gift: unknown recipient -> 404 Player not found; unknown gifter -> 404 User not found', async (t) => {
	const { state, log } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	assert.deepEqual(await giftPaidPass(1, 'Nobody', 'shop'), {
		ok: false,
		status: 404,
		error: 'Player not found'
	});
	assert.deepEqual(await giftPaidPass(99, 'Friend', 'shop'), {
		ok: false,
		status: 404,
		error: 'User not found'
	});
	assert.equal(log.txOpened, 0);
	assert.equal(state.users[1].vexPoints, 2500);
});

test('gift: ledger insert failure rolls back BOTH the decrement and the unlock, and the error propagates', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() }, { shopCreateFails: true });
	await assert.rejects(() => giftPaidPass(1, 'Friend', 'shop'), /ledger insert failed/);
	assert.equal(state.users[1].vexPoints, 2500);
	assert.equal(state.users[2].hasPaidPass, false);
});

test('gift: conservation - VP spent equals PASS_COST_VP exactly, one pass created per gift', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow({ vexPoints: 10_000 }), 2: recipientRow() });
	const total = () => Object.values(state.users).reduce((s, u) => s + u.vexPoints, 0);
	const before = total();
	assert.equal((await giftPaidPass(1, 'Friend', 'shop')).ok, true);
	assert.equal(before - total(), PASS_COST_VP, 'VP is destroyed (sunk) exactly once, never credited to the recipient');
	// A second gift to the same player is refused and costs nothing.
	const again = await giftPaidPass(1, 'Friend', 'shop');
	assert.equal(again.ok, false);
	assert.equal(before - total(), PASS_COST_VP);
});

// ---------------------------------------------------------------------------
// Shop gift-pass route
// ---------------------------------------------------------------------------

const shopRouter = (await import('../routes/shop.js')).default;

function shopHandler() {
	const layer = shopRouter.stack.find((l) => l.route && l.route.path === '/gift-pass' && l.route.methods.post);
	assert.ok(layer, 'POST /gift-pass must exist');
	return layer.route.stack[layer.route.stack.length - 1].handle;
}
function makeRes() {
	let status = 200;
	let data;
	const res = {
		status(s) {
			status = s;
			return this;
		},
		json(d) {
			data = d;
			return this;
		}
	};
	return { res, status: () => status, data: () => data };
}

test('shop gift-pass route: validates username, maps results, writes the ledger (shop source)', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	const h = shopHandler();

	for (const bad of [undefined, null, '', 42, {}, ['Friend']]) {
		const out = makeRes();
		await h({ userId: 1, body: { username: bad } }, out.res);
		assert.equal(out.status(), 400, JSON.stringify(bad));
		assert.deepEqual(out.data(), { error: 'Username is required' });
	}
	const noBody = makeRes();
	await h({ userId: 1, body: {} }, noBody.res);
	assert.equal(noBody.status(), 400);

	const self = makeRes();
	await h({ userId: 1, body: { username: 'gifter' } }, self.res);
	assert.equal(self.status(), 400);

	const missing = makeRes();
	await h({ userId: 1, body: { username: 'ghost' } }, missing.res);
	assert.equal(missing.status(), 404);

	const ok = makeRes();
	await h({ userId: 1, body: { username: 'friend' } }, ok.res);
	assert.equal(ok.status(), 200);
	assert.deepEqual(ok.data(), { success: true, recipientUsername: 'Friend' });
	assert.equal(state.purchases.length, 1, 'shop route uses source shop');
	assert.equal(state.users[1].vexPoints, 1500);

	const owned = makeRes();
	await h({ userId: 1, body: { username: 'friend' } }, owned.res);
	assert.equal(owned.status(), 400);
	assert.equal(state.users[1].vexPoints, 1500, 'refused repeat gift is free');
});

test('shop gift-pass route: unexpected failure -> 500 generic body', async (t) => {
	silenceConsole(t);
	installGiftDb(t, { 1: gifterRow(), 2: recipientRow() }, { shopCreateFails: true });
	const out = makeRes();
	await shopHandler()({ userId: 1, body: { username: 'Friend' } }, out.res);
	assert.equal(out.status(), 500);
	assert.deepEqual(out.data(), { error: 'Internal server error' });
});

test('battle-pass /gift and /purchase routes delegate to the same single source of truth', async (t) => {
	silenceConsole(t);
	const { state } = installGiftDb(t, { 1: gifterRow(), 2: recipientRow() });
	const bpRouter = (await import('../routes/battlePass.js')).default;
	const find = (path) =>
		bpRouter.stack.find((l) => l.route && l.route.path === path && l.route.methods.post).route.stack.at(-1).handle;
	const out = makeRes();
	await find('/gift')({ userId: 1, body: { username: 'Friend' } }, out.res);
	assert.equal(out.status(), 200);
	assert.equal(state.purchases.length, 0, 'battle_pass source: no ledger row');

	const bad = makeRes();
	await find('/gift')({ userId: 1, body: {} }, bad.res);
	assert.equal(bad.status(), 400);

	installPurchaseDb(t, { 1: { id: 1, hasPaidPass: false, vexPoints: 10 } });
	const poor = makeRes();
	await find('/purchase')({ userId: 1, body: {} }, poor.res);
	assert.equal(poor.status(), 400);
	assert.deepEqual(poor.data(), { error: 'Not enough Vex Points' });
});

// ---------------------------------------------------------------------------
// Source-level conservation / regression guards
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const battlePassSrc = read('../utils/battlePass.ts');
const passClaimSrc = read('../utils/passClaim.ts');

/** Extract the balanced-paren argument text of every `needle(` call in src. */
function callArgs(src, needle) {
	const out = [];
	let from = 0;
	for (;;) {
		const i = src.indexOf(needle, from);
		if (i === -1) return out;
		let depth = 0;
		let j = src.indexOf('(', i);
		const start = j;
		for (; j < src.length; j++) {
			if (src[j] === '(') depth++;
			else if (src[j] === ')' && --depth === 0) break;
		}
		out.push(src.slice(start + 1, j));
		from = j;
	}
}

test('source guard: pass logic reads/writes only joinedAt/nexusGroups on GalaxyPlayer (no per-galaxy pass state)', () => {
	const legacy = /\b(seasonXp|passLevel|hasPaidPass|passTitle|claimedLevels)\b/;
	let calls = 0;
	for (const [name, src] of [
		['battlePass.ts', battlePassSrc],
		['passClaim.ts', passClaimSrc]
	]) {
		for (const method of ['findUnique', 'findFirst', 'findMany', 'update', 'updateMany', 'upsert', 'create']) {
			for (const args of callArgs(src, `galaxyPlayer.${method}`)) {
				calls++;
				assert.ok(!legacy.test(args), `${name}: galaxyPlayer.${method}(${args.replace(/\s+/g, ' ')})`);
			}
		}
	}
	assert.ok(calls >= 3, 'the guard actually found the GalaxyPlayer calls it is meant to police');
});

test('source guard: raw SQL in the pass modules only mentions GalaxyPlayer for the boost row lock', () => {
	for (const [name, src] of [
		['battlePass.ts', battlePassSrc],
		['passClaim.ts', passClaimSrc]
	]) {
		const hits = [...src.matchAll(/"GalaxyPlayer"[^\n]*/g)].map((m) => m[0]);
		for (const h of hits) assert.match(h, /FOR UPDATE/, `${name}: ${h}`);
	}
	const start = battlePassSrc.indexOf('export async function grantPassXp');
	const end = battlePassSrc.indexOf('// Returns the active production boost pct');
	const grantFn = battlePassSrc.slice(start, end);
	assert.ok(grantFn.length > 200 && !/galaxyPlayer|GalaxyPlayer/.test(grantFn));
});

test('source guard: pass state is held on User and PassClaim only (prisma.user / passClaim usage)', () => {
	assert.match(passClaimSrc, /tx\.passClaim\.create/);
	assert.match(passClaimSrc, /data:\s*{\s*userId,\s*level:\s*claimLevel,\s*track,/);
	// VP is only ever credited with an atomic increment, never a read-modify-write set.
	assert.match(passClaimSrc, /vexPoints\s*=\s*{\s*increment:/);
	assert.ok(!/vexPoints:\s*(user|existing)\.vexPoints\s*[+-]/.test(passClaimSrc));
	// Purchase / gift VP changes are conditional decrements.
	assert.match(battlePassSrc, /vexPoints:\s*{\s*decrement:\s*PASS_COST_VP\s*}/);
	assert.match(battlePassSrc, /vexPoints:\s*{\s*gte:\s*PASS_COST_VP\s*}/);
});

test('source guard: claim rows are inserted before any reward write inside claimPassReward', () => {
	const create = passClaimSrc.indexOf('tx.passClaim.create');
	for (const marker of ['tx.user.update', 'tx.milestoneToken.createMany', 'tx.galaxyPlayer.update', 'atomicUpdateNexusResources(']) {
		const at = passClaimSrc.indexOf(marker);
		assert.ok(at > create, `${marker} must come after the claim-row insert`);
	}
});

test('source guard: no em dashes in the new pass modules or tests', () => {
	for (const [name, src] of [
		['passClaim.ts', passClaimSrc],
		['vexpass-economy.test.js', read('./vexpass-economy.test.js')],
		['vexpass-claim.test.js', read('./vexpass-claim.test.js')]
	]) {
		assert.ok(!src.includes(String.fromCharCode(8212)), `${name} contains an em dash`);
	}
});
