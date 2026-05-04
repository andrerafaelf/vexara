const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function parsePositiveInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

export function parseNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    return null;
  }
  return num;
}

export function normalizeTroopPayload(troops, troopKeys) {
  if (!troops || typeof troops !== 'object' || Array.isArray(troops)) {
    return { error: 'Invalid troops payload' };
  }

  const troopSet = new Set(troopKeys);
  const normalized = Object.fromEntries(troopKeys.map((key) => [key, 0]));

  for (const [troopType, rawAmount] of Object.entries(troops)) {
    if (!troopSet.has(troopType)) {
      return { error: `Invalid troop type: ${troopType}` };
    }

    const amount = parseNonNegativeInt(rawAmount);
    if (amount === null) {
      return { error: `Invalid troop amount for ${troopType}` };
    }

    normalized[troopType] = amount;
  }

  return { normalized };
}

export function validateUsername(username) {
  if (typeof username !== 'string') return false;
  return USERNAME_RE.test(username.trim());
}

export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export function validatePassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 72;
}
