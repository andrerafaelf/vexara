/**
 * Permanent Vex Pass: claim engine tests (server/utils/passClaim.ts), state
 * snapshot (getPassState) and the battle-pass claim routes.
 *
 * Same prisma-monkey-patch harness as the rest of server/test/: an in-memory
 * fake of just the delegates the claim path touches, no real DB. The fake
 * $transaction snapshots state and restores it when the callback throws, so
 * "full rollback" assertions are real (deep-equal against the pre-claim state).
 *
 * Rules asserted here (approved Vex Pass design):
 *  - claim of level L takes every still-available track (free, paid back-fill)
 *  - claim-before-process: a P2002 on the PassClaim insert = 'Already claimed'
 *    and NO reward write happens
 *  - Rule B pacing, Rule A storage fit, optimistic nexus conflict, caches,
 *    titles (PASS_TITLE_RANK), getPassState shape
 */

import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const bp = await import('../utils/battlePass.js');
const pc = await import('../utils/passClaim.js');
const { getMaxStorage } = await import('../utils/economy.js');
const { getPopulationMax } = await import('../utils/population.js');

const { claimPassReward, getPassState, pacingAllowance, pacingUnlocksAt } = pc;
const {
	REWARD_TABLE,
	PASS_CACHE_REWARD,
	PASS_CLAIM_WASTE_TOLERANCE,
	PASS_TITLE_RANK,
	passLevelForXp,
	cachesEarnedForXp,
	utcDayKey
} = bp;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// installWorld() runs several times inside one test, so each (target, key) pair
// remembers its TRUE original once and every cleanup restores that, regardless of
// the order the after-hooks run in.
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

function p2002() {
	const e = new Error('Unique constraint failed');
	e.code = 'P2002';
	return e;
}

const REWARD_CALLS = [
	'user.update',
	'token.createMany',
	'galaxyPlayer.update',
	'nexus.updateMany'
];

/**
 * Build the in-memory world and install it onto the prisma singleton.
 * `opts.failCreateOn(track)` returns true to make the insert throw P2002.
 * `opts.concurrentNexusWrite` bumps nexus.lastResourceUpdate right before the
 * CAS compare, simulating another request committing first.
 */
function installWorld(t, over = {}) {
	const now = Date.now();
	const state = {
		user: {
			id: 1,
			passXp: 10000,
			hasPaidPass: false,
			passTitle: null,
			earnedTitles: [],
			earnedBadges: [],
			vexPoints: 0,
			...(over.user ?? {})
		},
		claims: [...(over.claims ?? [])],
		nexus: {
			id: 5,
			ownerId: 1,
			galaxyId: 9,
			name: 'Alpha',
			nexusType: null,
			nexusTypeDoubled: false,
			// Zero-level producers: production is exactly 0, so "free storage" is
			// deterministic regardless of wall-clock drift during a test.
			biomassFarm: 0,
			alloyForge: 0,
			oreExtractor: 0,
			storageVault: 12,
			biomass: 0,
			alloy: 0,
			ore: 0,
			lastResourceUpdate: new Date(now - 60_000),
			buildQueue: [],
			trainingQueue: [],
			lifeSupport: 1,
			populationMax: getPopulationMax(1),
			populationCurrent: 0,
			...(over.nexus ?? {})
		},
		galaxy: {
			id: 9,
			startsAt: null,
			createdAt: new Date(now - 100 * DAY),
			speedMultiplier: 1,
			...(over.galaxy ?? {})
		},
		player: {
			joinedAt: new Date(now - 100 * DAY),
			nexusGroups: [],
			...(over.player ?? {})
		},
		tokens: []
	};
	const calls = [];
	const hooks = { createError: null, failCreateOn: over.failCreateOn ?? null, concurrentNexusWrite: !!over.concurrentNexusWrite };

	const snap = () =>
		structuredClone({
			user: state.user,
			claims: state.claims,
			nexus: state.nexus,
			player: state.player,
			tokens: state.tokens
		});
	const restore = (s) => {
		state.user = s.user;
		state.claims = s.claims;
		state.nexus = s.nexus;
		state.player = s.player;
		state.tokens = s.tokens;
	};

	const db = {
		$queryRaw: async () => {
			calls.push('queryRaw');
			return [];
		},
		user: {
			findUnique: async () => structuredClone(state.user),
			update: async ({ data }) => {
				calls.push('user.update');
				for (const [k, v] of Object.entries(data)) {
					if (v && typeof v === 'object' && 'increment' in v) state.user[k] += v.increment;
					else state.user[k] = v;
				}
				return structuredClone(state.user);
			}
		},
		passClaim: {
			findMany: async ({ where }) =>
				state.claims
					.filter((c) => c.userId === where.userId && (where.level == null || c.level === where.level))
					.map((c) => ({ level: c.level, track: c.track })),
			count: async ({ where }) =>
				state.claims.filter((c) => c.userId === where.userId && c.track === where.track).length,
			create: async ({ data }) => {
				calls.push(`passClaim.create:${data.track}`);
				if (hooks.createError) throw hooks.createError;
				if (hooks.failCreateOn && hooks.failCreateOn(data.track)) throw p2002();
				if (state.claims.some((c) => c.userId === data.userId && c.level === data.level && c.track === data.track)) {
					throw p2002();
				}
				state.claims.push({ userId: data.userId, level: data.level, track: data.track });
				return data;
			}
		},
		milestoneToken: {
			createMany: async ({ data }) => {
				calls.push('token.createMany');
				state.tokens.push(...data);
				return { count: data.length };
			}
		},
		galaxy: { findUnique: async () => structuredClone(state.galaxy) },
		galaxyPlayer: {
			findUnique: async () => (state.player ? structuredClone(state.player) : null),
			update: async ({ data }) => {
				calls.push('galaxyPlayer.update');
				state.player.nexusGroups = data.nexusGroups;
				return structuredClone(state.player);
			}
		},
		nexus: {
			findFirst: async ({ where }) =>
				where.id === state.nexus.id && where.ownerId === state.nexus.ownerId && where.galaxyId === state.nexus.galaxyId
					? structuredClone(state.nexus)
					: null,
			findUniqueOrThrow: async () => structuredClone(state.nexus),
			update: async ({ data }) => {
				calls.push('nexus.update');
				Object.assign(state.nexus, data);
				return structuredClone(state.nexus);
			},
			updateMany: async ({ where, data }) => {
				calls.push('nexus.updateMany');
				if (hooks.concurrentNexusWrite) {
					state.nexus.lastResourceUpdate = new Date(state.nexus.lastResourceUpdate.getTime() + 1000);
				}
				if (state.nexus.lastResourceUpdate.getTime() !== where.lastResourceUpdate.getTime()) {
					return { count: 0 };
				}
				const { lastActivityAt: _a, ...rest } = data;
				Object.assign(state.nexus, rest);
				return { count: 1 };
			}
		}
	};

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const before = snap();
			try {
				return await fn(db);
			} catch (err) {
				restore(before);
				throw err;
			}
		}
	});
	withPatched(t, prisma.nexus, db.nexus);
	withPatched(t, prisma.user, db.user);
	withPatched(t, prisma.passClaim, db.passClaim);
	withPatched(t, prisma.milestoneToken, db.milestoneToken);
	withPatched(t, prisma.galaxy, db.galaxy);
	withPatched(t, prisma.galaxyPlayer, db.galaxyPlayer);

	return { state, calls, hooks, snap, maxStorage: () => getMaxStorage(state.nexus) };
}

const CTX = { userId: 1, galaxyId: 9, galaxyStatus: 'active', nexusId: 5 };
const claimLevel = (level) => claimPassReward(CTX, { kind: 'level', level });
const claimCache = () => claimPassReward(CTX, { kind: 'cache' });

function parseVp(str) {
	return (str ?? '')
		.split(',')
		.filter((p) => p.startsWith('vexpoints:'))
		.reduce((s, p) => s + Number(p.split(':')[1]), 0);
}
const row = (level) => REWARD_TABLE.find((r) => r.level === level);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('passLevelForXp: level = min(50, floor(xp/200)), clamps negatives', () => {
	assert.equal(passLevelForXp(-500), 0);
	assert.equal(passLevelForXp(0), 0);
	assert.equal(passLevelForXp(199), 0);
	assert.equal(passLevelForXp(200), 1);
	assert.equal(passLevelForXp(9999), 49);
	assert.equal(passLevelForXp(10000), 50);
	assert.equal(passLevelForXp(1_000_000), 50);
});

