import prisma from '../lib/prisma.js';

export function getUserById(userId: number) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, createdAt: true } });
}

export function getGalaxyPlayer(userId: number, galaxyId: number) {
  return prisma.galaxyPlayer.findUnique({ where: { userId_galaxyId: { userId, galaxyId } }, select: { points: true } });
}

export function getUserNexuses(userId: number, galaxyId: number) {
  return prisma.nexus.findMany({ where: { ownerId: userId, galaxyId } });
}

export function getCompletedAttacks(userId: number, galaxyId: number) {
  return prisma.attack.findMany({
    where: { galaxyId, status: 'completed', OR: [{ attackerUserId: userId }, { defenderUserId: userId }] },
    select: { attackerUserId: true, defenderUserId: true, type: true, result: true, createdAt: true },
  });
}

export function getCompletedAttacksSince(userId: number, galaxyId: number, since: Date) {
  return prisma.attack.findMany({
    where: { galaxyId, status: 'completed', createdAt: { gte: since }, OR: [{ attackerUserId: userId }, { defenderUserId: userId }] },
    select: { attackerUserId: true, defenderUserId: true, result: true, createdAt: true },
  });
}
