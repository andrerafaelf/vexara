import prisma from '../lib/prisma.js';

export function getNexusById(nexusId: number) {
	return prisma.nexus.findUnique({ where: { id: nexusId } });
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
	return prisma.nexus.update({ where: { id }, data });
}

// Troops away from a nexus on its own attacks, normalized to the set that still
// occupies the sender's housing. A 'traveling' attack hasn't fought yet, so its
// full dispatched force counts. A 'returning' attack has already taken its
// casualties - but the `troops` column is never trimmed to survivors, it still
// lists the dead - so we substitute result.survivingTroops. Counting the raw
// `troops` for a returning attack would charge housing for troops that died in
// combat, blocking the player from training replacements until the (already
// dead) force lands home. Callers sum population from the returned `troops`.
export async function getInFlightTroops(
	nexusId: number
): Promise<{ troops: unknown }[]> {
	const attacks = await prisma.attack.findMany({
		where: { attackerNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
		select: { troops: true, status: true, result: true }
	});
	return attacks.map((a) => {
		if (a.status === 'returning') {
			const survivors = (a.result as { survivingTroops?: unknown } | null)?.survivingTroops;
			return { troops: survivors ?? {} };
		}
		return { troops: a.troops };
	});
}

export function getOutboundTransferTroops(nexusId: number) {
	return prisma.troopTransfer.findMany({
		where: { ownerNexusId: nexusId, status: { in: ['traveling', 'stationed', 'returning'] } },
		select: { troops: true }
	});
}

export function countOwnedNexuses(userId: number, galaxyId: number): Promise<number> {
	return prisma.nexus.count({ where: { ownerId: userId, galaxyId } });
}
