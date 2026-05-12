import type { TroopKey } from '../types/index.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export function validatePassword(password: unknown): boolean {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 72;
}
