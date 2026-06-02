import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMaxTrainingQueueSlots,
  getTrainingChains,
  trainingChainFor,
} from '../utils/gameConstants.js';

test('pre-veteran (CC<15): combat units collapse into one combat chain', () => {
  for (const cc of [0, 10, 14]) {
    assert.deepEqual(getTrainingChains(cc), ['combat', 'special']);
    // Every fighting unit maps to `combat`, regardless of its counter class.
    assert.equal(trainingChainFor('skimmerBike', cc), 'combat'); // mobile
    assert.equal(trainingChainFor('assaultTrooper', cc), 'combat'); // armor
    assert.equal(trainingChainFor('lancerDrone', cc), 'combat'); // fire
    // Recon + overseer are always special.
    assert.equal(trainingChainFor('reconOperative', cc), 'special');
    assert.equal(trainingChainFor('overseer', cc), 'special');
  }
});

test('veteran (CC>=15): combat chain splits into mobile/armor/fire', () => {
  for (const cc of [15, 18, 20]) {
    assert.deepEqual(getTrainingChains(cc), ['mobile', 'armor', 'fire', 'special']);
    assert.equal(trainingChainFor('skimmerBike', cc), 'mobile');
    assert.equal(trainingChainFor('voidStalker', cc), 'mobile');
    assert.equal(trainingChainFor('assaultTrooper', cc), 'armor');
    assert.equal(trainingChainFor('siegeMech', cc), 'armor');
    assert.equal(trainingChainFor('lancerDrone', cc), 'fire');
    assert.equal(trainingChainFor('plasmaTurret', cc), 'fire');
    assert.equal(trainingChainFor('overseer', cc), 'special');
    assert.equal(trainingChainFor('reconOperative', cc), 'special');
  }
});

test('the CC15 boundary flips exactly at the veteran threshold', () => {
  assert.equal(trainingChainFor('skimmerBike', 14), 'combat');
  assert.equal(trainingChainFor('skimmerBike', 15), 'mobile');
});

test('slot budget: pre-veteran keeps 5, veteran is the tight base 2 + CC18/19 ramp', () => {
  // Pre-veteran: legacy 5 per chain, no bonus below CC15.
  assert.equal(getMaxTrainingQueueSlots(0), 5);
  assert.equal(getMaxTrainingQueueSlots(14), 5);
  // Veteran base is deliberately tight (additive parallelism, not faster rebuild).
  assert.equal(getMaxTrainingQueueSlots(15), 2);
  assert.equal(getMaxTrainingQueueSlots(17), 2);
  // CC18/19 each add one slot, capped at +2.
  assert.equal(getMaxTrainingQueueSlots(18), 3);
  assert.equal(getMaxTrainingQueueSlots(19), 4);
  assert.equal(getMaxTrainingQueueSlots(20), 4);
});
