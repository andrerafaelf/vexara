import type { TroopKey } from '../types/index.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cpm': 'gmail.com',
  'gmail.ocm': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'outlook.cm': 'outlook.com',
  'outlook.con': 'outlook.com',
};

export function detectEmailTypo(email: string): string | null {
  const lower = email.trim().toLowerCase();
  const atIdx = lower.lastIndexOf('@');
  if (atIdx === -1) return null;
  const domain = lower.slice(atIdx + 1);
  const correction = COMMON_DOMAIN_TYPOS[domain];
  if (!correction) return null;
  return `Did you mean ${lower.slice(0, atIdx + 1)}${correction}?`;
}
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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
  return USERNAME_RE.test(username.trim());
}

export function validateEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return false;
  const atIdx = normalized.lastIndexOf('@');
  const domain = normalized.slice(atIdx + 1);
  if (COMMON_DOMAIN_TYPOS[domain]) return false;
  return true;
}

export function validatePassword(password: unknown): boolean {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 72;
}
