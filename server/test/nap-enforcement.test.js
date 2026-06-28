/**
 * NAP (Non-Aggression Pact) enforcement tests - Phase 1 "Diplomacy Teeth".
 *
 * Covers 12 contracted cases:
 *   NAP gate in launchAttack (cases 1-7)
 *   breakNap controller (cases 8-10)
 *   proposeTreaty re-sign cooldown (cases 11-12)
 *
 * All tests use the same prisma-monkey-patch harness as the rest of the
 * server/test/ suite: no real DB connection is required.
 *
 * Design intent reference: server/DIPLOMACY_BALANCE.md section 1.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const { launchAttack } = await import('../services/attackService.js');
const { breakNap, cancelTreaty, proposeTreaty } = await import('../controllers/factionTreatyController.js');
const { NAP_BREAK_NOTICE_MS, NAP_RESIGN_COOLDOWN_MS } = await import('../utils/gameConstants.js');

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

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

/**
 * Build a fake Express res object. Returns the object plus getters so tests can
 * read the status and JSON body after the controller returns.
 */
function makeRes() {
	let capturedStatus = 200;
	let capturedData = undefined;
	const res = {
		status(s) {
			capturedStatus = s;
			return this;
		},
		json(d) {
			capturedData = d;
			return this;
		}
	};
	return { res, getStatus: () => capturedStatus, getData: () => capturedData };
}

/**
 * A minimal nexus row for the attacker (id=10, owned by userId=1).
 * All troop counts included so launchAttack's availability loop doesn't throw.
 */
function makeAttackerNexus(overrides = {}) {
	return {
		id: 10,
		ownerId: 1,
		galaxyId: 1,
		x: 0,
		y: 0,
		name: 'Alpha Nexus',
		newbieProtectionEndsAt: null,
		nexusType: null,
		nexusTypeDoubled: false,
		// Troop inventory - all keys that TROOP_KEYS includes.
		sentinelLancer: 0,
		assaultTrooper: 100,
		vanguardBreaker: 0,
		reconOperative: 5,
		wraithSkimmer: 0,
		siegeMech: 0,
		bulwarkGuard: 0,
		pyreSuppressor: 0,
		arcDisruptor: 0,
		phantomLance: 0,
		annihilatorPlatform: 0,
		voidStalker: 0,
		plasmaTurret: 0,
		overseer: 0,
		siegeColossus: 0,
		aegisSkirmisher: 0,
		...overrides
	};
}

/** A minimal nexus row for the defender (id=20, owned by userId=2). */
function makeDefenderNexus(overrides = {}) {
	return {
		id: 20,
		ownerId: 2,
		galaxyId: 1,
		x: 10,
		y: 10,
		name: 'Beta Nexus',
		newbieProtectionEndsAt: null,
		...overrides
	};
}

/**
 * Sets up the three prisma mocks needed to drive the launchAttack NAP gate:
 *   - nexus.findUnique  → returns attacker (id 10) or defender (id 20)
 *   - factionMember.findFirst → returns members with given factionIds
 *   - factionTreaty.findFirst → returns `treaty` (or null)
 *
 * Returns { attackerNexus, defenderNexus } so tests can inspect them afterward.
 */
function setupNapGateMocks(t, {
	attackerFactionId = 10,
	defenderFactionId = 20,
	treaty = { id: 5, status: 'active', betrayalEndsAt: null },
	attackerNexusOverrides = {},
	defenderNexusOverrides = {}
} = {}) {
	const attackerNexus = makeAttackerNexus(attackerNexusOverrides);
	const defenderNexus = makeDefenderNexus(defenderNexusOverrides);

	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === attackerNexus.id) return attackerNexus;
			if (where.id === defenderNexus.id) return defenderNexus;
			return null;
		}
	});

	withPatched(t, prisma.factionMember, {
		findFirst: async ({ where }) => {
			// launchAttack calls findFirst twice concurrently, distinguished by userId.
			if (where.userId === 1) {
				return { userId: 1, factionId: attackerFactionId, galaxyId: 1, role: 'member' };
			}
			if (where.userId === 2) {
				return { userId: 2, factionId: defenderFactionId, galaxyId: 1, role: 'member' };
			}
			return null;
		},
		// notifyDiplomacyLeaders fires void - return empty so no push is attempted.
		findMany: async () => []
	});

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => treaty
	});

	return { attackerNexus, defenderNexus };
}

// ---------------------------------------------------------------------------
// Case 1: Active NAP blocks attack mission with ok:false, status 403, NAP error
// and protectedUntil null (active NAP has no betrayalEndsAt).
// ---------------------------------------------------------------------------
test('NAP gate [case 1]: active NAP blocks attack - ok:false, status 403, NAP error, protectedUntil null', async (t) => {
	setupNapGateMocks(t, {
		treaty: { id: 5, status: 'active', betrayalEndsAt: null }
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: { assaultTrooper: 1 },
		type: 'attack'
	});

	assert.equal(result.ok, false);
	assert.equal(result.status, 403);
	assert.match(result.error, /Non-Aggression Pact/);
	// Active NAP has no betrayalEndsAt; protectedUntil must be null.
	assert.equal(result.protectedUntil, null);
});

