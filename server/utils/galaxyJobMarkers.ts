import prisma from '../lib/prisma.js';

// Restart-proof "last run" stamps for per-galaxy periodic jobs, stored as already
// resolved GalaxyEvent rows so no schema change is needed. A marker is created
// with resolvedAt set and no expiry, so every player-facing and spawn-cap query
// (all of which filter on resolvedAt: null) ignores it. The job itself runs on a
// short interval and uses these stamps to decide whether its real cadence (e.g.
// once per 24h) has elapsed, so a deploy or crash never resets the clock.

export const MARKER_EVENT_ROLL = 'event_roll';
export const MARKER_NEXUS_GROWTH = 'nexus_growth';
const MARKER_TYPES = [MARKER_EVENT_ROLL, MARKER_NEXUS_GROWTH];

// Latest createdAt for a galaxy's rows of the given type; null if none.
export async function getLastMarkerAt(galaxyId: number, type: string): Promise<Date | null> {
	const row = await prisma.galaxyEvent.findFirst({
		where: { galaxyId, type },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});
	return row?.createdAt ?? null;
}

// Latest createdAt of any REAL (non-marker) event row, used as a fallback roll
// time for galaxies that spawned events before markers existed.
export async function getLastRealEventAt(galaxyId: number): Promise<Date | null> {
	const row = await prisma.galaxyEvent.findFirst({
		where: { galaxyId, type: { notIn: MARKER_TYPES } },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});
	return row?.createdAt ?? null;
}

// Claim a run for this galaxy BEFORE doing the work so a crash mid-run cannot
// cause an immediate re-run on the next tick.
export async function stampMarker(galaxyId: number, type: string, now: Date): Promise<void> {
	await prisma.galaxyEvent.create({
		data: {
			galaxyId,
			type,
			title: 'Scheduler marker',
			description: 'Internal job timestamp. Not a gameplay event.',
			resolvedAt: now,
			createdAt: now
		}
	});
}
