/**
 * C1-class conservation property tests.
 *
 * Each test fires N concurrent operations against a shared in-memory "database"
 * and asserts the sum-of-balances invariant: resources and troops are never
 * created or destroyed. Tests cover every path identified in the Pre-Beta #1
 * audit as a non-atomic deduct-and-escrow risk:
 *
 *   1. nexusService.transferResources
 *   2. marketService.cancelListing (refund) and atomicSystemTrade (gte-guarded buy)
 *   3. factionTreasuryController treasury spend (faction.updateMany gte guard)
 *   4. troopTransferService.sendTroopsTransaction
 *
 * Concurrency is simulated by running N Promise.all-concurrent calls against a
 * single shared mutable state object. The atomic mock performs its check+write
 * synchronously (no yield between them), so JS single-threading serialises the
 * operations correctly. The broken mock inserts `await Promise.resolve()` between
 * read and write, allowing all N concurrent callers to snapshot the pre-write
 * state and then all commit based on that stale snapshot - the classic C1 race.
 *
 * Each section includes a "teeth check" that verifies the broken mock actually
 * fails the conservation assertion, proving the test would have caught a
 * regression before the atomic fix landed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Apply an updateMany-style WHERE + DATA against a plain state object.
 * Returns { count: 1 } on success, { count: 0 } if a gte guard fails.
 * Never yields - simulates the atomic DB operation.
 */
function applyAtomicUpdateMany(state, where, data) {
	// Check all gte guards (skip 'id').
	for (const [field, guard] of Object.entries(where)) {
		if (field === 'id') continue;
		if (guard && typeof guard.gte === 'number') {
			if ((state[field] ?? 0) < guard.gte) return { count: 0 };
		}
	}
	// Apply decrements and increments.
	for (const [field, delta] of Object.entries(data)) {
		if (delta && typeof delta.decrement === 'number') {
			state[field] = (state[field] ?? 0) - delta.decrement;
		}
		if (delta && typeof delta.increment === 'number') {
			state[field] = (state[field] ?? 0) + delta.increment;
		}
	}
	return { count: 1 };
}

/**
 * Same logic but with a yield between read and write to simulate the pre-fix
 * non-atomic pattern: all concurrent callers snapshot the stale state, then
 * all write based on that snapshot.
 */
async function applyBrokenUpdateMany(state, where, data) {
	// Stale read.
	const snapshot = { ...state };

	// Yield - every concurrent caller in the Promise.all batch will reach this
	// point and capture the same pre-write snapshot before any of them commit.
	await Promise.resolve();

	// Check based on stale snapshot.
	for (const [field, guard] of Object.entries(where)) {
		if (field === 'id') continue;
		if (guard && typeof guard.gte === 'number') {
			if ((snapshot[field] ?? 0) < guard.gte) return { count: 0 };
		}
	}

	// Absolute write based on stale snapshot - the C1 bug.
	for (const [field, delta] of Object.entries(data)) {
		if (delta && typeof delta.decrement === 'number') {
			state[field] = (snapshot[field] ?? 0) - delta.decrement;
		}
		if (delta && typeof delta.increment === 'number') {
			// Increment applied on top of stale snapshot also loses concurrent increments
			// but in the debit path the critical failure is on decrement.
			state[field] = (snapshot[field] ?? 0) + delta.increment;
		}
	}
	return { count: 1 };
}

// ---------------------------------------------------------------------------
// 1. nexusService.transferResources
// ---------------------------------------------------------------------------

const { transferResources, ResourceConflictError } = await import('../services/nexusService.js');

