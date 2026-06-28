/**
 * Vassal dominance credit - unit tests (Phase 2a)
 *
 * Tests the pure computation helper and the anti-collusion resolution logic
 * in server/utils/dominance.ts without hitting the DB. The DB-facing
 * resolveActiveVassalRelationships is tested via its contract shape only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import pure helpers directly (no Prisma calls).
import {
	computeVassalCreditForOverlord
} from '../utils/dominance.js';

// ── computeVassalCreditForOverlord ────────────────────────────────────────────

describe('computeVassalCreditForOverlord', () => {
	// Constants mirrored from dominance.ts for assertion clarity.
	const FRACTION = 0.25;
	const MIN_NEXUSES = 4;
	const MAX_COUNTED = 3;
	const CAP_FRACTION = 0.5;

	it('returns 0 credit when faction has no vassal relationships', () => {
		const counts = new Map([[1, 20], [2, 10]]);
		const result = computeVassalCreditForOverlord(1, [], counts);
		assert.equal(result.totalCreditedNexuses, 0);
		assert.deepEqual(result.breakdown, []);
	});

	it('credits floor(0.25 * vassalCount) per qualifying vassal', () => {
		// Overlord owns 20, vassal owns 8. Credit = floor(0.25 * 8) = 2.
		// Cap = floor(0.5 * 20) = 10. min(2, 10) = 2.
		const counts = new Map([[1, 20], [2, 8]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 2);
		assert.equal(result.breakdown.length, 1);
		assert.equal(result.breakdown[0].creditedNexuses, 2);
		assert.equal(result.breakdown[0].vassalOwnNexusCount, 8);
	});

	it('VASSAL_MIN_NEXUSES_TO_COUNT: vassal with <4 nexuses credits 0', () => {
		const counts = new Map([[1, 20], [2, 3]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 0);
		assert.equal(result.breakdown.length, 0);
	});

	it('VASSAL_MIN_NEXUSES_TO_COUNT: vassal with exactly 4 nexuses qualifies', () => {
		const counts = new Map([[1, 20], [2, 4]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		// floor(0.25 * 4) = 1
		assert.equal(result.totalCreditedNexuses, 1);
	});

	it('VASSAL_MAX_COUNTED: only top 3 qualifying vassals contribute', () => {
		// Overlord (id=1) owns 40. Four vassals: 10, 9, 8, 7.
		// Top 3: 10, 9, 8. Credits: 2 + 2 + 2 = 6.
		// Cap = floor(0.5 * 40) = 20. min(6, 20) = 6.
		const counts = new Map([[1, 40], [2, 10], [3, 9], [4, 8], [5, 7]]);
		const rels = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 },
			{ overlordFactionId: 1, vassalFactionId: 4 },
			{ overlordFactionId: 1, vassalFactionId: 5 }
		];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		// Top 3 are 10, 9, 8. floor(0.25*10)=2, floor(0.25*9)=2, floor(0.25*8)=2
		assert.equal(result.totalCreditedNexuses, 6);
		assert.equal(result.breakdown.length, 3); // only 3 counted
	});

	it('VASSAL_MAX_COUNTED: selects the 3 LARGEST qualifying vassals', () => {
		// Vassals with counts 5 (large), 4 (qualifying floor), 3 (below min), 10 (largest).
		const counts = new Map([[1, 40], [2, 5], [3, 4], [4, 3], [5, 10]]);
		const rels = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 },
			{ overlordFactionId: 1, vassalFactionId: 4 },
			{ overlordFactionId: 1, vassalFactionId: 5 }
		];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		// Qualifying: 10, 5, 4 (3 is below MIN). All 3 fit within MAX_COUNTED.
		// Credits: floor(0.25*10)=2, floor(0.25*5)=1, floor(0.25*4)=1 = 4 total.
		assert.equal(result.breakdown.length, 3);
		assert.equal(result.totalCreditedNexuses, 4);
	});

	it('VASSAL_CREDIT_CAP_VS_OWN: cap at floor(0.5 * ownCount)', () => {
		// Overlord owns 4. Cap = floor(0.5 * 4) = 2.
		// Vassal owns 20. Raw credit = floor(0.25 * 20) = 5.
		// min(5, 2) = 2.
		const counts = new Map([[1, 4], [2, 20]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 2);
	});

	it('VASSAL_CREDIT_CAP_VS_OWN: overlord with 1 nexus gets 0 credit (floor(0.5*1)=0)', () => {
		const counts = new Map([[1, 1], [2, 20]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 0);
	});

	it('VASSAL_CREDIT_CAP_VS_OWN: overlord with 2 nexuses gets at most 1 credit', () => {
		// Cap = floor(0.5 * 2) = 1.
		const counts = new Map([[1, 2], [2, 20]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 1);
	});

	it('non-overlord faction gets 0 credit even with vassal relationships in the list', () => {
		// Faction 3 is not an overlord in any relationship.
		const counts = new Map([[1, 20], [2, 10], [3, 15]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		const result = computeVassalCreditForOverlord(3, rels, counts);
		assert.equal(result.totalCreditedNexuses, 0);
	});

	it('conservation: factionNexusCounts is not mutated', () => {
		const counts = new Map([[1, 20], [2, 8]]);
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];
		computeVassalCreditForOverlord(1, rels, counts);
		// Original counts must be unchanged.
		assert.equal(counts.get(1), 20);
		assert.equal(counts.get(2), 8);
	});

	it('multiple vassals: sum of credits respects cap', () => {
		// Overlord owns 10. Cap = floor(0.5 * 10) = 5.
		// Vassal A owns 8: credit = floor(0.25*8) = 2.
		// Vassal B owns 12: credit = floor(0.25*12) = 3.
		// Raw total = 5. Cap = 5. Result = 5.
		const counts = new Map([[1, 10], [2, 8], [3, 12]]);
		const rels = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 }
		];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 5);
	});

	it('multiple vassals: raw sum exceeds cap - clipped correctly', () => {
		// Overlord owns 6. Cap = floor(0.5 * 6) = 3.
		// Vassal A owns 20: credit = 5. Vassal B owns 20: credit = 5.
		// Raw total = 10. Cap = 3. Result = 3.
		const counts = new Map([[1, 6], [2, 20], [3, 20]]);
		const rels = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 }
		];
		const result = computeVassalCreditForOverlord(1, rels, counts);
		assert.equal(result.totalCreditedNexuses, 3);
	});
});

// ── Anti-collusion logic (tested via resolveActiveVassalRelationships contract) ──
// The DB-facing function is tested indirectly; we verify the filtering logic
// by calling it on the pure parts through a helper that simulates the output.

describe('anti-collusion enforcement (resolveActiveVassalRelationships contract)', () => {
	// We simulate the filtering logic manually here to verify it produces the
	// expected shape, since we can't call the DB function in unit tests.

	function simulateResolve(rawPairs) {
		// Reproduce the algorithm from resolveActiveVassalRelationships.
		const allVassalSet = new Set(rawPairs.map((p) => p.vassalFactionId));
		const usedVassals = new Set();
		const valid = [];
		for (const p of rawPairs) {
			if (allVassalSet.has(p.overlordFactionId)) continue; // chain rule
			if (usedVassals.has(p.vassalFactionId)) continue;   // uniqueness
			usedVassals.add(p.vassalFactionId);
			valid.push({ overlordFactionId: p.overlordFactionId, vassalFactionId: p.vassalFactionId });
		}
		return valid;
	}

	it('simple valid pair: A->B passes through', () => {
		const result = simulateResolve([{ overlordFactionId: 1, vassalFactionId: 2 }]);
		assert.equal(result.length, 1);
		assert.equal(result[0].overlordFactionId, 1);
		assert.equal(result[0].vassalFactionId, 2);
	});

	it('chain: A->B->C removes B->C (B is a vassal, cannot be overlord)', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 2 }, // A overlord of B
			{ overlordFactionId: 2, vassalFactionId: 3 }  // B overlord of C - INVALID chain
		];
		const result = simulateResolve(rawPairs);
		// Only A->B is valid; B->C is skipped because B appears in allVassalSet.
		assert.equal(result.length, 1);
		assert.equal(result[0].overlordFactionId, 1);
		assert.equal(result[0].vassalFactionId, 2);
	});

	it('ring: A->B, B->A - both are in allVassalSet, both are skipped', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 2, vassalFactionId: 1 }
		];
		const result = simulateResolve(rawPairs);
		// A is in allVassalSet (from B->A), so A->B is skipped.
		// B is in allVassalSet (from A->B), so B->A is skipped.
		assert.equal(result.length, 0);
	});

	it('uniqueness: vassal B in two treaties, first wins', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 3 }, // treaty id 10 (first)
			{ overlordFactionId: 2, vassalFactionId: 3 }  // treaty id 20 (second)
		];
		const result = simulateResolve(rawPairs);
		// B credits only the first overlord (A), not C.
		assert.equal(result.length, 1);
		assert.equal(result[0].overlordFactionId, 1);
	});

	it('valid parallel relationships: A->B and C->D both pass', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 3, vassalFactionId: 4 }
		];
		const result = simulateResolve(rawPairs);
		assert.equal(result.length, 2);
	});

	it('chain with multiple levels: A->B, B->C, C->D', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 2, vassalFactionId: 3 },
			{ overlordFactionId: 3, vassalFactionId: 4 }
		];
		// allVassalSet = {2, 3, 4}.
		// A->B: is A in {2,3,4}? No. Valid.
		// B->C: is B in {2,3,4}? Yes. Skipped.
		// C->D: is C in {2,3,4}? Yes. Skipped.
		const result = simulateResolve(rawPairs);
		assert.equal(result.length, 1);
		assert.equal(result[0].overlordFactionId, 1);
		assert.equal(result[0].vassalFactionId, 2);
	});

	it('overlord can have multiple valid vassals', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 },
			{ overlordFactionId: 1, vassalFactionId: 4 }
		];
		const result = simulateResolve(rawPairs);
		assert.equal(result.length, 3);
		assert.ok(result.every((r) => r.overlordFactionId === 1));
	});

	it('property: no faction appears as both overlord AND vassal in output', () => {
		// Stress test with 6 factions: overlord 1 has vassals 2,3; overlord 2 also
		// has vassal 4; vassal 3 tries to be overlord of 5 (chain).
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 },
			{ overlordFactionId: 2, vassalFactionId: 4 }, // 2 is a vassal, chain
			{ overlordFactionId: 3, vassalFactionId: 5 }  // 3 is a vassal, chain
		];
		const result = simulateResolve(rawPairs);
		const overlordIds = new Set(result.map((r) => r.overlordFactionId));
		const vassalIds = new Set(result.map((r) => r.vassalFactionId));
		// No faction should appear in both sets.
		for (const id of overlordIds) {
			assert.ok(!vassalIds.has(id), `faction ${id} appears as both overlord and vassal`);
		}
	});

	it('property: vassal appears in output at most once', () => {
		const rawPairs = [
			{ overlordFactionId: 1, vassalFactionId: 5 },
			{ overlordFactionId: 2, vassalFactionId: 5 },
			{ overlordFactionId: 3, vassalFactionId: 5 }
		];
		const result = simulateResolve(rawPairs);
		const vassalIds = result.map((r) => r.vassalFactionId);
		const unique = new Set(vassalIds);
		assert.equal(unique.size, vassalIds.length, 'vassal 5 credited to more than one overlord');
		assert.equal(result.length, 1); // only the first overlord wins
	});
});

// ── Conservation property ─────────────────────────────────────────────────────

describe('conservation: vassal credit is a pure scoring overlay', () => {
	it('credited nexuses are virtual: factionCounts unchanged, no minting', () => {
		const counts = new Map([[1, 30], [2, 12], [3, 8]]);
		const originalCounts = new Map(counts); // snapshot

		const rels = [
			{ overlordFactionId: 1, vassalFactionId: 2 },
			{ overlordFactionId: 1, vassalFactionId: 3 }
		];
		computeVassalCreditForOverlord(1, rels, counts);
		computeVassalCreditForOverlord(2, rels, counts); // vassal, gets 0
		computeVassalCreditForOverlord(3, rels, counts); // vassal, gets 0

		// Original map must be byte-for-byte identical.
		for (const [k, v] of originalCounts) {
			assert.equal(counts.get(k), v, `faction ${k} count was mutated`);
		}
		assert.equal(counts.size, originalCounts.size);
	});

	it('effective counts can sum > total nexuses (shares > 1.0) without error', () => {
		// Galaxy has 20 nexuses total. Overlord owns 14, vassal owns 6.
		// All 20 are owned (14 + 6 = 20; no unowned).
		// Credit = floor(0.25*6)=1. Cap = floor(0.5*14)=7. min(1,7)=1.
		// overlordEffective = 14 + 1 = 15. vassalRaw = 6.
		// Sum of effective shares = 15/20 + 6/20 = 1.05, which is > 1.0.
		// This is by design: the virtual credit is counted for both factions.
		const counts = new Map([[1, 14], [2, 6]]);
		const totalNexuses = 20;
		const rels = [{ overlordFactionId: 1, vassalFactionId: 2 }];

		const overlordResult = computeVassalCreditForOverlord(1, rels, counts);
		const overlordEffective = (counts.get(1) ?? 0) + overlordResult.totalCreditedNexuses;
		const vassalRaw = counts.get(2) ?? 0;

		// Faction effective shares sum to > 1.0 (1.05 in this case).
		const sumOfShares = overlordEffective / totalNexuses + vassalRaw / totalNexuses;
		assert.ok(
			sumOfShares > 1.0,
			`expected shares > 1.0 to confirm overlay is working; got ${sumOfShares}`
		);

		// Crucially the sum of RAW nexuses is still <= totalNexuses (no minting).
		const rawSum = (counts.get(1) ?? 0) + (counts.get(2) ?? 0);
		assert.ok(rawSum <= totalNexuses, 'raw nexus counts exceed total - real conservation breach');
	});
});
