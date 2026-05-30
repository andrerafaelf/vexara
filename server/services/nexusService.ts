import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { checkAndGrantMilestoneToken, checkAndGrantToken } from './referralService.js';

export class ResourceConflictError extends Error {
  constructor() { super('Resource state changed - please retry'); this.name = 'ResourceConflictError'; }
}

/**
 * Atomic compare-and-swap update for economy actions (train, build, cancel).
 *
 * Guards against the non-atomic read→check→write race by including
 * `lastResourceUpdate` in the WHERE clause. If another request already
 * committed a resource write, the stale timestamp won't match and we get
 * 0 rows back → ResourceConflictError, which callers surface as 409.
 */
export async function atomicUpdateNexusResources(
  id: number,
  expectedLastUpdate: Date,
  data: Parameters<typeof prisma.nexus.update>[0]['data'],
) {
  const { count } = await prisma.nexus.updateMany({
    where: { id, lastResourceUpdate: expectedLastUpdate },
    data,
  });
  if (count === 0) throw new ResourceConflictError();
  return prisma.nexus.findUniqueOrThrow({ where: { id } });
}

type OwnedNexusOrderFields = {
  id: number;
  createdAt?: Date | null;
  conqueredAt?: Date | null;
};

function time(value: Date | string | null | undefined): number {
  if (!value) return 0;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function sortOwnedNexuses<T extends OwnedNexusOrderFields>(nexuses: T[]): T[] {
  return [...nexuses].sort((a, b) => {
    const aOriginal = a.conqueredAt == null;
    const bOriginal = b.conqueredAt == null;
    if (aOriginal !== bOriginal) return aOriginal ? -1 : 1;

    if (aOriginal && bOriginal) {
      return time(a.createdAt) - time(b.createdAt) || a.id - b.id;
    }

    return time(a.conqueredAt) - time(b.conqueredAt) || a.id - b.id;
  });
}

export function getNexusByOwner(userId: number, galaxyId: number) {
  return prisma.nexus.findMany({
    where: { ownerId: userId, galaxyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  }).then(sortOwnedNexuses);
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
  // Ratchet peakPoints up to the new high-water mark. A separate conditional
  // update (rather than read-modify-write) keeps it race-free under the
  // concurrent point recomputations that getMyNexuses can trigger.
  if (points > updated.peakPoints) {
    await prisma.galaxyPlayer.updateMany({
      where: { userId, galaxyId, peakPoints: { lt: points } },
      data: { peakPoints: points },
    });
  }
  void checkAndGrantToken(userId, points, galaxyId);
  void checkAndGrantMilestoneToken(userId, points);
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
