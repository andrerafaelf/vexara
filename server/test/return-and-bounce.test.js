import assert from 'node:assert/strict';
import test from 'node:test';
import { RETURN_TRAVEL_MULTIPLIER } from '../utils/gameConstants.js';

// --- Return travel time --------------------------------------------------
// Returns (post-combat survivors, scouts heading home, bounced support, and
// recalled transfers) take RETURN_TRAVEL_MULTIPLIER * the original one-way
// travel time. 0 means near-instant: returnsAt collapses to "now" and the
// troops land on the next job tick. Guard the intended value so a refactor
// can't silently restore a full round trip.
test('RETURN_TRAVEL_MULTIPLIER makes returns near-instant', () => {
  assert.equal(RETURN_TRAVEL_MULTIPLIER, 0);
  assert.ok(
    RETURN_TRAVEL_MULTIPLIER >= 0 && RETURN_TRAVEL_MULTIPLIER <= 1,
    'multiplier must stay within [0,1] (0 = instant, 1 = full round trip)'
  );
});

test('return time is the outbound trip scaled by the multiplier', () => {
  const outboundMs = 42 * 60 * 1000; // arbitrary 42-minute one-way trip
  const returnMs = outboundMs * RETURN_TRAVEL_MULTIPLIER;
  assert.equal(returnMs, 0, 'with the multiplier at 0 the return is instant');
});

// --- Self-owned bounce suppression --------------------------------------
// When an earlier wave conquers a nexus, later waves arrive to find it already
// attacker-owned and bounce home untouched. Those rows carry
// result.reason === 'target_self_owned' and must NOT appear as combat reports
// (they previously rendered as a phantom "Defeat"). This mirrors the predicate
// used in reportService.getReportsForNexus / getUnreadNexusIds and
// reportController's summary + history paths.
const isPhantomBounce = (attack) =>
  attack?.result?.reason === 'target_self_owned';

test('self-owned bounce rows are identified for suppression', () => {
  const bounce = {
    id: 1,
    result: { mission: 'attack', victory: false, reason: 'target_self_owned' }
  };
  const realDefeat = {
    id: 2,
    result: { mission: 'attack', victory: false, reason: 'repelled' }
  };
  const realVictory = {
    id: 3,
    result: { mission: 'attack', victory: true, conquered: true }
  };

  assert.equal(isPhantomBounce(bounce), true);
  assert.equal(isPhantomBounce(realDefeat), false);
  assert.equal(isPhantomBounce(realVictory), false);
});

test('filtering bounces leaves real engagements untouched', () => {
  const rows = [
    { id: 1, result: { victory: false, reason: 'target_self_owned' } },
    { id: 2, result: { victory: true, conquered: true } },
    { id: 3, result: { victory: false, reason: 'repelled' } },
    { id: 4, result: { victory: false, reason: 'target_self_owned' } }
  ];
  const kept = rows.filter((r) => !isPhantomBounce(r)).map((r) => r.id);
  assert.deepEqual(kept, [2, 3]);
});

test('isPhantomBounce tolerates missing/empty result', () => {
  assert.equal(isPhantomBounce({ id: 1, result: null }), false);
  assert.equal(isPhantomBounce({ id: 2, result: {} }), false);
  assert.equal(isPhantomBounce({ id: 3 }), false);
});
