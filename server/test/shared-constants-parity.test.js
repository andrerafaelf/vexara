import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { TROOP_CLASS } from '../utils/combatMath.js';
import * as serverEconomy from '../utils/economy.js';
import * as serverConstants from '../utils/gameConstants.js';

// client/src/realtime/gameConstants.shared.ts and economy.shared.ts are hand
// copies of server/utils/gameConstants.ts and economy.ts (separate TS projects,
// no shared package). A one-sided edit there is how the client once showed a
// 16s train time for a unit the server trained in 1m 22s. This suite imports
// both sides and compares every mirrored constant and every mirrored function
// over a grid of inputs, and fails when a new server export appears that is
// neither mirrored nor listed as server-only below.
//
// The client files are transpiled in isolation, so they must keep no runtime
// imports (type-only imports are fine).
const here = dirname(fileURLToPath(import.meta.url));

async function loadClientModule(rel) {
	const src = readFileSync(resolve(here, rel), 'utf8');
	const { outputText } = ts.transpileModule(src, {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
	});
	if (/^\s*import\s/m.test(outputText) || /\brequire\(/.test(outputText)) {
		throw new Error(`${rel} now has a runtime import; the parity test needs it dependency-free.`);
	}
	return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const clientConstants = await loadClientModule('../../client/src/realtime/gameConstants.shared.ts');
const clientEconomy = await loadClientModule('../../client/src/realtime/economy.shared.ts');

// Server exports that deliberately have no client mirror. Adding a server
// export means deciding: mirror it in the client .shared.ts file (same commit),
// or add it here with the reason it is server-only.
const SERVER_ONLY_CONSTANTS = new Set([
	'NEXUS_ACTIVE_WINDOW_MS', // client receives server-computed activity flags
	'RETURN_TRAVEL_MULTIPLIER', // client renders server-computed returnsAt
	'PROTECTION_TAPER_DURATION_MS', // combat-resolution only
	'PROTECTION_TAPER_START_SURVIVOR_PCT',
	'getProtectionTaperSurvivorFloor',
	'NAP_BREAK_NOTICE_MS', // client receives server timestamps
	'NAP_RESIGN_COOLDOWN_MS',
	'STANDING_ORDER_COOLDOWN_MS',
	'STANDING_ORDER_MIN_TRIGGER_UNITS',
	'STANDING_ORDER_SOURCE_GARRISON_FLOOR',
	'MAX_STANDING_ORDERS_PER_USER',
	'MAX_QUEUE_TEMPLATES_PER_USER',
	'MAX_AUTO_REQUEUE_RULES_PER_USER',
	'STATIONABLE_TROOPS',
	'isStationableTroop',
	'NON_STATIONABLE_TROOPS',
	'canStationTroop'
]);

const SERVER_ONLY_ECONOMY = new Set([
	'getNexusTypeBonuses',
	'MAX_LOOT_PROTECTION', // loot is resolved server-side only
	'VASSAL_LOOT_PROTECTION',
	'resolveLootProtection',
	'getNexusTypeEffectiveMultipliers',
	'computeResourceUpdate', // client interpolates via interpolateResources
	'TROOP_INFLUENCE_POINTS',
	'calculateTroopInfluence',
	'INFLUENCE_SCALE',
	'calculatePoints'
]);

function assertExportCoverage(server, client, serverOnly, label) {
	for (const name of Object.keys(server)) {
		if (serverOnly.has(name)) continue;
		assert.ok(
			name in client,
			`${label}: server export "${name}" has no client mirror. Mirror it in the .shared.ts file in the same commit, or list it as server-only in this test.`
		);
	}
	for (const name of serverOnly) {
		assert.ok(
			name in server,
			`${label}: "${name}" is listed as server-only but no longer exported`
		);
	}
}

function sameOver(name, server, client, argsList) {
	for (const args of argsList) {
		assert.deepEqual(
			client[name](...args),
			server[name](...args),
			`${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`
		);
	}
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const BUILDINGS = Object.keys(serverConstants.BUILDING_COSTS);
const TROOPS = Object.keys(serverConstants.TROOP_COSTS);
const NEXUS_TYPES = [
	null,
	undefined,
	'Resource Depot',
	'Supply Cache',
	'Military Outpost',
	'Forward Base',
	'Bogus'
];
const STEPS = [
	null,
	undefined,
	'create_nexus',
	'upgrade_building',
	'while_you_build',
	'reinforce_command',
	'build_production',
	'counter_triangle',
	'train_troops',
	'something_later'
];

// ── gameConstants ─────────────────────────────────────────────────────────

test('every server gameConstants export is mirrored or explicitly server-only', () => {
	assertExportCoverage(serverConstants, clientConstants, SERVER_ONLY_CONSTANTS, 'gameConstants');
});

test('mirrored gameConstants values are identical', () => {
	for (const [name, value] of Object.entries(serverConstants)) {
		if (typeof value === 'function' || SERVER_ONLY_CONSTANTS.has(name)) continue;
		assert.deepEqual(clientConstants[name], value, `constant ${name}`);
	}
	assert.deepEqual(
		clientConstants.TROOP_COMBAT_CLASS,
		TROOP_CLASS,
		'client TROOP_COMBAT_CLASS vs server combatMath TROOP_CLASS'
	);
});

test('building cost / time curves match', () => {
	const args = [];
	for (const b of BUILDINGS) for (const lvl of range(0, 25)) args.push([b, lvl]);
	sameOver('getBuildingCost', serverConstants, clientConstants, args);
	sameOver(
		'getCommandTimeFactor',
		serverConstants,
		clientConstants,
		range(-1, 21).map((l) => [l])
	);
	sameOver(
		'isFirstBuild',
		serverConstants,
		clientConstants,
		BUILDINGS.flatMap((b) => [0, 1, 2].map((l) => [b, l]))
	);
	const buildArgs = [];
	for (const b of BUILDINGS)
		for (const lvl of [0, 1, 4, 9, 14, 19, 24])
			for (const cc of [0, 10, 20])
				for (const type of NEXUS_TYPES)
					for (const doubled of [false, true]) buildArgs.push([b, lvl, cc, type, doubled]);
	sameOver('getEffectiveBuildTimeSeconds', serverConstants, clientConstants, buildArgs);
});

test('training time, chains, and slot math match', () => {
	sameOver(
		'getClassBuildingTrainFactor',
		serverConstants,
		clientConstants,
		range(-1, 26).map((l) => [l])
	);
	const trainArgs = [];
	for (const t of TROOPS)
		for (const lvl of range(0, 20))
			for (const stealth of [0, 5, 15]) trainArgs.push([t, lvl, stealth]);
	sameOver('getTrainTimeSeconds', serverConstants, clientConstants, trainArgs);
	const effArgs = [];
	for (const t of TROOPS)
		for (const lvl of [0, 10, 20])
			for (const type of NEXUS_TYPES)
				for (const doubled of [false, true])
					for (const stealth of [0, 15]) effArgs.push([t, lvl, type, doubled, stealth]);
	sameOver('getEffectiveTrainTimeSeconds', serverConstants, clientConstants, effArgs);
	const cc = range(0, 21).map((l) => [l]);
	for (const fn of [
		'getCommandBuildQueueBonus',
		'getCommandTrainingQueueBonus',
		'getMaxTrainingQueueSlots',
		'getTrainingChains'
	]) {
		sameOver(fn, serverConstants, clientConstants, cc);
	}
	sameOver(
		'trainingChainFor',
		serverConstants,
		clientConstants,
		[...TROOPS, 'bogus'].flatMap((t) => [0, 14, 15, 20].map((l) => [t, l]))
	);
	sameOver(
		'trainingBuildingFor',
		serverConstants,
		clientConstants,
		[...TROOPS, 'bogus'].map((t) => [t])
	);
});

test('overseer cost scaling matches', () => {
	sameOver(
		'getOverseerCostMultiplier',
		serverConstants,
		clientConstants,
		range(-1, 20).map((n) => [n])
	);
	sameOver(
		'getOverseerCost',
		serverConstants,
		clientConstants,
		range(0, 20).map((n) => [n])
	);
});

test('onboarding eligibility and taper match', () => {
	const trainArgs = [];
	for (const t of TROOPS)
		for (const tips of [true, false]) for (const step of STEPS) trainArgs.push([t, tips, step]);
	sameOver('isOnboardingTrainEligible', serverConstants, clientConstants, trainArgs);
	const buildArgs = [];
	for (const b of BUILDINGS)
		for (const lvl of [0, 1, 2])
			for (const tips of [true, false])
				for (const step of STEPS) buildArgs.push([b, lvl, tips, step]);
	sameOver('isOnboardingBuildEligible', serverConstants, clientConstants, buildArgs);
	const now = new Date('2026-10-24T12:00:00Z');
	const h = 3600_000;
	sameOver(
		'getOnboardingTaperFraction',
		serverConstants,
		clientConstants,
		[
			null,
			undefined,
			now,
			new Date(now.getTime() + h),
			new Date(now.getTime() - h),
			new Date(now.getTime() - 36 * h),
			new Date(now.getTime() - 71 * h),
			new Date(now.getTime() - 80 * h),
			'2026-10-22T12:00:00Z'
		].map((c) => [c, now])
	);
});

test('stealth array math matches', () => {
	const lv = range(-1, 20).map((l) => [l]);
	sameOver('getStealthScoutFailChance', serverConstants, clientConstants, lv);
	sameOver('getStealthVaultPerResource', serverConstants, clientConstants, lv);
	const args = [];
	for (const stock of [0, 1, 499.7, 1000, 49_000, 2_000_000])
		for (const l of [0, 1, 8, 15]) args.push([stock, l]);
	sameOver('partitionStealthVault', serverConstants, clientConstants, args);
});

// ── economy ───────────────────────────────────────────────────────────────

test('every server economy export is mirrored or explicitly server-only', () => {
	assertExportCoverage(serverEconomy, clientEconomy, SERVER_ONLY_ECONOMY, 'economy');
});

test('nexus-type bonus table matches', () => {
	assert.deepEqual(clientEconomy.NEXUS_TYPE_BONUSES, serverEconomy.NEXUS_TYPE_BONUSES);
});

test('production and storage curves match, including doubled and derelict nexuses', () => {
	const prodArgs = [];
	const storageArgs = [];
	for (const nexusType of NEXUS_TYPES) {
		for (const nexusTypeDoubled of [false, true]) {
			for (const isDerelict of [false, true]) {
				for (const commandCore of [0, 14, 15]) {
					for (const lvl of range(0, 20)) {
						const nexus = {
							nexusType,
							nexusTypeDoubled,
							isDerelict,
							commandCore,
							biomassFarm: lvl,
							alloyForge: Math.max(0, lvl - 3),
							oreExtractor: 20 - lvl,
							storageVault: lvl
						};
						prodArgs.push([nexus]);
						prodArgs.push([nexus, { biomass: 1.5, ore: 0.5 }]);
						storageArgs.push([nexus]);
					}
				}
			}
		}
	}
	sameOver('getResourceProduction', serverEconomy, clientEconomy, prodArgs);
	sameOver('getMaxStorage', serverEconomy, clientEconomy, storageArgs);
});
