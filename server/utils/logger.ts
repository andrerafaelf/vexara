import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { TROOP_CLASS } from './combatMath.js';
import type { TroopClass } from './combatMath.js';
import type { TroopKey } from '../types/index.js';

export function logInfo(event: string, meta: Record<string, unknown> = {}): void {
	console.log(JSON.stringify({ level: 'info', event, ts: new Date().toISOString(), ...meta }));
}

export function logWarn(event: string, meta: Record<string, unknown> = {}): void {
	console.warn(JSON.stringify({ level: 'warn', event, ts: new Date().toISOString(), ...meta }));
}

export function logError(event: string, meta: Record<string, unknown> = {}): void {
	console.error(JSON.stringify({ level: 'error', event, ts: new Date().toISOString(), ...meta }));
}

// Persist a typed game event for funnel analytics. Fire-and-forget — never
// awaited in hot paths so it cannot slow down or break the caller.
export function logGameEvent(
	event: string,
	userId: number,
	galaxyId?: number | null,
	meta?: Record<string, unknown>
): void {
	prisma.gameEvent
		.create({
			data: {
				event,
				userId,
				galaxyId: galaxyId ?? null,
				meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined
			}
		})
		.catch((err) =>
			logError('game_event_write_failed', { event, userId, message: (err as Error).message })
		);
}

// Persist a funnel-milestone event AT MOST ONCE per user. The `first_*` events
// (first_build / first_train / first_attack / first_scout) were previously fired
// on every action where the relevant queue happened to be empty, so they could
// not distinguish a genuine first-ever action from the fiftieth — useless for
// activation-funnel analysis. This variant first checks the @@index([userId,
// event]) for an existing row and only inserts if none exists. Still fire-and-
// forget; a rare race may double-insert, which dedup at read time tolerates.
export function logGameEventOnce(
	event: string,
	userId: number,
	galaxyId?: number | null,
	meta?: Record<string, unknown>
): void {
	prisma.gameEvent
		.findFirst({ where: { userId, event }, select: { id: true } })
		.then((existing) => {
			if (existing) return;
			return prisma.gameEvent.create({
				data: {
					event,
					userId,
					galaxyId: galaxyId ?? null,
					meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined
				}
			});
		})
		.catch((err) =>
			logError('game_event_once_write_failed', { event, userId, message: (err as Error).message })
		);
}

// ---------------------------------------------------------------------------
// Combat-health instrumentation
//
// COMBAT_BALANCE.md §4 names four playtest signals as the gate before the
// v0.22 combat triangle can be treated as settled — but nothing emitted them,
// so they could only be eyeballed. This records ONE `combat_resolved` GameEvent
// per resolved PvP attack carrying exactly the fields the four signals are
// derived from, so the admin dashboard can read them straight out of GameEvent
// (no new table, reuses the @@index([event, createdAt])):
//
//   1. Comp diversity     — attackerClass / defenderClass (dominant class) +
//                           whether each side fielded any anvil.
//   2. Conquest rate      — `conquered`.
//   3. Post-loss recovery — `attackerWiped` (≥85% of the force lost); the
//                           dashboard pairs this with the attacker's next
//                           attack to get wipe→re-army time.
//   4. First-strike win-rate in near-mirrors — `victory` + `powerRatio`
//                           (the dashboard filters to powerRatio ≥ MIRROR band).
//
// NPC/PvE attacks (defenderUserId null) are excluded by the caller: the four
// signals are all about PvP combat health, and NPC garrisons would swamp the
// comp-diversity and win-rate reads with scripted defenses.
// ---------------------------------------------------------------------------

// Anvils are the high-defense garrison units. Signal 1 cares specifically about
// whether anvils are ever built ("anvils never built" is the concerning case),
// so we flag their presence per side. Mirrors STATIONABLE_TROOPS / the anvil
// column of COMBAT_BALANCE §1.
const ANVIL_TROOPS = new Set<TroopKey>([
	'assaultTrooper',
	'bulwarkGuard',
	'siegeMech',
	'aegisSkirmisher',
	'arcDisruptor',
	'plasmaTurret'
]);

