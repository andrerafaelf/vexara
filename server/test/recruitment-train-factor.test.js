import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecruitmentTrainFactor } from '../utils/gameConstants.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('factor is 1.0 at level 0 and -9%/level through level 15', () => {
  assert.equal(getRecruitmentTrainFactor(0), 1);
  assert.ok(approx(getRecruitmentTrainFactor(5), Math.pow(0.91, 5)));
  assert.ok(approx(getRecruitmentTrainFactor(15), Math.pow(0.91, 15)));
});

test('factor flattens to -5%/level for 16-20 and is continuous at 15', () => {
  // Continuity: the L15 value is the pure 0.91^15 with no late term yet.
  assert.ok(approx(getRecruitmentTrainFactor(15), Math.pow(0.91, 15)));
  // L20 = 0.91^15 * 0.95^5, NOT 0.91^20.
  assert.ok(approx(getRecruitmentTrainFactor(20), Math.pow(0.91, 15) * Math.pow(0.95, 5)));
  assert.ok(getRecruitmentTrainFactor(20) > Math.pow(0.91, 20), 'flattened tail must be slower than raw 0.91^20');
});

test('maxed Lv20 trains ~5.3x faster (factor ~0.188)', () => {
  const f = getRecruitmentTrainFactor(20);
  assert.ok(f > 0.185 && f < 0.19, `expected ~0.188, got ${f}`);
  const speedup = 1 / f;
  assert.ok(speedup > 5.2 && speedup < 5.4, `expected ~5.3x, got ${speedup}`);
});
