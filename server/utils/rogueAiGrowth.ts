import prisma from '../lib/prisma.js';
import { logInfo, logError } from './logger.js';

// Rogue AI cores reinforce themselves over time so the threat doesn't stay
// trivially solvable indefinitely. The longer a core sits unconquered the
// faster it grows, until it hits a hard cap (about 5× initial garrison).
const GROWTH_TICK_MS = 6 * 60 * 60 * 1000; // grow at most every 6h per core
const GROWTH_AGE_SCALE_PER_DAY = 0.5; // each day alive multiplies base growth
const GROWTH_TROOP_CAP = 5; // max ratio of current/initial garrison

// Base troops added per growth tick (gets scaled by age).
const BASE_GROWTH: Record<string, number> = {
	lancerDrone: 8,
	assaultTrooper: 6,
	breakerUnit: 3,
	bulwarkGuard: 3,
	suppressorTeam: 2,
	annihilatorPlatform: 0.2
};

// Generous initial-equivalent garrison used to cap growth. Mirrors spawnRogueAi.
const INITIAL_TROOP_CEILING: Record<string, number> = {
	lancerDrone: 80,
	assaultTrooper: 60,
	breakerUnit: 30,
	bulwarkGuard: 25,
	suppressorTeam: 20,
	annihilatorPlatform: 3
};

export async function processRogueAiGrowth(): Promise<void> {
	try {
		const now = new Date();
		const events = await prisma.galaxyEvent.findMany({
			where: { type: 'rogue_ai', resolvedAt: null, nexusId: { not: null } },
			select: { id: true, nexusId: true, createdAt: true, meta: true }
		});

		for (const event of events) {
			if (!event.nexusId) continue;
			const meta = (event.meta as Record<string, unknown> | null) ?? {};
			const lastGrowthAt =
				typeof meta.lastGrowthAt === 'string' ? new Date(meta.lastGrowthAt) : null;
			if (lastGrowthAt && now.getTime() - lastGrowthAt.getTime() < GROWTH_TICK_MS) continue;

			const core = await prisma.nexus.findUnique({ where: { id: event.nexusId } });
			// If captured or removed, skip (event will be resolved separately).
			if (!core || core.ownerId != null) continue;

			const ageDays = (now.getTime() - event.createdAt.getTime()) / (24 * 60 * 60 * 1000);
			const ageMultiplier = 1 + ageDays * GROWTH_AGE_SCALE_PER_DAY;

			const updates: Record<string, number> = {};
			let totalAdded = 0;
			for (const [key, base] of Object.entries(BASE_GROWTH)) {
				const ceiling = (INITIAL_TROOP_CEILING[key] ?? base * 10) * GROWTH_TROOP_CAP;
				const current = (core as unknown as Record<string, number>)[key] ?? 0;
				if (current >= ceiling) continue;
				const increment = Math.max(1, Math.floor(base * ageMultiplier));
				const next = Math.min(ceiling, current + increment);
				if (next > current) {
					updates[key] = next;
					totalAdded += next - current;
				}
			}

			if (totalAdded > 0) {
				await prisma.$transaction([
					prisma.nexus.update({ where: { id: core.id }, data: updates }),
					prisma.galaxyEvent.update({
						where: { id: event.id },
						data: { meta: { ...meta, lastGrowthAt: now.toISOString() } }
					})
				]);
				logInfo('rogue_ai_growth_tick', {
					eventId: event.id,
					coreNexusId: core.id,
					ageDays: Math.round(ageDays * 10) / 10,
					totalAdded
				});
			} else {
				// At cap - still bump the timestamp so we don't re-evaluate every cron.
				await prisma.galaxyEvent.update({
					where: { id: event.id },
					data: { meta: { ...meta, lastGrowthAt: now.toISOString() } }
				});
			}
		}
	} catch (err) {
		logError('rogue_ai_growth_error', { message: (err as Error).message });
	}
}
