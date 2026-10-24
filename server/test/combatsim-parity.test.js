import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import {
	CLASS_COUNTERS,
	computeClassWeightedAttack,
	computeClassWeightedDefense,
	computeLossesForLoser,
	computeLossesForWinner,
	DEF_COUNTER_ADVANTAGE,
	DEF_COUNTER_DISADVANTAGE,
	LOSER_MAX_LOSS_RATE,
	LOSER_MIN_LOSS_RATE,
	LOSER_WIPE_RATIO,
	loserLossRate,
	TROOP_CLASS,
	TROOP_STATS,
	WINNER_COINFLIP_LOSS_RATE
} from '../utils/combatMath.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { MAX_OVERSEERS_PER_ATTACK } from '../utils/validation.js';

// The public battle calculator (client/src/app/calculator) and the in-game
// predictor run on client/src/utils/combatSim.ts, a hand-maintained mirror of
// server combat.ts + combatMath.ts. When the two drift, the calculator lies to
// players about fights the server then resolves differently. This suite pins
// the mirror three ways:
//   1. constants and pure helpers are compared against the exported server
//      versions (stats, counters, loss curves, class-weighted power),
//   2. numbers that live as inline literals inside the server's combat
//      resolver (Shield Grid per level, Military Outpost efficiency, control
//      drain tiers, control regen, building caps) are text-extracted and
//      compared against the client's named constants,
//   3. predictCombat is checked end to end against a reconstruction built from
//      the server helpers, plus the Overseer / conquest rules.
//
// combatSim.ts lives in the client TS project (no shared package), so we
// transpile it with the TypeScript compiler and import the result. That only
// works while combatSim.ts has no runtime imports; keep it dependency-free.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

