import assert from 'node:assert/strict';
import test from 'node:test';
import {
	computeClassWeightedAttack,
	computeClassWeightedDefense,
	TROOP_CLASS
} from '../utils/combatMath.js';
import { getMaxStorage, getResourceProduction } from '../utils/economy.js';
import { TROOP_COSTS } from '../utils/gameConstants.js';

// Executable guards for the v0.22 economy overhaul invariants
// (server/ECONOMY_BALANCE.md §4). A future change that re-breaks one of the three
// faults the rework fixed should fail here, not in playtest.

const resTotal = (k) => TROOP_COSTS[k].biomass + TROOP_COSTS[k].alloy + TROOP_COSTS[k].ore;
const atkPerKRes = (k, atk) => (atk / resTotal(k)) * 1000;

// Striker attack stats (frozen, from COMBAT_BALANCE / TROOP_STATS). Kept local so
// this test pins the economic invariant without importing the full stat table.
const STRIKER_ATK = {
	sentinelLancer: 28,
	vanguardBreaker: 32,
	pyreSuppressor: 80,
	wraithSkimmer: 105,
	phantomLance: 125,
	voidStalker: 215,
	annihilatorPlatform: 360,
	siegeColossus: 300
};

test('Fault B fixed: storage leads production at every level, but the gap is bounded', () => {
	// Fill-time = storage / production at matching farm/vault level. Must stay > 1×
	// (storage ahead → raiding still pays) AND bounded (no runaway like the old 32h).
	for (let lvl = 1; lvl <= 20; lvl++) {
		const nexus = {
			biomassFarm: lvl,
			alloyForge: lvl,
			oreExtractor: lvl,
			storageVault: lvl,
			lastResourceUpdate: new Date()
		};
		const prod = getResourceProduction(nexus).biomass;
		const store = getMaxStorage(nexus);
		const fillHours = store / prod;
		assert.ok(fillHours > 1, `Lv${lvl}: storage must lead production (fill ${fillHours.toFixed(1)}h > 1h)`);
		assert.ok(
			fillHours <= 16.5,
			`Lv${lvl}: fill-time must stay bounded (got ${fillHours.toFixed(1)}h, cap ~16h)`
		);
	}
});

test('production growth is 1.35 and base is unchanged (early game identical)', () => {
	const base = {
		biomassFarm: 1,
		alloyForge: 1,
		oreExtractor: 1,
		storageVault: 1,
		lastResourceUpdate: new Date()
	};
	assert.equal(getResourceProduction(base).biomass, 800, 'base production unchanged at 800/h');
	const l2 = getResourceProduction({ ...base, biomassFarm: 2 }).biomass;
	assert.ok(Math.abs(l2 - 800 * 1.35) < 1e-6, 'Lv2 production reflects 1.35 growth');
});

test('Fault C fixed: PURE-striker resource-efficiency is monotonic by tier (T1 < T2 < T3)', () => {
	// Pure strikers (glass cannons — minimal defense) must rise cleanly with tier:
	// every T1 < every T2 < every T3. Siege Colossus is DELIBERATELY excluded here:
	// it's an armor striker carrying 130 defense (vs Void Stalker's 36), so a chunk
	// of its cost buys survivability, not attack. Judging it on attack-per-resource
	// alone undercounts what you pay for — it's covered by its own assertion below
	// (must still beat every T1) and by its def/pop placement (§3.6). See
	// ECONOMY_BALANCE §8: its cost was softened to restore the COMBAT_BALANCE §2.1
	// ratios, which intentionally lands its atk/res just under the pure-striker T2s.
	const t1 = ['sentinelLancer', 'vanguardBreaker'].map((k) => atkPerKRes(k, STRIKER_ATK[k]));
	const t2 = ['pyreSuppressor', 'wraithSkimmer', 'phantomLance'].map((k) =>
		atkPerKRes(k, STRIKER_ATK[k])
	);
	const t3 = ['voidStalker', 'annihilatorPlatform'].map((k) => atkPerKRes(k, STRIKER_ATK[k]));
	const maxT1 = Math.max(...t1);
	const minT2 = Math.min(...t2);
	const maxT2 = Math.max(...t2);
	const minT3 = Math.min(...t3);
	assert.ok(maxT1 < minT2, `T1 max eff (${maxT1.toFixed(1)}) must be below T2 min (${minT2.toFixed(1)})`);
	assert.ok(maxT2 < minT3, `T2 max eff (${maxT2.toFixed(1)}) must be below T3 min (${minT3.toFixed(1)})`);
});