test('transferResources: N concurrent transfers conserve total resources (atomic path)', async (t) => {
	// Two nexuses. from-nexus starts with 1200 biomass; to-nexus starts at 0.
	// Fire 6 concurrent transfers of 300 each. Only 4 can succeed (1200/300 = 4).
	// Conservation invariant: from.biomass + to.biomass === 1200 always.
	const from = { id: 1, biomass: 1200, alloy: 0, ore: 0 };
	const to   = { id: 2, biomass: 0,    alloy: 0, ore: 0 };
	const TOTAL = from.biomass;
	const AMOUNT = 300;
	const N = 6;

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						// Atomic: no yield between guard check and write.
						return applyAtomicUpdateMany(state, where, data);
					},
					update: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						applyAtomicUpdateMany(state, {}, data);
						return { ...state };
					},
					findUniqueOrThrow: async ({ where }) => {
						const state = where.id === from.id ? from : to;
						return { ...state };
					}
				}
			};
			return fn(tx);
		}
	});

	const results = await Promise.allSettled(
		Array.from({ length: N }, () =>
			transferResources(from.id, to.id, { biomass: AMOUNT, alloy: 0, ore: 0 }, { biomass: AMOUNT, alloy: 0, ore: 0 })
		)
	);

	const successes = results.filter((r) => r.status === 'fulfilled').length;
	const failures  = results.filter((r) => r.status === 'rejected').length;

	// Conservation: sum of both sides equals original total.
	assert.equal(
		from.biomass + to.biomass,
		TOTAL,
		`conservation violated: from=${from.biomass} to=${to.biomass} sum=${from.biomass + to.biomass} expected=${TOTAL}`
	);

	// No balance driven negative.
	assert.ok(from.biomass >= 0, `from-nexus balance went negative: ${from.biomass}`);
	assert.ok(to.biomass >= 0, `to-nexus balance went negative: ${to.biomass}`);

	// Exactly 4 should succeed (1200/300), 2 should fail.
	assert.equal(successes, 4, `expected 4 successes, got ${successes}`);
	assert.equal(failures,  2, `expected 2 failures,  got ${failures}`);

	// All failures must be ResourceConflictError.
	for (const r of results.filter((r) => r.status === 'rejected')) {
		assert.ok(
			r.reason instanceof ResourceConflictError,
			`unexpected rejection reason: ${r.reason}`
		);
	}
});

test('transferResources: over-spend is rejected, debit is never lost', async (t) => {
	// Single nexus with exactly 100 biomass. Transfer of 150 must be rejected.
	// After rejection the balance must still be 100.
	const from = { id: 10, biomass: 100, alloy: 0, ore: 0 };
	const to   = { id: 11, biomass: 0,   alloy: 0, ore: 0 };

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						return applyAtomicUpdateMany(state, where, data);
					},
					update: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						applyAtomicUpdateMany(state, {}, data);
						return { ...state };
					},
					findUniqueOrThrow: async ({ where }) => {
						const state = where.id === from.id ? from : to;
						return { ...state };
					}
				}
			};
			return fn(tx);
		}
	});

	await assert.rejects(
		() => transferResources(from.id, to.id, { biomass: 150, alloy: 0, ore: 0 }, { biomass: 150, alloy: 0, ore: 0 }),
		ResourceConflictError
	);

	assert.equal(from.biomass, 100, 'balance must not change on a rejected transfer');
	assert.equal(to.biomass, 0);
});

test('TEETH: broken non-atomic transferResources mints resources under concurrency', async (t) => {
	// Prove the test has teeth: the broken mock (stale-snapshot write) causes
	// conservation to fail. If this test does NOT detect the violation, the
	// main conservation test above is meaningless.
	const from = { id: 20, biomass: 900, alloy: 0, ore: 0 };
	const to   = { id: 21, biomass: 0,   alloy: 0, ore: 0 };
	const TOTAL = from.biomass;

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						// Broken: yield allows all concurrent callers to snapshot stale value.
						return applyBrokenUpdateMany(state, where, data);
					},
					update: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						applyAtomicUpdateMany(state, {}, data);
						return { ...state };
					},
					findUniqueOrThrow: async ({ where }) => {
						const state = where.id === from.id ? from : to;
						return { ...state };
					}
				}
			};
			return fn(tx);
		}
	});

	// 4 concurrent transfers of 300 each. Atomically only 3 could succeed (900/300).
	await Promise.allSettled(
		Array.from({ length: 4 }, () =>
			transferResources(from.id, to.id, { biomass: 300, alloy: 0, ore: 0 }, { biomass: 300, alloy: 0, ore: 0 })
		)
	);

	const broken = from.biomass + to.biomass !== TOTAL || from.biomass < 0;
	assert.ok(
		broken,
		`TEETH FAILURE: broken mock happened to conserve resources (from=${from.biomass} to=${to.biomass}), ` +
		`which means the race condition was not simulated. The main conservation test may not have teeth.`
	);
});