async function loadClientModule(rel) {
	const src = read(rel);
	const { outputText } = ts.transpileModule(src, {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
	});
	if (/^\s*import\s/m.test(outputText) || /\brequire\(/.test(outputText)) {
		throw new Error(
			`${rel} now has a runtime import. The parity test transpiles it in isolation, so it must stay dependency-free (type-only imports are fine).`
		);
	}
	return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const sim = await loadClientModule('../../client/src/utils/combatSim.ts');
const combatSrc = read('../utils/combat.ts');
const combatMathSrc = read('../utils/combatMath.ts');
const nexusModelSrc = read('../models/Nexus.ts');
const buildingControllerSrc = read('../controllers/buildingController.ts');

const SERVER_KEYS = Object.keys(TROOP_STATS);

function allMatches(re, text) {
	return [...text.matchAll(re)];
}

function one(re, text, what) {
	const m = text.match(re);
	assert.ok(
		m,
		`could not find ${what} in the server source; re-verify the client mirror and update this regex`
	);
	return m;
}

// Deterministic PRNG so a failure is reproducible.
function makeRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomForce(rng, { density = 0.4, max = 1500, allowOverseer = true } = {}) {
	const force = {};
	for (const k of SERVER_KEYS) {
		if (k === 'overseer') {
			if (allowOverseer && rng() < 0.3) force.overseer = 1;
			continue;
		}
		if (rng() < density) {
			// Skew toward small stacks but keep some large ones so the 20 / 200
			// variance bands and the ceil/round edges all get exercised.
			const r = rng();
			force[k] = 1 + Math.floor(r * r * r * max);
		}
	}
	return force;
}

function norm(force) {
	const out = {};
	for (const k of SERVER_KEYS) out[k] = force[k] || 0;
	return out;
}

function close(a, b, what) {
	const tol = 1e-9 * Math.max(1, Math.abs(b));
	assert.ok(Math.abs(a - b) <= tol, `${what}: client ${a} vs server ${b}`);
}

// ── 1. Constants ──────────────────────────────────────────────────────────

test('TROOP_STATS / TROOP_CARRY / TROOP_CLASS match the server roster exactly', () => {
	assert.deepEqual(
		[...sim.TROOP_KEYS].sort(),
		[...SERVER_KEYS].sort(),
		'troop key sets differ between client combatSim and server combatMath'
	);
	for (const k of SERVER_KEYS) {
		const s = TROOP_STATS[k];
		const c = sim.TROOP_STATS[k];
		assert.equal(c.attack, s.attack, `${k} attack`);
		assert.equal(c.defense, s.defense, `${k} defense`);
		assert.equal(c.speed, s.speed, `${k} speed`);
		assert.equal(sim.TROOP_CARRY[k], s.carry, `${k} carry`);
		assert.equal(sim.TROOP_CLASS[k], TROOP_CLASS[k], `${k} class`);
	}
});

test('class counters and loss-curve constants match combatMath', () => {
	assert.deepEqual(sim.CLASS_COUNTERS, CLASS_COUNTERS);
	assert.equal(sim.DEF_COUNTER_ADVANTAGE, DEF_COUNTER_ADVANTAGE);
	assert.equal(sim.DEF_COUNTER_DISADVANTAGE, DEF_COUNTER_DISADVANTAGE);
	assert.equal(sim.LOSER_MIN_LOSS_RATE, LOSER_MIN_LOSS_RATE);
	assert.equal(sim.LOSER_MAX_LOSS_RATE, LOSER_MAX_LOSS_RATE);
	assert.equal(sim.LOSER_WIPE_RATIO, LOSER_WIPE_RATIO);
	assert.equal(sim.WINNER_MAX_LOSS_RATE, WINNER_COINFLIP_LOSS_RATE);
	assert.equal(sim.MAX_OVERSEERS_PER_ATTACK, MAX_OVERSEERS_PER_ATTACK);
});

test('winner loss shaping and Targeting Core literals match combatMath', () => {
	const def = one(
		/Math\.max\(([0-9.]+), 1 - TROOP_STATS\[key\]\.defense \/ ([0-9.]+)\)/,
		combatMathSrc,
		'winner defFactor'
	);
	assert.equal(sim.WINNER_DEF_FACTOR_FLOOR, Number(def[1]));
	assert.equal(sim.WINNER_DEF_FACTOR_DIVISOR, Number(def[2]));

	const matchup = one(
		/Math\.max\(([0-9.]+), Math\.min\(([0-9.]+), 2\.0 - weightedCounter\)\)/,
		combatMathSrc,
		'winner matchupFactor clamp'
	);
	assert.equal(sim.WINNER_MATCHUP_MIN, Number(matchup[1]));
	assert.equal(sim.WINNER_MATCHUP_MAX, Number(matchup[2]));

	const cap = one(/const rawRate = Math\.min\(\s*([0-9.]+),/, combatMathSrc, 'winner per-unit cap');
	assert.equal(sim.WINNER_MAX_UNIT_LOSS_RATE, Number(cap[1]));

	const tc = one(
		/Math\.min\(targetingCoreLevel \* ([0-9.]+), ([0-9.]+)\)/,
		combatMathSrc,
		'Targeting Core bonus'
	);
	assert.equal(sim.TARGETING_CORE_BONUS_PER_LEVEL, Number(tc[1]));
	assert.equal(sim.TARGETING_CORE_BONUS_CAP, Number(tc[2]));
});

// ── 2. Inline literals inside the server resolver ──────────────────────────

test('Shield Grid per-level bonus matches both server combat paths', () => {
	const hits = allMatches(/shieldGrid \* ([0-9.]+) \* shieldEfficiencyMultiplier/g, combatSrc);
	assert.equal(
		hits.length,
		2,
		'expected the Shield Grid multiplier in resolveCombat and resolveCoordinatedCombat'
	);
	for (const m of hits) assert.equal(sim.SHIELD_GRID_DEFENSE_PER_LEVEL, Number(m[1]));
});

test('Military Outpost shield efficiency (base and doubled) matches the server', () => {
	const base = allMatches(/nexusType === 'Military Outpost' \? ([0-9.]+) : 1\b/g, combatSrc);
	const doubled = allMatches(
		/1 \+ \(baseShieldEff - 1\) \* \(nexusDoubled \? ([0-9.]+) : 1\)/g,
		combatSrc
	);
	assert.equal(base.length, 2, 'expected the Outpost shield efficiency in both combat paths');
	assert.equal(doubled.length, 2, 'expected the doubled-efficiency formula in both combat paths');
	for (const m of base) assert.equal(sim.MILITARY_OUTPOST_SHIELD_EFFICIENCY, Number(m[1]));
	assert.equal(
		sim.MILITARY_OUTPOST_SHIELD_EFFICIENCY,
		NEXUS_TYPE_BONUSES['Military Outpost'].shieldEfficiencyMultiplier
	);
	const b = Number(base[0][1]);
	const d = Number(doubled[0][1]);
	assert.equal(sim.shieldEfficiencyFor('Military Outpost', false), b);
	assert.equal(sim.shieldEfficiencyFor('Military Outpost', true), 1 + (b - 1) * d);
	assert.equal(sim.shieldEfficiencyFor(null), 1);
	for (const other of ['Resource Depot', 'Supply Cache', 'Forward Base']) {
		assert.equal(sim.shieldEfficiencyFor(other, true), 1, `${other} must not change shields`);
	}
});

test('Overseer control-drain tiers match both server combat paths', () => {
	const re =
		/if \(powerRatio <= ([0-9.]+)\)\s*\{?\s*controlDrain = (\d+);\s*\}?\s*else if \(powerRatio <= ([0-9.]+)\)\s*\{?\s*controlDrain = (\d+);\s*\}?\s*else\s*\{?\s*controlDrain = (\d+);/g;
	const hits = allMatches(re, combatSrc);
	assert.equal(
		hits.length,
		2,
		'expected the drain tiers in resolveCombat and resolveCoordinatedCombat'
	);
	for (const m of hits) {
		const [crushRatio, crush, clearRatio, clear, narrow] = m.slice(1).map(Number);
		assert.equal(sim.CONTROL_DRAIN_CRUSHING_RATIO, crushRatio);
		assert.equal(sim.CONTROL_DRAIN_CRUSHING, crush);
		assert.equal(sim.CONTROL_DRAIN_CLEAR_RATIO, clearRatio);
		assert.equal(sim.CONTROL_DRAIN_CLEAR, clear);
		assert.equal(sim.CONTROL_DRAIN_NARROW, narrow);
		// Boundaries are inclusive on the server (<=).
		assert.equal(sim.overseerControlDrain(0), crush);
		assert.equal(sim.overseerControlDrain(crushRatio), crush);
		assert.equal(sim.overseerControlDrain(crushRatio + 1e-9), clear);
		assert.equal(sim.overseerControlDrain(clearRatio), clear);
		assert.equal(sim.overseerControlDrain(clearRatio + 1e-9), narrow);
		assert.equal(sim.overseerControlDrain(1), narrow);
	}
});

test('Overseer acts on any win it survives, not only on a garrison wipe (server rule tripwire)', () => {
	// If either of these server conditions changes shape, predictCombat's
	// overseerCanAct / escort rule must be re-mirrored by hand.
	one(
		/overseerCanAct\s*=\s*attackerWins && overseerSent > 0 && attackerLosses\.overseer === 0/,
		combatSrc,
		'single-attack overseerCanAct'
	);
	one(
		/overseerCanAct\s*=\s*attackerWins && totalOverseerSent > 0 && totalOverseerLost < totalOverseerSent/,
		combatSrc,
		'coordinated overseerCanAct'
	);
	one(
		/totalNonOverseerSent > 0 &&\s*totalNonOverseerLost >= totalNonOverseerSent/,
		combatSrc,
		'attacker Overseer escort-wipe rule'
	);
	one(/attackTroops = \{ \.\.\.attackTroops, plasmaTurret: 0 \}/, combatSrc, 'Plasma Turret strip');
});

test('control regeneration and cap match recoverControlLevels', () => {
	const m = one(
		/LEAST\(\s*"controlLevel" \+ (\d+) \* FLOOR\(([\s\S]*?)\)::int,\s*(\d+)\s*\)/,
		nexusModelSrc,
		'control regen SQL'
	);
	assert.equal(sim.CONTROL_REGEN_PER_HOUR, Number(m[1]));
	assert.ok(
		m[2].includes('/ 3600'),
		'control regen is no longer per hour; update CONTROL_REGEN_PER_HOUR copy'
	);
	assert.equal(sim.CONTROL_MAX, Number(m[3]));
	one(/controlLevel \?\? 100\b/, combatSrc, 'default control level');
	assert.equal(sim.CONTROL_MAX, 100);
});

test('calculator level caps match the server building rules', () => {
	const sg = one(
		/shieldGrid:\s*\{\s*maxLevel:\s*(\d+)/,
		buildingControllerSrc,
		'shieldGrid maxLevel'
	);
	const tc = one(
		/targetingCore:\s*\{\s*maxLevel:\s*(\d+)/,
		buildingControllerSrc,
		'targetingCore maxLevel'
	);
	assert.equal(sim.SHIELD_GRID_MAX_LEVEL, Number(sg[1]));
	assert.equal(sim.TARGETING_CORE_MAX_LEVEL, Number(tc[1]));
});

// ── 3. Pure helpers against the server implementations ─────────────────────

test('class-weighted attack and defense match the server on random forces', () => {
	const rng = makeRng(0xc0ffee);
	for (let i = 0; i < 400; i++) {
		const atk = randomForce(rng);
		const def = randomForce(rng);
		for (const tcLevel of [0, 1, 7, 20, 25]) {
			close(
				sim.classWeightedAttack(atk, def, tcLevel),
				computeClassWeightedAttack(atk, def, tcLevel),
				`attack (case ${i}, Targeting Core ${tcLevel})`
			);
		}
		close(
			sim.classWeightedDefense(def, atk),
			computeClassWeightedDefense(def, atk),
			`defense (case ${i})`
		);
	}
});

test('loserLossRate matches the server across ratios and taper floors', () => {
	for (const floor of [0, 0.05, 0.25, 1]) {
		for (let i = 0; i <= 200; i++) {
			const ratio = i / 200;
			close(
				sim.loserLossRate(ratio, floor),
				loserLossRate(ratio, floor),
				`ratio ${ratio}, floor ${floor}`
			);
		}
		close(sim.loserLossRate(-1, floor), loserLossRate(-1, floor), 'negative ratio');
		close(sim.loserLossRate(3, floor), loserLossRate(3, floor), 'ratio above 1');
	}
});

test('lossesForLoser matches computeLossesForLoser exactly', () => {
	const rng = makeRng(0xbadc0de);
	for (let i = 0; i < 400; i++) {
		const force = randomForce(rng);
		const ratio = rng();
		const floor = rng() < 0.3 ? rng() * 0.25 : 0;
		assert.deepEqual(
			norm(sim.lossesForLoser(force, ratio, floor)),
			norm(computeLossesForLoser(force, ratio, floor)),
			`case ${i} (ratio ${ratio}, floor ${floor})`
		);
	}
});

test('expectedWinnerLosses sits inside the server jitter band of computeLossesForWinner', () => {
	const band = one(
		/varianceMagnitude = count < 20 \? ([0-9.]+) : count < 200 \? ([0-9.]+) : ([0-9.]+);/,
		combatMathSrc,
		'winner variance bands'
	);
	const [small, mid, large] = band.slice(1).map(Number);
	const magnitude = (count) => (count < 20 ? small : count < 200 ? mid : large);

	const rng = makeRng(0x5eed);
	for (let i = 0; i < 300; i++) {
		const force = randomForce(rng, { max: 3000 });
		const opposing = randomForce(rng);
		const ratio = rng() < 0.1 ? 0 : rng();
		const expected = norm(sim.expectedWinnerLosses(force, ratio, opposing));
		for (const seed of [1, 77, 2654435761, 0xabcd1234]) {
			const actual = norm(computeLossesForWinner(force, ratio, seed, opposing));
			for (const k of SERVER_KEYS) {
				const count = force[k] || 0;
				// rate_server = clamp(R * v) with v in [1-m, 1+m], rate_client =
				// clamp(R), so |server - client| <= (client + 0.5) * m + 1 after
				// rounding. Anything outside that band is a formula drift.
				const tol = (expected[k] + 0.5) * magnitude(count) + 1;
				assert.ok(
					Math.abs(actual[k] - expected[k]) <= tol,
					`${k} x${count} (case ${i}, seed ${seed}, ratio ${ratio}): server ${actual[k]} vs client ${expected[k]}`
				);
			}
		}
	}
});

// ── 4. predictCombat end to end ────────────────────────────────────────────

// Reconstruction of resolveCombat's outcome from the server helpers plus the
// server's inline Shield Grid literal. The tripwires above keep the glue honest.
function serverOutcome(attacker, defender, tcLevel, shieldGrid, shieldEff) {
	const atk = { ...attacker, plasmaTurret: 0 };
	const shieldPerLevel = Number(
		one(/shieldGrid \* ([0-9.]+) \* shieldEfficiencyMultiplier/, combatSrc, 'shield literal')[1]
	);
	const attackPower = computeClassWeightedAttack(atk, defender, tcLevel);
	const defensePower =
		computeClassWeightedDefense(defender, atk) * (1 + shieldGrid * shieldPerLevel * shieldEff);
	const units = (f) => SERVER_KEYS.reduce((s, k) => s + (f[k] || 0), 0);
	const attackerWins = attackPower > defensePower || (units(defender) === 0 && units(atk) > 0);
	const powerRatio = attackerWins
		? Math.min(1, defensePower / Math.max(1, attackPower))
		: Math.min(1, attackPower / Math.max(1, defensePower));
	return { atk, attackPower, defensePower, attackerWins, powerRatio };
}

test('predictCombat matches the server outcome, powerRatio, and loser losses', () => {
	const rng = makeRng(0x1234);
	let checked = 0;
	for (let i = 0; i < 500; i++) {
		const attacker = randomForce(rng, { density: 0.35 });
		if (rng() < 0.15) attacker.plasmaTurret = 1 + Math.floor(rng() * 50);
		const defender = rng() < 0.08 ? {} : randomForce(rng, { density: 0.35 });
		const tcLevel = Math.floor(rng() * 21);
		const shieldGrid = Math.floor(rng() * 16);
		const shieldEff = [1, 2, 3][Math.floor(rng() * 3)];
		const s = serverOutcome(attacker, defender, tcLevel, shieldGrid, shieldEff);
		// Skip razor-thin ties where summation order alone could flip the winner.
		if (Math.abs(s.attackPower - s.defensePower) <= 1e-9 * Math.max(1, s.defensePower)) continue;
		const p = sim.predictCombat({
			attacker,
			defender,
			attackerTargetingCore: tcLevel,
			defenderShieldGrid: shieldGrid,
			shieldEfficiencyMultiplier: shieldEff
		});
		close(p.attackPower, s.attackPower, `attackPower (case ${i})`);
		close(p.defensePower, s.defensePower, `defensePower (case ${i})`);
		assert.equal(p.attackerWins, s.attackerWins, `winner (case ${i})`);
		close(p.powerRatio, s.powerRatio, `powerRatio (case ${i})`);
		const loserSide = s.attackerWins ? defender : s.atk;
		const serverLoser = norm(computeLossesForLoser(loserSide, s.powerRatio));
		const clientLoser = norm(s.attackerWins ? p.defenderLosses : p.attackerLosses);
		for (const k of SERVER_KEYS) {
			if (k === 'overseer') continue;
			assert.equal(clientLoser[k], serverLoser[k], `${k} loser losses (case ${i})`);
		}
		assert.ok(!p.attackerLosses.plasmaTurret, 'Plasma Turrets never fight on attack');
		checked++;
	}
	assert.ok(checked > 400, `only ${checked} cases checked`);
});

test('Plasma Turrets on the attacking side are ignored, as the server strips them', () => {
	const base = { siegeColossus: 40, voidStalker: 60, overseer: 1 };
	const defender = { bulwarkGuard: 120, plasmaTurret: 10 };
	assert.deepEqual(
		sim.predictCombat({ attacker: { ...base, plasmaTurret: 25 }, defender }),
		sim.predictCombat({ attacker: base, defender })
	);
});

test('an Overseer drains control on a win that leaves defenders alive', () => {
	// 30000 attack vs 18000 defense: powerRatio 0.6 is a clear win. The loser
	// keeps survivors (rate < 1), yet the server still drains 34.
	const p = sim.predictCombat({
		attacker: { siegeColossus: 100, overseer: 1 },
		defender: { bulwarkGuard: 200 }
	});
	assert.equal(p.attackerWins, true);
	close(p.powerRatio, 0.6, 'powerRatio');
	assert.ok((p.defenderLosses.bulwarkGuard || 0) < 200, 'garrison should not be wiped');
	assert.equal(p.conquerCapable, true);
	assert.equal(p.controlDrain, sim.CONTROL_DRAIN_CLEAR);
	assert.equal(p.marginLabel, 'decisive');
});

test('drain tier follows powerRatio: crushing and narrow wins', () => {
	const crushing = sim.predictCombat({
		attacker: { siegeColossus: 1000, overseer: 1 },
		defender: { bulwarkGuard: 100 }
	});
	assert.ok(crushing.powerRatio <= sim.CONTROL_DRAIN_CRUSHING_RATIO);
	assert.equal(crushing.controlDrain, sim.CONTROL_DRAIN_CRUSHING);
	assert.equal(crushing.defenderLosses.bulwarkGuard, 100, 'a crushing win wipes the loser');
	assert.equal(crushing.marginLabel, 'blowout');

	const narrow = sim.predictCombat({
		attacker: { siegeColossus: 100, overseer: 1 },
		defender: { bulwarkGuard: 300 }
	});
	assert.equal(narrow.attackerWins, true);
	assert.ok(narrow.powerRatio > sim.CONTROL_DRAIN_CLEAR_RATIO);
	assert.equal(narrow.controlDrain, sim.CONTROL_DRAIN_NARROW);
});

test('Overseer edge cases follow the server rules', () => {
	// Lone Overseer into an empty nexus: taken unopposed, no losses, full drain.
	const empty = sim.predictCombat({ attacker: { overseer: 1 }, defender: {} });
	assert.equal(empty.attackerWins, true);
	assert.equal(empty.powerRatio, 0);
	assert.equal(empty.controlDrain, sim.CONTROL_DRAIN_CRUSHING);
	assert.deepEqual(norm(empty.attackerLosses), norm({}));

	// Lone Overseer into a garrison: loses (0 attack) but, with no escort, the
	// Overseer itself is not destroyed and drains nothing.
	const lone = sim.predictCombat({ attacker: { overseer: 1 }, defender: { assaultTrooper: 5 } });
	assert.equal(lone.attackerWins, false);
	assert.equal(lone.conquerCapable, false);
	assert.equal(lone.controlDrain, 0);
	assert.ok(!lone.attackerLosses.overseer, 'a lone Overseer is never lost in combat');

	// A failed escorted strike that is wiped takes the Overseer with it.
	const wiped = sim.predictCombat({
		attacker: { sentinelLancer: 5, overseer: 1 },
		defender: { siegeMech: 200 }
	});
	assert.equal(wiped.attackerWins, false);
	assert.equal(wiped.attackerLosses.overseer, 1);
	assert.equal(wiped.controlDrain, 0);

	// Defender Overseer dies only once the rest of the garrison is gone.
	const garrisonOverseer = sim.predictCombat({
		attacker: { siegeColossus: 1000 },
		defender: { assaultTrooper: 10, overseer: 2 }
	});
	assert.equal(garrisonOverseer.defenderLosses.assaultTrooper, 10);
	assert.equal(garrisonOverseer.defenderLosses.overseer, 2);
});

test('loot capacity uses the count-based survive ratio, like the server haul', () => {
	const attacker = { phantomLance: 300, assaultTrooper: 100 };
	const p = sim.predictCombat({ attacker, defender: { aegisSkirmisher: 150 } });
	assert.equal(p.attackerWins, true);
	const sent = 400;
	const lost = (p.attackerLosses.phantomLance || 0) + (p.attackerLosses.assaultTrooper || 0);
	const carry = 300 * TROOP_STATS.phantomLance.carry + 100 * TROOP_STATS.assaultTrooper.carry;
	close(p.estLootCapacity, carry * (1 - lost / sent), 'surviving carry');
	close(p.attackerLossPct, lost / sent, 'attacker loss share');
});
