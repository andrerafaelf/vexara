import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIONABLE_TROOPS, isStationableTroop } from '../utils/gameConstants.js';

// Stationing (support to an ally OR transfer to your own nexus) is defense-only.
// This is the single source of truth both code paths share.
test('only the four mobile defenders are stationable', () => {
  assert.deepEqual([...STATIONABLE_TROOPS].sort(), [
    'assaultTrooper',
    'bulwarkGuard',
    'lancerDrone',
    'siegeMech',
  ]);
});

test('isStationableTroop accepts defensive units', () => {
  for (const t of ['assaultTrooper', 'lancerDrone', 'siegeMech', 'bulwarkGuard']) {
    assert.equal(isStationableTroop(t), true, `${t} should be stationable`);
  }
});

test('isStationableTroop rejects offensive / special / stationary units', () => {
  for (const t of [
    'breakerUnit',
    'skimmerBike',
    'suppressorTeam',
    'disruptorUnit',
    'interceptorBike',
    'annihilatorPlatform',
    'voidStalker', // offensive mobile unit - not a logistics shortcut
    'overseer', // conquest tool
    'reconOperative', // scout-only
    'plasmaTurret', // stationary emplacement
  ]) {
    assert.equal(isStationableTroop(t), false, `${t} should NOT be stationable`);
  }
});
