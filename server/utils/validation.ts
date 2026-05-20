import type { TroopKey } from '../types/index.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const KNOWN_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com',
];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Returns the closest known domain if it differs by 1-2 chars; otherwise null.
// Distance 0 (exact match) and >2 (probably unrelated) both return null so we
// don't badger users with legitimate but uncommon domains.
export function suggestEmailDomain(domain: string): string | null {
  const lower = domain.trim().toLowerCase();
  if (!lower) return null;
  if (KNOWN_EMAIL_DOMAINS.includes(lower)) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const known of KNOWN_EMAIL_DOMAINS) {
    if (Math.abs(known.length - lower.length) > 2) continue;
    const distance = levenshtein(lower, known);
    if (distance === 0) return null;
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: known, distance };
    }
  }
  return best?.domain ?? null;
}

export function detectEmailTypo(email: string): string | null {
  const lower = email.trim().toLowerCase();
  const atIdx = lower.lastIndexOf('@');
  if (atIdx === -1) return null;
  const domain = lower.slice(atIdx + 1);
  const suggestion = suggestEmailDomain(domain);
  if (!suggestion) return null;
  return `Did you mean ${lower.slice(0, atIdx + 1)}${suggestion}?`;
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
  return EMAIL_RE.test(normalized);
}

export function validatePassword(password: unknown): boolean {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 72;
}