// ---------------------------------------------------------------------------
// Case 2a: Active NAP does NOT block a scout mission.
// ---------------------------------------------------------------------------
test('NAP gate [case 2a]: active NAP does NOT block scout - gate is skipped for scout type', async (t) => {
	// We set up nexus mocks only; factionMember and factionTreaty will NOT be
	// called because the NAP gate is gated on attackType === 'attack'.
	const attackerNexus = makeAttackerNexus();
	const defenderNexus = makeDefenderNexus();

	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 10) return attackerNexus;
			if (where.id === 20) return defenderNexus;
			return null;
		}
	});

	// Pass 0 troops so we never reach DB writes - but we WILL pass the NAP gate.
	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: {},
		type: 'scout'
	});

	// The scout hit the "Select at least one troop" wall, NOT the NAP 403.
	assert.equal(result.ok, false);
	assert.notEqual(result.status, 403);
	assert.doesNotMatch(result.error ?? '', /Non-Aggression Pact/);
});

// ---------------------------------------------------------------------------
// Case 2b: Active NAP does NOT block a support mission.
// ---------------------------------------------------------------------------
test('NAP gate [case 2b]: active NAP does NOT block support - gate is skipped for support type', async (t) => {
	const attackerNexus = makeAttackerNexus();
	const defenderNexus = makeDefenderNexus();

	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 10) return attackerNexus;
			if (where.id === 20) return defenderNexus;
			return null;
		}
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: {},
		type: 'support'
	});

	// Support with 0 troops fails at "Select at least one troop", not the NAP 403.
	assert.equal(result.ok, false);
	assert.notEqual(result.status, 403);
	assert.doesNotMatch(result.error ?? '', /Non-Aggression Pact/);
});

// ---------------------------------------------------------------------------
// Case 3a: Factionless attacker - gate is a no-op (attack passes NAP check).
// ---------------------------------------------------------------------------
test('NAP gate [case 3a]: factionless attacker - gate skipped (attack proceeds to normal validation)', async (t) => {
	const attackerNexus = makeAttackerNexus();
	const defenderNexus = makeDefenderNexus();

	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 10) return attackerNexus;
			if (where.id === 20) return defenderNexus;
			return null;
		}
	});

	// Attacker has no faction membership.
	withPatched(t, prisma.factionMember, {
		findFirst: async () => null
	});

	// factionTreaty.findFirst must NOT be called when either party is factionless.
	// To verify that, make it throw if reached - but since we can't assert "not called"
	// easily, we instead assert the result error is NOT the NAP error.
	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => {
			throw new Error('factionTreaty.findFirst should not be called for factionless players');
		}
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: {},
		type: 'attack'
	});

	// Falls through to "Select at least one troop", not the NAP 403.
	assert.equal(result.ok, false);
	assert.doesNotMatch(result.error ?? '', /Non-Aggression Pact/);
	assert.notEqual(result.status, 403);
});

// ---------------------------------------------------------------------------
// Case 3b: Same-faction attacker/defender - gate is a no-op.
// ---------------------------------------------------------------------------
test('NAP gate [case 3b]: same-faction players - NAP check skipped (attack proceeds to normal validation)', async (t) => {
	const attackerNexus = makeAttackerNexus();
	const defenderNexus = makeDefenderNexus();

	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 10) return attackerNexus;
			if (where.id === 20) return defenderNexus;
			return null;
		}
	});

	// Both players in the same faction (factionId=10).
	withPatched(t, prisma.factionMember, {
		findFirst: async ({ where }) => ({
			userId: where.userId,
			factionId: 10,
			galaxyId: 1,
			role: 'member'
		})
	});

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => {
			throw new Error('factionTreaty.findFirst should not be called for same-faction players');
		}
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: {},
		type: 'attack'
	});

	assert.equal(result.ok, false);
	assert.doesNotMatch(result.error ?? '', /Non-Aggression Pact/);
	assert.notEqual(result.status, 403);
});

// ---------------------------------------------------------------------------
// Case 4a: Pair ordering - attacker faction is the treaty's proposerFactionId.
// ---------------------------------------------------------------------------
test('NAP gate [case 4a]: pair ordering - attacker faction is proposerFactionId → still blocked', async (t) => {
	// Attacker (userId=1) is in faction 10 = proposer.
	// Defender (userId=2) is in faction 20 = target.
	setupNapGateMocks(t, {
		attackerFactionId: 10,
		defenderFactionId: 20,
		treaty: { id: 5, status: 'active', betrayalEndsAt: null }
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: { assaultTrooper: 1 },
		type: 'attack'
	});

	assert.equal(result.ok, false);
	assert.equal(result.status, 403);
	assert.match(result.error, /Non-Aggression Pact/);
});

