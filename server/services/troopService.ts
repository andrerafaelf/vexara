import prisma from '../lib/prisma.js';

export function getNexusById(nexusId: number) {
	return prisma.nexus.findUnique({ where: { id: nexusId } });
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
	return prisma.nexus.update({ where: { id }, data });
}

export function getInFlightTroops(nexusId: number) {
	return prisma.attack.findMany({
		where: { attackerNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
		select: { troops: true }
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
