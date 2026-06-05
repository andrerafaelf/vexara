import { TROOP_KEYS, type TroopKey } from '../types/index.js';

const TROOP_KEY_SET = new Set<string>(TROOP_KEYS);

const LEGACY_TROOP_KEY_ALIASES: Record<string, TroopKey> = {
	lancerDrone: 'sentinelLancer',
	breakerUnit: 'vanguardBreaker',
	skimmerBike: 'wraithSkimmer',
	interceptorBike: 'phantomLance',
	suppressorTeam: 'pyreSuppressor',
	disruptorUnit: 'arcDisruptor'
};

export function normalizeTroopKey(key: string): TroopKey | null {
	const normalized = LEGACY_TROOP_KEY_ALIASES[key] ?? key;
	return TROOP_KEY_SET.has(normalized) ? (normalized as TroopKey) : null;
}

export function normalizeTroopCounts(troops: unknown): Partial<Record<TroopKey, number>> {
	if (!troops || typeof troops !== 'object' || Array.isArray(troops)) return {};

	const normalized: Partial<Record<TroopKey, number>> = {};
	for (const [rawKey, rawCount] of Object.entries(troops as Record<string, unknown>)) {
		const key = normalizeTroopKey(rawKey);
		const count = Math.max(0, Math.floor(Number(rawCount) || 0));
		if (!key || count <= 0) continue;
		normalized[key] = (normalized[key] ?? 0) + count;
	}

	return normalized;
}
