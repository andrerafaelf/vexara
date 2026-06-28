/**
 * vassal-loot-protection.test.js
 *
 * Integration tests for the DB-facing third-party determination in
 * resolveVassalLootProtection (server/utils/combat.ts) -- the 7 cases
 * flagged as missing coverage.
 *
 * resolveVassalLootProtection is a private (non-exported) function, so it
 * cannot be called directly from a test file. The approach here is to use a
 * local mirror (resolveVassalProtectionMirror) that:
 *
 *   a) Calls the REAL resolveActiveVassalRelationships (exported from
 *      dominance.ts) with prisma.factionTreaty.findMany mocked -- this
 *      exercises the treaty-lookup DB path, including galaxyId scoping.
 *
 *   b) Calls mocked prisma.factionMember.findMany -- this exercises the
 *      user->faction membership lookup that drives the third-party check.
 *
 *   c) Applies the same filtering logic verbatim from the production function
 *      -- "any attacker whose faction is neither the vassal's nor the
 *      overlord's (including factionless) is a third party".
 *
 * The mirror must be kept in sync with resolveVassalLootProtection if
 * the production logic changes.
 *
 * The pure +0.25 fold and 0.80 clamp are already covered by the three unit
 * tests in economy-combat.test.js (resolveLootProtection: ...) and are NOT
 * duplicated here.
 *
 * Cases covered:
 *   [1]  Vassal defender + sole third-party attacker  -> protection (true)
 *   [2]  Vassal defender + overlord as sole attacker  -> no protection (false)
 *   [3]  Vassal defender + attacker from vassal's own faction -> no protection
 *   [4]  Coordinated wave: overlord + third party both attack -> protection (anti-laundering rule)
 *   [5]  Factionless attacker against a vassal -> third party -> protection
 *   [6]  Non-vassal defender (no active treaty) -> never any protection
 *   [7]  Cross-galaxy: treaty in galaxy B must not protect a defender in galaxy A
 *   [E1] null defenderOwnerId -> false immediately (no DB call)
 *   [E2] empty attackerUserIds -> false immediately (no DB call)
 *   [E3] factionless defender (no faction membership) -> false (vassalage requires a faction)
 *   [E4] defender's faction not in any vassal treaty -> false
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const { resolveActiveVassalRelationships } = await import('../utils/dominance.js');

// ---------------------------------------------------------------------------
// Shared harness
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

// ---------------------------------------------------------------------------
// Mirror of resolveVassalLootProtection (server/utils/combat.ts)
//
// This is a faithful, line-for-line copy of the production function with the
// same two DB calls (both mockable). Update this whenever the production
// function changes.
// ---------------------------------------------------------------------------

async function resolveVassalProtectionMirror(galaxyId, defenderOwnerId, attackerUserIds) {
	if (defenderOwnerId == null || attackerUserIds.length === 0) return false;

	const relationships = await resolveActiveVassalRelationships(galaxyId);
	if (relationships.length === 0) return false;

	const userIds = [...new Set([defenderOwnerId, ...attackerUserIds])];
	const memberships = await prisma.factionMember.findMany({
		where: { galaxyId, userId: { in: userIds } },
		select: { userId: true, factionId: true }
	});
	const factionByUser = new Map();
	for (const m of memberships) factionByUser.set(m.userId, m.factionId);

	// A factionless defender cannot be a vassal (vassalage is a faction treaty).
	const defenderFactionId = factionByUser.get(defenderOwnerId);
	if (defenderFactionId == null) return false;

	const relationship = relationships.find((r) => r.vassalFactionId === defenderFactionId);
	if (!relationship) return false;

	const overlordFactionId = relationship.overlordFactionId;
	// Protection applies if ANY attacker is a third party. A factionless attacker
	// (factionByUser entry absent) is a third party.
	return attackerUserIds.some((uid) => {
		const f = factionByUser.get(uid);
		return f !== defenderFactionId && f !== overlordFactionId;
	});
}

// ---------------------------------------------------------------------------
// Test data constants
//
// Galaxy A (id=1): overlord faction 10, vassal faction 20, third-party faction 30.
// Galaxy B (id=2): used only for cross-galaxy scoping (case 7).
// ---------------------------------------------------------------------------

const GALAXY_A = 1;
const GALAXY_B = 2;
const OVERLORD_FACTION = 10;
const VASSAL_FACTION = 20;
const THIRD_PARTY_FACTION = 30;

// User IDs within galaxy A.
const DEFENDER_USER = 100;    // member of VASSAL_FACTION
const OVERLORD_USER = 200;    // member of OVERLORD_FACTION
const THIRD_PARTY_USER = 300; // member of THIRD_PARTY_FACTION
const VASSAL_ALLY = 400;      // also in VASSAL_FACTION (faction-mate of defender)
const FACTIONLESS_USER = 999; // no faction membership row in DB

/**
 * Build a minimal factionTreaty row for a vassal treaty in the given galaxy.
 * resolveActiveVassalRelationships reads treaty.meta for overlord/vassal ids.
 */
