import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { checkAndGrantToken } from './referralService.js';

export function getNexusByOwner(userId: number, galaxyId: number) {
  return prisma.nexus.findMany({
    where: { ownerId: userId, galaxyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export function getNexusById(nexusId: number) {
  return prisma.nexus.findUnique({ where: { id: nexusId } });
}

export function countNexusesByOwner(userId: number, galaxyId: number) {
  return prisma.nexus.count({ where: { ownerId: userId, galaxyId } });
}

export function getOutgoingAttacks(nexusIds: number[]) {
  return prisma.attack.findMany({
    where: { attackerNexusId: { in: nexusIds }, status: 'traveling' },
    select: { attackerNexusId: true },
  });
}

export async function updateGalaxyPlayerPoints(userId: number, galaxyId: number, points: number) {
  const updated = await prisma.galaxyPlayer.update({
    where: { userId_galaxyId: { userId, galaxyId } },
    data: { points },
  });
  void checkAndGrantToken(userId, points);
  return updated;
}

export function createNexus(data: Parameters<typeof prisma.nexus.create>[0]['data']) {
  return prisma.nexus.create({ data });
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
  return prisma.nexus.update({ where: { id }, data });
}

export function getPlayerGroups(userId: number, galaxyId: number) {
  return prisma.galaxyPlayer.findUnique({
    where: { userId_galaxyId: { userId, galaxyId } },
    select: { nexusGroups: true },
  });
}

export async function updatePlayerGroups(userId: number, galaxyId: number, groups: unknown[]) {
  const updated = await prisma.galaxyPlayer.update({
    where: { userId_galaxyId: { userId, galaxyId } },
    data: { nexusGroups: groups as Prisma.InputJsonValue[] },
    select: { nexusGroups: true },
  });
  return updated.nexusGroups;
}

export function getOwnedNexusIds(userId: number, galaxyId: number) {
  return prisma.nexus.findMany({
    where: { ownerId: userId, galaxyId },
    select: { id: true },
  });
}

export function transferResources(
  fromId: number,
  toId: number,
  fromData: Record<string, number>,
  toData: Record<string, number>,
) {
  return prisma.$transaction([
    prisma.nexus.update({ where: { id: fromId }, data: fromData }),
    prisma.nexus.update({ where: { id: toId }, data: toData }),
  ]);
}