test('cachesEarnedForXp: max(0, floor((xp-10000)/200))', () => {
	assert.equal(cachesEarnedForXp(0), 0);
	assert.equal(cachesEarnedForXp(9999), 0);
	assert.equal(cachesEarnedForXp(10000), 0);
	assert.equal(cachesEarnedForXp(10199), 0);
	assert.equal(cachesEarnedForXp(10200), 1);
	assert.equal(cachesEarnedForXp(12000), 10);
});

test('pacingAllowance: exact at every 6h boundary (1x), one ms before is one level lower', () => {
	const anchor = new Date(1_700_000_000_000);
	assert.equal(pacingAllowance(anchor, 1, anchor.getTime()), 10);
	for (let k = 1; k <= 40; k++) {
		const at = anchor.getTime() + k * 6 * HOUR;
		assert.equal(pacingAllowance(anchor, 1, at), 10 + k, `k=${k}`);
		assert.equal(pacingAllowance(anchor, 1, at - 1), 10 + k - 1, `k=${k} minus 1ms`);
	}
	// A clock before the anchor never yields less than the base.
	assert.equal(pacingAllowance(anchor, 1, anchor.getTime() - DAY), 10);
});

test('pacingAllowance: 2x speed doubles the rate (3h per level)', () => {
	const anchor = new Date(1_700_000_000_000);
	for (let k = 1; k <= 40; k++) {
		const at = anchor.getTime() + k * 3 * HOUR;
		assert.equal(pacingAllowance(anchor, 2, at), 10 + k, `k=${k}`);
		assert.equal(pacingAllowance(anchor, 2, at - 1), 10 + k - 1, `k=${k} minus 1ms`);
	}
});

test('pacingUnlocksAt: anchor + (L-10)*6h/speed, base levels unlock at the anchor', () => {
	const anchor = new Date(1_700_000_000_000);
	assert.equal(pacingUnlocksAt(anchor, 1, 10).getTime(), anchor.getTime());
	assert.equal(pacingUnlocksAt(anchor, 1, 3).getTime(), anchor.getTime());
	assert.equal(pacingUnlocksAt(anchor, 1, 15).getTime(), anchor.getTime() + 5 * 6 * HOUR);
	assert.equal(pacingUnlocksAt(anchor, 2, 15).getTime(), anchor.getTime() + 5 * 3 * HOUR);
	assert.equal(pacingUnlocksAt(anchor, 1, 50).getTime(), anchor.getTime() + 240 * HOUR);
	assert.equal(pacingUnlocksAt(anchor, 2, 50).getTime(), anchor.getTime() + 120 * HOUR);
	// unlockAt and allowance agree: allowance at unlock time >= L, 1ms earlier < L.
	for (const speed of [1, 2, 3]) {
		for (let L = 11; L <= 50; L++) {
			const at = pacingUnlocksAt(anchor, speed, L).getTime();
			assert.ok(pacingAllowance(anchor, speed, at) >= L, `speed ${speed} L${L} at unlock`);
			assert.ok(pacingAllowance(anchor, speed, at - 1) < L, `speed ${speed} L${L} before unlock`);
		}
	}
});

test('honest-player invariant: fastest possible level never exceeds the pacing allowance (D 0..14, 1x)', () => {
	const anchor = new Date(1_700_000_000_000);
	for (let D = 0; D <= 14; D++) {
		const fastestLevel = passLevelForXp(800 * D); // 800 XP/day cap, banked at day boundaries
		const allowance = pacingAllowance(anchor, 1, anchor.getTime() + D * DAY);
		assert.equal(fastestLevel, Math.min(50, Math.floor((800 * D) / 200)), `D=${D}`);
		assert.ok(fastestLevel <= allowance, `D=${D}: level ${fastestLevel} > allowance ${allowance}`);
	}
	// Hour-by-hour with continuous accrual (strictly more generous than real play).
	for (let h = 0; h <= 14 * 24; h++) {
		const xp = Math.floor((800 * h) / 24);
		const level = passLevelForXp(xp);
		const allowance = pacingAllowance(anchor, 1, anchor.getTime() + h * HOUR);
		assert.ok(level <= allowance, `h=${h}: level ${level} > allowance ${allowance}`);
	}
	// Same invariant on a 2x galaxy: XP cap is per real UTC day but allowance
	// scales with speed, so it is only looser.
	for (let D = 0; D <= 14; D++) {
		assert.ok(passLevelForXp(800 * D) <= pacingAllowance(anchor, 2, anchor.getTime() + D * DAY));
	}
});

// ---------------------------------------------------------------------------
// Claim preconditions
// ---------------------------------------------------------------------------

test('claim refuses without an active galaxy', async (t) => {
	installWorld(t);
	const none = await claimPassReward({ ...CTX, galaxyId: null }, { kind: 'level', level: 1 });
	assert.deepEqual([none.ok, none.status, none.error], [false, 409, 'No active galaxy']);
	const ended = await claimPassReward({ ...CTX, galaxyStatus: 'ended' }, { kind: 'level', level: 1 });
	assert.deepEqual([ended.ok, ended.status, ended.error], [false, 409, 'No active galaxy']);
	const cache = await claimPassReward({ ...CTX, galaxyStatus: null }, { kind: 'cache' });
	assert.equal(cache.error, 'No active galaxy');
});

test('claim rejects out-of-range levels and nexuses the user does not own', async (t) => {
	const w = installWorld(t);
	const before = w.snap();
	for (const level of [0, -1, 51, 99, 1000]) {
		const r = await claimLevel(level);
		assert.deepEqual([r.ok, r.status, r.error], [false, 400, 'Invalid level'], `level ${level}`);
	}
	const foreign = await claimPassReward({ ...CTX, nexusId: 777 }, { kind: 'level', level: 1 });
	assert.deepEqual([foreign.ok, foreign.status, foreign.error], [false, 400, 'Nexus not found']);
	const otherGalaxy = await claimPassReward({ ...CTX, galaxyId: 10 }, { kind: 'level', level: 1 });
	assert.equal(otherGalaxy.error, 'Nexus not found');
	assert.deepEqual(w.snap(), before);
});

test('level not yet reached: L > floor(passXp/200) is refused, boundary L == level passes', async (t) => {
	const w = installWorld(t, { user: { passXp: 999 } }); // level 4
	const before = w.snap();
	const r5 = await claimLevel(5);
	assert.deepEqual([r5.ok, r5.status, r5.error], [false, 400, 'Level not yet reached']);
	assert.deepEqual(w.snap(), before, 'refusal writes nothing');
	const r4 = await claimLevel(4);
	assert.equal(r4.ok, true);

	const w2 = installWorld(t, { user: { passXp: 9999 } }); // level 49
	const r50 = await claimLevel(50);
	assert.equal(r50.error, 'Level not yet reached');
	assert.equal(w2.state.claims.length, 0);
});

test('free claim: free-only user gets the free track, resources land on the nexus, VP credited', async (t) => {
	const w = installWorld(t, { user: { passXp: 1000, vexPoints: 7 } });
	const r = await claimLevel(5); // free: resources:1500x3 + vexpoints:10
	assert.equal(r.ok, true);
	assert.equal(r.level, 5);
	assert.deepEqual(r.tracks, ['free']);
	assert.deepEqual(r.delivered, { biomass: 1500, alloy: 1500, ore: 1500 });
	assert.deepEqual(r.wasted, { biomass: 0, alloy: 0, ore: 0 });
	assert.equal(w.state.nexus.biomass, 1500);
	assert.equal(w.state.nexus.alloy, 1500);
	assert.equal(w.state.nexus.ore, 1500);
	assert.equal(w.state.user.vexPoints, 17);
	assert.deepEqual(w.state.claims.map((c) => [c.level, c.track]), [[5, 'free']]);
	assert.equal(r.nexus.biomass, 1500, 'result carries the post-credit nexus for the realtime push');
});