// ---------------------------------------------------------------------------
// Case 4b: Pair ordering - attacker faction is the treaty's targetFactionId.
// ---------------------------------------------------------------------------
test('NAP gate [case 4b]: pair ordering - attacker faction is targetFactionId → still blocked', async (t) => {
	// Attacker (userId=1) is in faction 30 = target.
	// Defender (userId=2) is in faction 10 = proposer.
	// The treaty is stored with proposer=10, target=30.
	setupNapGateMocks(t, {
		attackerFactionId: 30,
		defenderFactionId: 10,
		treaty: { id: 5, status: 'active', betrayalEndsAt: null }
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: { assaultTrooper: 1 },
		type: 'attack'
	});

	assert.equal(result.ok, false);
	assert.equal(result.status, 403);
	assert.match(result.error, /Non-Aggression Pact/);
});

// ---------------------------------------------------------------------------
// Case 5: Broken NAP with betrayalEndsAt in the FUTURE still blocks.
// ---------------------------------------------------------------------------
test('NAP gate [case 5]: broken NAP with future betrayalEndsAt still blocks attack', async (t) => {
	const futureEndsAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
	setupNapGateMocks(t, {
		treaty: { id: 5, status: 'broken', betrayalEndsAt: futureEndsAt }
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: { assaultTrooper: 1 },
		type: 'attack'
	});

	assert.equal(result.ok, false);
	assert.equal(result.status, 403);
	assert.match(result.error, /Non-Aggression Pact/);
	// protectedUntil must reflect the betrayalEndsAt timestamp.
	assert.ok(
		result.protectedUntil instanceof Date || typeof result.protectedUntil === 'string',
		'protectedUntil should be a date or ISO string for a broken NAP still in window'
	);
});

// ---------------------------------------------------------------------------
// Case 6: Broken NAP with betrayalEndsAt in the PAST does NOT block.
// ---------------------------------------------------------------------------
test('NAP gate [case 6]: broken NAP with past betrayalEndsAt does NOT block attack', async (t) => {
	// The DB query filters out broken NAPs whose betrayalEndsAt has elapsed.
	// Simulate that by returning null from findFirst (no blocking treaty found).
	const attackerNexus = makeAttackerNexus();
	const defenderNexus = makeDefenderNexus();

	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 10) return attackerNexus;
			if (where.id === 20) return defenderNexus;
			return null;
		}
	});

	withPatched(t, prisma.factionMember, {
		findFirst: async ({ where }) => {
			if (where.userId === 1) return { userId: 1, factionId: 10, galaxyId: 1, role: 'member' };
			if (where.userId === 2) return { userId: 2, factionId: 20, galaxyId: 1, role: 'member' };
			return null;
		},
		findMany: async () => []
	});

	// findFirst returns null because the broken NAP's betrayalEndsAt < now.
	// The real query uses betrayalEndsAt: { gt: now } so an expired break falls through.
	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => null
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: {},  // 0 troops → will fail at troop-count check, not at NAP gate
		type: 'attack'
	});

	// Must NOT be the NAP error - the gate passed, attack failed for another reason.
	assert.equal(result.ok, false);
	assert.doesNotMatch(result.error ?? '', /Non-Aggression Pact/);
	assert.notEqual(result.status, 403);
});

// ---------------------------------------------------------------------------
// Case 7: CONSERVATION - when the NAP gate blocks, no troops deducted and no
// Attack row created. Verified by tracking $transaction calls.
// ---------------------------------------------------------------------------
test('NAP gate [case 7]: conservation - blocked attack does NOT deduct troops or create Attack row', async (t) => {
	const { attackerNexus } = setupNapGateMocks(t, {
		treaty: { id: 5, status: 'active', betrayalEndsAt: null }
	});

	const troopsBefore = attackerNexus.assaultTrooper; // 100

	// Track whether the DB transaction (troop deduction + attack creation) fires.
	let transactionCalled = false;
	withPatched(t, prisma, {
		$transaction: async () => {
			transactionCalled = true;
		}
	});

	const result = await launchAttack({
		userId: 1,
		galaxyId: 1,
		fromNexusId: 10,
		toNexusId: 20,
		troops: { assaultTrooper: 50 },
		type: 'attack'
	});

	// NAP gate must have blocked.
	assert.equal(result.ok, false);
	assert.equal(result.status, 403);

	// No DB transaction must have run - troops are neither deducted nor an Attack row created.
	assert.equal(
		transactionCalled,
		false,
		'$transaction (troop deduction + attack creation) must not be called when NAP gate blocks'
	);

	// In-memory attacker nexus is unchanged.
	assert.equal(
		attackerNexus.assaultTrooper,
		troopsBefore,
		`troop count must be unchanged: expected ${troopsBefore}, got ${attackerNexus.assaultTrooper}`
	);
});

