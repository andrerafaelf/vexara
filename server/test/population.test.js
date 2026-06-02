import assert from 'node:assert/strict';
import test from 'node:test';
import { computeNexusPopulation, getPopulationMax, loadAwayPopulation } from '../utils/population.js';
import { TROOP_COSTS } from '../utils/gameConstants.js';

// A nexus with a high enough max that the cap never interferes unless a test
// sets it deliberately. Only troop columns matter to computeNexusPopulation.
const ROOMY_MAX = 100000;

test('sums stationed troops by their real per-unit population cost', () => {
	const pop = computeNexusPopulation({
		troops: { lancerDrone: 5, voidStalker: 2, annihilatorPlatform: 1 },
		trainingQueue: [],
		populationMax: ROOMY_MAX
	});
	const expected =
		5 * TROOP_COSTS.lancerDrone.population +
		2 * TROOP_COSTS.voidStalker.population +
		1 * TROOP_COSTS.annihilatorPlatform.population;
	assert.equal(pop, expected);
});

test('ignores non-troop columns on the nexus row', () => {
	const pop = computeNexusPopulation({
		troops: { biomass: 9999, alloy: 9999, lifeSupport: 20, lancerDrone: 3 },
		trainingQueue: [],
		populationMax: ROOMY_MAX
	});
	assert.equal(pop, 3 * TROOP_COSTS.lancerDrone.population);
});

test('counts queued training toward population', () => {
	const pop = computeNexusPopulation({
		troops: { siegeMech: 1 },
		trainingQueue: [
			{ troopType: 'voidStalker', amount: 4 },
			{ troopType: 'lancerDrone', amount: 10 }
		],
		populationMax: ROOMY_MAX
	});
	const expected =
		1 * TROOP_COSTS.siegeMech.population +
		4 * TROOP_COSTS.voidStalker.population +
		10 * TROOP_COSTS.lancerDrone.population;
	assert.equal(pop, expected);
});

test('adds in-flight and transfer population that lives off the nexus row', () => {
	const pop = computeNexusPopulation({
		troops: { lancerDrone: 1 },
		trainingQueue: [],
		populationMax: ROOMY_MAX,
		inFlightPopulation: 12,
		transferPopulation: 7
	});
	assert.equal(pop, 1 * TROOP_COSTS.lancerDrone.population + 12 + 7);
});

test('extraTroops covers survivors in transit on no counted row', () => {
	const pop = computeNexusPopulation({
		troops: { lancerDrone: 2 },
		trainingQueue: [],
		populationMax: ROOMY_MAX,
		extraTroops: { voidStalker: 3 }
	});
	assert.equal(
		pop,
		2 * TROOP_COSTS.lancerDrone.population + 3 * TROOP_COSTS.voidStalker.population
	);
});

test('caps the result at populationMax', () => {
	const pop = computeNexusPopulation({
		troops: { annihilatorPlatform: 100 },
		trainingQueue: [],
		populationMax: 50
	});
	assert.equal(pop, 50);
});

test('empty nexus reports zero population', () => {
	const pop = computeNexusPopulation({ troops: {}, trainingQueue: [], populationMax: ROOMY_MAX });
	assert.equal(pop, 0);
});

test('tolerates a non-array training queue', () => {
	const pop = computeNexusPopulation({
		troops: { lancerDrone: 4 },
		trainingQueue: null,
		populationMax: ROOMY_MAX
	});
	assert.equal(pop, 4 * TROOP_COSTS.lancerDrone.population);
});

// Regression: a stationed reinforcement (a TroopTransfer parked at a host) still
// occupies its SENDER's housing, so loadAwayPopulation must count transfers in
// all three away statuses - not just 'traveling'. Previously it counted only
// 'traveling', so the displayed populationCurrent under-reported and the UI
// showed free housing the training gate then rejected ("Insufficient population
// capacity" with plenty of headroom on screen). Attacks stay 'traveling'-only
// because a returning attack's troops column still lists the dead.
test('loadAwayPopulation counts transfers across traveling/stationed/returning, attacks traveling-only', async () => {
	const captured = {};
	const mockPrisma = {
		attack: {
			findMany: async ({ where }) => {
				captured.attackStatus = where.status;
				return [{ troops: { voidStalker: 2 } }]; // 2 * pop
			}
		},
		troopTransfer: {
			findMany: async ({ where }) => {
				captured.transferStatus = where.status;
				return [{ troops: { siegeMech: 1 } }, { troops: { lancerDrone: 5 } }];
			}
		}
	};

	const away = await loadAwayPopulation(mockPrisma, 1);

	// Attacks: a bare 'traveling' equality, NOT an { in: [...] } set.
	assert.equal(captured.attackStatus, 'traveling');
	// Transfers: all three away statuses so stationed reinforcements are charged.
	assert.deepEqual(captured.transferStatus, { in: ['traveling', 'stationed', 'returning'] });

	assert.equal(away.inFlightPopulation, 2 * TROOP_COSTS.voidStalker.population);
	assert.equal(
		away.transferPopulation,
		1 * TROOP_COSTS.siegeMech.population + 5 * TROOP_COSTS.lancerDrone.population
	);
});

test('getPopulationMax follows floor(100 * 1.202^level) and tops out just under 10k at Lv25', () => {
	assert.equal(getPopulationMax(0), 100);
	assert.equal(getPopulationMax(25), Math.floor(100 * Math.pow(1.202, 25)));
	// Max-level Life Support should land just under 10,000 (the tuning target).
	assert.equal(getPopulationMax(25), 9945);
	assert.ok(getPopulationMax(25) < 10000);
	// Monotonic increasing across the 21-25 band.
	for (let lvl = 21; lvl <= 25; lvl++) {
		assert.ok(getPopulationMax(lvl) > getPopulationMax(lvl - 1));
	}
});
