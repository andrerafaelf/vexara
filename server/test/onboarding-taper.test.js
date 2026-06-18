import assert from 'node:assert/strict';
import test from 'node:test';
import {
	getOnboardingTaperFraction,
	ONBOARDING_TAPER_DURATION_MS,
	isOnboardingTrainEligible,
	isOnboardingBuildEligible
} from '../utils/gameConstants.js';

test('getOnboardingTaperFraction returns 1 for a brand new account', () => {
	const createdAt = new Date('2026-01-10T00:00:00Z');
	const now = new Date(createdAt.getTime());
	assert.equal(getOnboardingTaperFraction(createdAt, now), 1);
});

test('getOnboardingTaperFraction returns 1 when createdAt is missing', () => {
	assert.equal(getOnboardingTaperFraction(null), 1);
	assert.equal(getOnboardingTaperFraction(undefined), 1);
});

test('getOnboardingTaperFraction decays linearly across the taper window', () => {
	const createdAt = new Date('2026-01-10T00:00:00Z');
	const halfway = new Date(createdAt.getTime() + ONBOARDING_TAPER_DURATION_MS / 2);
	const fraction = getOnboardingTaperFraction(createdAt, halfway);
	assert.ok(Math.abs(fraction - 0.5) < 1e-9);
});

test('getOnboardingTaperFraction reaches 0 once the taper window fully elapses', () => {
	const createdAt = new Date('2026-01-10T00:00:00Z');
	const after = new Date(createdAt.getTime() + ONBOARDING_TAPER_DURATION_MS + 1000);
	assert.equal(getOnboardingTaperFraction(createdAt, after), 0);
});

test('getOnboardingTaperFraction accepts a string date (as Prisma JSON round-trips it)', () => {
	const createdAt = '2026-01-10T00:00:00Z';
	const now = new Date(new Date(createdAt).getTime() + ONBOARDING_TAPER_DURATION_MS);
	assert.equal(getOnboardingTaperFraction(createdAt, now), 0);
});

test('isOnboardingTrainEligible and isOnboardingBuildEligible remain unaffected by account age (taper applies on top, not instead)', () => {
	assert.equal(isOnboardingTrainEligible('assaultTrooper', true, null), true);
	assert.equal(isOnboardingBuildEligible('commandCore', 1, true, null), true);
});