// Dominant combat class of a force (most populous of mobile/armor/fire), or null
// for an empty / special-only force. `special` (recon/overseer) is excluded — it
// never participates in the triangle, so an overseer-only follow-up wave should
// not register as a "class".
function dominantCombatClass(force: Partial<Record<TroopKey, number>>): TroopClass | null {
	const counts: Record<'mobile' | 'armor' | 'fire', number> = { mobile: 0, armor: 0, fire: 0 };
	for (const key of Object.keys(force) as TroopKey[]) {
		const cls = TROOP_CLASS[key];
		if (cls === 'special') continue;
		counts[cls] += force[key] || 0;
	}
	let best: 'mobile' | 'armor' | 'fire' | null = null;
	let bestCount = 0;
	for (const cls of ['mobile', 'armor', 'fire'] as const) {
		if (counts[cls] > bestCount) {
			best = cls;
			bestCount = counts[cls];
		}
	}
	return best;
}

function hasAnvil(force: Partial<Record<TroopKey, number>>): boolean {
	for (const key of Object.keys(force) as TroopKey[]) {
		if (ANVIL_TROOPS.has(key) && (force[key] || 0) > 0) return true;
	}
	return false;
}

export interface CombatResolvedInput {
	attackerUserId: number;
	galaxyId: number | null;
	/** loser/winner power ratio in (0,1]; 1 = a dead-even mirror. */
	powerRatio: number;
	/** true if the attacker won the engagement. */
	victory: boolean;
	/** true if the strike took the nexus (drove control to 0). */
	conquered: boolean;
	/** the force the attacker committed (sent), pre-loss. */
	attackerForce: Partial<Record<TroopKey, number>>;
	/** the defender's merged force (garrison + support) at engagement time. */
	defenderForce: Partial<Record<TroopKey, number>>;
	/** total attacker units sent (non-zero forces only). */
	attackerSent: number;
	/** total attacker units lost. */
	attackerLost: number;
	/** true when this event comes from a coordinated (multi-wave) assault. */
	merged?: boolean;
}

// Threshold for "post-loss recovery" signal: an attacker that lost this fraction
// of the force it committed is treated as wiped and starts a recovery clock. Kept
// in sync conceptually with the loss-curve floor (LOSER_MIN_LOSS_RATE ~0.85) so a
// decisive loss reads as a wipe but a near-even loss (remnant survives) does not.
const ATTACKER_WIPE_LOSS_RATIO = 0.85;

export interface CombatSignals {
	powerRatio: number;
	victory: boolean;
	conquered: boolean;
	attackerClass: TroopClass | null;
	defenderClass: TroopClass | null;
	attackerHasAnvil: boolean;
	defenderHasAnvil: boolean;
	attackerWiped: boolean;
}

// Pure derivation of the four COMBAT_BALANCE §4 signals from a resolved fight.
// Exported separately from the DB write so the signal math is unit-testable
// without a database. `attackerClass`/`defenderClass` are exported on the type
// but only attackerClass currently drives the dashboard; defenderClass is kept
// for future "what countered what" analysis.
export function deriveCombatSignals(input: CombatResolvedInput): CombatSignals {
	const lossRatio = input.attackerSent > 0 ? input.attackerLost / input.attackerSent : 0;
	return {
		powerRatio: Number(input.powerRatio.toFixed(3)),
		victory: input.victory,
		conquered: input.conquered,
		attackerClass: dominantCombatClass(input.attackerForce),
		defenderClass: dominantCombatClass(input.defenderForce),
		attackerHasAnvil: hasAnvil(input.attackerForce),
		defenderHasAnvil: hasAnvil(input.defenderForce),
		attackerWiped: lossRatio >= ATTACKER_WIPE_LOSS_RATIO
	};
}

// Emit one combat_resolved GameEvent for a resolved PvP attack. Fire-and-forget,
// fully guarded — instrumentation must never slow or break combat resolution.
export function logCombatResolved(input: CombatResolvedInput): void {
	try {
		const meta = deriveCombatSignals(input);
		logGameEvent('combat_resolved', input.attackerUserId, input.galaxyId, {
			...meta,
			...(input.merged ? { merged: true } : {})
		});
	} catch (err) {
		// Never let a malformed force shape or anything else escape into the
		// resolver. logGameEvent already swallows its own DB errors; this guards
		// the synchronous derivation above.
		logError('combat_resolved_log_failed', { message: (err as Error).message });
	}
}