test('paid user claim takes BOTH tracks in one claim; resources only from free half', async (t) => {
	const w = installWorld(t, { user: { passXp: 1000, hasPaidPass: true } });
	const r = await claimLevel(5); // free res+10vp, paid 10vp
	assert.equal(r.ok, true);
	assert.deepEqual(r.tracks, ['free', 'paid']);
	assert.equal(w.state.user.vexPoints, 20);
	assert.equal(w.state.nexus.biomass, 1500);
	assert.deepEqual(
		w.state.claims.map((c) => c.track).sort(),
		['free', 'paid']
	);
});

test('paid back-fill: level claimed free-only before buying keeps its paid half claimable', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 3000, hasPaidPass: true, vexPoints: 0 },
		claims: [{ userId: 1, level: 3, track: 'free' }]
	});
	const r = await claimLevel(3); // paid: vexpoints:10
	assert.equal(r.ok, true);
	assert.deepEqual(r.tracks, ['paid']);
	assert.equal(w.state.user.vexPoints, 10);
	assert.deepEqual(r.delivered, { biomass: 0, alloy: 0, ore: 0 });
	assert.equal(w.state.nexus.biomass, 0, 'no resources in a paid-only claim');
	const again = await claimLevel(3);
	assert.equal(again.error, 'Already claimed');
	assert.equal(w.state.user.vexPoints, 10, 'second claim pays nothing');
});

test("nothing left -> 'Already claimed' (free-only owner of free, paid owner of both)", async (t) => {
	const a = installWorld(t, {
		user: { passXp: 2000 },
		claims: [{ userId: 1, level: 2, track: 'free' }]
	});
	const beforeA = a.snap();
	const ra = await claimLevel(2);
	assert.deepEqual([ra.ok, ra.status, ra.error], [false, 400, 'Already claimed']);
	assert.deepEqual(a.snap(), beforeA);

	const b = installWorld(t, {
		user: { passXp: 2000, hasPaidPass: true },
		claims: [
			{ userId: 1, level: 2, track: 'free' },
			{ userId: 1, level: 2, track: 'paid' }
		]
	});
	const beforeB = b.snap();
	const rb = await claimLevel(2);
	assert.equal(rb.error, 'Already claimed');
	assert.deepEqual(b.snap(), beforeB);
});

test('a paid claim that exists does not block an unclaimed free half (tracks are independent)', async (t) => {
	// Gifted-then-claimed edge: paid row present, free missing.
	const w = installWorld(t, {
		user: { passXp: 2000, hasPaidPass: true },
		claims: [{ userId: 1, level: 2, track: 'paid' }]
	});
	const r = await claimLevel(2);
	assert.equal(r.ok, true);
	assert.deepEqual(r.tracks, ['free']);
	assert.equal(w.state.claims.length, 2);
});

test('claiming a level never touches other levels (no cross-level leakage)', async (t) => {
	const w = installWorld(t, { user: { passXp: 4000, hasPaidPass: true } });
	await claimLevel(7);
	assert.ok(w.state.claims.every((c) => c.level === 7));
});

// ---------------------------------------------------------------------------
// Claim-before-process
// ---------------------------------------------------------------------------

test('P2002 on the PassClaim insert -> Already claimed and NO reward is applied', async (t) => {
	// L20 paid user: free = res + 25vp, paid = 20vp + boost + token. Every reward type in play.
	const w = installWorld(t, {
		user: { passXp: 4000, hasPaidPass: true, vexPoints: 100 },
		failCreateOn: () => true
	});
	const before = w.snap();
	const r = await claimLevel(20);
	assert.deepEqual([r.ok, r.status, r.error], [false, 400, 'Already claimed']);
	assert.deepEqual(w.snap(), before, 'state identical to pre-claim');
	for (const c of REWARD_CALLS) {
		assert.ok(!w.calls.includes(c), `${c} must not run when the claim insert loses the race`);
	}
});

test('P2002 on the SECOND track insert rolls back the first track row and applies no reward', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 4000, hasPaidPass: true, vexPoints: 100 },
		failCreateOn: (track) => track === 'paid'
	});
	const before = w.snap();
	const r = await claimLevel(20);
	assert.equal(r.error, 'Already claimed');
	assert.deepEqual(w.snap(), before, 'free row rolled back too');
	assert.equal(w.state.claims.length, 0);
	for (const c of REWARD_CALLS) assert.ok(!w.calls.includes(c), c);
});

test('P2002 on a cache insert also maps to Already claimed with no writes', async (t) => {
	const w = installWorld(t, { user: { passXp: 10200 }, failCreateOn: () => true });
	const before = w.snap();
	const r = await claimCache();
	assert.equal(r.error, 'Already claimed');
	assert.deepEqual(w.snap(), before);
	for (const c of REWARD_CALLS) assert.ok(!w.calls.includes(c), c);
});

test('non-P2002 insert errors propagate (not swallowed as Already claimed)', async (t) => {
	const w = installWorld(t, { user: { passXp: 1000 } });
	w.hooks.createError = new Error('connection reset');
	await assert.rejects(() => claimLevel(5), /connection reset/);
	assert.equal(w.state.user.vexPoints, 0);
});

test('double-submit race: second concurrent-looking claim sees the row and yields Already claimed, VP paid once', async (t) => {
	const w = installWorld(t, { user: { passXp: 1000 } });
	const first = await claimLevel(5);
	const second = await claimLevel(5);
	assert.equal(first.ok, true);
	assert.equal(second.error, 'Already claimed');
	assert.equal(w.state.user.vexPoints, 10);
	assert.equal(w.state.nexus.biomass, 1500);
});

// ---------------------------------------------------------------------------
// Rule B: pacing
// ---------------------------------------------------------------------------

test('pacing: levels <= 10 claimable on a brand-new join; level 11+ refused with reason pacing', async (t) => {
	const now = Date.now();
	const w = installWorld(t, {
		user: { passXp: 6000 },
		player: { joinedAt: new Date(now - 5000) },
		galaxy: { createdAt: new Date(now - 100 * DAY) }
	});
	const ok = await claimLevel(10);
	assert.equal(ok.ok, true);
	const before = w.snap();
	const r = await claimLevel(11);
	assert.equal(r.ok, false);
	assert.equal(r.status, 400);
	assert.equal(r.reason, 'pacing');
	assert.equal(typeof r.unlocksAt, 'string');
	assert.deepEqual(w.snap(), before, 'a pacing refusal writes nothing');
});

test('pacing: anchor is the LATER of joinedAt and galaxy startsAt ?? createdAt', async (t) => {
	const now = Date.now();
	// joined long ago, galaxy started 1 day (+5s) ago -> anchor = startsAt
	const startsAt = new Date(now - DAY - 5000);
	installWorld(t, {
		user: { passXp: 6000 },
		player: { joinedAt: new Date(now - 100 * DAY) },
		galaxy: { startsAt, createdAt: new Date(now - 100 * DAY) }
	});
	assert.equal((await claimLevel(14)).ok, true, 'allowance 14 -> L14 ok');
	const r15 = await claimLevel(15);
	assert.equal(r15.reason, 'pacing');
	assert.equal(r15.unlocksAt, new Date(startsAt.getTime() + 5 * 6 * HOUR).toISOString());
});

test('pacing: startsAt null falls back to createdAt; joinedAt later than galaxy start wins', async (t) => {
	const now = Date.now();
	const joinedAt = new Date(now - 2 * DAY - 5000);
	installWorld(t, {
		user: { passXp: 6000 },
		player: { joinedAt },
		galaxy: { startsAt: null, createdAt: new Date(now - 300 * DAY) }
	});
	assert.equal((await claimLevel(18)).ok, true, 'allowance 18');
	const r = await claimLevel(19);
	assert.equal(r.reason, 'pacing');
	assert.equal(r.unlocksAt, new Date(joinedAt.getTime() + 9 * 6 * HOUR).toISOString());
});

