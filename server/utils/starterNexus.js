import { getPopulationMax } from './population.js';

export const STARTER_NEXUS_DEFAULTS = {
  commandCore: 0,
  recruitmentCore: 0,
  lifeSupport: 0,
  storageVault: 0,
  biomassFarm: 0,
  alloyForge: 0,
  oreExtractor: 0,
  shieldGrid: 0,
};

/**
 * Find a random unoccupied (x, y) in the active galaxy.
 * Tries up to maxAttempts times — caller decides what to do if it returns null.
 */
export async function findOpenStarterCoordinates(tx, galaxyId, { mapSize = 35, maxAttempts = 60 } = {}) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const x = Math.floor(Math.random() * mapSize);
    const y = Math.floor(Math.random() * mapSize);
    const existing = await tx.nexus.findFirst({
      where: { galaxyId, x, y },
      select: { id: true },
    });
    if (!existing) return { x, y };
  }
  return null;
}

/**
 * Create a starter nexus for a user in a galaxy. Caller must pass a Prisma
 * transactional client so this composes inside larger flows (registration,
 * galaxy-join, admin user create).
 */
export async function createStarterNexus(tx, { userId, username, galaxyId }) {
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
