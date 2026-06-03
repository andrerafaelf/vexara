import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStealthScoutFailChance,
  getStealthVaultPerResource,
  partitionStealthVault
} from '../utils/gameConstants.js';

test('scout-fail chance is 0 at L0 and 1.5% per level up to a 22.5% cap at L15', () => {
  assert.equal(getStealthScoutFailChance(0), 0);
  assert.ok(Math.abs(getStealthScoutFailChance(1) - 0.015) < 1e-9);
  assert.ok(Math.abs(getStealthScoutFailChance(10) - 0.15) < 1e-9);
  assert.ok(Math.abs(getStealthScoutFailChance(15) - 0.225) < 1e-9);
  // Hard cap kicks in past Lv15. Stealth Array's max level is 15 in current
  // building config, but the helper must clamp anyway in case rules drift.
  assert.equal(getStealthScoutFailChance(20), 0.225);
});

test('hidden vault is 0 at L0 and lands ~49k per resource at L15', () => {
  assert.equal(getStealthVaultPerResource(0), 0);
  // floor(550 * 1.35^15) = floor(89576.something) - wait, let me redo: actual
  // 550 * 1.35^15 ≈ 49267. Confirm the design-doc target.
  const v15 = getStealthVaultPerResource(15);
  assert.ok(v15 > 48000 && v15 < 50000, `expected ~49k, got ${v15}`);
});

test('hidden vault grows by a factor of 1.35 per level', () => {
  for (let lvl = 1; lvl <= 14; lvl++) {
    const here = getStealthVaultPerResource(lvl);
    const next = getStealthVaultPerResource(lvl + 1);
    // Allow a small tolerance to absorb the floor in each helper call.
    const ratio = next / here;
    assert.ok(Math.abs(ratio - 1.35) < 0.02, `level ${lvl}: ratio ${ratio}`);
  }
});

test('partitionStealthVault hides up to the cap and exposes the surplus', () => {
  // Below cap: everything hidden, nothing visible.
  assert.deepEqual(partitionStealthVault(500, 5), { visible: 0, hidden: 500 });
  // Above cap: cap hidden, rest visible.
  const cap5 = getStealthVaultPerResource(5);
  const total = cap5 + 1000;
  assert.deepEqual(partitionStealthVault(total, 5), {
    visible: 1000,
    hidden: cap5
  });
});

test('partitionStealthVault with no Stealth Array hides nothing', () => {
  assert.deepEqual(partitionStealthVault(10000, 0), { visible: 10000, hidden: 0 });
});

test('partitionStealthVault is robust to bad inputs', () => {
  assert.deepEqual(partitionStealthVault(-5, 5), { visible: 0, hidden: 0 });
  assert.deepEqual(partitionStealthVault(0, 5), { visible: 0, hidden: 0 });
});