test('pacing boundary (1x): exactly at the allowance passes, one level above is refused', async (t) => {
	const now = Date.now();
	// 6h*k + 5s ago -> allowance exactly 10 + k (5s of slack >> test jitter, << 6h)
	for (const k of [1, 7, 20]) {
		const anchor = new Date(now - k * 6 * HOUR - 5000);
		installWorld(t, { user: { passXp: 10000 }, player: { joinedAt: anchor } });
		const L = 10 + k;
		assert.equal((await claimLevel(L)).ok, true, `L${L} at allowance`);
		const next = await claimLevel(L + 1);
		assert.equal(next.reason, 'pacing', `L${L + 1} above allowance`);
		assert.equal(next.unlocksAt, new Date(anchor.getTime() + (L + 1 - 10) * 6 * HOUR).toISOString());
	}
	// 5s short of the boundary -> still the lower allowance
	const shortAnchor = new Date(now - 3 * 6 * HOUR + 5000);
	installWorld(t, { user: { passXp: 10000 }, player: { joinedAt: shortAnchor } });
	assert.equal((await claimLevel(12)).ok, true);
	assert.equal((await claimLevel(13)).reason, 'pacing');
});

test('pacing at 2x galaxy speed: 3h per level', async (t) => {
	const now = Date.now();
	const anchor = new Date(now - 12 * HOUR - 5000); // 0.5 day * 2x = 1 day-equivalent -> allowance 14
	installWorld(t, {
		user: { passXp: 10000 },
		player: { joinedAt: anchor },
		galaxy: { speedMultiplier: 2 }
	});
	assert.equal((await claimLevel(14)).ok, true);
	const r = await claimLevel(15);
	assert.equal(r.reason, 'pacing');
	assert.equal(r.unlocksAt, new Date(anchor.getTime() + (5 * 6 * HOUR) / 2).toISOString());
	// Level 20 at 2x unlocks 30h after anchor.
	const r20 = await claimLevel(20);
	assert.equal(r20.unlocksAt, new Date(anchor.getTime() + 30 * HOUR).toISOString());
});

test('pacing: speedMultiplier <= 0 is treated as 1x (no division by zero / negative time)', async (t) => {
	const now = Date.now();
	for (const bad of [0, -3]) {
		installWorld(t, {
			user: { passXp: 10000 },
			player: { joinedAt: new Date(now - 5000) },
			galaxy: { speedMultiplier: bad }
		});
		const r = await claimLevel(11);
		assert.equal(r.reason, 'pacing', `speed ${bad}`);
		assert.ok(Number.isFinite(Date.parse(r.unlocksAt)), 'unlocksAt is a real date');
	}
});

test('pacing never gates L50, nor paid-only claims', async (t) => {
	const now = Date.now();
	// Brand-new join, max XP.
	const w = installWorld(t, {
		user: { passXp: 10000, hasPaidPass: true },
		player: { joinedAt: new Date(now - 1000) }
	});
	const r50 = await claimLevel(50); // free badge+vp, paid title/vp/token/boost: no resources
	assert.equal(r50.ok, true, 'L50 carries no resources so it is never gated');
	assert.deepEqual(r50.tracks, ['free', 'paid']);
	assert.ok(w.state.claims.length === 2);

	// Paid-only back-fill of a resource-bearing free level: paid half has no resources.
	const w2 = installWorld(t, {
		user: { passXp: 10000, hasPaidPass: true },
		player: { joinedAt: new Date(now - 1000) },
		claims: [{ userId: 1, level: 40, track: 'free' }]
	});
	const r40 = await claimLevel(40);
	assert.equal(r40.ok, true);
	assert.deepEqual(r40.tracks, ['paid']);
	assert.equal(w2.state.user.vexPoints, 30);
});

test('pacing: a free-half claim on a paid account is still gated even though paid half is not', async (t) => {
	const now = Date.now();
	installWorld(t, {
		user: { passXp: 10000, hasPaidPass: true },
		player: { joinedAt: new Date(now - 1000) }
	});
	const r = await claimLevel(30); // free half carries resources
	assert.equal(r.reason, 'pacing');
});

test('pacing: not a galaxy member -> Not a member of this galaxy', async (t) => {
	const w = installWorld(t, { user: { passXp: 1000 } });
	w.state.player = null;
	const r = await claimLevel(3);
	assert.deepEqual([r.ok, r.status, r.error], [false, 400, 'Not a member of this galaxy']);
	assert.equal(w.state.claims.length, 0);
});

test('pacing: user-facing error is stable and names the level', async (t) => {
	const now = Date.now();
	installWorld(t, { user: { passXp: 10000 }, player: { joinedAt: new Date(now - 1000) } });
	const r = await claimLevel(12);
	assert.match(r.error, /^Level 12 unlocks in this galaxy in /);
	assert.match(r.error, /The reward stays claimable\.$/);
});

// ---------------------------------------------------------------------------
// Rule A: storage fit
// ---------------------------------------------------------------------------

/** Set the nexus so that free storage for each resource is exactly `free`. */
function nexusWithFree(max, free) {
	const base = Math.floor(max);
	return {
		biomass: base - free.biomass,
		alloy: base - free.alloy,
		ore: base - free.ore
	};
}

test('storage fit: free storage exactly equals the payload -> delivered in full, wasted 0', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const f = { biomass: 5000, alloy: 5000, ore: 5000 };
	const w = installWorld(t, { user: { passXp: 2400 }, nexus: nexusWithFree(max, f) });
	const r = await claimLevel(11); // L11 free = 5000 each; passXp 2400 is level 12
	assert.equal(r.ok, true);
	assert.deepEqual(r.delivered, { biomass: 5000, alloy: 5000, ore: 5000 });
	assert.deepEqual(r.wasted, { biomass: 0, alloy: 0, ore: 0 });
	assert.equal(w.state.nexus.biomass, Math.floor(max));
});

test('storage fit: payload boundary at exactly 5% waste', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const payload = 5000; // L11 free
	const tol = Math.floor(PASS_CLAIM_WASTE_TOLERANCE * payload); // 250
	assert.equal(tol, 250);

	// free = payload - tol  -> wasted exactly tol (5%): accepted, delivers `free`
	{
		const free = payload - tol;
		const w = installWorld(t, {
			user: { passXp: 2400 },
			nexus: nexusWithFree(max, { biomass: free, alloy: free, ore: free })
		});
		const r = await claimLevel(11);
		assert.equal(r.ok, true, 'exactly 5% waste is accepted');
		assert.deepEqual(r.delivered, { biomass: free, alloy: free, ore: free });
		assert.deepEqual(r.wasted, { biomass: tol, alloy: tol, ore: tol });
		assert.equal(w.state.nexus.biomass, Math.floor(max), 'nexus filled to the cap, never over');
	}
	// free = payload - tol - 1 -> 5% + 1 wasted: refused
	{
		const free = payload - tol - 1;
		const w = installWorld(t, {
			user: { passXp: 2400 },
			nexus: nexusWithFree(max, { biomass: free, alloy: free, ore: free })
		});
		const before = w.snap();
		const r = await claimLevel(11);
		assert.equal(r.ok, false);
		assert.equal(r.status, 400);
		assert.equal(r.reason, 'storage');
		assert.deepEqual(r.needed, { biomass: payload, alloy: payload, ore: payload });
		assert.deepEqual(r.available, { biomass: free, alloy: free, ore: free });
		assert.deepEqual(w.snap(), before);
	}
});

test('storage fit: ANY single resource over tolerance refuses the whole claim', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	for (const bad of ['biomass', 'alloy', 'ore']) {
		const free = { biomass: 9000, alloy: 9000, ore: 9000 };
		free[bad] = 0; // completely full on one resource
		const w = installWorld(t, { user: { passXp: 2400 }, nexus: nexusWithFree(max, free) });
		const before = w.snap();
		const r = await claimLevel(11);
		assert.equal(r.reason, 'storage', bad);
		assert.deepEqual(w.snap(), before, `${bad}: nothing granted`);
	}
});

