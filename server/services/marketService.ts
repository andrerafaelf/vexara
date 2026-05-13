import prisma from '../lib/prisma.js';

export function getAllListings(galaxyId: number) {
  return prisma.marketListing.findMany({
    where: { galaxyId },
    include: {
      sellerNexus: {
        select: {
          id: true, name: true, x: true, y: true, ownerId: true,
          owner: { select: { username: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
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
  resource: string,
  newAmount: number,
) {
  return prisma.$transaction([
    prisma.marketListing.create({ data: listingData }),
    prisma.nexus.update({ where: { id: nexusId }, data: { [resource]: newAmount } }),
  ]);
}

export function getListingWithNexus(id: number) {
  return prisma.marketListing.findUnique({ where: { id }, include: { sellerNexus: true } });
}

export async function buyListing(
  listingId: number, buyerNexusId: number, listing: {
    wantResource: string; wantAmount: number; offerResource: string; offerAmount: number;
    sellerNexusId: number; sellerNexus: Record<string, number>;
  },
  buyerNexus: Record<string, number>,
  sellerUsername: string, buyerUsername: string, galaxyId: number,
) {
  return prisma.$transaction([
    prisma.nexus.update({
      where: { id: buyerNexusId },
      data: {
        [listing.wantResource]: buyerNexus[listing.wantResource] - listing.wantAmount,
        [listing.offerResource]: buyerNexus[listing.offerResource] + listing.offerAmount,
      },
    }),
    prisma.nexus.update({
      where: { id: listing.sellerNexusId },
      data: { [listing.wantResource]: listing.sellerNexus[listing.wantResource] + listing.wantAmount },
    }),
    prisma.marketListing.delete({ where: { id: listingId } }),
    prisma.marketTransaction.create({
      data: {
        galaxyId, sellerNexusId: listing.sellerNexusId, sellerUsername,
        buyerNexusId, buyerUsername, offerResource: listing.offerResource,
        offerAmount: listing.offerAmount, wantResource: listing.wantResource, wantAmount: listing.wantAmount,
      },
    }),
  ]);
}

export function getTransactionHistory(galaxyId: number) {
  return prisma.marketTransaction.findMany({ where: { galaxyId }, orderBy: { completedAt: 'desc' }, take: 10 });
}

export async function cancelListing(listingId: number, sellerNexusId: number, resource: string, refundAmount: number) {
  return prisma.$transaction([
    prisma.nexus.update({ where: { id: sellerNexusId }, data: { [resource]: refundAmount } }),
    prisma.marketListing.delete({ where: { id: listingId } }),
  ]);
}

export function updateNexusResources(id: number, data: Record<string, number>) {
  return prisma.nexus.update({ where: { id }, data });
}
