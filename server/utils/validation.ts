import EmailSpellChecker from '@zootools/email-spell-checker';
import type { TroopKey } from '../types/index.js';
import { containsBlockedUsername } from './profanity.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function detectEmailTypo(email: string): string | null {
	const suggestion = EmailSpellChecker.run({ email: email.trim() });
	if (!suggestion) return null;
	return `Did you mean ${suggestion.full}?`;
}
// New signups / changes are capped at 16. The DB column stays VarChar(20) so
// pre-existing 17-20 char names remain valid (grandfathered) and aren't rejected
// on actions that re-validate them.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

const RESERVED_USERNAMES = new Set([
	'vexara',
	'admin',
	'administrator',
	'moderator',
	'mod',
	'staff',
	'support',
	'root',
	'system',
	'bot',
	'official',
	'help',
	'info',
	'contact',
	'security',
	'null',
	'undefined',
	'anonymous',
	'guest',
	'superuser',
	'sysadmin',
	'webmaster',
	'postmaster',
	'hostmaster',
	'noreply',
	'no-reply',
	// reserved for admins
	'andre',
	'ronaldo',
	'cristiano',
	'cristiano ronaldo',
	'cristiano ronaldo dos santos aveiro'
]);

export function parsePositiveInt(value: unknown): number | null {
	const num = Number(value);
	if (!Number.isInteger(num) || num <= 0) return null;
	return num;
}

export function parseNonNegativeInt(value: unknown): number | null {
	const num = Number(value);
	if (!Number.isInteger(num) || num < 0) return null;
	return num;
}

// Per-attack hard cap on overseers. An attack carries one army with one
// commanding officer; multiple overseers in the same strike doesn't make
// game sense (only one can drive control reduction) and would let players
// burn through their per-nexus overseer pool in a single failed raid.
// The client-side WavePlanner mirrors this constant.
export const MAX_OVERSEERS_PER_ATTACK = 1;

/**
 * Pure-function gate for the per-attack overseer cap. Split out from
 * attackService so it can be unit-tested without standing up the database.
 * `attackType === 'support'` is excluded because support missions have
 * their own no-Overseer rule (no offensive troops at all) checked separately.
 */
export function validateOverseerAttackCap(
	attackType: string,
	troops: Record<string, number>
): { ok: true } | { ok: false; error: string } {
	if (attackType === 'support') return { ok: true };
	const overseers = troops.overseer ?? 0;
	if (overseers > MAX_OVERSEERS_PER_ATTACK) {
		return { ok: false, error: `Maximum ${MAX_OVERSEERS_PER_ATTACK} Overseer per strike` };
	}
	return { ok: true };
}

export function normalizeTroopPayload(
	troops: unknown,
	troopKeys: readonly TroopKey[]
): { normalized: Record<TroopKey, number> } | { error: string } {
	if (!troops || typeof troops !== 'object' || Array.isArray(troops)) {
		return { error: 'Invalid troops payload' };
	}

	const troopSet = new Set<string>(troopKeys);
	const normalized = Object.fromEntries(troopKeys.map((key) => [key, 0])) as Record<
		TroopKey,
		number
	>;

	for (const [troopType, rawAmount] of Object.entries(troops as Record<string, unknown>)) {
		if (!troopSet.has(troopType)) return { error: `Invalid troop type: ${troopType}` };

		const amount = parseNonNegativeInt(rawAmount);
		if (amount === null) return { error: `Invalid troop amount for ${troopType}` };

		normalized[troopType as TroopKey] = amount;
	}

	return { normalized };
}

export function validateUsername(username: unknown): boolean {
	if (typeof username !== 'string') return false;
	const trimmed = username.trim();
	if (!USERNAME_RE.test(trimmed)) return false;
	if (RESERVED_USERNAMES.has(trimmed.toLowerCase())) return false;
	return !containsBlockedUsername(trimmed);
}

// Login-time format check. Looser than validateUsername on purpose: the signup
// cap is 16, but names created under the old 3-20 rule are grandfathered, so
// login must still accept up to 20 chars or those users would be locked out.
// It's only a cheap sanity gate before the DB lookup (the password check is the
// real auth), so reserved/profanity rules - which only matter at creation - are
// intentionally skipped here.
const LOGIN_USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
export function validateUsernameForLogin(username: unknown): boolean {
	if (typeof username !== 'string') return false;
	return LOGIN_USERNAME_RE.test(username.trim());
}

export function validateEmail(email: unknown): boolean {
	if (typeof email !== 'string') return false;
	const normalized = email.trim().toLowerCase();
	return EMAIL_RE.test(normalized);
}

export function validatePassword(password: unknown): boolean {
	if (typeof password !== 'string') return false;
	return password.length >= 8 && password.length <= 72;
}