test('storage refusal grants NOTHING: no VP, titles, badges, tokens, boosts, claim rows (paid L20 and free L40)', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const full = nexusWithFree(max, { biomass: 0, alloy: 0, ore: 0 });

	// L20: free res+25vp, paid 20vp+boost+token
	const a = installWorld(t, { user: { passXp: 4000, hasPaidPass: true, vexPoints: 50 }, nexus: full });
	const beforeA = a.snap();
	const ra = await claimLevel(20);
	assert.equal(ra.reason, 'storage');
	assert.deepEqual(a.snap(), beforeA);
	for (const c of REWARD_CALLS) assert.ok(!a.calls.includes(c), c);
	assert.ok(!a.calls.some((c) => c.startsWith('passClaim.create')), 'claim rows are inserted only after the storage check');

	// L40 free: badge:gold + title:Veteran + 75000s + 35vp
	const b = installWorld(t, { user: { passXp: 8000, vexPoints: 0 }, nexus: full });
	const beforeB = b.snap();
	const rb = await claimLevel(40);
	assert.equal(rb.reason, 'storage');
	assert.deepEqual(b.snap(), beforeB);
	assert.deepEqual(b.state.user.earnedTitles, []);
	assert.deepEqual(b.state.user.earnedBadges, []);
	assert.equal(b.state.user.passTitle, null);
});

test('storage fit: delivered = min(payload, free) per resource, wasted = remainder, mixed free levels', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const free = { biomass: 4900, alloy: 5000, ore: 20000 }; // payload 5000: waste 100 / 0 / 0
	const w = installWorld(t, { user: { passXp: 2400 }, nexus: nexusWithFree(max, free) });
	const r = await claimLevel(11);
	assert.equal(r.ok, true);
	assert.deepEqual(r.delivered, { biomass: 4900, alloy: 5000, ore: 5000 });
	assert.deepEqual(r.wasted, { biomass: 100, alloy: 0, ore: 0 });
	// conservation: delivered + wasted == payload, and the nexus gained exactly delivered
	for (const k of ['biomass', 'alloy', 'ore']) {
		assert.equal(r.delivered[k] + r.wasted[k], 5000, k);
	}
	assert.equal(w.state.nexus.biomass, Math.floor(max) - 4900 + 4900);
	assert.equal(w.state.nexus.ore, Math.floor(max) - 20000 + 5000);
});

test('storage fit: tolerance is floor(5% of payload) per payload size, over a sweep of levels', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const levels = [1, 2, 3, 4, 5, 9, 10, 11, 20, 30, 34, 45, 49];
	for (const L of levels) {
		const match = /resources:(\d+):/.exec(row(L).free);
		const payload = Number(match[1]);
		const tol = Math.floor(PASS_CLAIM_WASTE_TOLERANCE * payload);
		const fits = payload - tol;
		installWorld(t, {
			user: { passXp: 10000 },
			nexus: nexusWithFree(max, { biomass: fits, alloy: fits, ore: fits })
		});
		const r = await claimLevel(L);
		assert.equal(r.ok, true, `L${L} at payload-tol=${fits}`);
		assert.equal(r.wasted.biomass, tol, `L${L} wasted`);
		if (fits > 0) {
			installWorld(t, {
				user: { passXp: 10000 },
				nexus: nexusWithFree(max, { biomass: fits - 1, alloy: fits, ore: fits })
			});
			const bad = await claimLevel(L);
			assert.equal(bad.reason, 'storage', `L${L} one unit short`);
		}
	}
});

test('storage fit uses the Storage Vault level: a small vault cannot take a big cache', async (t) => {
	const w = installWorld(t, { user: { passXp: 10200 }, nexus: { storageVault: 3 } });
	assert.ok(w.maxStorage() < 50_000);
	const before = w.snap();
	const r = await claimCache();
	assert.equal(r.reason, 'storage');
	assert.deepEqual(w.snap(), before);
});

test('storage fit: a nexus holding more than max (e.g. downgraded) has 0 free, never negative', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const w = installWorld(t, {
		user: { passXp: 1000 },
		nexus: { biomass: max * 2, alloy: max * 2, ore: max * 2 }
	});
	const r = await claimLevel(5);
	assert.equal(r.reason, 'storage');
	assert.deepEqual(r.available, { biomass: 0, alloy: 0, ore: 0 });
	void w;
});

test('storage refusal message names the nexus and keeps reward claimable', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	installWorld(t, {
		user: { passXp: 1000 },
		nexus: { name: 'Fort Knox', ...nexusWithFree(max, { biomass: 0, alloy: 0, ore: 0 }) }
	});
	const r = await claimLevel(5);
	assert.match(r.error, /^Fort Knox can't hold this reward\./);
	assert.match(r.error, /The reward stays claimable\.$/);
});

// ---------------------------------------------------------------------------
// Optimistic nexus credit
// ---------------------------------------------------------------------------

test("optimistic nexus conflict -> 409 'Resources changed, please retry' and FULL rollback", async (t) => {
	const w = installWorld(t, {
		user: { passXp: 4000, hasPaidPass: true, vexPoints: 100 },
		concurrentNexusWrite: true
	});
	const before = w.snap();
	// the fake bumps lastResourceUpdate inside the CAS, as a concurrent commit would
	const r = await claimLevel(20);
	assert.deepEqual([r.ok, r.status, r.error], [false, 409, 'Resources changed, please retry']);
	// Rolled back: no claim rows, no VP, no token, no boost; the foreign write
	// to lastResourceUpdate is the only difference (it is the other request's).
	assert.equal(w.state.claims.length, 0);
	assert.equal(w.state.user.vexPoints, 100);
	assert.equal(w.state.tokens.length, 0);
	assert.deepEqual(w.state.player.nexusGroups, []);
	assert.equal(w.state.nexus.biomass, before.nexus.biomass);
	assert.equal(w.state.nexus.alloy, before.nexus.alloy);
	assert.equal(w.state.nexus.ore, before.nexus.ore);
	assert.deepEqual(w.state.user, before.user);
});

test('after a 409 the retry succeeds and pays exactly once', async (t) => {
	const w = installWorld(t, { user: { passXp: 1000 }, concurrentNexusWrite: true });
	assert.equal((await claimLevel(5)).status, 409);
	w.hooks.concurrentNexusWrite = false;
	const r = await claimLevel(5);
	assert.equal(r.ok, true);
	assert.equal(w.state.user.vexPoints, 10);
	assert.equal(w.state.claims.length, 1);
});

test('resource-free claims do not touch the nexus CAS at all (so cannot 409)', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 10000, hasPaidPass: true },
		claims: [{ userId: 1, level: 8, track: 'free' }],
		concurrentNexusWrite: true
	});
	const r = await claimLevel(8); // paid-only: title + vp
	assert.equal(r.ok, true);
	assert.ok(!w.calls.includes('nexus.updateMany'));
	assert.equal(r.nexus, null);
});

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

test('cache: none available below 10200 XP -> No resource cache available', async (t) => {
	for (const xp of [0, 5000, 10000, 10199]) {
		const w = installWorld(t, { user: { passXp: xp } });
		const before = w.snap();
		const r = await claimCache();
		assert.deepEqual([r.ok, r.status, r.error], [false, 400, 'No resource cache available'], `xp ${xp}`);
		assert.deepEqual(w.snap(), before);
	}
});

test('cache reward is exactly resources:50000:50000:50000 for free AND paid users, one track', async (t) => {
	assert.equal(PASS_CACHE_REWARD, 'resources:50000:50000:50000');
	for (const hasPaidPass of [false, true]) {
		const w = installWorld(t, {
			user: { passXp: 10200, hasPaidPass },
			player: { joinedAt: new Date(Date.now() - 11 * DAY) }
		});
		const r = await claimCache();
		assert.equal(r.ok, true, `paid=${hasPaidPass}`);
		assert.equal(r.level, 51);
		assert.deepEqual(r.tracks, ['cache']);
		assert.deepEqual(r.delivered, { biomass: 50000, alloy: 50000, ore: 50000 });
		assert.deepEqual(r.wasted, { biomass: 0, alloy: 0, ore: 0 });
		assert.equal(w.state.nexus.biomass, 50000);
		assert.equal(w.state.user.vexPoints, 0, 'caches carry no VP');
		assert.deepEqual(w.state.claims.map((c) => [c.level, c.track]), [[51, 'cache']]);
	}
});

