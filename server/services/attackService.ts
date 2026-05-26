import prisma from '../lib/prisma.js';

export function getNexusById(id: number) {
  return prisma.nexus.findUnique({ where: { id } });
}

export function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true } });
}

export async function getUsersByIds(ids: number[]): Promise<Map<number, { username: string; isSupporter: boolean; supporterTier: string | null; avatarKey: string | null }>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true },
  });
  return new Map(users.map((u) => [u.id, { username: u.username, isSupporter: u.isSupporter, supporterTier: u.supporterTier, avatarKey: u.avatarKey }]));
}

export function createAttackAndDeductTroops(
  attackData: Parameters<typeof prisma.attack.create>[0]['data'],
  nexusId: number,
  troopDeductions: Record<string, number>,
) {
  return prisma.$transaction([
    prisma.attack.create({ data: attackData }),
    prisma.nexus.update({ where: { id: nexusId }, data: troopDeductions }),
  ]);
}

export function getIncomingAttacks(nexusId: number) {
  return prisma.attack.findMany({
    where: { defenderNexusId: nexusId, status: 'traveling' },
    include: { attackerNexus: { select: { id: true, name: true, x: true, y: true } } },
  });
}

export function getOutgoingAttacks(nexusId: number) {
  return prisma.attack.findMany({
    where: { attackerNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
    include: { defenderNexus: { select: { id: true, name: true, x: true, y: true } } },
  });
}