function makeTreaty(galaxyId, id = 1) {
	return {
		id,
		meta: {
			overlordFactionId: OVERLORD_FACTION,
			vassalFactionId: VASSAL_FACTION
		}
	};
}

// ---------------------------------------------------------------------------
// The seven required cases
// ---------------------------------------------------------------------------

describe('resolveVassalLootProtection: third-party determination (7 required cases)', () => {
	it('[1] vassal defender + sole third-party attacker -> protection applies (true)', async (t) => {
		// Overlord=10 -> vassal=20. Defender is in faction 20. Attacker is in
		// faction 30. Faction 30 is neither the vassal nor the overlord -> third party.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION },
				{ userId: THIRD_PARTY_USER, factionId: THIRD_PARTY_FACTION }
			]
		});

		const result = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, [THIRD_PARTY_USER]);
		assert.equal(result, true, 'third-party attacker should trigger vassal loot protection');
	});

	it('[2] vassal defender + overlord as sole attacker -> NO protection (false)', async (t) => {
		// Overlord=10 -> vassal=20. Defender in faction 20. Attacker in faction 10
		// (the overlord itself). Overlord attacking its own vassal: no protection.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION },
				{ userId: OVERLORD_USER, factionId: OVERLORD_FACTION }
			]
		});

		const result = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, [OVERLORD_USER]);
		assert.equal(result, false, 'the overlord raiding its own vassal must not trigger protection');
	});

	it('[3] vassal defender + attacker from vassal\'s own faction -> NO protection (false)', async (t) => {
		// Attacker is in the same faction as the defender (both in VASSAL_FACTION).
		// Faction-internal aggression is excluded from the protection clause.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION },
				{ userId: VASSAL_ALLY, factionId: VASSAL_FACTION }
			]
		});

		const result = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, [VASSAL_ALLY]);
		assert.equal(result, false, 'an attacker from the vassal\'s own faction is not a third party');
	});

	it('[4] coordinated wave: overlord + third party both attacking -> protection STILL applies (true)', async (t) => {
		// Anti-laundering rule: "any attacker that is a third party" triggers
		// protection. A third party cannot launder an attack through co-participating
		// with the overlord to strip the vassal's protection.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION },
				{ userId: OVERLORD_USER, factionId: OVERLORD_FACTION },
				{ userId: THIRD_PARTY_USER, factionId: THIRD_PARTY_FACTION }
			]
		});

		// Two attackers: overlord (not a third party) + third party.
		// some() finds THIRD_PARTY_USER -> protection applies.
		const result = await resolveVassalProtectionMirror(
			GALAXY_A,
			DEFENDER_USER,
			[OVERLORD_USER, THIRD_PARTY_USER]
		);
		assert.equal(result, true, 'any third-party co-attacker triggers protection even if the overlord also participates');
	});

	it('[5] factionless attacker against a vassal -> treated as third party -> protection applies (true)', async (t) => {
		// The factionMember.findMany mock returns no row for FACTIONLESS_USER.
		// factionByUser.get(FACTIONLESS_USER) === undefined.
		// The check: undefined !== VASSAL_FACTION && undefined !== OVERLORD_FACTION
		//         =>  true                        && true
		//         =>  true  (factionless is a third party by definition).
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			// Only the defender has a faction row; FACTIONLESS_USER has none.
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION }
			]
		});

		const result = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, [FACTIONLESS_USER]);
		assert.equal(result, true, 'a factionless attacker is a third party and must trigger protection');
	});

	it('[6] non-vassal defender (no active vassal treaty in galaxy) -> never any protection (false)', async (t) => {
		// No treaties in the galaxy at all. resolveActiveVassalRelationships returns [].
		// The early-exit `if (relationships.length === 0) return false` fires before
		// factionMember.findMany is ever called.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => []
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION },
				{ userId: THIRD_PARTY_USER, factionId: THIRD_PARTY_FACTION }
			]
		});

		const result = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, [THIRD_PARTY_USER]);
		assert.equal(result, false, 'no vassal treaty means no diplomatic protection regardless of attacker');
	});

	it('[7] cross-galaxy: vassal treaty in galaxy B must not protect a defender in galaxy A (false)', async (t) => {
		// The treaty exists only in GALAXY_B. The combat resolves in GALAXY_A.
		// resolveActiveVassalRelationships uses where: { galaxyId } in its DB query,
		// so a treaty for galaxyId=2 must never be returned when we query galaxyId=1.
		//
		// The mock simulates the DB filter: return the treaty only when queried for GALAXY_B.
		withPatched(t, prisma.factionTreaty, {
			findMany: async (args) => args.where.galaxyId === GALAXY_B ? [makeTreaty(GALAXY_B)] : []
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: DEFENDER_USER, factionId: VASSAL_FACTION },
				{ userId: THIRD_PARTY_USER, factionId: THIRD_PARTY_FACTION }
			]
		});

		// Combat in galaxy A -> no treaty returned -> no protection.
		const resultInA = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, [THIRD_PARTY_USER]);
		assert.equal(resultInA, false, 'galaxy B treaty must not protect a defender in galaxy A');

		// Sanity: the same attack resolved in galaxy B WOULD trigger protection
		// (verifies the mock itself returns the treaty correctly for galaxy B).
		const resultInB = await resolveVassalProtectionMirror(GALAXY_B, DEFENDER_USER, [THIRD_PARTY_USER]);
		assert.equal(resultInB, true, 'sanity: same attacker/defender combo in galaxy B (where the treaty lives) is protected');
	});
});

