import prisma from '../lib/prisma.js';
import { ResourceConflictError } from './nexusService.js';

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

/**
 * Atomically deduct offerAmount from the seller's offer resource and create the
 * market listing in one transaction. Uses a guarded conditional decrement
 * (updateMany with gte check) to prevent the stale-snapshot double-deduct race
 * where two concurrent createListing requests clobber each other's absolute
 * write and mint resources.
 *
 * Throws ResourceConflictError if the nexus no longer has enough at commit time;
 * callers surface this as HTTP 409.
 */
export async function createListingAndDeductResource(
	listingData: Parameters<typeof prisma.marketListing.create>[0]['data'],
	nexusId: number,
	offerResource: string,
	offerAmount: number
) {
	return prisma.$transaction(async (tx) => {
		const { count } = await tx.nexus.updateMany({
			where: { id: nexusId, [offerResource]: { gte: offerAmount } },
			data: { [offerResource]: { decrement: offerAmount } }
		});
		if (count === 0) throw new ResourceConflictError();
		return tx.marketListing.create({ data: listingData });
	});
}

export function getListingWithNexus(id: number) {
	return prisma.marketListing.findUnique({ where: { id }, include: { sellerNexus: true } });
}

/**
 * Atomically settle a market trade.
 *
 * Buyer debit: guarded conditional decrement on wantResource (gte totalCost) +
 * increment of offerResource. Throws ResourceConflictError if the buyer can no
 * longer afford the trade at commit time (e.g. they just spent that resource).
 * Seller credit: unconditional increment (safe for concurrent writes).
 */
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
	totalCost: number,
	sellerUsername: string,
	buyerUsername: string,
	galaxyId: number
) {
	return prisma.$transaction(async (tx) => {
		// Debit buyer: guard with gte on the total cost (wantAmount + commission).
		const { count } = await tx.nexus.updateMany({
			where: { id: buyerNexusId, [listing.wantResource]: { gte: totalCost } },
			data: {
				[listing.wantResource]: { decrement: totalCost },
				[listing.offerResource]: { increment: listing.offerAmount }
			}
		});
		if (count === 0) throw new ResourceConflictError();

		// Credit seller: increment is safe for concurrent writes.
		await tx.nexus.update({
			where: { id: listing.sellerNexusId },
			data: { [listing.wantResource]: { increment: listing.wantAmount } }
		});

		await tx.marketListing.delete({ where: { id: listingId } });
		await tx.marketTransaction.create({
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
		});
	});
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
	offerResource: string,
	offerAmount: number
) {
	// Array-form transaction: the increment and the delete commit together. If
	// the delete throws P2025 (a concurrent cancel already removed the row) the
	// whole transaction rolls back, so the refund can never double-apply.
	return prisma.$transaction([
		prisma.nexus.update({
			where: { id: sellerNexusId },
			data: { [offerResource]: { increment: offerAmount } }
		}),
		prisma.marketListing.delete({ where: { id: listingId } })
	]);
}

/**
 * Atomically deduct payKey and credit receiveKey. Uses a gte guard on payKey so
 * two concurrent system-buy requests cannot both succeed if only one has enough.
 * Returns the updateMany result; callers check count === 1 and surface 0 as 409.
 */
export function atomicSystemTrade(
	nexusId: number,
	payKey: string,
	cost: number,
	receiveKey: string,
	amount: number
) {
	return prisma.nexus.updateMany({
		where: { id: nexusId, [payKey]: { gte: cost } },
		data: { [payKey]: { decrement: cost }, [receiveKey]: { increment: amount } }
	});
}