test('cache: next cache level = 51 + claimed, and claimable = earned - claimed', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 10000 + 200 * 4 },
		claims: [51, 52, 53].map((level) => ({ userId: 1, level, track: 'cache' })),
		player: { joinedAt: new Date(Date.now() - 11 * DAY) }
	});
	const r = await claimCache(); // earned 4, claimed 3 -> 1 left
	assert.equal(r.ok, true);
	assert.equal(r.level, 54);
	const again = await claimCache();
	assert.equal(again.error, 'No resource cache available');
	assert.equal(w.state.claims.filter((c) => c.track === 'cache').length, 4);
});

test('cache claims do not consume or require level-track claims', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 10200 },
		claims: [{ userId: 1, level: 50, track: 'free' }],
		player: { joinedAt: new Date(Date.now() - 11 * DAY) }
	});
	const r = await claimCache();
	assert.equal(r.level, 51);
	assert.equal(w.state.claims.length, 2);
});

test('cache pacing: needs allowance >= 50 (10 days at 1x, 5 days at 2x), unlocksAt = anchor + 240h/speed', async (t) => {
	const now = Date.now();
	// 1x: just short
	{
		const anchor = new Date(now - 240 * HOUR + 5000);
		installWorld(t, { user: { passXp: 10200 }, player: { joinedAt: anchor } });
		const r = await claimCache();
		assert.equal(r.reason, 'pacing');
		assert.equal(r.unlocksAt, new Date(anchor.getTime() + 240 * HOUR).toISOString());
	}
	// 1x: just enough
	{
		const anchor = new Date(now - 240 * HOUR - 5000);
		installWorld(t, { user: { passXp: 10200 }, player: { joinedAt: anchor } });
		assert.equal((await claimCache()).ok, true);
	}
	// 2x: 120h
	{
		const anchor = new Date(now - 120 * HOUR + 5000);
		installWorld(t, { user: { passXp: 10200 }, player: { joinedAt: anchor }, galaxy: { speedMultiplier: 2 } });
		const r = await claimCache();
		assert.equal(r.reason, 'pacing');
		assert.equal(r.unlocksAt, new Date(anchor.getTime() + 120 * HOUR).toISOString());
	}
	{
		const anchor = new Date(now - 120 * HOUR - 5000);
		installWorld(t, { user: { passXp: 10200 }, player: { joinedAt: anchor }, galaxy: { speedMultiplier: 2 } });
		assert.equal((await claimCache()).ok, true);
	}
});

test('cache storage fit: 5% of 50000 = 2500 tolerance, boundary exact', async (t) => {
	const probe = installWorld(t);
	const max = probe.maxStorage();
	const okFree = 47_500;
	installWorld(t, {
		user: { passXp: 10200 },
		nexus: nexusWithFree(max, { biomass: okFree, alloy: okFree, ore: okFree })
	});
	const r = await claimCache();
	assert.equal(r.ok, true);
	assert.deepEqual(r.wasted, { biomass: 2500, alloy: 2500, ore: 2500 });
	assert.deepEqual(r.delivered, { biomass: 47_500, alloy: 47_500, ore: 47_500 });

	const w = installWorld(t, {
		user: { passXp: 10200 },
		nexus: nexusWithFree(max, { biomass: okFree - 1, alloy: okFree, ore: okFree })
	});
	const before = w.snap();
	const bad = await claimCache();
	assert.equal(bad.reason, 'storage');
	assert.deepEqual(w.snap(), before);
});

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

test('L50 paid grants Protocol Ascendant once; passTitle becomes the highest-ranked title', async (t) => {
	const w = installWorld(t, {
		user: {
			passXp: 10000,
			hasPaidPass: true,
			passTitle: 'Vex Commander',
			earnedTitles: ['Conscript', 'Vex Commander']
		}
	});
	const r = await claimLevel(50);
	assert.equal(r.ok, true);
	assert.equal(w.state.user.earnedTitles.filter((x) => x === 'Protocol Ascendant').length, 1);
	assert.deepEqual(w.state.user.earnedTitles, ['Conscript', 'Vex Commander', 'Protocol Ascendant']);
	assert.equal(w.state.user.passTitle, 'Protocol Ascendant');
	assert.equal(w.state.user.vexPoints, 20 + 170);
	assert.equal(w.state.tokens.length, 4, '4 tokens at L50 paid');
	assert.ok(w.state.tokens.every((x) => x.rewardType === 'battle_pass' && x.userId === 1));
	assert.ok(w.state.user.earnedBadges.includes('platinum'));
	assert.equal(w.state.player.nexusGroups.length, 1, 'the +35% boost');
	assert.equal(w.state.player.nexusGroups[0].type, 'production_boost');
	assert.equal(w.state.player.nexusGroups[0].pct, 35);
});

test('a lower title claimed later never downgrades passTitle (back-fill order)', async (t) => {
	const w = installWorld(t, {
		user: {
			passXp: 10000,
			hasPaidPass: true,
			passTitle: 'Protocol Ascendant',
			earnedTitles: ['Protocol Ascendant']
		},
		claims: [{ userId: 1, level: 8, track: 'free' }]
	});
	const r = await claimLevel(8); // paid: title:Operative, vp
	assert.equal(r.ok, true);
	assert.deepEqual(w.state.user.earnedTitles, ['Protocol Ascendant', 'Operative']);
	assert.equal(w.state.user.passTitle, 'Protocol Ascendant');
});

test('free Veteran (L40) outranks a lower held title; ranks order the display title', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 8000, passTitle: 'Operative', earnedTitles: ['Operative'] }
	});
	const r = await claimLevel(40);
	assert.equal(r.ok, true);
	assert.equal(w.state.user.passTitle, 'Veteran');
	assert.deepEqual(w.state.user.earnedTitles, ['Operative', 'Veteran']);
	assert.ok(w.state.user.earnedBadges.includes('gold'));
	// rank table sanity
	assert.ok(PASS_TITLE_RANK.Veteran > PASS_TITLE_RANK.Operative);
	assert.ok(PASS_TITLE_RANK.Veteran < PASS_TITLE_RANK['Vex Commander']);
});

test('title already held: not duplicated in earnedTitles', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 8000, passTitle: 'Veteran', earnedTitles: ['Veteran'], earnedBadges: ['gold'] }
	});
	await claimLevel(40);
	assert.deepEqual(w.state.user.earnedTitles, ['Veteran']);
	assert.deepEqual(w.state.user.earnedBadges, ['gold']);
	assert.equal(w.state.user.passTitle, 'Veteran');
});

test('Season Conqueror does not exist in the table or the rank map', () => {
	assert.ok(!JSON.stringify(REWARD_TABLE).includes('Season Conqueror'));
	assert.ok(!Object.keys(PASS_TITLE_RANK).includes('Season Conqueror'));
});

test('every title in REWARD_TABLE has a rank, and ranks are unique and ascending by prestige', () => {
	const titles = new Set();
	for (const r of REWARD_TABLE) {
		for (const part of `${r.free ?? ''},${r.paid ?? ''}`.split(',')) {
			if (part.startsWith('title:')) titles.add(part.slice('title:'.length));
		}
	}
	for (const name of titles) assert.ok(name in PASS_TITLE_RANK, `${name} missing from PASS_TITLE_RANK`);
	for (const name of Object.keys(PASS_TITLE_RANK)) assert.ok(titles.has(name), `${name} unreachable`);
	const ranks = Object.values(PASS_TITLE_RANK);
	assert.equal(new Set(ranks).size, ranks.length);
	assert.equal(PASS_TITLE_RANK['Protocol Ascendant'], Math.max(...ranks));
});

test('boost reward: appended to nexusGroups with pct and an expiry ~hours ahead; existing groups kept', async (t) => {
	const existing = { type: 'production_boost', pct: 5, expiresAt: '2030-01-01T00:00:00.000Z' };
	const w = installWorld(t, {
		user: { passXp: 600, hasPaidPass: true },
		player: { nexusGroups: [existing] }
	});
	const t0 = Date.now();
	const r = await claimLevel(2); // paid: boost:production:5:12
	assert.equal(r.ok, true);
	assert.equal(w.state.player.nexusGroups.length, 2);
	assert.deepEqual(w.state.player.nexusGroups[0], existing);
	const added = w.state.player.nexusGroups[1];
	assert.equal(added.pct, 5);
	const exp = Date.parse(added.expiresAt);
	assert.ok(exp >= t0 + 12 * HOUR - 1000 && exp <= Date.now() + 12 * HOUR + 1000);
});

