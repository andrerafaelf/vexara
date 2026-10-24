import prisma from '../lib/prisma.js';
import { logInfo, logError } from './logger.js';
import { TROOP_STATS } from './combatMath.js';

// How often the raid scan runs is controlled by server.ts. Each scan, every active
// rogue AI core that hasn't raided in the last RAID_COOLDOWN_MS picks the nearest
// unprotected player nexus inside RAID_RADIUS and dispatches an attack.

const RAID_RADIUS = 12;
const RAID_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h between raids per core
const TROOP_COMMIT_FRACTION = 0.45; // how much of the core's garrison goes on a raid
const MIN_TROOPS_PER_RAID = 12;

const COMBAT_TROOP_KEYS = [
	'sentinelLancer',
	'assaultTrooper',
	'vanguardBreaker',
	'wraithSkimmer',
	'siegeMech',
	'bulwarkGuard',
	'aegisSkirmisher',
	'pyreSuppressor',
	'arcDisruptor',
	'phantomLance',
	'annihilatorPlatform',
	'siegeColossus'
] as const;
type CombatTroopKey = (typeof COMBAT_TROOP_KEYS)[number];

function distanceTiles(ax: number, ay: number, bx: number, by: number): number {
	return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function pickRaidTroops(coreNexus: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const key of COMBAT_TROOP_KEYS) {
		const available = coreNexus[key] || 0;
		if (available <= 0) continue;
		const send = Math.floor(available * TROOP_COMMIT_FRACTION);
		if (send > 0) out[key] = send;
	}
	return out;
}

function minTroopSpeed(troops: Record<string, number>): number {
	let minSpeed = Infinity;
	for (const [key, count] of Object.entries(troops)) {
		if (!count) continue;
		const stat = (TROOP_STATS as Record<string, { speed: number }>)[key];
		if (stat && stat.speed < minSpeed) minSpeed = stat.speed;
	}
	return Number.isFinite(minSpeed) ? minSpeed : 16;
}

export async function processRogueAiRaids(): Promise<void> {
	try {
		const now = new Date();
		const activeEvents = await prisma.galaxyEvent.findMany({
			where: {
				type: 'rogue_ai',
				resolvedAt: null,
				nexusId: { not: null },
				// An expired-but-unresolved core stops raiding immediately; expireOldEvents resolves it.
				OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
			},
			select: { id: true, galaxyId: true, nexusId: true, meta: true }
		});

		for (const event of activeEvents) {
			if (!event.nexusId) continue;
			const meta = (event.meta as Record<string, unknown> | null) ?? {};
			const lastRaidAt = typeof meta.lastRaidAt === 'string' ? new Date(meta.lastRaidAt) : null;
			if (lastRaidAt && now.getTime() - lastRaidAt.getTime() < RAID_COOLDOWN_MS) continue;

			const core = await prisma.nexus.findUnique({ where: { id: event.nexusId } });
			// If captured or removed, the event is no longer relevant; resolveEventForNexus handles it.
			if (!core || core.ownerId != null) continue;

			const candidates = await prisma.nexus.findMany({
				where: {
					galaxyId: event.galaxyId,
					ownerId: { not: null },
					OR: [{ newbieProtectionEndsAt: null }, { newbieProtectionEndsAt: { lte: now } }],
					x: { gte: core.x - RAID_RADIUS, lte: core.x + RAID_RADIUS },
					y: { gte: core.y - RAID_RADIUS, lte: core.y + RAID_RADIUS }
				},
				select: { id: true, ownerId: true, x: true, y: true }
			});

			if (candidates.length === 0) continue;

			let nearest: { id: number; ownerId: number; x: number; y: number; dist: number } | null =
				null;
			for (const c of candidates) {
				if (!c.ownerId) continue;
				const dist = distanceTiles(core.x, core.y, c.x, c.y);
				if (dist > RAID_RADIUS) continue;
				if (!nearest || dist < nearest.dist)
					nearest = { id: c.id, ownerId: c.ownerId, x: c.x, y: c.y, dist };
			}
			if (!nearest) continue;

			const coreRecord = core as unknown as Record<string, number>;
			const raidTroops = pickRaidTroops(coreRecord);
			const totalTroops = Object.values(raidTroops).reduce((a, b) => a + b, 0);
			if (totalTroops < MIN_TROOPS_PER_RAID) continue;

			const slowest = minTroopSpeed(raidTroops);
			const travelMinutes = nearest.dist * (4 + (28 - slowest) / 10);
			const arrivesAt = new Date(now.getTime() + travelMinutes * 60_000);

			// Conditional atomic decrement: the core's garrison is also written by growth,
			// level-up and combat under other locks, so only dispatch if every sent troop
			// column still covers what we send (and the core is still unowned). The attack
			// row and the cooldown stamp commit in the same transaction.
			const troopDeductions: Record<string, { decrement: number }> = {};
			const troopGuards: Record<string, { gte: number }> = {};
			for (const [key, sent] of Object.entries(raidTroops)) {
				troopDeductions[key] = { decrement: sent };
				troopGuards[key] = { gte: sent };
			}

			const dispatched = await prisma.$transaction(async (tx) => {
				const claimed = await tx.nexus.updateMany({
					where: { id: core.id, ownerId: null, ...troopGuards },
					data: troopDeductions
				});
				if (claimed.count === 0) return false;
				await tx.attack.create({
					data: {
						galaxyId: event.galaxyId,
						attackerUserId: null,
						attackerNexusId: core.id,
						defenderUserId: nearest.ownerId,
						defenderNexusId: nearest.id,
						troops: raidTroops,
						arrivesAt,
						type: 'attack'
					}
				});
				await tx.galaxyEvent.update({
					where: { id: event.id },
					data: { meta: { ...meta, lastRaidAt: now.toISOString() } }
				});
				return true;
			});
			if (!dispatched) {
				logInfo('rogue_ai_raid_skipped_stale', { eventId: event.id, coreNexusId: core.id });
				continue;
			}

			logInfo('rogue_ai_raid_dispatched', {
				eventId: event.id,
				coreNexusId: core.id,
				targetNexusId: nearest.id,
				targetUserId: nearest.ownerId,
				travelMinutes: Math.round(travelMinutes),
				totalTroops
			});
		}
	} catch (err) {
		logError('rogue_ai_raider_error', { message: (err as Error).message });
	}
}
