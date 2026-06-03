import assert from 'node:assert/strict';
import test from 'node:test';
import {
	computeForcePower,
	computeLossesForLoser,
	computeLossesForWinner,
	computeClassWeightedAttack,
	computeLootStolen
} from '../utils/combatMath.js';
import { calculatePoints, computeResourceUpdate } from '../utils/economy.js';
import { getBuildingCost, getOverseerCost, getOverseerCostMultiplier } from '../utils/gameConstants.js';
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
		lastResourceUpdate: new Date(now - 60 * 60 * 1000)
	};

	const updated = computeResourceUpdate(nexus);
	assert.ok(updated.biomass > 500);
	assert.ok(updated.alloy > 500);
	assert.ok(updated.ore > 500);
});

test('overseer cost ramps to a 4x cap at 12 owned nexuses', () => {
	assert.equal(getOverseerCostMultiplier(3), 1);
	assert.equal(getOverseerCostMultiplier(12), 4);
	assert.equal(getOverseerCostMultiplier(20), 4);
	assert.deepEqual(getOverseerCost(12), {
		biomass: 720000,
		alloy: 560000,
		ore: 480000
	});
});

test('life support level 25 cost is rescaled to the old level 20 cap', () => {
	assert.deepEqual(getBuildingCost('lifeSupport', 24), {
		biomass: 1768478,
		alloy: 2210598,
		ore: 1547418,
		time: 67465
	});

	assert.deepEqual(getBuildingCost('lifeSupport', 21), {
		biomass: 437852,
		alloy: 547315,
		ore: 383120,
		time: 27914
	});
});

test('calculatePoints awards points for buildings and troops', () => {
	const nexus = {
		commandCore: 1,
		hangarBay: 1,
		plasmaForge: 1,
		armorFoundry: 1,
		lifeSupport: 1,
		storageVault: 1,
		biomassFarm: 1,
		alloyForge: 1,
		oreExtractor: 1,
		shieldGrid: 1,
		sentinelLancer: 2,
		assaultTrooper: 3,
		vanguardBreaker: 1,
		reconOperative: 1,
		wraithSkimmer: 1,
		siegeMech: 1
	};

	const points = calculatePoints(nexus);
	assert.ok(points > 0);
});

test('computeForcePower sums troop stats for selected power type', () => {
	const attackTroops = { vanguardBreaker: 10, pyreSuppressor: 5 };
	const defenseTroops = { assaultTrooper: 10, sentinelLancer: 5 };

	const attackPower = computeForcePower(attackTroops, 'attack');
	const defensePower = computeForcePower(defenseTroops, 'defense');

	assert.ok(attackPower > 0);
	assert.ok(defensePower > 0);
	assert.notEqual(attackPower, defensePower);
});

test('computeLossesForLoser wipes all non-overseer troops', () => {
	const troops = {
		assaultTrooper: 62,
		sentinelLancer: 25,
		vanguardBreaker: 3,
		overseer: 1
	};

	const losses = computeLossesForLoser(troops);

	assert.equal(losses.assaultTrooper, troops.assaultTrooper);
	assert.equal(losses.sentinelLancer, troops.sentinelLancer);
	assert.equal(losses.vanguardBreaker, troops.vanguardBreaker);
	assert.equal(losses.overseer, undefined);
});

test('loser losses scale with how close the fight was (no all-or-nothing cliff)', () => {
	const force = { assaultTrooper: 100, sentinelLancer: 100 };

	// Blowout (powerRatio -> 0): essentially wiped.
	const blowout = computeLossesForLoser(force, 0);
	assert.equal(blowout.assaultTrooper, 100);
	assert.equal(blowout.sentinelLancer, 100);

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

test('a decisive blowout is a TOTAL wipe — no survivors', () => {
	const force = { assaultTrooper: 100, sentinelLancer: 100 };

	// At/under the wipe threshold (~3:1 power, ratio <= 0.33) the losing army is
	// 100% destroyed. This is the "150k vs 10k should leave nothing" fix: a
	// crushing victory annihilates the defender instead of leaving stragglers.
	const lopsided = computeLossesForLoser(force, 0.067); // ~15:1, the reported case
	assert.equal(lopsided.assaultTrooper, 100, 'blowout wipes the whole force');
	assert.equal(lopsided.sentinelLancer, 100);

	const atThreshold = computeLossesForLoser(force, 0.33);
	assert.equal(atThreshold.assaultTrooper, 100, 'exactly at the threshold still wipes');

	// Just above the threshold a remnant begins to survive again (gradient intact).
	const justAbove = computeLossesForLoser(force, 0.5);
	assert.ok(justAbove.assaultTrooper < 100, 'a non-blowout loss leaves a remnant');
});

test('winner takes ~zero losses against a near-powerless attacker', () => {
	// Regression: a lone Breaker Unit (powerRatio ~0) was "killing" 22 of a 1181
	// Assault Trooper garrison because variance was ADDED to a ~0 base rate and
	// every type was force-rounded up via ceil. Multiplicative variance + round
	// means a trivial attacker costs the winner nothing.
	const garrison = {
		siegeMech: 136,
		bulwarkGuard: 134,
		plasmaTurret: 18,
		assaultTrooper: 1181,
		reconOperative: 495
	};
	for (let seed = 0; seed < 12; seed++) {
		const losses = computeLossesForWinner(garrison, 0.0005, seed * 7919 + 1, {
			vanguardBreaker: 1
		});
		const total = Object.values(losses).reduce((a, b) => a + (b || 0), 0);
		assert.equal(total, 0, `lone attacker should cost the winner 0 (seed ${seed} gave ${total})`);
	}
});

test('winner still bleeds on a near-even victory (coin-flip cost preserved)', () => {
	const garrison = { assaultTrooper: 1000, siegeMech: 100 };
	// powerRatio 0.8 = barely won; should cost a meaningful chunk, not zero.
	const losses = computeLossesForWinner(garrison, 0.8, 4242, { wraithSkimmer: 1500 });
	const total = Object.values(losses).reduce((a, b) => a + (b || 0), 0);
	assert.ok(total > 100, `a near-even win should bleed (got ${total})`);
});

test('a lone Overseer has zero class-weighted attack power', () => {
	// Regression guard for the empty-nexus conquest fix: an Overseer-only follow-up
	// strike produces 0 attack power, so combat must rely on the "defender has no
	// troops -> unopposed win" path (in resolveCombat) rather than attackPower>defensePower.
	const power = computeClassWeightedAttack({ overseer: 1 }, {});
	assert.equal(power, 0);
});

test('loot stolen is capped by surviving carry', () => {
	const stolen = computeLootStolen({ biomass: 3897228, alloy: 2717289, ore: 3650260 }, 2153 * 60);

	assert.equal(stolen.biomass + stolen.alloy + stolen.ore, 129180);
	assert.ok(stolen.biomass < 3897228);
	assert.ok(stolen.alloy < 2717289);
	assert.ok(stolen.ore < 3650260);
});

test('loot stolen is split proportionally and cannot exceed lootable resources', () => {
	const capped = computeLootStolen({ biomass: 100, alloy: 200, ore: 700 }, 250, 0.5);
	assert.deepEqual(capped, { biomass: 25, alloy: 50, ore: 175 });

	const drained = computeLootStolen({ biomass: 100, alloy: 200, ore: 700 }, 2000);
	assert.deepEqual(drained, { biomass: 100, alloy: 200, ore: 700 });
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
	assert.ok(
		bigPts >= target * 0.6,
		`respawn influence ${bigPts} is in the neighbourhood of target ${target}`
	);
});
