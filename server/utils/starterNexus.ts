import type { PrismaClient } from '@prisma/client';
import { getPopulationMax } from './population.js';

export const STARTER_NEXUS_DEFAULTS = {
  commandCore:    0,
  recruitmentCore: 0,
  lifeSupport:    0,
  storageVault:   0,
  biomassFarm:    1,
  alloyForge:     1,
  oreExtractor:   1,
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

export const NEWBIE_PROTECTION_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

// Bonus resources credited to a new player's starter nexus when they joined via a referral link.
// Enough to feel meaningful on day one without being game-breaking.
export const REFERRAL_SIGNUP_BONUS = 5_000;

export async function createStarterNexus(
  tx: TxClient,
  { userId, username, galaxyId, referredById }: { userId: number; username: string; galaxyId: number; referredById?: number | null },
) {
  const coords = (await findOpenStarterCoordinates(tx, galaxyId)) ?? { x: 0, y: 0 };
  const bonus = referredById ? REFERRAL_SIGNUP_BONUS : 0;
  return tx.nexus.create({
    data: {
      name: `${username}'s Nexus`,
      ownerId: userId,
      galaxyId,
      x: coords.x,
      y: coords.y,
      ...STARTER_NEXUS_DEFAULTS,
      biomass: 1500 + bonus,
      alloy: 1500 + bonus,
      ore: 1500 + bonus,
      populationMax: getPopulationMax(STARTER_NEXUS_DEFAULTS.lifeSupport),
      newbieProtectionEndsAt: new Date(Date.now() + NEWBIE_PROTECTION_DURATION_MS),
    },
  });
}