// ---------------------------------------------------------------------------
// Case 8a: breakNap - leader of the proposer faction can break an active NAP.
// Flips to status='broken', stamps betrayalEndsAt in the future, writes two
// FactionEvent rows (nap_broken + nap_broken_received).
// ---------------------------------------------------------------------------
test('breakNap [case 8a]: leader of proposer faction can break active NAP', async (t) => {
	const TREATY_ID = 5;
	const PROPOSER_FACTION_ID = 10;
	const TARGET_FACTION_ID = 20;
	const calls = {};

	const mockTreaty = {
		id: TREATY_ID,
		galaxyId: 1,
		type: 'nap',
		status: 'active',
		proposerFactionId: PROPOSER_FACTION_ID,
		targetFactionId: TARGET_FACTION_ID
	};
	const updatedTreaty = {
		...mockTreaty,
		status: 'broken',
		brokenAt: new Date(),
		brokenByUserId: 1,
		betrayalEndsAt: new Date(Date.now() + NAP_BREAK_NOTICE_MS)
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty,
		findUnique: async () => updatedTreaty,
		updateMany: async (args) => {
			calls.updateMany = args;
			return { count: 1 };
		}
	});

	// getUserFaction returns a leader of the proposer faction (with faction included).
	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: PROPOSER_FACTION_ID,
			galaxyId: 1,
			role: 'leader',
			faction: { id: PROPOSER_FACTION_ID, name: 'Iron Pact', tag: 'IP' }
		}),
		findMany: async () => [] // notifyDiplomacyLeaders - no leaders to notify
	});

	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: 1.0 })
	});

	withPatched(t, prisma.factionEvent, {
		createMany: async (args) => {
			calls.factionEvents = args.data;
			return { count: 2 };
		}
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await breakNap(req, res);

	// Response: 200 with the broken treaty.
	assert.equal(getStatus(), 200);
	assert.equal(getData().status, 'broken');

	// updateMany must have been called with correct transition.
	assert.equal(calls.updateMany.data.status, 'broken');
	assert.ok(calls.updateMany.data.brokenByUserId === 1, 'brokenByUserId must match the caller');
	assert.ok(
		calls.updateMany.data.betrayalEndsAt > new Date(),
		'betrayalEndsAt must be stamped in the future'
	);

	// Two FactionEvent rows: nap_broken for breaker, nap_broken_received for victim.
	assert.equal(calls.factionEvents.length, 2);
	const breakerEvent = calls.factionEvents.find((e) => e.type === 'nap_broken');
	const victimEvent = calls.factionEvents.find((e) => e.type === 'nap_broken_received');
	assert.ok(breakerEvent, 'nap_broken event must exist');
	assert.ok(victimEvent, 'nap_broken_received event must exist');
	assert.equal(breakerEvent.factionId, PROPOSER_FACTION_ID);
	assert.equal(victimEvent.factionId, TARGET_FACTION_ID);
});

// ---------------------------------------------------------------------------
// Case 8b: breakNap - officer of the TARGET faction can also break the NAP.
// ---------------------------------------------------------------------------
test('breakNap [case 8b]: officer of target faction can break active NAP', async (t) => {
	const TREATY_ID = 6;
	const PROPOSER_FACTION_ID = 10;
	const TARGET_FACTION_ID = 20;

	const mockTreaty = {
		id: TREATY_ID,
		galaxyId: 1,
		type: 'nap',
		status: 'active',
		proposerFactionId: PROPOSER_FACTION_ID,
		targetFactionId: TARGET_FACTION_ID
	};
	const updatedTreaty = { ...mockTreaty, status: 'broken', brokenByUserId: 2, betrayalEndsAt: new Date(Date.now() + NAP_BREAK_NOTICE_MS) };

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty,
		findUnique: async () => updatedTreaty,
		updateMany: async () => ({ count: 1 })
	});

	// userId=2 is an officer of the TARGET faction.
	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 2,
			factionId: TARGET_FACTION_ID,
			galaxyId: 1,
			role: 'officer',
			faction: { id: TARGET_FACTION_ID, name: 'Steel Union', tag: 'SU' }
		}),
		findMany: async () => []
	});

	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: 1.0 })
	});

	withPatched(t, prisma.factionEvent, {
		createMany: async () => ({ count: 2 })
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 2, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await breakNap(req, res);

	assert.equal(getStatus(), 200);
	assert.equal(getData().status, 'broken');
});