// ---------------------------------------------------------------------------
// Conservation sweep over the whole table
// ---------------------------------------------------------------------------

test('conservation: claiming every level 1..50 (paid) pays exactly the table VP, resources, tokens', async (t) => {
	const w = installWorld(t, {
		user: { passXp: 10000, hasPaidPass: true },
		nexus: { storageVault: 40 }
	});
	let expectVp = 0;
	let expectRes = 0;
	let expectTokens = 0;
	for (const r of REWARD_TABLE) {
		expectVp += parseVp(r.free) + parseVp(r.paid);
		for (const part of `${r.free ?? ''},${r.paid ?? ''}`.split(',')) {
			if (part.startsWith('resources:')) expectRes += Number(part.split(':')[1]);
			if (part.startsWith('token:')) expectTokens += Number(part.split(':')[1]);
		}
	}
	let deliveredBiomass = 0;
	let wastedBiomass = 0;
	for (let L = 1; L <= 50; L++) {
		const r = await claimLevel(L);
		assert.equal(r.ok, true, `L${L}: ${r.error}`);
		deliveredBiomass += r.delivered.biomass;
		wastedBiomass += r.wasted.biomass;
	}
	assert.equal(w.state.user.vexPoints, expectVp);
	assert.equal(deliveredBiomass + wastedBiomass, expectRes);
	assert.equal(w.state.nexus.biomass, deliveredBiomass);
	assert.equal(w.state.tokens.length, expectTokens);
	assert.equal(w.state.claims.length, 100);
	// Nothing further to claim.
	for (let L = 1; L <= 50; L++) assert.equal((await claimLevel(L)).error, 'Already claimed');
	assert.equal(w.state.user.vexPoints, expectVp);
});

const tableTokens = () =>
	REWARD_TABLE.reduce(
		(s, r) =>
			s +
			`${r.free ?? ''},${r.paid ?? ''}`
				.split(',')
				.filter((p) => p.startsWith('token:'))
				.reduce((a, p) => a + Number(p.split(':')[1]), 0),
		0
	);

test('table totals: free-track VP is 250 and the free track carries no tokens', () => {
	const freeVp = REWARD_TABLE.reduce((s, r) => s + parseVp(r.free), 0);
	assert.equal(freeVp, 250, 'free VP total');
	assert.ok(REWARD_TABLE.every((r) => !(r.free ?? '').includes('token:')));
});

// The table is authoritative (it is what players see in-game and on the landing
// page); the header comment in battlePass.ts documents these same totals.
test('table totals: current actual paid-track values are pinned (520 VP, 6 tokens) so silent changes are noticed', () => {
	const paidVp = REWARD_TABLE.reduce((s, r) => s + parseVp(r.paid), 0);
	assert.equal(paidVp, 520);
	assert.equal(tableTokens(), 6);
});

// ---------------------------------------------------------------------------
// getPassState
// ---------------------------------------------------------------------------

function installStateWorld(t, { user, claims = [], player, galaxy } = {}) {
	const now = Date.now();
	const u =
		user === null
			? null
			: {
					passXp: 0,
					hasPaidPass: false,
					passTitle: null,
					passXpDay: null,
					passXpDayTotal: 0,
					...(user ?? {})
				};
	const g = { startsAt: null, createdAt: new Date(now - 100 * DAY), speedMultiplier: 1, ...(galaxy ?? {}) };
	const pl = player === null ? null : { joinedAt: new Date(now - 100 * DAY), ...(player ?? {}) };
	withPatched(t, prisma.user, { findUnique: async () => u });
	withPatched(t, prisma.passClaim, { findMany: async () => claims });
	withPatched(t, prisma.galaxy, { findUnique: async () => g });
	withPatched(t, prisma.galaxyPlayer, { findUnique: async () => pl });
}

test('getPassState: unknown user -> null', async (t) => {
	installStateWorld(t, { user: null });
	assert.equal(await getPassState(1, 9, 'active'), null);
});

test('getPassState: full shape incl. legacy fields', async (t) => {
	installStateWorld(t, {
		user: { passXp: 10450, hasPaidPass: true, passTitle: 'Operative', passXpDay: utcDayKey(), passXpDayTotal: 300 },
		claims: [
			{ level: 3, track: 'free' },
			{ level: 1, track: 'free' },
			{ level: 2, track: 'free' },
			{ level: 1, track: 'paid' },
			{ level: 51, track: 'cache' }
		]
	});
	const s = await getPassState(1, 9, 'active');
	assert.equal(s.passXp, 10450);
	assert.equal(s.passLevel, 50);
	assert.equal(s.xpPerLevel, 200);
	assert.equal(s.xpIntoLevel, 0, 'maxed level reports 0 into-level');
	assert.equal(s.hasPaidPass, true);
	assert.equal(s.passTitle, 'Operative');
	assert.deepEqual(s.claimed, { free: [1, 2, 3], paid: [1] });
	assert.deepEqual(s.caches, {
		earned: 2,
		claimed: 1,
		claimable: 1,
		bankCap: 10,
		nextCacheAtXp: 10000 + 3 * 200,
		reward: 'resources:50000:50000:50000'
	});
	assert.deepEqual(s.xp, { today: 300, dailyCap: 800 });
	// legacy
	assert.equal(s.seasonXp, s.passXp);
	assert.deepEqual(s.claimedLevels, s.claimed.free);
	assert.equal(s.seasonEndsAt, null);
});

test('getPassState: xpIntoLevel mid-level; xp.today is 0 when the stored day is stale', async (t) => {
	installStateWorld(t, { user: { passXp: 1234, passXpDay: '2000-01-01', passXpDayTotal: 700 } });
	const s = await getPassState(1, null, null);
	assert.equal(s.passLevel, 6);
	assert.equal(s.xpIntoLevel, 34);
	assert.deepEqual(s.xp, { today: 0, dailyCap: 800 });
});

test('getPassState: pacing is null without an active galaxy (none, ended, or non-member)', async (t) => {
	installStateWorld(t, { user: { passXp: 0 } });
	assert.equal((await getPassState(1, null, null)).pacing, null);
	assert.equal((await getPassState(1, 9, 'ended')).pacing, null);
	assert.equal((await getPassState(1, 9, null)).pacing, null);
	installStateWorld(t, { user: { passXp: 0 }, player: null });
	assert.equal((await getPassState(1, 9, 'active')).pacing, null, 'galaxy active but not a member');
});

test('getPassState: claimableUpToLevel capped at 49, caches unlocked once allowance >= 50', async (t) => {
	installStateWorld(t, { user: { passXp: 0 } });
	const s = await getPassState(1, 9, 'active');
	assert.equal(s.pacing.claimableUpToLevel, 49);
	assert.equal(s.pacing.cachesUnlockAt, null);
	assert.equal(s.pacing.speedMultiplier, 1);
});

test('getPassState: fresh join exposes allowance 10 and the cache unlock moment', async (t) => {
	const joinedAt = new Date(Date.now() - 5000);
	installStateWorld(t, { user: { passXp: 0 }, player: { joinedAt } });
	const s = await getPassState(1, 9, 'active');
	assert.equal(s.pacing.claimableUpToLevel, 10);
	assert.equal(s.pacing.anchor, joinedAt.toISOString());
	assert.equal(s.pacing.cachesUnlockAt, new Date(joinedAt.getTime() + 240 * HOUR).toISOString());
});

test('getPassState: 2x galaxy reports speedMultiplier and halves the cache unlock delay', async (t) => {
	const joinedAt = new Date(Date.now() - 1000);
	installStateWorld(t, { user: { passXp: 0 }, player: { joinedAt }, galaxy: { speedMultiplier: 2 } });
	const s = await getPassState(1, 9, 'active');
	assert.equal(s.pacing.speedMultiplier, 2);
	assert.equal(s.pacing.cachesUnlockAt, new Date(joinedAt.getTime() + 120 * HOUR).toISOString());
});