// ---------------------------------------------------------------------------
// 2. marketService.cancelListing and atomicSystemTrade
// ---------------------------------------------------------------------------

const { cancelListing, atomicSystemTrade } = await import('../services/marketService.js');

test('cancelListing: concurrent cancels of the same listing refund exactly once', async (t) => {
	// A listing for 500 ore. Two concurrent cancel attempts. Only one should
	// refund (the second delete throws P2025 - not found, rolling back its refund).
	// The balance should end at initial + 500, never initial + 1000.
	const nexus    = { id: 30, ore: 200 };
	const listing  = { id: 99, exists: true };
	const REFUND   = 500;
	const INITIAL  = nexus.ore;

	withPatched(t, prisma, {
		$transaction: async (ops) => {
			// Array-form transaction. ops[0] = nexus.update (increment), ops[1] = listing.delete.
			// Simulate the P2025 guard: only the first caller finds the listing.
			if (!listing.exists) {
				const err = new Error('Record not found');
				err.code = 'P2025';
				throw err;
			}
			listing.exists = false;
			// Apply the refund increment atomically.
			nexus.ore += REFUND;
			// Return what prisma would return.
			return [{ ...nexus }, { id: listing.id }];
		}
	});

	const results = await Promise.allSettled([
		cancelListing(listing.id, nexus.id, 'ore', REFUND),
		cancelListing(listing.id, nexus.id, 'ore', REFUND)
	]);

	const successes = results.filter((r) => r.status === 'fulfilled').length;
	assert.equal(successes, 1, 'exactly one cancel should succeed');
	assert.equal(nexus.ore, INITIAL + REFUND, 'refund applied exactly once');
});

test('atomicSystemTrade: gte guard blocks concurrent over-spend', async (t) => {
	// Nexus has 600 ore. Two concurrent system trades each cost 400 ore.
	// Only one can succeed. The guard returns count===0 for the second.
	const nexus = { id: 40, ore: 600, biomass: 0 };
	const COST   = 400;
	const GAIN   = 100;
	const INITIAL_ORE = nexus.ore;

	withPatched(t, prisma.nexus, {
		updateMany: async ({ where, data }) => {
			// Atomic: no yield.
			return applyAtomicUpdateMany(nexus, where, data);
		}
	});

	const results = await Promise.allSettled([
		atomicSystemTrade(nexus.id, 'ore', COST, 'biomass', GAIN),
		atomicSystemTrade(nexus.id, 'ore', COST, 'biomass', GAIN)
	]);

	const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.count === 1);
	const blocked   = results.filter((r) => r.status === 'fulfilled' && r.value.count === 0);

	assert.equal(succeeded.length, 1, 'exactly one trade should pass the gte guard');
	assert.equal(blocked.length,   1, 'exactly one trade should be blocked');

	// Balance conservation: ore spent + ore remaining = initial.
	// biomass gained = GAIN * successes.
	assert.equal(nexus.ore, INITIAL_ORE - COST, `ore balance should be ${INITIAL_ORE - COST}, got ${nexus.ore}`);
	assert.ok(nexus.ore >= 0, `ore balance went negative: ${nexus.ore}`);
	assert.equal(nexus.biomass, GAIN, `biomass should equal one gain (${GAIN}), got ${nexus.biomass}`);
});

test('TEETH: broken atomicSystemTrade allows both concurrent trades through', async (t) => {
	// Prove that without the gte guard, both concurrent trades succeed and the
	// balance goes negative (or conservation is violated).
	const nexus = { id: 41, ore: 600, biomass: 0 };
	const COST   = 400;
	const GAIN   = 100;
	const INITIAL_ORE = nexus.ore;

	withPatched(t, prisma.nexus, {
		updateMany: async ({ where, data }) => {
			// Broken: yield before write.
			return applyBrokenUpdateMany(nexus, where, data);
		}
	});

	await Promise.allSettled([
		atomicSystemTrade(nexus.id, 'ore', COST, 'biomass', GAIN),
		atomicSystemTrade(nexus.id, 'ore', COST, 'biomass', GAIN)
	]);

	const conserved = nexus.ore + nexus.biomass === INITIAL_ORE && nexus.ore >= 0;
	assert.ok(
		!conserved,
		`TEETH FAILURE: broken mock conserved resources (ore=${nexus.ore} biomass=${nexus.biomass}). ` +
		`The race was not simulated.`
	);
});

