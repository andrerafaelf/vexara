import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeForcePower,
  computeLossesForLoser,
  computeClassWeightedAttack,
} from '../utils/combatMath.js';
import { calculatePoints, computeResourceUpdate } from '../utils/economy.js';
import { buildRespawnNexusConfig, RESPAWN_INFLUENCE_FRACTION } from '../utils/starterNexus.js';

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

test('computeLossesForLoser wipes all non-overseer troops', () => {
  const troops = {
    assaultTrooper: 62,
    lancerDrone: 25,
    breakerUnit: 3,
    overseer: 1,
  };

  const losses = computeLossesForLoser(troops);

  assert.equal(losses.assaultTrooper, troops.assaultTrooper);
  assert.equal(losses.lancerDrone, troops.lancerDrone);
  assert.equal(losses.breakerUnit, troops.breakerUnit);
  assert.equal(losses.overseer, undefined);
});

test('loser losses scale with how close the fight was (no all-or-nothing cliff)', () => {
  const force = { assaultTrooper: 100, lancerDrone: 100 };

  // Blowout (powerRatio -> 0): essentially wiped.
  const blowout = computeLossesForLoser(force, 0);
  assert.equal(blowout.assaultTrooper, 100);
  assert.equal(blowout.lancerDrone, 100);

  // Near-even loss (powerRatio -> 1): ~85%, leaving a real remnant.
  const even = computeLossesForLoser(force, 1);
  assert.ok(even.assaultTrooper < 100, 'a narrow loss leaves survivors');
  assert.ok(even.assaultTrooper >= 80, 'but still costs the bulk of the army');

  // Default (no ratio passed) preserves the old total-wipe behaviour for callers
  // that don't supply a ratio.
  const legacy = computeLossesForLoser(force);
  assert.equal(legacy.assaultTrooper, 100);

  // Overseer is never counted as a loser-side casualty here.
  assert.equal(computeLossesForLoser({ ...force, overseer: 1 }, 1).overseer, undefined);
});

test('a lone Overseer has zero class-weighted attack power', () => {
  // Regression guard for the empty-nexus conquest fix: an Overseer-only follow-up
  // strike produces 0 attack power, so combat must rely on the "defender has no
  // troops -> unopposed win" path (in resolveCombat) rather than attackPower>defensePower.
  const power = computeClassWeightedAttack({ overseer: 1 }, {});
  assert.equal(power, 0);
});

test('respawn config scales to ~55% of peak influence and respects the floor', () => {
  const floorCfg = buildRespawnNexusConfig(0);
  const floorPts = calculatePoints({ ...floorCfg.buildings, ...floorCfg.troops });
  assert.ok(floorPts > 0, 'floor respawn has influence');

  // A small peak still yields at least the floor (never weaker than the template).
  const tinyCfg = buildRespawnNexusConfig(100);
  const tinyPts = calculatePoints({ ...tinyCfg.buildings, ...tinyCfg.troops });
  assert.ok(tinyPts >= floorPts, 'tiny-peak respawn never drops below the floor');

  // A large peak scales up toward the target fraction (well above the floor).
  const peak = 5000;
  const bigCfg = buildRespawnNexusConfig(peak);
  const bigPts = calculatePoints({ ...bigCfg.buildings, ...bigCfg.troops });
  assert.ok(bigPts > floorPts, 'high-peak respawn scales above the floor');
  // "Just over half" — within a reasonable band of the target given level rounding/caps.
  const target = peak * RESPAWN_INFLUENCE_FRACTION;
  assert.ok(bigPts >= target * 0.6, `respawn influence ${bigPts} is in the neighbourhood of target ${target}`);
});
