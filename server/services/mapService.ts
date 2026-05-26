import prisma from '../lib/prisma.js';

export function getNexusesInArea(galaxyId: number, x: number, y: number, range: number) {
  return prisma.nexus.findMany({
    where: { galaxyId, x: { gte: x - range, lte: x + range }, y: { gte: y - range, lte: y + range } },
    include: { owner: { select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true } } },
  });
}

export function getGalaxyPlayerPoints(galaxyId: number, ownerIds: number[]) {
  if (!ownerIds.length) return Promise.resolve([]);
  return prisma.galaxyPlayer.findMany({
    where: { galaxyId, userId: { in: ownerIds } },
    select: { userId: true, points: true },
  });
}