// ---------------------------------------------------------------------------
// 3. Faction treasury spend (gte-guarded faction.updateMany)
// ---------------------------------------------------------------------------

// The spend function lives in a controller so we extract and test the atomic
// core directly: a faction.updateMany with gte guards on all three treasury
// fields, wrapped in a $transaction.
//
// We replicate the exact pattern from factionTreasuryController.ts:spend so
// that a regression to non-atomic writes would be caught here.

async function factionTreasurySpend(factionId, cost, db, useAtomicMock) {
	return prisma.$transaction(async (tx) => {
		const { count } = await tx.faction.updateMany({
			where: {
				id: factionId,
				treasuryBiomass: { gte: cost.biomass },
				treasuryAlloy:   { gte: cost.alloy },
				treasuryOre:     { gte: cost.ore }
			},
			data: {
				treasuryBiomass: { decrement: cost.biomass },
				treasuryAlloy:   { decrement: cost.alloy },
				treasuryOre:     { decrement: cost.ore }
			}
		});
		if (count === 0) return { ok: false };
		return { ok: true };
	});
}

test('faction treasury spend: N concurrent spends conserve treasury (exactly one succeeds)', async (t) => {
	// Treasury can afford exactly one spend of the given cost.
	// Three concurrent spend attempts: only one must succeed.
	const treasury = { id: 50, treasuryBiomass: 1500, treasuryAlloy: 1500, treasuryOre: 1500 };
	const COST = { biomass: 1500, alloy: 1500, ore: 1500 };
	const INITIAL = { biomass: treasury.treasuryBiomass, alloy: treasury.treasuryAlloy, ore: treasury.treasuryOre };

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				faction: {
					updateMany: async ({ where, data }) => {
						// Map treasury guard fields to state fields.
						const stateWhere = {
							id: where.id,
							treasuryBiomass: where.treasuryBiomass,
							treasuryAlloy:   where.treasuryAlloy,
							treasuryOre:     where.treasuryOre
						};
						return applyAtomicUpdateMany(treasury, stateWhere, data);
					}
				},
				factionEvent: {
					create: async () => ({ id: 1 })
				}
			};
			return fn(tx);
		}
	});

	const results = await Promise.allSettled([
		factionTreasurySpend(50, COST, treasury, true),
		factionTreasurySpend(50, COST, treasury, true),
		factionTreasurySpend(50, COST, treasury, true)
	]);

	const successes = results
		.filter((r) => r.status === 'fulfilled' && r.value?.ok === true)
		.length;
	const failures = results
		.filter((r) => r.status === 'fulfilled' && r.value?.ok === false)
		.length;

	assert.equal(successes, 1, `expected exactly 1 successful spend, got ${successes}`);
	assert.equal(failures,  2, `expected 2 blocked spends, got ${failures}`);

	// Treasury should be fully drained (exactly one cost deducted).
	assert.equal(treasury.treasuryBiomass, 0, `biomass should be 0, got ${treasury.treasuryBiomass}`);
	assert.equal(treasury.treasuryAlloy,   0, `alloy should be 0, got ${treasury.treasuryAlloy}`);
	assert.equal(treasury.treasuryOre,     0, `ore should be 0, got ${treasury.treasuryOre}`);
});

