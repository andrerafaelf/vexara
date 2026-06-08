import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIONABLE_TROOPS, isStationableTroop } from '../utils/gameConstants.js';

// Stationing (support to an ally OR transfer to your own nexus) is defense-only.
// This is the single source of truth both code paths share.
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
