import assert from 'node:assert/strict';
import test from 'node:test';
import { computeNexusPopulation, getPopulationMax } from '../utils/population.js';
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

test('getPopulationMax follows floor(100 * 1.19^level) and supports level 25', () => {
	assert.equal(getPopulationMax(0), 100);
	assert.equal(getPopulationMax(25), Math.floor(100 * Math.pow(1.19, 25)));
	// Monotonic increasing across the new 21-25 band.
	for (let lvl = 21; lvl <= 25; lvl++) {
		assert.ok(getPopulationMax(lvl) > getPopulationMax(lvl - 1));
	}
});
