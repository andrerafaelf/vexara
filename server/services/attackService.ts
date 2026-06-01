import prisma from '../lib/prisma.js';

export class InsufficientTroopsError extends Error {
	constructor() {
		super('Insufficient troops');
	}
}

export class DuplicateRequestIdError extends Error {
	constructor() {
		super('Request id already used');
	}
}

function isSameAttackRequest(
	existing: { attackerUserId: number | null; attackerNexusId: number; defenderNexusId: number },
	attackData: {
		attackerUserId?: number | null;
		attackerNexusId?: number;
		defenderNexusId?: number;
	}
) {
	return (
		existing.attackerUserId === attackData.attackerUserId &&
		existing.attackerNexusId === attackData.attackerNexusId &&
		existing.defenderNexusId === attackData.defenderNexusId
	);
}

export function getNexusById(id: number) {
	return prisma.nexus.findUnique({ where: { id } });
}

export function getUserById(id: number) {
	return prisma.user.findUnique({
		where: { id },
		select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true }
	});
}

export async function getUsersByIds(
	ids: number[]
): Promise<
	Map<
		number,
		{
			username: string;
			isSupporter: boolean;
			supporterTier: string | null;
			avatarKey: string | null;
		}
	>
> {
	if (ids.length === 0) return new Map();
	const users = await prisma.user.findMany({
		where: { id: { in: ids } },
		select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true }
	});
	return new Map(
		users.map((u) => [
			u.id,
			{
				username: u.username,
				isSupporter: u.isSupporter,
				supporterTier: u.supporterTier,
				avatarKey: u.avatarKey
			}
		])
	);
}

export async function createAttackAndDeductTroops(
	attackData: Parameters<typeof prisma.attack.create>[0]['data'],
	nexusId: number,
	requestedTroops: Record<string, number>
) {
	try {
		return await prisma.$transaction(async (tx) => {
			const clientRequestId = (attackData as { clientRequestId?: string | null }).clientRequestId;
			if (clientRequestId) {
				const existing = await tx.attack.findUnique({ where: { clientRequestId } as any });
				if (existing) {
					if (!isSameAttackRequest(existing, attackData as any))
						throw new DuplicateRequestIdError();
					const nexus = await tx.nexus.findUnique({ where: { id: nexusId } });
					if (!nexus) throw new InsufficientTroopsError();
					return { attack: existing, updatedAttackerNexus: nexus, reused: true };
				}
			}

			const decrementData: Record<string, { decrement: number }> = {};
			const availabilityWhere: Record<string, { gte: number }> = {};
			for (const [troopType, amount] of Object.entries(requestedTroops)) {
				if (amount <= 0) continue;
				decrementData[troopType] = { decrement: amount };
				availabilityWhere[troopType] = { gte: amount };
			}

			const attack = await tx.attack.create({ data: attackData });
			const updated = await tx.nexus.updateMany({
				where: { id: nexusId, ...availabilityWhere },
				data: decrementData
			});
			if (updated.count !== 1) throw new InsufficientTroopsError();

			const updatedAttackerNexus = await tx.nexus.findUnique({ where: { id: nexusId } });
			if (!updatedAttackerNexus) throw new InsufficientTroopsError();
			return { attack, updatedAttackerNexus, reused: false };
		});
	} catch (err) {
		const clientRequestId = (attackData as { clientRequestId?: string | null }).clientRequestId;
		if ((err as { code?: string }).code === 'P2002' && clientRequestId) {
			const [existing, nexus] = await Promise.all([
				prisma.attack.findUnique({ where: { clientRequestId } as any }),
				prisma.nexus.findUnique({ where: { id: nexusId } })
			]);
			if (existing && nexus) {
				if (!isSameAttackRequest(existing, attackData as any)) throw new DuplicateRequestIdError();
				return { attack: existing, updatedAttackerNexus: nexus, reused: true };
			}
		}
		throw err;
	}
}

export function getIncomingAttacks(nexusId: number) {
	return prisma.attack.findMany({
		where: { defenderNexusId: nexusId, status: 'traveling' },
		include: { attackerNexus: { select: { id: true, name: true, x: true, y: true } } }
	});
}

export function getOutgoingAttacks(nexusId: number) {
	return prisma.attack.findMany({
		where: { attackerNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
		include: { defenderNexus: { select: { id: true, name: true, x: true, y: true } } }
	});
}

export function getAllAttacksForUser(nexusIds: number[]) {
	if (nexusIds.length === 0) return Promise.resolve({ incoming: [], outgoing: [] });
	return Promise.all([
		prisma.attack.findMany({
			where: {
				defenderNexusId: { in: nexusIds },
				status: 'traveling',
				type: { in: ['attack', 'scout'] }
			},
			include: {
				attackerNexus: { select: { id: true, name: true, x: true, y: true } },
				defenderNexus: { select: { id: true, name: true, x: true, y: true } }
			}
		}),
		prisma.attack.findMany({
			where: { attackerNexusId: { in: nexusIds }, status: { in: ['traveling', 'returning'] } },
			include: {
				attackerNexus: { select: { id: true, name: true, x: true, y: true } },
				defenderNexus: { select: { id: true, name: true, x: true, y: true } }
			}
		})
	]).then(([incoming, outgoing]) => ({ incoming, outgoing }));
}
