import prisma from '../lib/prisma.js';

export class TroopShortfallError extends Error {
	constructor() {
		super('Insufficient troops available');
		this.name = 'TroopShortfallError';
	}
}

export function getNexusById(id: number) {
	return prisma.nexus.findUnique({ where: { id } });
}

export function getTransferById(id: number) {
	return prisma.troopTransfer.findUnique({
		where: { id },
		include: { ownerNexus: true, hostNexus: true }
	});
}

/**
 * Atomically deduct troops from the source nexus and create a TroopTransfer row
 * in a single transaction. Uses guarded conditional decrements (updateMany with
 * per-field gte checks) so two concurrent sends cannot both succeed if only one
 * has enough troops - no absolute-value clobber race.
 *
 * Throws TroopShortfallError (count === 0) if the nexus no longer has enough
 * troops at commit time. Callers should surface this as HTTP 409.
 */
export async function sendTroopsTransaction(
	fromId: number,
	decrementData: Record<string, { decrement: number }>,
	availabilityWhere: Record<string, { gte: number }>,
	transferData: Parameters<typeof prisma.troopTransfer.create>[0]['data']
) {
	return prisma.$transaction(async (tx) => {
		const { count } = await tx.nexus.updateMany({
			where: { id: fromId, ...availabilityWhere },
			data: decrementData
		});
		if (count !== 1) throw new TroopShortfallError();

		const transfer = await tx.troopTransfer.create({
			data: transferData,
			include: {
				ownerNexus: { select: { id: true, name: true, x: true, y: true } },
				hostNexus: { select: { id: true, name: true, x: true, y: true } }
			}
		});
		const updatedFrom = await tx.nexus.findUniqueOrThrow({ where: { id: fromId } });
		return [updatedFrom, transfer] as const;
	});
}

export function updateTransfer(
	id: number,
	data: Parameters<typeof prisma.troopTransfer.update>[0]['data']
) {
	return prisma.troopTransfer.update({
		where: { id },
		data,
		include: {
			ownerNexus: { select: { id: true, name: true, x: true, y: true } },
			hostNexus: { select: { id: true, name: true, x: true, y: true } }
		}
	});
}

export function getTransfersForNexus(nexusId: number, galaxyId: number) {
	return prisma.troopTransfer.findMany({
		where: { galaxyId, OR: [{ ownerNexusId: nexusId }, { hostNexusId: nexusId }] },
		include: {
			ownerNexus: { select: { id: true, name: true, x: true, y: true } },
			hostNexus: { select: { id: true, name: true, x: true, y: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
}