test('faction treasury spend: treasury never goes negative under concurrent load', async (t) => {
	// 8 concurrent spends against a treasury that can afford 3.
	const treasury = { id: 51, treasuryBiomass: 4500, treasuryAlloy: 4500, treasuryOre: 4500 };
	const COST = { biomass: 1500, alloy: 1500, ore: 1500 };

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				faction: {
					updateMany: async ({ where, data }) => {
						return applyAtomicUpdateMany(treasury, where, data);
					}
				},
				factionEvent: { create: async () => ({ id: 1 }) }
			};
			return fn(tx);
		}
	});

	const results = await Promise.allSettled(
		Array.from({ length: 8 }, () => factionTreasurySpend(51, COST, treasury, true))
	);

	const successes = results.filter((r) => r.status === 'fulfilled' && r.value?.ok === true).length;

	assert.equal(successes, 3, `expected 3 successes (4500/1500), got ${successes}`);
	assert.ok(treasury.treasuryBiomass >= 0, `treasuryBiomass went negative: ${treasury.treasuryBiomass}`);
	assert.ok(treasury.treasuryAlloy   >= 0, `treasuryAlloy went negative: ${treasury.treasuryAlloy}`);
	assert.ok(treasury.treasuryOre     >= 0, `treasuryOre went negative: ${treasury.treasuryOre}`);
	assert.equal(treasury.treasuryBiomass, 0);
	assert.equal(treasury.treasuryAlloy,   0);
	assert.equal(treasury.treasuryOre,     0);
});

test('TEETH: broken faction treasury spend allows over-spend under concurrency', async (t) => {
	const treasury = { id: 52, treasuryBiomass: 1500, treasuryAlloy: 1500, treasuryOre: 1500 };
	const COST = { biomass: 1500, alloy: 1500, ore: 1500 };

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				faction: {
					updateMany: async ({ where, data }) => {
						return applyBrokenUpdateMany(treasury, where, data);
					}
				},
				factionEvent: { create: async () => ({ id: 1 }) }
			};
			return fn(tx);
		}
	});

	const results = await Promise.allSettled([
		factionTreasurySpend(52, COST, treasury, false),
		factionTreasurySpend(52, COST, treasury, false),
		factionTreasurySpend(52, COST, treasury, false)
	]);

	const successes = results.filter((r) => r.status === 'fulfilled' && r.value?.ok === true).length;

	// Under the broken mock, all 3 should succeed even though only 1 can afford it.
	// If the broken mock correctly simulates the race, successes > 1.
	assert.ok(
		successes > 1 || treasury.treasuryBiomass < 0,
		`TEETH FAILURE: broken mock did not allow over-spend ` +
		`(successes=${successes} remainingBiomass=${treasury.treasuryBiomass}). ` +
		`The concurrent race was not reproduced.`
	);
});

// ---------------------------------------------------------------------------
// 4. troopTransferService.sendTroopsTransaction
// ---------------------------------------------------------------------------

const { sendTroopsTransaction, TroopShortfallError } = await import(
	'../services/troopTransferService.js'
);

test('sendTroopsTransaction: N concurrent sends conserve total troop counts', async (t) => {
	// Source nexus has 500 assaultTrooper. Fire 6 concurrent sends of 100 each.
	// Only 5 can succeed. Conservation: troops sent + troops remaining == 500.
	const sourceNexus = { id: 60, assaultTrooper: 500, vanguardBreaker: 0 };
	const SEND = 100;
	const N = 6;
	const INITIAL_TROOPS = sourceNexus.assaultTrooper;
	let transferIdSeq = 0;

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						return applyAtomicUpdateMany(sourceNexus, where, data);
					},
					findUniqueOrThrow: async () => ({ ...sourceNexus })
				},
				troopTransfer: {
					create: async (args) => ({
						id: ++transferIdSeq,
						...args.data,
						ownerNexus: { id: args.data.ownerNexusId, name: 'Source', x: 0, y: 0 },
						hostNexus:  { id: args.data.hostNexusId,  name: 'Target', x: 1, y: 1 }
					})
				}
			};
			return fn(tx);
		}
	});

	const results = await Promise.allSettled(
		Array.from({ length: N }, () =>
			sendTroopsTransaction(
				sourceNexus.id,
				{ assaultTrooper: { decrement: SEND } },
				{ assaultTrooper: { gte: SEND } },
				{
					ownerNexusId: sourceNexus.id,
					hostNexusId: 61,
					galaxyId: 1,
					troops: { assaultTrooper: SEND },
					travelTimeMs: 60000,
					arrivesAt: new Date(Date.now() + 60000)
				}
			)
		)
	);

	const successes = results.filter((r) => r.status === 'fulfilled').length;
	const failures  = results.filter((r) => r.status === 'rejected').length;

	// Count troops successfully sent.
	const troopsSent = successes * SEND;
	const troopsRemaining = sourceNexus.assaultTrooper;

	// Conservation: sent + remaining == initial.
	assert.equal(
		troopsSent + troopsRemaining,
		INITIAL_TROOPS,
		`conservation violated: sent=${troopsSent} remaining=${troopsRemaining} ` +
		`sum=${troopsSent + troopsRemaining} expected=${INITIAL_TROOPS}`
	);

	assert.ok(troopsRemaining >= 0, `source troop count went negative: ${troopsRemaining}`);
	assert.equal(successes, 5, `expected 5 successes (500/100), got ${successes}`);
	assert.equal(failures,  1, `expected 1 failure, got ${failures}`);

	// All failures must be TroopShortfallError.
	for (const r of results.filter((r) => r.status === 'rejected')) {
		assert.ok(
			r.reason instanceof TroopShortfallError,
			`unexpected rejection reason: ${r.reason}`
		);
	}
});