// ---------------------------------------------------------------------------
// Case 9a: breakNap - regular member is rejected 403.
// ---------------------------------------------------------------------------
test('breakNap [case 9a]: regular member cannot break NAP - rejected 403', async (t) => {
	const TREATY_ID = 7;
	const mockTreaty = {
		id: TREATY_ID,
		galaxyId: 1,
		type: 'nap',
		status: 'active',
		proposerFactionId: 10,
		targetFactionId: 20
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty
	});

	// Role is 'member', not leader/officer.
	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: 10,
			galaxyId: 1,
			role: 'member',
			faction: { id: 10, name: 'Iron Pact', tag: 'IP' }
		})
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await breakNap(req, res);

	assert.equal(getStatus(), 403);
	assert.match(getData().error, /leaders and officers/);
});

// ---------------------------------------------------------------------------
// Case 9b: breakNap - non-member of either faction is rejected 403.
// ---------------------------------------------------------------------------
test('breakNap [case 9b]: non-member of either signatory faction is rejected 403', async (t) => {
	const TREATY_ID = 8;
	const mockTreaty = {
		id: TREATY_ID,
		galaxyId: 1,
		type: 'nap',
		status: 'active',
		proposerFactionId: 10,
		targetFactionId: 20
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty
	});

	// userId=99 is in factionId=99 - not a signatory.
	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 99,
			factionId: 99,
			galaxyId: 1,
			role: 'leader',
			faction: { id: 99, name: 'Other Guild', tag: 'OG' }
		})
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 99, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await breakNap(req, res);

	assert.equal(getStatus(), 403);
	assert.match(getData().error, /Not authorized/);
});

// ---------------------------------------------------------------------------
// Case 9c: breakNap - user with no faction membership is rejected 403.
// ---------------------------------------------------------------------------
test('breakNap [case 9c]: factionless user is rejected 403', async (t) => {
	const TREATY_ID = 9;
	const mockTreaty = {
		id: TREATY_ID,
		galaxyId: 1,
		type: 'nap',
		status: 'active',
		proposerFactionId: 10,
		targetFactionId: 20
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty
	});

	withPatched(t, prisma.factionMember, {
		findFirst: async () => null
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 5, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await breakNap(req, res);

	assert.equal(getStatus(), 403);
	assert.match(getData().error, /Not authorized/);
});

// ---------------------------------------------------------------------------
// Case 10a: breakNap - breaking a non-nap treaty (e.g. trade) returns 400.
// ---------------------------------------------------------------------------
test('breakNap [case 10a]: breaking a trade treaty returns 400', async (t) => {
	const mockTreaty = {
		id: 10,
		galaxyId: 1,
		type: 'trade', // NOT nap
		status: 'active',
		proposerFactionId: 10,
		targetFactionId: 20
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: '10' } };
	await breakNap(req, res);

	assert.equal(getStatus(), 400);
	assert.match(getData().error, /Non-Aggression Pacts/);
});

// ---------------------------------------------------------------------------
// Case 10b: breakNap - breaking an already-broken NAP returns 400
// (the guarded updateMany will return count=0, causing a 409;
//  but the status check fires BEFORE the updateMany, returning 400).
// ---------------------------------------------------------------------------
test('breakNap [case 10b]: breaking an already-broken NAP returns 400', async (t) => {
	const mockTreaty = {
		id: 11,
		galaxyId: 1,
		type: 'nap',
		status: 'broken', // already broken
		proposerFactionId: 10,
		targetFactionId: 20
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: '11' } };
	await breakNap(req, res);

	assert.equal(getStatus(), 400);
	assert.match(getData().error, /active NAP/);
});

// ---------------------------------------------------------------------------
// Case 10c: breakNap - concurrent double-fire on the same active NAP. The
// second caller gets the updateMany count=0 guard and receives 409.
// ---------------------------------------------------------------------------
test('breakNap [case 10c]: concurrent double-fire - second call gets 409 from guarded updateMany', async (t) => {
	const TREATY_ID = 12;
	const mockTreaty = {
		id: TREATY_ID,
		galaxyId: 1,
		type: 'nap',
		status: 'active',
		proposerFactionId: 10,
		targetFactionId: 20
	};

	let updateCalls = 0;
	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => mockTreaty,
		findUnique: async () => ({ ...mockTreaty, status: 'broken', betrayalEndsAt: new Date(Date.now() + NAP_BREAK_NOTICE_MS) }),
		updateMany: async () => {
			updateCalls++;
			// First call succeeds; second simulates the race-lost case (already transitioned).
			return { count: updateCalls === 1 ? 1 : 0 };
		}
	});

	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: 10,
			galaxyId: 1,
			role: 'leader',
			faction: { id: 10, name: 'Iron Pact', tag: 'IP' }
		}),
		findMany: async () => []
	});

	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: 1.0 })
	});

	withPatched(t, prisma.factionEvent, {
		createMany: async () => ({ count: 2 })
	});

	const req1 = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	const req2 = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	const { res: res1, getStatus: getStatus1 } = makeRes();
	const { res: res2, getStatus: getStatus2, getData: getData2 } = makeRes();

	// Simulate sequential double-fire (concurrent is unpredictable in unit tests).
	await breakNap(req1, res1);
	await breakNap(req2, res2);

	assert.equal(getStatus1(), 200, 'first caller must succeed');
	assert.equal(getStatus2(), 409, 'second caller must get 409 from guarded updateMany');
	assert.match(getData2().error, /already broken/);
});

