import prisma from '../lib/prisma.js';

export const MARKET_COMMISSION_RATE = 0.1;

export async function getActiveTradeTreaty(userIdA: number, userIdB: number, galaxyId: number) {
	const [memberA, memberB] = await Promise.all([
		prisma.factionMember.findFirst({
			where: { userId: userIdA, galaxyId },
			select: { factionId: true }
		}),
		prisma.factionMember.findFirst({
			where: { userId: userIdB, galaxyId },
			select: { factionId: true }
		})
	]);
	if (!memberA || !memberB || memberA.factionId === memberB.factionId) return null;
	return prisma.factionTreaty.findFirst({
		where: {
			galaxyId,
			type: 'trade',
			status: 'active',
			OR: [
				{ proposerFactionId: memberA.factionId, targetFactionId: memberB.factionId },
				{ proposerFactionId: memberB.factionId, targetFactionId: memberA.factionId }
			]
		}
	});
}

export function getAllListings(galaxyId: number) {
	return prisma.marketListing.findMany({
		where: { galaxyId },
		include: {
			sellerNexus: {
				select: {
					id: true,
					name: true,
					x: true,
					y: true,
					ownerId: true,
					owner: { select: { username: true } }
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	});
}

export function getUserById(id: number) {
	return prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
}

export function getNexusById(id: number) {
	return prisma.nexus.findUnique({ where: { id } });
}

export function countListingsByNexus(nexusId: number, galaxyId: number) {
	return prisma.marketListing.count({ where: { sellerNexusId: nexusId, galaxyId } });
}

export function createListingAndDeductResource(
	listingData: Parameters<typeof prisma.marketListing.create>[0]['data'],
	nexusId: number,
	nexusData: Record<string, unknown>
) {
	// Persist all three resources + lastResourceUpdate together. If we only
	// wrote the offer column, a subsequent refreshResources call would replay
	// production from the stale lastResourceUpdate and effectively refund the
	// listed amount on the next tick.
	return prisma.$transaction([
		prisma.marketListing.create({ data: listingData }),
		prisma.nexus.update({ where: { id: nexusId }, data: nexusData })
	]);
}

export function getListingWithNexus(id: number) {
	return prisma.marketListing.findUnique({ where: { id }, include: { sellerNexus: true } });
}

export async function buyListing(
	listingId: number,
	buyerNexusId: number,
	listing: {
		wantResource: string;
		wantAmount: number;
		offerResource: string;
		offerAmount: number;
		sellerNexusId: number;
	},
	buyerNexusData: Record<string, unknown>,
	sellerNexusData: Record<string, unknown>,
	sellerUsername: string,
	buyerUsername: string,
	galaxyId: number
) {
	return prisma.$transaction([
		prisma.nexus.update({ where: { id: buyerNexusId }, data: buyerNexusData }),
		prisma.nexus.update({ where: { id: listing.sellerNexusId }, data: sellerNexusData }),
		prisma.marketListing.delete({ where: { id: listingId } }),
		prisma.marketTransaction.create({
			data: {
				galaxyId,
				sellerNexusId: listing.sellerNexusId,
				sellerUsername,
				buyerNexusId,
				buyerUsername,
				offerResource: listing.offerResource,
				offerAmount: listing.offerAmount,
				wantResource: listing.wantResource,
				wantAmount: listing.wantAmount
			}
		})
	]);
}

export function getTransactionHistory(galaxyId: number) {
	return prisma.marketTransaction.findMany({
		where: { galaxyId },
		orderBy: { completedAt: 'desc' },
		take: 10
	});
}

export async function cancelListing(
	listingId: number,
	sellerNexusId: number,
	nexusData: Record<string, unknown>
) {
	return prisma.$transaction([
		prisma.nexus.update({ where: { id: sellerNexusId }, data: nexusData }),
		prisma.marketListing.delete({ where: { id: listingId } })
	]);
}

export function updateNexusResources(id: number, data: Record<string, unknown>) {
	return prisma.nexus.update({ where: { id }, data });
}