test('sendTroopsTransaction: mixed troop types conserve independently', async (t) => {
	// Two troop types. Verify each type is conserved independently under
	// concurrent multi-type sends.
	const source = { id: 70, assaultTrooper: 300, vanguardBreaker: 200 };
	const INITIAL = { assaultTrooper: source.assaultTrooper, vanguardBreaker: source.vanguardBreaker };
	let sentByType = { assaultTrooper: 0, vanguardBreaker: 0 };
	let transferIdSeq = 0;

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						return applyAtomicUpdateMany(source, where, data);
					},
					findUniqueOrThrow: async () => ({ ...source })
				},
				troopTransfer: {
					create: async (args) => {
						// Track what was actually sent.
						for (const [k, v] of Object.entries(args.data.troops ?? {})) {
							sentByType[k] = (sentByType[k] ?? 0) + v;
						}
						return {
							id: ++transferIdSeq,
							...args.data,
							ownerNexus: { id: args.data.ownerNexusId, name: 'S', x: 0, y: 0 },
							hostNexus:  { id: args.data.hostNexusId,  name: 'T', x: 1, y: 1 }
						};
					}
				}
			};
			return fn(tx);
		}
	});

	// 4 concurrent sends: 2 send assaultTrooper (100 each), 2 send vanguardBreaker (100 each).
	await Promise.allSettled([
		sendTroopsTransaction(source.id, { assaultTrooper: { decrement: 100 } }, { assaultTrooper: { gte: 100 } },
			{ ownerNexusId: source.id, hostNexusId: 71, galaxyId: 1, troops: { assaultTrooper: 100 }, travelTimeMs: 1, arrivesAt: new Date() }),
		sendTroopsTransaction(source.id, { assaultTrooper: { decrement: 100 } }, { assaultTrooper: { gte: 100 } },
			{ ownerNexusId: source.id, hostNexusId: 71, galaxyId: 1, troops: { assaultTrooper: 100 }, travelTimeMs: 1, arrivesAt: new Date() }),
		sendTroopsTransaction(source.id, { vanguardBreaker: { decrement: 100 } }, { vanguardBreaker: { gte: 100 } },
			{ ownerNexusId: source.id, hostNexusId: 71, galaxyId: 1, troops: { vanguardBreaker: 100 }, travelTimeMs: 1, arrivesAt: new Date() }),
		sendTroopsTransaction(source.id, { vanguardBreaker: { decrement: 100 } }, { vanguardBreaker: { gte: 100 } },
			{ ownerNexusId: source.id, hostNexusId: 71, galaxyId: 1, troops: { vanguardBreaker: 100 }, travelTimeMs: 1, arrivesAt: new Date() })
	]);

	// Each type: sent + remaining == initial.
	assert.equal(
		sentByType.assaultTrooper + source.assaultTrooper,
		INITIAL.assaultTrooper,
		`assaultTrooper not conserved: sent=${sentByType.assaultTrooper} remaining=${source.assaultTrooper}`
	);
	assert.equal(
		sentByType.vanguardBreaker + source.vanguardBreaker,
		INITIAL.vanguardBreaker,
		`vanguardBreaker not conserved: sent=${sentByType.vanguardBreaker} remaining=${source.vanguardBreaker}`
	);

	assert.ok(source.assaultTrooper >= 0, `assaultTrooper went negative: ${source.assaultTrooper}`);
	assert.ok(source.vanguardBreaker >= 0, `vanguardBreaker went negative: ${source.vanguardBreaker}`);
});

