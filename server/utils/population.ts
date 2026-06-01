import type { PrismaClient } from '@prisma/client';
import { TROOP_COSTS } from './gameConstants.js';

export const POPULATION_BASE = 100;
export const POPULATION_GROWTH = 1.19;

export function getPopulationMax(level: number): number {
	const safeLevel = Math.max(0, Number(level) || 0);
	return Math.floor(POPULATION_BASE * Math.pow(POPULATION_GROWTH, safeLevel));
}

// Population cost of a troop map ({ lancerDrone: 5, ... }). Mirrors the
// troopPopulation helper in troopController and the combat damage helper -
// kept here too so the recount can be self-contained.
function mapPopulation(troops: unknown): number {
	if (!troops || typeof troops !== 'object') return 0;
	return Object.entries(troops as Record<string, unknown>).reduce((sum, [type, amount]) => {
		const count = Math.max(0, Math.floor(Number(amount) || 0));
		return sum + count * (TROOP_COSTS[type]?.population ?? 0);
	}, 0);
}

function queuePopulation(queue: unknown): number {
	if (!Array.isArray(queue)) return 0;
	return queue.reduce((sum: number, entry: unknown) => {
		if (!entry || typeof entry !== 'object') return sum;
		const e = entry as { troopType?: string; amount?: unknown };
		const amount = Math.max(0, Math.floor(Number(e.amount) || 0));
		return sum + amount * (TROOP_COSTS[e.troopType ?? '']?.population ?? 0);
	}, 0);
}

const RECOUNT_TROOP_KEYS = Object.keys(TROOP_COSTS);

// Population a nexus is committing right now, from first principles:
//   stationed troops + queued training + in-flight attacks + outbound transfers,
// capped at populationMax. This is THE definition of populationCurrent - every
// write site recomputes from this rather than nudging the stored value by a
// delta, so the column can't drift out of sync with the troop/queue rows.
//
// `troops` is any object carrying troop-count columns (a Nexus row works as-is).
// `inFlightPopulation` / `transferPopulation` are the population already away on
// attacks / transfers from this nexus; pass them when known, or use
// loadAwayPopulation() to fetch them. Callers that have just mutated the troop
// columns should pass the POST-mutation values.
//
// `extraTroops` covers survivors that are in transit but live on no counted row
// yet - e.g. an attack that just flipped to 'returning' (loadAwayPopulation only
// counts 'traveling'). Their housing is still owed until they land, so they're
// added in explicitly.
export function computeNexusPopulation(args: {
	troops: Record<string, unknown>;
	trainingQueue: unknown;
	populationMax: number;
	inFlightPopulation?: number;
	transferPopulation?: number;
	extraTroops?: Record<string, unknown>;
}): number {
	const stationed = mapPopulation(args.troops);
	const queued = queuePopulation(args.trainingQueue);
	const away = (args.inFlightPopulation ?? 0) + (args.transferPopulation ?? 0);
	const extra = args.extraTroops ? mapPopulation(args.extraTroops) : 0;
	return Math.min(args.populationMax, stationed + queued + away + extra);
}

