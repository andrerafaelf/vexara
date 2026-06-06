import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_OVERSEERS_PER_ATTACK,
  normalizeTroopPayload,
  parseNonNegativeInt,
  parsePositiveInt,
  validateEmail,
  validateOverseerAttackCap,
  validatePassword,
  validateUsername,
  validateUsernameForLogin,
} from '../utils/validation.js';

const TROOP_KEYS = ['assaultTrooper', 'reconOperative', 'overseer'];

test('parsePositiveInt accepts valid positive integers', () => {
  assert.equal(parsePositiveInt(1), 1);
  assert.equal(parsePositiveInt('12'), 12);
});

test('parsePositiveInt rejects invalid values', () => {
  assert.equal(parsePositiveInt(0), null);
  assert.equal(parsePositiveInt(-1), null);
  assert.equal(parsePositiveInt(1.5), null);
  assert.equal(parsePositiveInt('foo'), null);
});

test('parseNonNegativeInt accepts 0 and positive integers', () => {
  assert.equal(parseNonNegativeInt(0), 0);
  assert.equal(parseNonNegativeInt('9'), 9);
});

test('normalizeTroopPayload rejects unknown troop keys', () => {
  const result = normalizeTroopPayload({ unknownTroop: 1 }, TROOP_KEYS);
  assert.equal(typeof result.error, 'string');
});

test('normalizeTroopPayload returns normalized object with defaults', () => {
  const result = normalizeTroopPayload({ assaultTrooper: '4' }, TROOP_KEYS);
  assert.deepEqual(result.normalized, {
    assaultTrooper: 4,
    reconOperative: 0,
    overseer: 0,
  });
});

test('MAX_OVERSEERS_PER_ATTACK is 1 (game rule guard)', () => {
  // Pinned because the WavePlanner client mirrors this value. If the cap
  // ever changes, update both sides AND this test together.
  assert.equal(MAX_OVERSEERS_PER_ATTACK, 1);
});

test('validateOverseerAttackCap rejects 2+ overseers on an attack', () => {
  const result = validateOverseerAttackCap('attack', { overseer: 2 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Overseer/);
});

test('validateOverseerAttackCap accepts 1 overseer on an attack', () => {
  const result = validateOverseerAttackCap('attack', { overseer: 1 });
  assert.equal(result.ok, true);
});

test('validateOverseerAttackCap accepts 0 overseers on an attack', () => {
  const result = validateOverseerAttackCap('attack', { overseer: 0 });
  assert.equal(result.ok, true);
});

test('validateOverseerAttackCap accepts 0 overseers when key is absent', () => {
  // Missing key should be treated as 0, not throw.
  const result = validateOverseerAttackCap('attack', {});
  assert.equal(result.ok, true);
});

test('validateOverseerAttackCap is a no-op for support missions', () => {
  // Support missions have their own no-offensive-units check; the overseer
  // cap intentionally short-circuits so we don't double-report the same error.
  const result = validateOverseerAttackCap('support', { overseer: 5 });
  assert.equal(result.ok, true);
});

test('credential validators enforce expected format', () => {
  assert.equal(validateUsername('alpha_user'), true);
  assert.equal(validateUsername('x'), false);
  assert.equal(validateEmail('pilot@example.com'), true);
  assert.equal(validateEmail('bad-email'), false);
  assert.equal(validatePassword('12345678'), true);
  assert.equal(validatePassword('short'), false);
});

test('signup username cap is 16, login grandfathers up to 20', () => {
  // 16 is the new signup max; 17+ is rejected on signup.
  assert.equal(validateUsername('a'.repeat(16)), true);
  assert.equal(validateUsername('a'.repeat(17)), false);
  assert.equal(validateUsername('a'.repeat(20)), false);

  // Login must still accept grandfathered 17-20 char names, but nothing longer
  // (the DB column is VarChar(20)) and nothing shorter than the 3-char floor.
  assert.equal(validateUsernameForLogin('a'.repeat(16)), true);
  assert.equal(validateUsernameForLogin('a'.repeat(20)), true);
  assert.equal(validateUsernameForLogin('a'.repeat(21)), false);
  assert.equal(validateUsernameForLogin('xx'), false);
});
