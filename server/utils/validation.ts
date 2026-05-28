import EmailSpellChecker from '@zootools/email-spell-checker';
import type { TroopKey } from '../types/index.js';
import { containsBlockedUsername } from './profanity.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function detectEmailTypo(email: string): string | null {
  const suggestion = EmailSpellChecker.run({ email: email.trim() });
  if (!suggestion) return null;
  return `Did you mean ${suggestion.full}?`;
}
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const RESERVED_USERNAMES = new Set([
  'vexara', 'admin', 'administrator', 'moderator', 'mod', 'staff', 'support',
  'root', 'system', 'bot', 'official', 'help', 'info', 'contact', 'security',
  'null', 'undefined', 'anonymous', 'guest', 'superuser', 'sysadmin',
  'webmaster', 'postmaster', 'hostmaster', 'noreply', 'no-reply',
  // reserved for admins
  'andre', 'ronaldo', 'cristiano', 'cristiano ronaldo', 'cristiano ronaldo dos santos aveiro'
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

export function normalizeTroopPayload(
  troops: unknown,
  troopKeys: TroopKey[],
): { normalized: Record<TroopKey, number> } | { error: string } {
  if (!troops || typeof troops !== 'object' || Array.isArray(troops)) {
    return { error: 'Invalid troops payload' };
  }

  const troopSet = new Set<string>(troopKeys);
  const normalized = Object.fromEntries(troopKeys.map((key) => [key, 0])) as Record<TroopKey, number>;

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

export function validateEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return EMAIL_RE.test(normalized);
}

export function validatePassword(password: unknown): boolean {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 72;
}