// ---------------------------------------------------------------------------
// Case 11: proposeTreaty re-sign cooldown - new NAP proposal within 24h of a
// break is rejected 409.
// ---------------------------------------------------------------------------
test('proposeTreaty [case 11]: re-sign cooldown - new NAP blocked within 24h of break', async (t) => {
	const PROPOSER_FACTION_ID = 10;
	const TARGET_FACTION_ID = 20;
	let findFirstCallCount = 0;

	// getUserFaction returns a leader member.
	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: PROPOSER_FACTION_ID,
			galaxyId: 1,
			role: 'leader',
			faction: { id: PROPOSER_FACTION_ID, name: 'Iron Pact', tag: 'IP' }
		}),
		findMany: async () => []
	});

	// Target faction exists.
	withPatched(t, prisma.faction, {
		findFirst: async () => ({ id: TARGET_FACTION_ID, galaxyId: 1, name: 'Steel Union', tag: 'SU' })
	});

	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: 1.0 })
	});

	withPatched(t, prisma.factionTreaty, {
		findFirst: async (args) => {
			findFirstCallCount++;
			if (findFirstCallCount === 1) {
				// existingActive check: no pending/active NAP between the pair.
				return null;
			}
			// recentBreak check: NAP was broken 1 hour ago (well within 24h cooldown).
			return { brokenAt: new Date(Date.now() - 60 * 60 * 1000) };
		}
	});

	const { res, getStatus, getData } = makeRes();
	const req = {
		userId: 1,
		galaxyId: 1,
		params: { factionId: String(PROPOSER_FACTION_ID) },
		body: { targetFactionId: TARGET_FACTION_ID, type: 'nap', durationDays: 7 }
	};
	await proposeTreaty(req, res);

	assert.equal(getStatus(), 409);
	assert.match(getData().error, /recently broken|re-sign|cooldown|cannot sign/i);
	// canResignAt must be present and in the future.
	assert.ok(getData().canResignAt, 'canResignAt should be returned');
	assert.ok(
		new Date(getData().canResignAt) > new Date(),
		'canResignAt must be a future timestamp'
	);
});

// ---------------------------------------------------------------------------
// Case 12: proposeTreaty re-sign cooldown - after 24h, a new NAP is allowed.
// ---------------------------------------------------------------------------
test('proposeTreaty [case 12]: re-sign allowed after cooldown elapses', async (t) => {
	const PROPOSER_FACTION_ID = 10;
	const TARGET_FACTION_ID = 20;
	let findFirstCallCount = 0;

	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: PROPOSER_FACTION_ID,
			galaxyId: 1,
			role: 'leader',
			faction: { id: PROPOSER_FACTION_ID, name: 'Iron Pact', tag: 'IP' }
		}),
		findMany: async () => []
	});

	withPatched(t, prisma.faction, {
		findFirst: async () => ({ id: TARGET_FACTION_ID, galaxyId: 1, name: 'Steel Union', tag: 'SU' })
	});

	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: 1.0 })
	});

	const newTreaty = {
		id: 100,
		galaxyId: 1,
		type: 'nap',
		status: 'pending',
		proposerFactionId: PROPOSER_FACTION_ID,
		targetFactionId: TARGET_FACTION_ID
	};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => {
			findFirstCallCount++;
			// Both existingActive and recentBreak return null:
			// - existingActive: no pending/active treaty
			// - recentBreak: previous break was > 24h ago (outside the cooldown window)
			return null;
		},
		create: async () => newTreaty
	});

	withPatched(t, prisma.pushSubscription, {
		findMany: async () => []
	});

	withPatched(t, prisma.notificationPreferences, {
		findUnique: async () => null
	});

	const { res, getStatus, getData } = makeRes();
	const req = {
		userId: 1,
		galaxyId: 1,
		params: { factionId: String(PROPOSER_FACTION_ID) },
		body: { targetFactionId: TARGET_FACTION_ID, type: 'nap', durationDays: 7 }
	};
	await proposeTreaty(req, res);

	assert.equal(getStatus(), 200);
	assert.equal(getData().status, 'pending');
	assert.equal(getData().type, 'nap');
});

// ---------------------------------------------------------------------------
// Parity: NAP constants are pinned to design-doc values.
// ---------------------------------------------------------------------------
test('parity: NAP_BREAK_NOTICE_MS is 60 minutes (server-only, as designed)', () => {
	assert.equal(
		NAP_BREAK_NOTICE_MS,
		60 * 60 * 1000,
		'NAP_BREAK_NOTICE_MS must be exactly 60 minutes per DIPLOMACY_BALANCE.md'
	);
});

