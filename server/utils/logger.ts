import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';

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