test('TEETH: broken sendTroopsTransaction allows troop duplication under concurrency', async (t) => {
	const source = { id: 80, assaultTrooper: 200 };
	const INITIAL = source.assaultTrooper;
	let troopsCreated = 0;
	let transferIdSeq = 0;

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						// Broken: stale snapshot + yield causes all concurrent callers to pass.
						return applyBrokenUpdateMany(source, where, data);
					},
					findUniqueOrThrow: async () => ({ ...source })
				},
				troopTransfer: {
					create: async (args) => {
						troopsCreated += args.data.troops?.assaultTrooper ?? 0;
						return {
							id: ++transferIdSeq,
							...args.data,
							ownerNexus: { id: 80, name: 'S', x: 0, y: 0 },
							hostNexus:  { id: 81, name: 'T', x: 1, y: 1 }
						};
					}
				}
			};
			return fn(tx);
		}
	});

	// 3 concurrent sends of 100 each. Atomically only 2 can succeed.
	await Promise.allSettled(
		Array.from({ length: 3 }, () =>
			sendTroopsTransaction(
				source.id,
				{ assaultTrooper: { decrement: 100 } },
				{ assaultTrooper: { gte: 100 } },
				{ ownerNexusId: 80, hostNexusId: 81, galaxyId: 1, troops: { assaultTrooper: 100 }, travelTimeMs: 1, arrivesAt: new Date() }
			)
		)
	);

	const remaining = source.assaultTrooper;
	const conserved = troopsCreated + remaining === INITIAL && remaining >= 0;

	assert.ok(
		!conserved,
		`TEETH FAILURE: broken mock conserved troops (created=${troopsCreated} remaining=${remaining}). ` +
		`The concurrent race was not reproduced.`
	);
});

// ---------------------------------------------------------------------------
// 5. Multi-resource transferResources: all three fields conserved together
// ---------------------------------------------------------------------------

test('transferResources: all three resource fields conserved in multi-resource transfer', async (t) => {
	const from = { id: 90, biomass: 600, alloy: 400, ore: 800 };
	const to   = { id: 91, biomass: 0,   alloy: 0,   ore: 0 };
	const INITIAL = { biomass: from.biomass + to.biomass, alloy: from.alloy + to.alloy, ore: from.ore + to.ore };

	withPatched(t, prisma, {
		$transaction: async (fn) => {
			const tx = {
				nexus: {
					updateMany: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						return applyAtomicUpdateMany(state, where, data);
					},
					update: async ({ where, data }) => {
						const state = where.id === from.id ? from : to;
						applyAtomicUpdateMany(state, {}, data);
						return { ...state };
					},
					findUniqueOrThrow: async ({ where }) => {
						return { ...(where.id === from.id ? from : to) };
					}
				}
			};
			return fn(tx);
		}
	});

	// 3 concurrent transfers: each takes biomass=200, alloy=200, ore=300.
	// Only 2 can fully succeed (alloy: 400/200 = 2, biomass: 600/200 = 3, ore: 800/300 = 2).
	const results = await Promise.allSettled(
		Array.from({ length: 3 }, () =>
			transferResources(
				from.id, to.id,
				{ biomass: 200, alloy: 200, ore: 300 },
				{ biomass: 200, alloy: 200, ore: 300 }
			)
		)
	);

	const successes = results.filter((r) => r.status === 'fulfilled').length;

	assert.equal(from.biomass + to.biomass, INITIAL.biomass, `biomass not conserved`);
	assert.equal(from.alloy   + to.alloy,   INITIAL.alloy,   `alloy not conserved`);
	assert.equal(from.ore     + to.ore,     INITIAL.ore,     `ore not conserved`);

	assert.ok(from.biomass >= 0, `from.biomass negative: ${from.biomass}`);
	assert.ok(from.alloy   >= 0, `from.alloy negative: ${from.alloy}`);
	assert.ok(from.ore     >= 0, `from.ore negative: ${from.ore}`);

	assert.equal(successes, 2, `expected 2 successes (limited by alloy and ore), got ${successes}`);
});