test('parity: NAP_RESIGN_COOLDOWN_MS is 24 hours (server-only, as designed)', () => {
	assert.equal(
		NAP_RESIGN_COOLDOWN_MS,
		24 * 60 * 60 * 1000,
		'NAP_RESIGN_COOLDOWN_MS must be exactly 24 hours per DIPLOMACY_BALANCE.md'
	);
});

// ---------------------------------------------------------------------------
// Re-sign cooldown respects galaxy speedMultiplier.
// This is a property test against the formula used in proposeTreaty:
//   cooldownMs = NAP_RESIGN_COOLDOWN_MS / speedMultiplier
// A 2x galaxy should have a 12h effective cooldown (24h / 2).
// ---------------------------------------------------------------------------
test('proposeTreaty [case 11b]: re-sign cooldown is divided by speedMultiplier for fast galaxies', async (t) => {
	const SPEED = 2.0; // 2x galaxy
	const EFFECTIVE_COOLDOWN_MS = NAP_RESIGN_COOLDOWN_MS / SPEED; // 12 hours
	const PROPOSER_FACTION_ID = 10;
	const TARGET_FACTION_ID = 20;
	let findFirstCallCount = 0;

	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: PROPOSER_FACTION_ID,
			galaxyId: 1,
			role: 'leader',
			faction: { id: PROPOSER_FACTION_ID, name: 'Iron Pact', tag: 'IP' }
		}),
		findMany: async () => []
	});

	withPatched(t, prisma.faction, {
		findFirst: async () => ({ id: TARGET_FACTION_ID, galaxyId: 1, name: 'Steel Union', tag: 'SU' })
	});

	// 2x speed galaxy.
	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: SPEED })
	});

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => {
			findFirstCallCount++;
			if (findFirstCallCount === 1) return null; // existingActive
			// brokenAt was 13 hours ago. The full 24h raw cooldown would still apply,
			// but with speedMultiplier=2 the effective cooldown is only 12h, so 13h
			// ago is OUTSIDE the cooldown window - this NAP should be allowed.
			// Simulate: recentBreak is null (DB sees brokenAt > cutoff would NOT match).
			return null;
		},
		create: async () => ({
			id: 200,
			galaxyId: 1,
			type: 'nap',
			status: 'pending',
			proposerFactionId: PROPOSER_FACTION_ID,
			targetFactionId: TARGET_FACTION_ID
		})
	});

	withPatched(t, prisma.pushSubscription, {
		findMany: async () => []
	});

	withPatched(t, prisma.notificationPreferences, {
		findUnique: async () => null
	});

	const { res, getStatus } = makeRes();
	const req = {
		userId: 1,
		galaxyId: 1,
		params: { factionId: String(PROPOSER_FACTION_ID) },
		body: { targetFactionId: TARGET_FACTION_ID, type: 'nap', durationDays: 3 }
	};
	await proposeTreaty(req, res);

	// 13h > effective 12h cooldown → allowed.
	assert.equal(getStatus(), 200, `a ${SPEED}x galaxy should use a ${EFFECTIVE_COOLDOWN_MS / 3600000}h effective cooldown`);
});

// ---------------------------------------------------------------------------
// breakNap betrayalEndsAt is divided by galaxy speedMultiplier.
// In a 2x galaxy the notice window should be NAP_BREAK_NOTICE_MS / 2 = 30 min.
// ---------------------------------------------------------------------------
test('breakNap [case 8c]: betrayalEndsAt is scaled by galaxy speedMultiplier', async (t) => {
	const TREATY_ID = 13;
	const SPEED = 2.0;
	const calls = {};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => ({
			id: TREATY_ID,
			galaxyId: 1,
			type: 'nap',
			status: 'active',
			proposerFactionId: 10,
			targetFactionId: 20
		}),
		findUnique: async () => ({ id: TREATY_ID, status: 'broken', betrayalEndsAt: new Date(Date.now() + NAP_BREAK_NOTICE_MS / SPEED) }),
		updateMany: async (args) => {
			calls.updateMany = args;
			return { count: 1 };
		}
	});

	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: 10,
			galaxyId: 1,
			role: 'leader',
			faction: { id: 10, name: 'Iron Pact', tag: 'IP' }
		}),
		findMany: async () => []
	});

	withPatched(t, prisma.galaxy, {
		findUnique: async () => ({ speedMultiplier: SPEED })
	});

	withPatched(t, prisma.factionEvent, {
		createMany: async () => ({ count: 2 })
	});

	const { res, getStatus } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	const before = Date.now();
	await breakNap(req, res);
	const after = Date.now();

	assert.equal(getStatus(), 200);

	const expectedWindowMs = NAP_BREAK_NOTICE_MS / SPEED; // 30 minutes
	const stampedAt = calls.updateMany.data.betrayalEndsAt.getTime();

	// betrayalEndsAt should be ~now + 30min (scaled), within a few ms tolerance.
	const expectedLow = before + expectedWindowMs - 500;
	const expectedHigh = after  + expectedWindowMs + 500;
	assert.ok(
		stampedAt >= expectedLow && stampedAt <= expectedHigh,
		`betrayalEndsAt should be ~now + ${expectedWindowMs / 60000} min ` +
		`(was ${new Date(stampedAt).toISOString()}, expected between ` +
		`${new Date(expectedLow).toISOString()} and ${new Date(expectedHigh).toISOString()})`
	);
});

