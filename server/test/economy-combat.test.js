import assert from 'node:assert/strict';
import test from 'node:test';
import {
	computeForcePower,
	computeLossesForLoser,
	computeLossesForWinner,
	computeClassWeightedAttack,
	computeClassWeightedDefense,
	computeLootStolen,
	splitProportionalByForce,
	splitLootByCarry
} from '../utils/combatMath.js';
import {
	calculatePoints,
	computeResourceUpdate,
	getMaxStorage,
	resolveLootProtection,
	VASSAL_LOOT_PROTECTION,
	MAX_LOOT_PROTECTION
} from '../utils/economy.js';
import { getBuildingCost, getOverseerCost, getOverseerCostMultiplier } from '../utils/gameConstants.js';
import { buildRespawnNexusConfig, RESPAWN_INFLUENCE_FRACTION } from '../utils/starterNexus.js';

const BUILDING_MAX_LEVELS = {
	commandCore: 20,
	hangarBay: 20,
	plasmaForge: 20,
	armorFoundry: 20,
	lifeSupport: 25,
	storageVault: 20,
	biomassFarm: 20,
	alloyForge: 20,
	oreExtractor: 20,
	shieldGrid: 15,
	targetingCore: 20,
	stealthArray: 15
};

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

test('all building upgrades fit under reachable storage caps', () => {
	const resources = ['biomass', 'alloy', 'ore'];

	for (const [building, maxLevel] of Object.entries(BUILDING_MAX_LEVELS)) {
		for (let currentLevel = 0; currentLevel < maxLevel; currentLevel += 1) {
			const cost = getBuildingCost(building, currentLevel);
			const storageLevel = building === 'storageVault' ? currentLevel : 20;
			const maxStorage = Math.floor(getMaxStorage({ storageVault: storageLevel }));

			for (const resource of resources) {
				assert.ok(
					cost[resource] <= maxStorage,
					`${building} Lv${currentLevel + 1} ${resource} cost ${cost[resource]} exceeds storage cap ${maxStorage}`
				);
			}
		}
	}
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

test('symmetric triangle: a defender amplifies defense when it counters the attacker', () => {
	// Fire defenders (Arc Disruptor) counter Mobile attackers (Void Stalker), so the
	// SAME garrison defends harder against mobile than against an armor attacker it
	// is countered by. This is the core of the v0.22 symmetric-defense rework.
	const garrison = { arcDisruptor: 100 }; // fire class
	const vsMobile = computeClassWeightedDefense(garrison, { voidStalker: 50 }); // fire counters mobile
	const vsArmor = computeClassWeightedDefense(garrison, { siegeColossus: 50 }); // armor counters fire
	const neutral = computeClassWeightedDefense(garrison, {}); // no attacker → raw defense

	assert.ok(vsMobile > neutral, 'countering the attacker amplifies defense');
	assert.ok(vsArmor < neutral, 'being countered weakens defense');
	// Raw (un-weighted) defense is the neutral baseline.
	assert.equal(neutral, computeForcePower(garrison, 'defense'));
});

test('symmetric triangle: an empty attacker leaves defense at raw value', () => {
	const garrison = { siegeMech: 10, bulwarkGuard: 20 };
	assert.equal(
		computeClassWeightedDefense(garrison, {}),
		computeForcePower(garrison, 'defense')
	);
});

test('a striker is a poor defender, an anvil is a strong one (role separation)', () => {
	// Equal-ish footprint: a glass-cannon striker garrison defends far worse than an
	// anvil garrison of the same unit count, so players are pushed to garrison with
	// anvils and attack with strikers.
	const attacker = { siegeColossus: 30 }; // armor attacker
	const strikerGarrison = { voidStalker: 100 }; // mobile striker (low defense)
	const anvilGarrison = { aegisSkirmisher: 100 }; // mobile anvil (high defense), counters armor
	assert.ok(
		computeClassWeightedDefense(anvilGarrison, attacker) >
			computeClassWeightedDefense(strikerGarrison, attacker),
		'the anvil garrison defends harder than the striker garrison'
	);
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

// ── Vassal loot protection fold (Diplomacy Teeth Phase 2b) ──────────────────
// Locks the +0.25 vassal bonus folding under the single shared 0.80 cap, so a
// future edit on either side can't silently strip a raid below the documented
// ceiling. resolveLootProtection is the one server-side place the vassal bonus
// enters the loot path; combatSim.ts deliberately does not model loot protection.

test('resolveLootProtection: no vassal protection returns the base unchanged', () => {
	assert.equal(resolveLootProtection(0, false), 0);
	assert.equal(resolveLootProtection(0.4, false), 0.4);
});

test('resolveLootProtection: vassal adds exactly +0.25 below the cap', () => {
	assert.equal(VASSAL_LOOT_PROTECTION, 0.25);
	// Factionless / no-building defender that is a vassal: 0 + 0.25.
	assert.equal(resolveLootProtection(0, true), 0.25);
	// Single Supply Cache (0.40) + vassal (0.25) = 0.65, still under the cap.
	assert.equal(Number(resolveLootProtection(0.4, true).toFixed(10)), 0.65);
});

test('resolveLootProtection: vassal + doubled Supply Cache clamps to MAX_LOOT_PROTECTION', () => {
	assert.equal(MAX_LOOT_PROTECTION, 0.8);
	// Doubled Supply Cache already caps at 0.80; vassal can never push past it.
	assert.equal(resolveLootProtection(0.8, true), 0.8);
	// Even a hypothetical over-cap base is clamped.
	assert.equal(resolveLootProtection(1.0, true), 0.8);
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

// ───────────────────────────────────────────────────────────────────────────
// Coordinated Assault PR2 — conservation property tests.
// These are load-bearing: if the splits don't conserve, the merged path
// silently creates or destroys troops/resources. Treat any failure here as
// a release blocker, not a flaky test.
// ───────────────────────────────────────────────────────────────────────────

function sumTroopsByType(perParticipantMap) {
	const summed = {};
	for (const partial of perParticipantMap.values()) {
		for (const [k, v] of Object.entries(partial)) {
			summed[k] = (summed[k] ?? 0) + v;
		}
	}
	return summed;
}

function fuzzRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

test('splitProportionalByForce: sum of participant losses equals merged total', () => {
	const participants = [
		{ id: 1, troops: { vanguardBreaker: 100, sentinelLancer: 50 } },
		{ id: 2, troops: { vanguardBreaker: 50, assaultTrooper: 200 } },
		{ id: 3, troops: { sentinelLancer: 80, voidStalker: 30 } }
	];
	const totalLosses = {
		vanguardBreaker: 73,
		sentinelLancer: 41,
		assaultTrooper: 137,
		voidStalker: 19
	};
	const result = splitProportionalByForce(
		participants,
		(p, k) => p.troops[k] ?? 0,
		totalLosses
	);
	const summed = sumTroopsByType(result);
	for (const [k, total] of Object.entries(totalLosses)) {
		assert.equal(summed[k] ?? 0, total, `troop ${k}: sum ${summed[k] ?? 0} !== total ${total}`);
	}
});

test('splitProportionalByForce: per-participant losses never exceed contribution', () => {
	const participants = [
		{ id: 1, troops: { vanguardBreaker: 5 } },
		{ id: 2, troops: { vanguardBreaker: 95 } }
	];
	// Total exactly equals combined contribution — both must be fully wiped.
	const result = splitProportionalByForce(
		participants,
		(p, k) => p.troops[k] ?? 0,
		{ vanguardBreaker: 100 }
	);
	for (const p of participants) {
		const loss = result.get(p).vanguardBreaker ?? 0;
		assert.ok(
			loss <= p.troops.vanguardBreaker,
			`participant ${p.id}: lost ${loss} of ${p.troops.vanguardBreaker} brought`
		);
	}
	assert.equal(result.get(participants[0]).vanguardBreaker, 5);
	assert.equal(result.get(participants[1]).vanguardBreaker, 95);
});

test('splitProportionalByForce: tiny contributor with rounding can be clamped, overflow re-distributes', () => {
	// Tiny participant brings 1, big brings 999. Loss = 100. Tiny's raw share is
	// 0.1, big's is 99.9. Floors: 0 and 99. Remainder 1. The remainder goes to
	// the largest fractional, which is the big participant (0.9) — not the tiny
	// one (0.1) — so we never clamp here. Tiny stays alive (losses=0).
	const tiny = { id: 1, troops: { vanguardBreaker: 1 } };
	const big = { id: 2, troops: { vanguardBreaker: 999 } };
	const result = splitProportionalByForce(
		[tiny, big],
		(p, k) => p.troops[k] ?? 0,
		{ vanguardBreaker: 100 }
	);
	assert.equal(result.get(tiny).vanguardBreaker ?? 0, 0);
	assert.equal(result.get(big).vanguardBreaker, 100);
});

test('splitProportionalByForce: zero total losses returns empty per participant', () => {
	const participants = [
		{ id: 1, troops: { vanguardBreaker: 100 } },
		{ id: 2, troops: { vanguardBreaker: 200 } }
	];
	const result = splitProportionalByForce(participants, (p, k) => p.troops[k] ?? 0, {});
	for (const p of participants) {
		assert.deepEqual(result.get(p), {});
	}
});

test('splitProportionalByForce: fuzz — 200 random shapes, conservation holds for every troop type', () => {
	const rand = fuzzRng(0xc001d00d);
	const troopKeys = ['vanguardBreaker', 'sentinelLancer', 'assaultTrooper', 'siegeMech', 'voidStalker'];
	for (let trial = 0; trial < 200; trial++) {
		const n = 1 + Math.floor(rand() * 7); // 1..7 participants
		const participants = [];
		for (let i = 0; i < n; i++) {
			const troops = {};
			for (const k of troopKeys) {
				if (rand() < 0.6) troops[k] = Math.floor(rand() * 500);
			}
			participants.push({ id: i, troops });
		}
		// Generate plausible total losses bounded by combined contribution per type.
		const combined = {};
		for (const k of troopKeys) {
			combined[k] = participants.reduce((s, p) => s + (p.troops[k] ?? 0), 0);
		}
		const totalLosses = {};
		for (const k of troopKeys) {
			if (combined[k] > 0) totalLosses[k] = Math.floor(rand() * (combined[k] + 1));
		}
		const result = splitProportionalByForce(
			participants,
			(p, k) => p.troops[k] ?? 0,
			totalLosses
		);
		const summed = sumTroopsByType(result);
		for (const k of troopKeys) {
			const expected = totalLosses[k] ?? 0;
			const got = summed[k] ?? 0;
			assert.equal(got, expected, `trial ${trial} type ${k}: sum ${got} !== total ${expected}`);
		}
		for (const p of participants) {
			for (const k of troopKeys) {
				const lost = result.get(p)[k] ?? 0;
				assert.ok(
					lost <= (p.troops[k] ?? 0),
					`trial ${trial} participant ${p.id} type ${k}: lost ${lost} > brought ${p.troops[k] ?? 0}`
				);
			}
		}
	}
});

test('splitLootByCarry: sum of participant loot equals merged total', () => {
	const participants = [
		{ id: 1, carry: 200 },
		{ id: 2, carry: 350 },
		{ id: 3, carry: 75 }
	];
	const totalLoot = { biomass: 13337, alloy: 5051, ore: 9999 };
	const result = splitLootByCarry(participants, (p) => p.carry, totalLoot);
	let biomass = 0, alloy = 0, ore = 0;
	for (const r of result.values()) {
		biomass += r.biomass;
		alloy += r.alloy;
		ore += r.ore;
	}
	assert.equal(biomass, totalLoot.biomass);
	assert.equal(alloy, totalLoot.alloy);
	assert.equal(ore, totalLoot.ore);
});

test('splitLootByCarry: zero surviving carry leaves loot undistributed (evaporates correctly)', () => {
	const participants = [
		{ id: 1, carry: 0 },
		{ id: 2, carry: 0 }
	];
	const result = splitLootByCarry(participants, (p) => p.carry, {
		biomass: 100,
		alloy: 50,
		ore: 25
	});
	for (const p of participants) {
		assert.deepEqual(result.get(p), { biomass: 0, alloy: 0, ore: 0 });
	}
});

// ───────────────────────────────────────────────────────────────────────────
// partitionByCoordination — group-by behavior.
// ───────────────────────────────────────────────────────────────────────────

import { partitionByCoordination } from '../utils/combat.js';

function fakeAttack(overrides) {
	return {
		id: 1,
		type: 'attack',
		troops: { vanguardBreaker: 10 },
		defenderNexusId: 100,
		warOperationWaveId: null,
		wavePlanId: null,
		arrivesAt: new Date('2026-06-07T12:00:00.000Z'),
		...overrides
	};
}

test('partitionByCoordination: same WarOperationWave merges', () => {
	const attacks = [
		fakeAttack({ id: 1, warOperationWaveId: 9 }),
		fakeAttack({ id: 2, warOperationWaveId: 9 }),
		fakeAttack({ id: 3, warOperationWaveId: 10 })
	];
	const groups = partitionByCoordination(attacks);
	assert.equal(groups.length, 2);
	const merged = groups.find((g) => g.length === 2);
	const solo = groups.find((g) => g.length === 1);
	assert.ok(merged);
	assert.ok(solo);
	assert.deepEqual(
		merged.map((a) => a.id).sort(),
		[1, 2]
	);
	assert.equal(solo[0].id, 3);
});

test('partitionByCoordination: same WavePlan + same arrivesAt merges; different arrivesAt does not', () => {
	const t0 = new Date('2026-06-07T12:00:00.000Z');
	const t1 = new Date('2026-06-07T12:05:00.000Z');
	const attacks = [
		fakeAttack({ id: 1, wavePlanId: 7, arrivesAt: t0 }),
		fakeAttack({ id: 2, wavePlanId: 7, arrivesAt: t0 }),
		fakeAttack({ id: 3, wavePlanId: 7, arrivesAt: t1 })
	];
	const groups = partitionByCoordination(attacks);
	assert.equal(groups.length, 2);
	const merged = groups.find((g) => g.length === 2);
	const stagger = groups.find((g) => g.length === 1);
	assert.deepEqual(merged.map((a) => a.id).sort(), [1, 2]);
	assert.equal(stagger[0].id, 3);
});

test('partitionByCoordination: WavePlan and WarOperationWave on same target do NOT cross-merge', () => {
	const attacks = [
		fakeAttack({ id: 1, wavePlanId: 7 }),
		fakeAttack({ id: 2, warOperationWaveId: 9 })
	];
	const groups = partitionByCoordination(attacks);
	assert.equal(groups.length, 2);
	for (const g of groups) assert.equal(g.length, 1);
});

test('partitionByCoordination: soft-fail when group has >1 Overseer', () => {
	const attacks = [
		fakeAttack({
			id: 1,
			warOperationWaveId: 9,
			troops: { vanguardBreaker: 10, overseer: 1 }
		}),
		fakeAttack({
			id: 2,
			warOperationWaveId: 9,
			troops: { vanguardBreaker: 10, overseer: 1 }
		})
	];
	const groups = partitionByCoordination(attacks);
	assert.equal(groups.length, 2, 'group should soft-fail to two singletons');
	for (const g of groups) assert.equal(g.length, 1);
});

test('partitionByCoordination: non-attack types are forced singleton', () => {
	const attacks = [
		fakeAttack({ id: 1, type: 'scout', warOperationWaveId: 9 }),
		fakeAttack({ id: 2, type: 'attack', warOperationWaveId: 9 })
	];
	const groups = partitionByCoordination(attacks);
	assert.equal(groups.length, 2);
	for (const g of groups) assert.equal(g.length, 1);
});

test('partitionByCoordination: uncoordinated attacks remain singletons', () => {
	const attacks = [
		fakeAttack({ id: 1 }),
		fakeAttack({ id: 2 }),
		fakeAttack({ id: 3 })
	];
	const groups = partitionByCoordination(attacks);
	assert.equal(groups.length, 3);
	for (const g of groups) assert.equal(g.length, 1);
});

test('splitLootByCarry: fuzz — 200 random shapes, conservation holds for every resource', () => {
	const rand = fuzzRng(0xfeed5eed);
	for (let trial = 0; trial < 200; trial++) {
		const n = 1 + Math.floor(rand() * 6);
		const participants = Array.from({ length: n }, (_, i) => ({
			id: i,
			carry: Math.floor(rand() * 1000)
		}));
		const totalLoot = {
			biomass: Math.floor(rand() * 20000),
			alloy: Math.floor(rand() * 20000),
			ore: Math.floor(rand() * 20000)
		};
		const result = splitLootByCarry(participants, (p) => p.carry, totalLoot);
		const totalCarry = participants.reduce((s, p) => s + p.carry, 0);
		let biomass = 0, alloy = 0, ore = 0;
		for (const r of result.values()) {
			biomass += r.biomass;
			alloy += r.alloy;
			ore += r.ore;
		}
		if (totalCarry === 0) {
			assert.equal(biomass, 0);
			assert.equal(alloy, 0);
			assert.equal(ore, 0);
		} else {
			assert.equal(biomass, totalLoot.biomass, `trial ${trial}: biomass`);
			assert.equal(alloy, totalLoot.alloy, `trial ${trial}: alloy`);
			assert.equal(ore, totalLoot.ore, `trial ${trial}: ore`);
		}
	}
});