// Population currently away from a nexus on attacks and transfers. A unit
// occupies its SENDER's housing for its entire away-lifetime and is only
// released when it dies (see the support-mission invariant in combat.ts). These
// count toward populationCurrent but don't live on the nexus row, so any
// recompute that only sees the row must add them back.
//
// Transfers carry their full troop set the whole way (traveling -> stationed at
// a host -> returning), so all three statuses are counted at face value. This
// mirrors the training-capacity gate's getOutboundTransferTroops - keep the two
// in lockstep, or the displayed populationCurrent under-reports stationed
// reinforcements and the UI shows free housing the gate then rejects.
//
// Attacks are intentionally 'traveling'-only: the attack row's `troops` column
// holds the FULL dispatched force and is never trimmed to survivors, so counting
// a 'returning' attack here would charge housing for troops that already died.
// Returning-attack survivors are bridged via computeNexusPopulation's
// extraTroops at combat-resolve time and land on the troop columns thereafter.
export async function loadAwayPopulation(
	prisma: PrismaClient,
	nexusId: number
): Promise<{ inFlightPopulation: number; transferPopulation: number }> {
	const [attacks, transfers] = await Promise.all([
		prisma.attack.findMany({
			where: { attackerNexusId: nexusId, status: 'traveling' },
			select: { troops: true }
		}),
		prisma.troopTransfer.findMany({
			where: { ownerNexusId: nexusId, status: { in: ['traveling', 'stationed', 'returning'] } },
			select: { troops: true }
		})
	]);
	return {
		inFlightPopulation: attacks.reduce((s, a) => s + mapPopulation(a.troops), 0),
		transferPopulation: transfers.reduce((s, t) => s + mapPopulation(t.troops), 0)
	};
}

export interface RecountResult {
	scanned: number;
	corrected: number;
}

// Recompute populationCurrent for every nexus from first principles:
// troops stationed + queued training + in-flight attacks + outbound transfers,
// capped at populationMax. This is the authoritative definition that
// trainTroops keeps incrementally; running it heals any nexus whose stored
// value drifted (e.g. after an admin wiped a training queue out of band).
// Only writes the rows that actually changed.
export async function recountAllPopulation(prisma: PrismaClient): Promise<RecountResult> {
	const nexuses = await prisma.nexus.findMany({
		select: {
			id: true,
			populationMax: true,
			populationCurrent: true,
			trainingQueue: true,
			...Object.fromEntries(RECOUNT_TROOP_KEYS.map((k) => [k, true]))
		}
	});

	// Same away-status filters as loadAwayPopulation: transfers hold their
	// sender's housing across all three away statuses (a stationed reinforcement
	// still counts), while attacks are 'traveling'-only because a returning
	// attack's `troops` column still lists the dead. Counting only 'traveling'
	// transfers here would heal every nexus toward an under-reported value and
	// re-introduce the capacity-display mismatch this job exists to prevent.
	const [attacks, transfers] = await Promise.all([
		prisma.attack.findMany({
			where: { status: 'traveling' },
			select: { attackerNexusId: true, troops: true }
		}),
		prisma.troopTransfer.findMany({
			where: { status: { in: ['traveling', 'stationed', 'returning'] } },
			select: { ownerNexusId: true, troops: true }
		})
	]);

	const inFlightByNexus = new Map<number, number>();
	for (const a of attacks) {
		inFlightByNexus.set(
			a.attackerNexusId,
			(inFlightByNexus.get(a.attackerNexusId) ?? 0) + mapPopulation(a.troops)
		);
	}

	const inTransferByNexus = new Map<number, number>();
	for (const t of transfers) {
		inTransferByNexus.set(
			t.ownerNexusId,
			(inTransferByNexus.get(t.ownerNexusId) ?? 0) + mapPopulation(t.troops)
		);
	}

	const updates: { id: number; populationCurrent: number }[] = [];
	for (const nexus of nexuses) {
		const correct = computeNexusPopulation({
			troops: nexus as unknown as Record<string, unknown>,
			trainingQueue: nexus.trainingQueue,
			populationMax: nexus.populationMax,
			inFlightPopulation: inFlightByNexus.get(nexus.id) ?? 0,
			transferPopulation: inTransferByNexus.get(nexus.id) ?? 0
		});
		if (correct !== nexus.populationCurrent) {
			updates.push({ id: nexus.id, populationCurrent: correct });
		}
	}

	const BATCH = 100;
	for (let i = 0; i < updates.length; i += BATCH) {
		const batch = updates.slice(i, i + BATCH);
		await prisma.$transaction(
			batch.map((u) =>
				prisma.nexus.update({
					where: { id: u.id },
					data: { populationCurrent: u.populationCurrent }
				})
			)
		);
	}

	return { scanned: nexuses.length, corrected: updates.length };
}
