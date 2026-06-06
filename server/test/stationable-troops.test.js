import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STATIONABLE_TROOPS,
  isStationableTroop,
  NON_STATIONABLE_TROOPS,
  canStationTroop,
} from '../utils/gameConstants.js';
import { TROOP_KEYS } from '../types/index.js';

// STATIONABLE_TROOPS is the canonical "anvils" list (combat-balance tuning), NOT
// the deployment gate. isStationableTroop tests below pin that list; the
// canStationTroop tests further down pin the actual support/transfer rule.
test('only the five anvils are stationable', () => {
  assert.deepEqual([...STATIONABLE_TROOPS].sort(), [
    'aegisSkirmisher',
    'arcDisruptor',
    'assaultTrooper',
    'bulwarkGuard',
    'siegeMech',
  ]);
});

test('isStationableTroop accepts defensive (anvil) units', () => {
  for (const t of [
    'assaultTrooper',
    'arcDisruptor',
    'siegeMech',
    'bulwarkGuard',
    'aegisSkirmisher',
  ]) {
    assert.equal(isStationableTroop(t), true, `${t} should be stationable`);
  }
});

test('isStationableTroop rejects striker / special / stationary units', () => {
  for (const t of [
    'vanguardBreaker',
    'wraithSkimmer',
    'pyreSuppressor',
    'sentinelLancer', // now a Fire striker, no longer a defender
    'phantomLance',
    'annihilatorPlatform',
    'voidStalker', // offensive mobile unit - not a logistics shortcut
    'siegeColossus', // elite armor attacker
    'overseer', // conquest tool
    'reconOperative', // scout-only
    'plasmaTurret', // stationary emplacement
  ]) {
    assert.equal(isStationableTroop(t), false, `${t} should NOT be stationable`);
  }
});

// --- Deployment gate (support + transfer) -------------------------------
// Any combat troop may be stationed at another nexus EXCEPT the non-deployables.
// Offensive units make poor garrisons but players may still send them.
test('non-deployables are exactly overseer, plasmaTurret, reconOperative', () => {
  assert.deepEqual([...NON_STATIONABLE_TROOPS].sort(), [
    'overseer',
    'plasmaTurret',
    'reconOperative',
  ]);
});

test('canStationTroop rejects only the three non-deployables', () => {
  for (const t of ['overseer', 'plasmaTurret', 'reconOperative']) {
    assert.equal(canStationTroop(t), false, `${t} should NOT be deployable`);
  }
});

test('canStationTroop accepts every other troop (incl. offensive)', () => {
  const deployable = TROOP_KEYS.filter(canStationTroop);
  // All offensive strikers a player might lend now pass the gate.
  for (const t of [
    'sentinelLancer',
    'vanguardBreaker',
    'wraithSkimmer',
    'phantomLance',
    'annihilatorPlatform',
    'voidStalker',
    'siegeColossus',
    'pyreSuppressor',
  ]) {
    assert.equal(canStationTroop(t), true, `${t} should be deployable`);
  }
  // Sanity: deployable set is every troop minus the three non-deployables.
  assert.equal(deployable.length, TROOP_KEYS.length - 3);
});
