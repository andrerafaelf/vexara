import prisma from '../lib/prisma.js';
import { TROOP_COSTS } from '../utils/gameConstants.js';

const TROOP_KEYS = Object.keys(TROOP_COSTS);

function troopPop(troops: unknown): number {
	if (!troops || typeof troops !== 'object') return 0;
	return Object.entries(troops as Record<string, unknown>).reduce((sum, [type, amount]) => {
		const count = Math.max(0, Math.floor(Number(amount) || 0));
		return sum + count * (TROOP_COSTS[type]?.population ?? 0);
	}, 0);
}

function queuePop(queue: unknown): number {
	if (!Array.isArray(queue)) return 0;
	return queue.reduce((sum: number, entry: unknown) => {
		if (!entry || typeof entry !== 'object') return sum;
		const e = entry as Record<string, unknown>;
		const amount = Math.max(0, Math.floor(Number(e.amount) || 0));
		const cost = TROOP_COSTS[e.troopType as string]?.population ?? 0;
		return sum + amount * cost;
	}, 0);
}

async function main() {
	const nexuses = await prisma.nexus.findMany({
		select: {
			id: true,
			populationMax: true,
			populationCurrent: true,
			trainingQueue: true,
			...Object.fromEntries(TROOP_KEYS.map((k) => [k, true]))
		}
	});

	// Fetch all in-flight attacks and outbound transfers in bulk
	const [attacks, transfers] = await Promise.all([
		prisma.attack.findMany({
			where: { status: 'traveling' },
			select: { attackerNexusId: true, troops: true }
		}),
		prisma.troopTransfer.findMany({
			where: { status: 'traveling' },
			select: { ownerNexusId: true, troops: true }
		})
	]);

	// Group by nexus id for O(n) lookup
	const attacksByNexus = new Map<number, number>();
	for (const a of attacks) {
		const prev = attacksByNexus.get(a.attackerNexusId) ?? 0;
		attacksByNexus.set(a.attackerNexusId, prev + troopPop(a.troops));
	}

	const transfersByNexus = new Map<number, number>();
	for (const t of transfers) {
		const prev = transfersByNexus.get(t.ownerNexusId) ?? 0;
		transfersByNexus.set(t.ownerNexusId, prev + troopPop(t.troops));
	}

	let updated = 0;
	let skipped = 0;

	const updates: { id: number; old: number; correct: number }[] = [];

	for (const nexus of nexuses) {
		const nexusTroops = Object.fromEntries(
			TROOP_KEYS.map((k) => [k, (nexus as unknown as Record<string, number>)[k] ?? 0])
		);
		const onNexus = troopPop(nexusTroops);
		const inQueue = queuePop(nexus.trainingQueue);
		const inFlight = attacksByNexus.get(nexus.id) ?? 0;
		const inTransfer = transfersByNexus.get(nexus.id) ?? 0;

		const correct = Math.min(
			nexus.populationMax,
			onNexus + inQueue + inFlight + inTransfer
		);

		if (correct !== nexus.populationCurrent) {
			updates.push({ id: nexus.id, old: nexus.populationCurrent, correct });
		} else {
			skipped++;
		}
	}

	console.log(`Nexuses needing correction: ${updates.length} / ${nexuses.length}`);

	if (updates.length === 0) {
		console.log('All population counts are already correct.');
		return;
	}

	// Apply updates in batches of 100
	const BATCH = 100;
	for (let i = 0; i < updates.length; i += BATCH) {
		const batch = updates.slice(i, i + BATCH);
		await prisma.$transaction(
			batch.map((u) =>
				prisma.nexus.update({
					where: { id: u.id },
					data: { populationCurrent: u.correct }
				})
			)
		);
		updated += batch.length;
		console.log(`  Updated ${updated}/${updates.length}...`);
	}

	console.log(`Done. ${updated} nexuses corrected, ${skipped} already correct.`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
