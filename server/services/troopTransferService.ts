import prisma from '../lib/prisma.js';

export function getNexusById(id: number) {
  return prisma.nexus.findUnique({ where: { id } });
}

export function getTransferById(id: number) {
  return prisma.troopTransfer.findUnique({ where: { id }, include: { ownerNexus: true, hostNexus: true } });
}

export function sendTroopsTransaction(
  fromId: number, deductData: Record<string, number>,
  transferData: Parameters<typeof prisma.troopTransfer.create>[0]['data'],
) {
  return prisma.$transaction([
    prisma.nexus.update({ where: { id: fromId }, data: deductData }),
    prisma.troopTransfer.create({
      data: transferData,
      include: {
        ownerNexus: { select: { id: true, name: true, x: true, y: true } },
        hostNexus: { select: { id: true, name: true, x: true, y: true } },
      },
    }),
  ]);
}

export function updateTransfer(id: number, data: Parameters<typeof prisma.troopTransfer.update>[0]['data']) {
  return prisma.troopTransfer.update({
    where: { id },
    data,
    include: {
      ownerNexus: { select: { id: true, name: true, x: true, y: true } },
      hostNexus: { select: { id: true, name: true, x: true, y: true } },
    },
  });
}

export function getTransfersForNexus(nexusId: number, galaxyId: number) {
  return prisma.troopTransfer.findMany({
    where: { galaxyId, OR: [{ ownerNexusId: nexusId }, { hostNexusId: nexusId }] },
    include: {
      ownerNexus: { select: { id: true, name: true, x: true, y: true } },
      hostNexus: { select: { id: true, name: true, x: true, y: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
