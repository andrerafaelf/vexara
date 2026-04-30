import prisma from '../lib/prisma.js';

const MAP_SIZE = 100;
const MIN_NEUTRALS = 40;
const NEUTRALS_PER_CAPTURED = 2;
const NEUTRALS_PER_PLAYER = 6;

const NEXUS_TYPES = [
  { name: 'Neutral Settlement', weight: 40 },
  { name: 'Resource Depot', weight: 20, resourceBonus: true },
  { name: 'Military Outpost', weight: 15, troopBonus: true },
  { name: 'Supply Cache', weight: 15, highResources: true },
  { name: 'Abandoned Base', weight: 10, lowDefense: true },
];

function selectNexusType() {
  const totalWeight = NEXUS_TYPES.reduce((sum, type) => sum + type.weight, 0);
  let random = Math.random() * totalWeight;

  for (const type of NEXUS_TYPES) {
    random -= type.weight;
    if (random <= 0) return type;
  }

  return NEXUS_TYPES[0];
}

function buildNeutralNexusData(x, y) {
  const nexusType = selectNexusType();

  let biomass = Math.floor(Math.random() * 4000) + 1000;
  let alloy = Math.floor(Math.random() * 4000) + 1000;
  let ore = Math.floor(Math.random() * 2000) + 500;

  if (nexusType.resourceBonus || nexusType.highResources) {
    const multiplier = nexusType.highResources ? 1.5 : 2;
    biomass *= multiplier;
    alloy *= multiplier;
    ore *= multiplier;
  }

  let troopMultiplier = 1;
  if (nexusType.troopBonus) troopMultiplier = 1.5;
  if (nexusType.lowDefense) troopMultiplier = 0.3;

  return {
    name: nexusType.name,
    x,
    y,
    biomass: Math.floor(biomass),
    alloy: Math.floor(alloy),
    ore: Math.floor(ore),
    commandCore: Math.floor(Math.random() * 4) + 1,
    troopFabricator: Math.floor(Math.random() * 3),
    lifeSupport: Math.floor(Math.random() * 4) + 2,
    storageVault: Math.floor(Math.random() * 4) + 1,
    biomassFarm: Math.floor(Math.random() * 4) + 1,
    alloyForge: Math.floor(Math.random() * 4) + 1,
    oreExtractor: Math.floor(Math.random() * 4) + 1,
    shieldGrid: Math.floor(Math.random() * 2),
    lancerDrone: Math.floor((Math.random() * 40 + 5) * troopMultiplier),
    assaultTrooper: Math.floor((Math.random() * 30 + 5) * troopMultiplier),
    breakerUnit: Math.floor((Math.random() * 25 + 5) * troopMultiplier),
    reconOperative: Math.floor(Math.random() * 10 * troopMultiplier),
    skimmerBike: Math.floor(Math.random() * 15 * troopMultiplier),
    siegeMech: Math.floor(Math.random() * 8 * troopMultiplier),
    bulwarkGuard: Math.floor(Math.random() * 10 * troopMultiplier),
    suppressorTeam: Math.floor(Math.random() * 8 * troopMultiplier),
    disruptorUnit: Math.floor(Math.random() * 8 * troopMultiplier),
    interceptorBike: Math.floor(Math.random() * 5 * troopMultiplier),
    annihilatorPlatform: Math.floor(Math.random() * 3 * troopMultiplier),
    overseer: 0,
    ownerId: null,
  };
}

async function findOpenCoordinates() {
  for (let attempt = 0; attempt < MAP_SIZE * 2; attempt += 1) {
    const x = Math.floor(Math.random() * MAP_SIZE);
    const y = Math.floor(Math.random() * MAP_SIZE);
    const existing = await prisma.nexus.findFirst({ where: { x, y }, select: { id: true } });
    if (!existing) {
      return { x, y };
    }
  }

  return null;
}

export async function createNeutralNexus() {
  const coordinates = await findOpenCoordinates();
  if (!coordinates) {
    return null;
  }

  return prisma.nexus.create({ data: buildNeutralNexusData(coordinates.x, coordinates.y) });
}

export async function ensureNeutralNexusPool() {
  const [userCount, totalNexusCount, neutralCount] = await Promise.all([
    prisma.user.count(),
    prisma.nexus.count(),
    prisma.nexus.count({ where: { ownerId: null } }),
  ]);

  const capturedCount = Math.max(0, totalNexusCount - userCount - neutralCount);
  const targetNeutralCount = Math.max(
    MIN_NEUTRALS,
    userCount * NEUTRALS_PER_PLAYER + capturedCount * NEUTRALS_PER_CAPTURED,
  );
  const missingCount = Math.max(0, targetNeutralCount - neutralCount);

  if (missingCount === 0) {
    return { created: 0, neutralCount, targetNeutralCount };
  }

  let created = 0;
  for (let index = 0; index < missingCount; index += 1) {
    const nexus = await createNeutralNexus();
    if (!nexus) {
      break;
    }
    created += 1;
  }

  return { created, neutralCount: neutralCount + created, targetNeutralCount };
}

export async function seedNeutralNexuses(count) {
  let created = 0;
  for (let index = 0; index < count; index += 1) {
    const nexus = await createNeutralNexus();
    if (!nexus) {
      break;
    }
    created += 1;
  }
  return created;
}
