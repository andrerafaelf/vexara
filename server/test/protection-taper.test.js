import assert from 'node:assert/strict';
import test from 'node:test';
import { loserLossRate, computeLossesForLoser, LOSER_WIPE_RATIO } from '../utils/combatMath.js';
import {
	getProtectionTaperSurvivorFloor,
	PROTECTION_TAPER_DURATION_MS,
	PROTECTION_TAPER_START_SURVIVOR_PCT
} from '../utils/gameConstants.js';

test('getProtectionTaperSurvivorFloor returns 0 when never protected', () => {
	assert.equal(getProtectionTaperSurvivorFloor(null), 0);
	assert.equal(getProtectionTaperSurvivorFloor(undefined), 0);
});

test('getProtectionTaperSurvivorFloor returns 0 while still under hard protection', () => {
	const now = new Date('2026-01-10T00:00:00Z');
	const protectionEndsAt = new Date('2026-01-15T00:00:00Z'); // still in the future
	assert.equal(getProtectionTaperSurvivorFloor(protectionEndsAt, now), 0);
});

test('getProtectionTaperSurvivorFloor is at its start value the instant protection ends', () => {
	const protectionEndsAt = new Date('2026-01-10T00:00:00Z');
	const now = new Date(protectionEndsAt.getTime()); // exactly at expiry
	assert.equal(getProtectionTaperSurvivorFloor(protectionEndsAt, now), PROTECTION_TAPER_START_SURVIVOR_PCT);
});

test('getProtectionTaperSurvivorFloor decays linearly to 0 across the taper window', () => {
	const protectionEndsAt = new Date('2026-01-10T00:00:00Z');
	const halfway = new Date(protectionEndsAt.getTime() + PROTECTION_TAPER_DURATION_MS / 2);
	const floor = getProtectionTaperSurvivorFloor(protectionEndsAt, halfway);
	assert.ok(Math.abs(floor - PROTECTION_TAPER_START_SURVIVOR_PCT / 2) < 1e-9);
});

test('getProtectionTaperSurvivorFloor returns 0 once the taper window fully elapses', () => {
	const protectionEndsAt = new Date('2026-01-10T00:00:00Z');
	const after = new Date(protectionEndsAt.getTime() + PROTECTION_TAPER_DURATION_MS + 1000);
	assert.equal(getProtectionTaperSurvivorFloor(protectionEndsAt, after), 0);
});

test('loserLossRate with survivorFloor=0 reproduces the original curve exactly', () => {
	assert.equal(loserLossRate(0.1, 0), loserLossRate(0.1));
	assert.equal(loserLossRate(0.5, 0), loserLossRate(0.5));
	assert.equal(loserLossRate(1.0, 0), loserLossRate(1.0));
});

test('loserLossRate caps the loss rate at (1 - survivorFloor) even on a total-wipe ratio', () => {
	// ratio below the wipe threshold would normally be a 100% loss
	assert.equal(loserLossRate(0.1), 1.0);
	// with a 0.25 survivor floor, loss rate cannot exceed 0.75
	assert.equal(loserLossRate(0.1, 0.25), 0.75);
});

test('loserLossRate floor never makes losses worse than the unmodified curve', () => {
	for (const ratio of [0, 0.1, 0.2, 0.33, 0.5, 0.75, 1.0]) {
		for (const floor of [0, 0.1, 0.25, 0.5]) {
			assert.ok(loserLossRate(ratio, floor) <= loserLossRate(ratio, 0));
		}
	}
});

test('computeLossesForLoser with a survivor floor leaves real survivors on a blowout ratio', () => {
	const force = { assaultTrooper: 100, sentinelLancer: 50 };
	const ratio = 0.05; // deep inside LOSER_WIPE_RATIO, normally a total wipe
	assert.ok(ratio <= LOSER_WIPE_RATIO);

	const noFloorLosses = computeLossesForLoser(force, ratio, 0);
	assert.equal(noFloorLosses.assaultTrooper, 100);
	assert.equal(noFloorLosses.sentinelLancer, 50);

	const taperedLosses = computeLossesForLoser(force, ratio, 0.25);
	assert.ok(taperedLosses.assaultTrooper < 100);
	assert.ok(taperedLosses.sentinelLancer < 50);
	// at most 75% lost given a 0.25 floor
	assert.ok(taperedLosses.assaultTrooper <= 75);
	assert.ok(taperedLosses.sentinelLancer <= 38); // ceil(50*0.75)=38
});

test('computeLossesForLoser never reports more losses than units present', () => {
	const force = { assaultTrooper: 3 };
	const losses = computeLossesForLoser(force, 0.05, 0.9);
	assert.ok(losses.assaultTrooper <= 3);
});

test('full-strength taper floor at protection-end instant leaves a real remnant on a 20:1 stomp', () => {
	const force = { bulwarkGuard: 1000 };
	const floor = PROTECTION_TAPER_START_SURVIVOR_PCT; // 0.25, as if attacked the instant protection lapsed
	const losses = computeLossesForLoser(force, 0.05, floor);
	const survivors = 1000 - (losses.bulwarkGuard || 0);
	assert.ok(survivors >= 250, `expected at least 250 survivors, got ${survivors}`);
});
