import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCombatSignals } from '../utils/logger.js';

// Executable guards for the combat-health instrumentation (COMBAT_BALANCE §4).
// deriveCombatSignals is the pure derivation behind the combat_resolved
// GameEvent; the admin dashboard reads exactly these fields, so a regression
// here silently corrupts every playtest signal. The thresholds below mirror
// logger.ts (ATTACKER_WIPE_LOSS_RATIO = 0.85).

const base = {
	attackerUserId: 1,
	galaxyId: 1,
	powerRatio: 1,
	victory: true,
	conquered: false,
	attackerForce: {},
	defenderForce: {},
	attackerSent: 0,
	attackerLost: 0
};

test('dominant class is the most populous combat class, ignoring special', () => {
	// vanguardBreaker = mobile, sentinelLancer = fire. Overseer (special) is ignored.
	const s = deriveCombatSignals({
		...base,
		attackerForce: { vanguardBreaker: 10, sentinelLancer: 3, overseer: 1 }
	});
	assert.equal(s.attackerClass, 'mobile');
});

test('a special-only force (e.g. lone overseer wave) has no class', () => {
	const s = deriveCombatSignals({ ...base, attackerForce: { overseer: 1, reconOperative: 5 } });
	assert.equal(s.attackerClass, null);
});

test('an empty force has no class', () => {
	const s = deriveCombatSignals({ ...base, attackerForce: {} });
	assert.equal(s.attackerClass, null);
});

test('anvil presence is detected on either side', () => {
	// bulwarkGuard / aegisSkirmisher / plasmaTurret etc. are anvils; voidStalker is a striker.
	const withAnvil = deriveCombatSignals({
		...base,
		attackerForce: { voidStalker: 5 },
		defenderForce: { bulwarkGuard: 20, sentinelLancer: 5 }
	});
	assert.equal(withAnvil.attackerHasAnvil, false, 'striker-only attacker has no anvil');
	assert.equal(withAnvil.defenderHasAnvil, true, 'garrison with bulwarkGuard has an anvil');

	const noAnvil = deriveCombatSignals({ ...base, defenderForce: { voidStalker: 10 } });
	assert.equal(noAnvil.defenderHasAnvil, false, 'glass-cannon garrison flags no anvil');
});

test('attackerWiped triggers at >=85% losses, not below', () => {
	const wiped = deriveCombatSignals({ ...base, attackerSent: 100, attackerLost: 85 });
	assert.equal(wiped.attackerWiped, true, '85% loss is a wipe');

	const survived = deriveCombatSignals({ ...base, attackerSent: 100, attackerLost: 84 });
	assert.equal(survived.attackerWiped, false, '84% loss leaves a remnant, not a wipe');

	const total = deriveCombatSignals({ ...base, attackerSent: 50, attackerLost: 50 });
	assert.equal(total.attackerWiped, true, 'total loss is a wipe');

	const none = deriveCombatSignals({ ...base, attackerSent: 0, attackerLost: 0 });
	assert.equal(none.attackerWiped, false, 'zero-sent force never reads as wiped');
});

test('powerRatio is rounded to 3 decimals and outcome flags pass through', () => {
	const s = deriveCombatSignals({
		...base,
		powerRatio: 0.123456,
		victory: false,
		conquered: false
	});
	assert.equal(s.powerRatio, 0.123);
	assert.equal(s.victory, false);

	const conq = deriveCombatSignals({ ...base, victory: true, conquered: true });
	assert.equal(conq.conquered, true);
});

test('a near-mirror win (ratio ~1) is preserved for the first-strike signal', () => {
	// The dashboard filters mirror fights at powerRatio >= 0.75; ensure a true
	// mirror lands well inside that band and the victory flag is intact.
	const s = deriveCombatSignals({ ...base, powerRatio: 0.98, victory: true });
	assert.ok(s.powerRatio >= 0.75);
	assert.equal(s.victory, true);
});