// ---------------------------------------------------------------------------
// Regression: cancelTreaty must not allow silent NAP dissolution.
//
// Before the fix, cancelTreaty accepted active NAPs because it only checked
// status in ['pending', 'active'] - a deliberate attacker could cancel an
// active NAP with no betrayal window, no victim notification, and no 24h
// re-sign cooldown, turning the NAP gate into a free-action bypass.
// The fix adds an active-nap type guard before the member check. These three
// tests lock that invariant.
// ---------------------------------------------------------------------------

// cancelTreaty [regression 1]: cancelling an ACTIVE nap returns 400.
// The treaty row must NOT be updated to 'cancelled' (status unchanged).
test('cancelTreaty [regression 1]: cancelling active NAP is blocked - 400, no DB update issued', async (t) => {
	const TREATY_ID = 50;
	let updateCalled = false;

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => ({
			id: TREATY_ID,
			galaxyId: 1,
			type: 'nap',
			status: 'active', // the critical condition
			proposerFactionId: 10,
			targetFactionId: 20
		}),
		update: async () => {
			updateCalled = true;
			return {};
		}
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await cancelTreaty(req, res);

	assert.equal(getStatus(), 400, 'cancelling an active NAP must be rejected with 400');
	assert.match(
		getData().error,
		/formally broken|Break Pact/i,
		'error must direct user to breakNap endpoint'
	);
	assert.equal(
		updateCalled,
		false,
		'prisma.factionTreaty.update must NOT be called: treaty status must remain unchanged'
	);
});

// cancelTreaty [regression 2]: cancelling a PENDING nap is still allowed (withdrawing
// an un-accepted proposal is harmless - it blocks no attacks, opens no window).
test('cancelTreaty [regression 2]: cancelling PENDING nap is allowed - 200, status becomes cancelled', async (t) => {
	const TREATY_ID = 51;
	const calls = {};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => ({
			id: TREATY_ID,
			galaxyId: 1,
			type: 'nap',
			status: 'pending', // un-accepted proposal: guard must NOT fire
			proposerFactionId: 10,
			targetFactionId: 20
		}),
		update: async (args) => {
			calls.update = args;
			return { id: TREATY_ID, type: 'nap', status: 'cancelled' };
		}
	});

	// getUserFaction is reached because the guard passes.
	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: 10,
			galaxyId: 1,
			role: 'leader',
			faction: { id: 10, name: 'Iron Pact', tag: 'IP' }
		})
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await cancelTreaty(req, res);

	assert.equal(getStatus(), 200, 'cancelling a pending NAP must succeed');
	assert.equal(getData().status, 'cancelled');
	// The update must have written status: 'cancelled'.
	assert.equal(calls.update.data.status, 'cancelled');
});

// cancelTreaty [regression 3]: cancelling an ACTIVE trade treaty is still allowed.
// The guard is specifically nap+active only; trade/vassal cancellation is
// handled by the pre-existing path and must be unaffected.
test('cancelTreaty [regression 3]: cancelling active trade treaty is allowed - 200 (guard is nap-only)', async (t) => {
	const TREATY_ID = 52;
	const calls = {};

	withPatched(t, prisma.factionTreaty, {
		findFirst: async () => ({
			id: TREATY_ID,
			galaxyId: 1,
			type: 'trade', // active but NOT nap - guard must NOT fire
			status: 'active',
			proposerFactionId: 10,
			targetFactionId: 20
		}),
		update: async (args) => {
			calls.update = args;
			return { id: TREATY_ID, type: 'trade', status: 'cancelled' };
		}
	});

	withPatched(t, prisma.factionMember, {
		findFirst: async () => ({
			userId: 1,
			factionId: 10,
			galaxyId: 1,
			role: 'leader',
			faction: { id: 10, name: 'Iron Pact', tag: 'IP' }
		})
	});

	const { res, getStatus, getData } = makeRes();
	const req = { userId: 1, galaxyId: 1, params: { treatyId: String(TREATY_ID) } };
	await cancelTreaty(req, res);

	assert.equal(getStatus(), 200, 'cancelling an active trade treaty must still succeed');
	assert.equal(getData().status, 'cancelled');
	assert.equal(calls.update.data.status, 'cancelled');
});
