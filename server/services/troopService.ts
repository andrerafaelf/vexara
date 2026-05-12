import prisma from '../lib/prisma.js';

export function getNexusById(nexusId: number) {
  return prisma.nexus.findUnique({ where: { id: nexusId } });
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
  return prisma.nexus.update({ where: { id }, data });
}

export function getInFlightTroops(nexusId: number) {
  return prisma.attack.findMany({
    where: { attackerNexusId: nexusId, status: 'traveling' },
    select: { troops: true },
  });
}