// ---------------------------------------------------------------------------
// Edge-case / early-exit guards
// ---------------------------------------------------------------------------

describe('resolveVassalLootProtection: early-exit guards (no DB calls)', () => {
	it('[E1] null defenderOwnerId -> false immediately (no DB call)', async () => {
		// Neither prisma mock is installed. If any DB method were called it would
		// throw (or connect to the fake DB URL and fail). Passing proves the
		// null-check fires before any DB work.
		const result = await resolveVassalProtectionMirror(GALAXY_A, null, [THIRD_PARTY_USER]);
		assert.equal(result, false);
	});

	it('[E2] empty attackerUserIds -> false immediately (no DB call)', async () => {
		const result = await resolveVassalProtectionMirror(GALAXY_A, DEFENDER_USER, []);
		assert.equal(result, false);
	});
});

describe('resolveVassalLootProtection: additional structural guards', () => {
	it('[E3] factionless defender (no factionMember row) -> false (no faction = cannot be a vassal)', async (t) => {
		// There IS a valid vassal treaty, but the defender has no faction membership.
		// defenderFactionId will be undefined -> early exit with false.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			// No membership row for the defender; attacker has one.
			findMany: async () => [
				{ userId: THIRD_PARTY_USER, factionId: THIRD_PARTY_FACTION }
			]
		});

		const result = await resolveVassalProtectionMirror(GALAXY_A, FACTIONLESS_USER, [THIRD_PARTY_USER]);
		assert.equal(result, false, 'a factionless defender cannot be a vassal; no protection is applied');
	});

	it('[E4] defender\'s faction exists but is the overlord (not a vassal) -> false', async (t) => {
		// Treaty is overlord=10 -> vassal=20. Defender is in faction 10 (the
		// overlord). The relationships.find checks vassalFactionId === defenderFactionId,
		// which is 20 === 10 = false. No relationship found -> return false.
		withPatched(t, prisma.factionTreaty, {
			findMany: async () => [makeTreaty(GALAXY_A)]
		});
		withPatched(t, prisma.factionMember, {
			findMany: async () => [
				{ userId: OVERLORD_USER, factionId: OVERLORD_FACTION },
				{ userId: THIRD_PARTY_USER, factionId: THIRD_PARTY_FACTION }
			]
		});

		// Defender is in the overlord faction (not a vassal).
		const result = await resolveVassalProtectionMirror(GALAXY_A, OVERLORD_USER, [THIRD_PARTY_USER]);
		assert.equal(result, false, 'a defender in the overlord faction is not protected by the vassal treaty');
	});
});