test('Fault C fixed: the elite Siege Colossus is no longer cheaper-per-attack than a T1 opener', () => {
	// The headline regression: pre-rework the flagship elite (41.7) was BELOW a T1
	// Sentinel Lancer (56.0). The elite must now be strictly more efficient than
	// every T1 striker on attack-per-resource.
	const colossus = atkPerKRes('siegeColossus', STRIKER_ATK.siegeColossus);
	for (const t1 of ['sentinelLancer', 'vanguardBreaker']) {
		assert.ok(
			colossus > atkPerKRes(t1, STRIKER_ATK[t1]),
			`Siege Colossus (${colossus.toFixed(1)}) must out-efficiency T1 ${t1}`
		);
	}
	// Positive backing for excluding it from the pure-striker ladder: it's a
	// DURABLE striker (def 130). On COMBINED (attack+defense)-per-resource it sits
	// cleanly in T3, above every T2 — so it's not under-tuned, its value is just
	// split across both stats. def 130 is the frozen combat stat.
	const COLOSSUS_DEF = 130;
	const colossusCombined = (STRIKER_ATK.siegeColossus + COLOSSUS_DEF) / resTotal('siegeColossus') * 1000;
	for (const t2 of ['pyreSuppressor', 'wraithSkimmer', 'phantomLance']) {
		// T2 strikers' frozen defense stats (combat-owned): pyre 20, wraith 22, phantom 26.
		const T2_DEF = { pyreSuppressor: 20, wraithSkimmer: 22, phantomLance: 26 };
		const t2Combined = (STRIKER_ATK[t2] + T2_DEF[t2]) / resTotal(t2) * 1000;
		assert.ok(
			colossusCombined > t2Combined,
			`Colossus combined eff (${colossusCombined.toFixed(1)}) should exceed T2 ${t2} (${t2Combined.toFixed(1)})`
		);
	}
});

test('Siege Colossus population is 4 (pop-efficiency fix), not the old pop-5 tax', () => {
	assert.equal(TROOP_COSTS.siegeColossus.population, 4);
	// atk/pop must now sit above Void Stalker (the per-pop ladder fix). VS = 215/3.
	const colossusAtkPerPop = STRIKER_ATK.siegeColossus / TROOP_COSTS.siegeColossus.population;
	const voidAtkPerPop = STRIKER_ATK.voidStalker / TROOP_COSTS.voidStalker.population;
	assert.ok(
		colossusAtkPerPop > voidAtkPerPop,
		`Colossus atk/pop (${colossusAtkPerPop}) should exceed Void Stalker (${voidAtkPerPop.toFixed(1)})`
	);
});

test('combat gate: every striker still loses to its PROPER class anvil at equal resources', () => {
	// The binding COMBAT_BALANCE §2.1 invariant must survive the striker re-tune.
	// Proper anvil = the anvil whose class counters the striker on defense:
	//   mobile striker → fire anvil; fire striker → armor anvil; armor striker → mobile anvil.
	const matchups = [
		['voidStalker', 'plasmaTurret'], // mobile → fire
		['wraithSkimmer', 'plasmaTurret'],
		['phantomLance', 'plasmaTurret'],
		['annihilatorPlatform', 'siegeMech'], // fire → armor
		['sentinelLancer', 'assaultTrooper'],
		['siegeColossus', 'aegisSkirmisher'], // armor → mobile
		['vanguardBreaker', 'arcDisruptor'] // mobile → fire (T1)
	];
	const RES = 30000;
	const SHIELD = 8;
	for (const [striker, anvil] of matchups) {
		// Sanity: the pairing really is a proper counter on the defense triangle.
		const sClass = TROOP_CLASS[striker];
		const aClass = TROOP_CLASS[anvil];
		const counters =
			(sClass === 'mobile' && aClass === 'fire') ||
			(sClass === 'fire' && aClass === 'armor') ||
			(sClass === 'armor' && aClass === 'mobile');
		assert.ok(counters, `${anvil} (${aClass}) must be the proper anvil for ${striker} (${sClass})`);

		const nStriker = Math.floor(RES / resTotal(striker));
		const nAnvil = Math.floor(RES / resTotal(anvil));
		const atk = computeClassWeightedAttack({ [striker]: nStriker }, { [anvil]: nAnvil }, 0);
		const def =
			computeClassWeightedDefense({ [anvil]: nAnvil }, { [striker]: nStriker }) *
			(1 + 0.015 * SHIELD);
		assert.ok(
			atk < def,
			`${striker} must lose to proper anvil ${anvil} at equal res (atk ${atk.toFixed(0)} < def ${def.toFixed(0)})`
		);
	}
});
