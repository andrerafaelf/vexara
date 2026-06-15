import assert from 'node:assert/strict';
import test from 'node:test';
import {
	FIRST_BUILD_TIME_SECONDS,
	getBuildingCost,
	getCommandTimeFactor,
	getEffectiveBuildTimeSeconds,
	isFirstBuild
} from '../utils/gameConstants.js';

// Guards for the beta first-build acceleration. A brand-new player's first build
// is the Command Core 0 -> 1 upgrade; we collapse just that one build to a short
// fixed time so the first session isn't a ~2-minute idle wait. These tests pin
// that the acceleration (a) fires only for that single build and (b) leaves every
// other build's timing exactly as the existing formula computed it.

test('isFirstBuild is true ONLY for Command Core at level 0', () => {
	assert.equal(isFirstBuild('commandCore', 0), true);
	// Any later Command Core level is a normal build.
	assert.equal(isFirstBuild('commandCore', 1), false);
	assert.equal(isFirstBuild('commandCore', 5), false);
	// No other building qualifies, even at level 0.
	assert.equal(isFirstBuild('biomassFarm', 0), false);
	assert.equal(isFirstBuild('hangarBay', 0), false);
	assert.equal(isFirstBuild('storageVault', 0), false);
});

test('first Command Core build returns the fixed accelerated time', () => {
	// Fresh starter: CC0, default nexus type (no type multiplier).
	const t = getEffectiveBuildTimeSeconds('commandCore', 0, 0, null, false);
	assert.equal(t, FIRST_BUILD_TIME_SECONDS);
	// The acceleration is a real speed-up vs the un-accelerated base (120s at CC0).
	const baseCC0 = getBuildingCost('commandCore', 0).time;
	assert.ok(FIRST_BUILD_TIME_SECONDS < baseCC0, 'accelerated time should beat the base');
});

test('acceleration does not leak into any later or non-Command-Core build', () => {
	// Command Core 1 -> 2 uses the normal formula (CC discount at level 1).
	const cc1 = getEffectiveBuildTimeSeconds('commandCore', 1, 1, null, false);
	const cc1Expected = Math.max(
		1,
		Math.floor(getBuildingCost('commandCore', 1).time * getCommandTimeFactor(1))
	);
	assert.equal(cc1, cc1Expected);

	// A different building at level 0 is NOT accelerated — it uses the formula.
	const farm0 = getEffectiveBuildTimeSeconds('biomassFarm', 0, 0, null, false);
	const farm0Expected = Math.max(
		1,
		Math.floor(getBuildingCost('biomassFarm', 0).time * getCommandTimeFactor(0))
	);
	assert.equal(farm0, farm0Expected);
	assert.notEqual(farm0, FIRST_BUILD_TIME_SECONDS);
});
