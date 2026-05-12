import type { PrismaClient } from '@prisma/client';
import { getPopulationMax } from './population.js';

export const STARTER_NEXUS_DEFAULTS = {
  commandCore:    0,
  recruitmentCore: 0,
  lifeSupport:    0,
  storageVault:   0,
  biomassFarm:    0,
  alloyForge:     0,
  oreExtractor:   0,
  shieldGrid:     0,
} as const;

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function findOpenStarterCoordinates(
  tx: TxClient,
  galaxyId: number,
  { mapSize = 35, maxAttempts = 60 } = {},
): Promise<{ x: number; y: number } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.floor(Math.random() * mapSize);
    const y = Math.floor(Math.random() * mapSize);
    const existing = await tx.nexus.findFirst({ where: { galaxyId, x, y }, select: { id: true } });
    if (!existing) return { x, y };
  }
  return null;
}

export async function createStarterNexus(
  tx: TxClient,
  { userId, username, galaxyId }: { userId: number; username: string; galaxyId: number },
) {
  const coords = (await findOpenStarterCoordinates(tx, galaxyId)) ?? { x: 0, y: 0 };
  return tx.nexus.create({
    data: {
      name: `${username}'s Nexus`,
      ownerId: userId,
      galaxyId,
      x: coords.x,
      y: coords.y,
      ...STARTER_NEXUS_DEFAULTS,
      populationMax: getPopulationMax(STARTER_NEXUS_DEFAULTS.lifeSupport),
    },
  });
}
