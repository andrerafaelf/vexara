import prisma from '../lib/prisma.js';

export function getAllGalaxies() {
  return prisma.galaxy.findMany({ orderBy: { createdAt: 'asc' } });
}

export function getMyGalaxyPlayers(userId: number) {
  return prisma.galaxyPlayer.findMany({ where: { userId }, select: { galaxyId: true } });
}

export function getUserWithGalaxy(userId: number) {
  return prisma.user.findUnique({ where: { id: userId }, select: { activeGalaxyId: true, activeGalaxy: true } });
}

export function getGalaxyById(id: number) {
  return prisma.galaxy.findUnique({ where: { id } });
}

export function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
}

export function leaveGalaxy(userId: number, galaxyId: number) {
  return prisma.$transaction(async (tx) => {
    const player = await tx.galaxyPlayer.findUnique({
      where: { userId_galaxyId: { userId, galaxyId } },
      select: { id: true },
    });
    if (!player) {
      const err = Object.assign(new Error('Not a member of this galaxy'), { status: 400 });
      throw err;
    }
    const ownedNexuses = await tx.nexus.findMany({ where: { galaxyId, ownerId: userId }, select: { id: true } });
    const nexusIds = ownedNexuses.map((n) => n.id);
    if (nexusIds.length > 0) {
      await tx.attack.deleteMany({ where: { galaxyId, attackerNexusId: { in: nexusIds } } });
      await tx.troopTransfer.deleteMany({ where: { galaxyId, ownerNexusId: { in: nexusIds } } });
      await tx.troopTransfer.deleteMany({ where: { galaxyId, hostNexusId: { in: nexusIds } } });
      await tx.marketListing.deleteMany({ where: { galaxyId, sellerNexusId: { in: nexusIds } } });
      await tx.nexus.updateMany({ where: { id: { in: nexusIds } }, data: { ownerId: null, nexusType: 'Reclaimed Outpost' } });
    }
    await tx.galaxyPlayer.delete({ where: { id: player.id } });
    await tx.user.updateMany({ where: { id: userId, activeGalaxyId: galaxyId }, data: { activeGalaxyId: null } });
  });
}

export function selectGalaxy(userId: number, username: string, galaxyId: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.galaxyPlayer.findUnique({
      where: { userId_galaxyId: { userId, galaxyId } },
      select: { id: true },
    });
    if (!existing) {
      await tx.galaxyPlayer.create({ data: { userId, galaxyId } });
      const { createStarterNexus } = await import('../utils/starterNexus.js');
      await createStarterNexus(tx, { userId, username, galaxyId });
    }
    await tx.user.update({ where: { id: userId }, data: { activeGalaxyId: galaxyId } });
    return { joined: !existing };
  });
}
