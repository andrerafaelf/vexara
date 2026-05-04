import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTroopPayload,
  parseNonNegativeInt,
  parsePositiveInt,
  validateEmail,
  validatePassword,
  validateUsername,
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

test('credential validators enforce expected format', () => {
  assert.equal(validateUsername('alpha_user'), true);
  assert.equal(validateUsername('x'), false);
  assert.equal(validateEmail('pilot@example.com'), true);
  assert.equal(validateEmail('bad-email'), false);
  assert.equal(validatePassword('12345678'), true);
  assert.equal(validatePassword('short'), false);
});
