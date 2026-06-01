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
  meta?: Record<string, unknown>,
): void {
  prisma.gameEvent
    .create({ data: { event, userId, galaxyId: galaxyId ?? null, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined } })
    .catch((err) => logError('game_event_write_failed', { event, userId, message: (err as Error).message }));
}