test('getPassState: nextCacheAtXp is null when the bank is full; claimable capped at the bank cap', async (t) => {
	installStateWorld(t, { user: { passXp: 12000 } }); // earned 10, claimed 0 -> banked 10
	let s = await getPassState(1, null, null);
	assert.equal(s.caches.earned, 10);
	assert.equal(s.caches.claimable, 10);
	assert.equal(s.caches.nextCacheAtXp, null);

	installStateWorld(t, { user: { passXp: 12400 } }); // legacy over-ceiling row: still capped
	s = await getPassState(1, null, null);
	assert.equal(s.caches.claimable, 10);
	assert.equal(s.caches.nextCacheAtXp, null);

	installStateWorld(t, {
		user: { passXp: 12000 },
		claims: [{ level: 51, track: 'cache' }]
	}); // banked 9 -> room again
	s = await getPassState(1, null, null);
	assert.equal(s.caches.claimable, 9);
	assert.equal(s.caches.nextCacheAtXp, 10000 + 11 * 200);
});

test('getPassState: below L50 there are no caches', async (t) => {
	installStateWorld(t, { user: { passXp: 9999 } });
	const s = await getPassState(1, null, null);
	assert.deepEqual([s.passLevel, s.caches.earned, s.caches.claimable], [49, 0, 0]);
	assert.equal(s.caches.nextCacheAtXp, 10200);
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routerMod = await import('../routes/battlePass.js');
const router = routerMod.default;

function routeHandler(method, path) {
	const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
	assert.ok(layer, `${method} ${path} not registered`);
	return layer.route.stack[layer.route.stack.length - 1].handle; // last = the real handler (after auth)
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

const authed = (over = {}) => ({
	userId: 1,
	galaxyId: 9,
	galaxyStatus: 'active',
	params: {},
	body: {},
	...over
});

test('route claim-cache: validates nexusId before touching the claim engine', async (t) => {
	installWorld(t, { user: { passXp: 10200 } });
	const h = routeHandler('post', '/claim-cache');
	for (const bad of [undefined, null, '5', 0, -1, 1.5, NaN, {}, []]) {
		const out = makeRes();
		await h(authed({ body: { nexusId: bad } }), out.res);
		assert.equal(out.status(), 400, JSON.stringify(bad));
		assert.deepEqual(out.data(), { error: 'nexusId is required' });
	}
	const noBody = makeRes();
	await h(authed({ body: undefined }), noBody.res);
	assert.equal(noBody.status(), 400);
});

test('route claim-cache: success shape is {success, level, tracks, delivered, wasted} and nothing else leaks', async (t) => {
	installWorld(t, {
		user: { passXp: 10200 },
		player: { joinedAt: new Date(Date.now() - 11 * DAY) }
	});
	const out = makeRes();
	await routeHandler('post', '/claim-cache')(authed({ body: { nexusId: 5 } }), out.res);
	assert.equal(out.status(), 200);
	assert.deepEqual(Object.keys(out.data()).sort(), ['delivered', 'level', 'success', 'tracks', 'wasted']);
	assert.equal(out.data().success, true);
	assert.equal(out.data().level, 51);
});

test('route claim-cache: refusals strip ok/status from the body and keep reason/unlocksAt/needed/available', async (t) => {
	const now = Date.now();
	installWorld(t, { user: { passXp: 10200 }, player: { joinedAt: new Date(now - 1000) } });
	const pacing = makeRes();
	await routeHandler('post', '/claim-cache')(authed({ body: { nexusId: 5 } }), pacing.res);
	assert.equal(pacing.status(), 400);
	assert.equal(pacing.data().reason, 'pacing');
	assert.ok(pacing.data().unlocksAt);
	assert.ok(!('ok' in pacing.data()) && !('status' in pacing.data()));

	installWorld(t, { user: { passXp: 10200 }, nexus: { storageVault: 3 } });
	const storage = makeRes();
	await routeHandler('post', '/claim-cache')(authed({ body: { nexusId: 5 } }), storage.res);
	assert.equal(storage.data().reason, 'storage');
	assert.deepEqual(storage.data().needed, { biomass: 50000, alloy: 50000, ore: 50000 });
	assert.ok(storage.data().available);

	installWorld(t, { user: { passXp: 10200 }, concurrentNexusWrite: true, player: { joinedAt: new Date(now - 11 * DAY) } });
	const conflict = makeRes();
	await routeHandler('post', '/claim-cache')(authed({ body: { nexusId: 5 } }), conflict.res);
	assert.equal(conflict.status(), 409);
	assert.deepEqual(conflict.data(), { error: 'Resources changed, please retry' });
});

test('route claim-cache: unexpected engine error becomes a 500 without leaking the message', async (t) => {
	installWorld(t, { user: { passXp: 10200 } });
	withPatched(t, prisma.nexus, {
		findFirst: async () => {
			throw new Error('db exploded: secret detail');
		}
	});
	const origErr = console.error;
	console.error = () => {};
	t.after(() => {
		console.error = origErr;
	});
	const out = makeRes();
	await routeHandler('post', '/claim-cache')(authed({ body: { nexusId: 5 } }), out.res);
	assert.equal(out.status(), 500);
	assert.deepEqual(out.data(), { error: 'Internal server error' });
});

test('route claim/:level rejects non-numeric, out-of-range and malformed levels', async (t) => {
	installWorld(t, { user: { passXp: 10000 } });
	const h = routeHandler('post', '/claim/:level');
	for (const raw of ['0', '51', '-3', 'abc', '5.5', '1e1', '', '05x', '9999', ' 5']) {
		const out = makeRes();
		await h(authed({ params: { level: raw }, body: { nexusId: 5 } }), out.res);
		assert.equal(out.status(), 400, `level "${raw}"`);
		assert.deepEqual(out.data(), { error: 'Invalid level' }, `level "${raw}"`);
	}
});

// REGRESSION: the level parser in routes/battlePass.ts was `/^d{1,3}$/` (missing
// backslash), so every numeric level answered 400 Invalid level while all engine
// tests stayed green. These drive the real route handler end to end.
test('route claim/:level: "1", "25", "50" parse and reach the claim engine', async (t) => {
	const h = routeHandler('post', '/claim/:level');
	for (const raw of ['1', '25', '50']) {
		const w = installWorld(t, { user: { passXp: 10000 } });
		const out = makeRes();
		await h(authed({ params: { level: raw }, body: { nexusId: 5 } }), out.res);
		assert.equal(out.status(), 200, `level ${raw}: ${JSON.stringify(out.data())}`);
		assert.equal(out.data().success, true);
		assert.equal(out.data().level, Number(raw));
		assert.deepEqual(w.state.claims.map((c) => c.level), [Number(raw)], 'engine wrote the claim for that level');
	}
});

test('route claim/:level: "0", "51", "abc", "1e1", "ddd", "" -> 400 Invalid level and the engine is never reached', async (t) => {
	const w = installWorld(t, { user: { passXp: 10000 } });
	const h = routeHandler('post', '/claim/:level');
	for (const raw of ['0', '51', 'abc', '1e1', 'ddd', '', 'd', '1234']) {
		const out = makeRes();
		await h(authed({ params: { level: raw }, body: { nexusId: 5 } }), out.res);
		assert.equal(out.status(), 400, `"${raw}"`);
		assert.deepEqual(out.data(), { error: 'Invalid level' }, `"${raw}"`);
	}
	assert.equal(w.state.claims.length, 0);
	assert.deepEqual(w.calls, []);
});

test('route GET /: 404 for an unknown user, state otherwise', async (t) => {
	installStateWorld(t, { user: null });
	const out = makeRes();
	await routeHandler('get', '/')(authed({ galaxyId: undefined, galaxyStatus: null }), out.res);
	assert.equal(out.status(), 404);

	installStateWorld(t, { user: { passXp: 400 } });
	const ok = makeRes();
	await routeHandler('get', '/')(authed({ galaxyId: undefined, galaxyStatus: null }), ok.res);
	assert.equal(ok.status(), 200);
	assert.equal(ok.data().passLevel, 2);
	assert.equal(ok.data().pacing, null);
});
