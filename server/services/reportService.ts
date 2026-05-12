import prisma from '../lib/prisma.js';

export function getNexusById(id: number) {
  return prisma.nexus.findUnique({ where: { id } });
}

export function getAttackById(id: number) {
  return prisma.attack.findUnique({ where: { id } });
}

export function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
}

export function getReportsForNexus(nexusId: number) {
  return prisma.attack.findMany({
    where: { OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }], status: 'completed' },
    orderBy: { createdAt: 'desc' },
    include: {
      attackerNexus: { select: { id: true, name: true, x: true, y: true } },
      defenderNexus: { select: { id: true, name: true, x: true, y: true } },
    },
  });
}

export function getOwnedNexusIds(userId: number, galaxyId: number) {
  return prisma.nexus.findMany({ where: { ownerId: userId, galaxyId }, select: { id: true } });
}

export function upsertReportRead(userId: number, attackId: number, galaxyId: number) {
  return prisma.reportRead.upsert({
    where: { userId_attackId: { userId, attackId } },
    create: { userId, attackId, galaxyId },
    update: { readAt: new Date() },
  });
}

export function getCompletedAttacksForNexus(nexusId: number, galaxyId: number) {
  return prisma.attack.findMany({
    where: { galaxyId, OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }], status: 'completed' },
    select: { id: true },
  });
}

export async function markAllRead(userId: number, attacks: { id: number }[], galaxyId: number) {
  const now = new Date();
  return prisma.$transaction(
    attacks.map((a) =>
      prisma.reportRead.upsert({
        where: { userId_attackId: { userId, attackId: a.id } },
        create: { userId, attackId: a.id, galaxyId },
        update: { readAt: now },
      }),
    ),
  );
}

export function getReadIds(userId: number, galaxyId: number) {
  return prisma.reportRead.findMany({ where: { userId, galaxyId }, select: { attackId: true } });
}
