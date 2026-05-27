import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DECISIVE_WIPE_POWER_RATIO,
  computeForcePower,
  computeLossesForLoser,
} from '../utils/combatMath.js';
import { calculatePoints, computeResourceUpdate } from '../utils/economy.js';

test('computeResourceUpdate increases resources over elapsed time', () => {
  const now = Date.now();
  const nexus = {
    biomass: 500,
    alloy: 500,
    ore: 500,
    biomassFarm: 1,
    alloyForge: 1,
    oreExtractor: 1,
    storageVault: 1,
    lastResourceUpdate: new Date(now - 60 * 60 * 1000),
  };

  const updated = computeResourceUpdate(nexus);
  assert.ok(updated.biomass > 500);
  assert.ok(updated.alloy > 500);
  assert.ok(updated.ore > 500);
});

test('calculatePoints awards points for buildings and troops', () => {
  const nexus = {
    commandCore: 1,
    recruitmentCore: 1,
    lifeSupport: 1,
    storageVault: 1,
    biomassFarm: 1,
    alloyForge: 1,
    oreExtractor: 1,
    shieldGrid: 1,
    lancerDrone: 2,
    assaultTrooper: 3,
    breakerUnit: 1,
    reconOperative: 1,
    skimmerBike: 1,
    siegeMech: 1,
  };

  const points = calculatePoints(nexus);
  assert.ok(points > 0);
});

test('computeForcePower sums troop stats for selected power type', () => {
  const troops = {
    assaultTrooper: 10,
    lancerDrone: 5,
  };

  const attackPower = computeForcePower(troops, 'attack');
  const defensePower = computeForcePower(troops, 'defense');

  assert.ok(attackPower > 0);
  assert.ok(defensePower > 0);
  assert.notEqual(attackPower, defensePower);
});

test('computeLossesForLoser wipes non-overseer troops at decisive power ratio', () => {
  const troops = {
    assaultTrooper: 62,
    lancerDrone: 25,
    breakerUnit: 3,
    overseer: 1,
  };

  const losses = computeLossesForLoser(troops, DECISIVE_WIPE_POWER_RATIO, 12345);

  assert.equal(losses.assaultTrooper, troops.assaultTrooper);
  assert.equal(losses.lancerDrone, troops.lancerDrone);
  assert.equal(losses.breakerUnit, troops.breakerUnit);
  assert.equal(losses.overseer, undefined);
});

test('computeLossesForLoser remains attritional below decisive power ratio', () => {
  const troops = {
    assaultTrooper: 62,
    lancerDrone: 25,
  };

  const losses = computeLossesForLoser(troops, DECISIVE_WIPE_POWER_RATIO - 0.01, 12345);

  assert.ok((losses.assaultTrooper ?? 0) > 0);
  assert.ok((losses.lancerDrone ?? 0) > 0);
  assert.ok((losses.assaultTrooper ?? 0) < troops.assaultTrooper);
  assert.ok((losses.lancerDrone ?? 0) < troops.lancerDrone);
});
