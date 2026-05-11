import prisma from '../lib/prisma.js';
import { getPopulationMax } from './population.js';

// Buildings that NPC nexuses can level up over time, in priority order
const NPC_LEVELABLE_BUILDINGS = [
  'commandCore',
  'lifeSupport',
  'storageVault',
  'biomassFarm',
  'alloyForge',
  'oreExtractor',
  'recruitmentCore',
  'shieldGrid',
];

// Max level NPC nexuses can reach per building (~75% of player max)
const NPC_MAX_LEVELS = {
  commandCore: 15,
  recruitmentCore: 11,
  lifeSupport: 15,
  storageVault: 15,
  biomassFarm: 15,
  alloyForge: 15,
  oreExtractor: 15,
  shieldGrid: 11,
};

const MAP_SIZE = 35;
const MIN_NEUTRALS = 32;
const NEUTRALS_PER_CAPTURED = 1;
const NEUTRALS_PER_PLAYER = 4;
const BASE_NEUTRAL_DIFFICULTY = 0.7;
const MAX_NEUTRAL_DIFFICULTY = 1.35;
const USER_DIFFICULTY_STEP = 0.015;
const CAPTURE_DIFFICULTY_STEP = 0.004;

const NEXUS_TYPES = [
  { name: 'Neutral Settlement', weight: 40 },
  { name: 'Resource Depot', weight: 20, resourceBonus: true },
  { name: 'Military Outpost', weight: 15, troopBonus: true },
  { name: 'Supply Cache', weight: 15, highResources: true },
  { name: 'Reclaimed Outpost', weight: 10 },
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

function scaleTroopCount(min, max, troopMultiplier, difficultyScale) {
  const raw = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.max(0, Math.floor(raw * troopMultiplier * difficultyScale));
}

function buildNeutralNexusData(x, y, difficultyScale = BASE_NEUTRAL_DIFFICULTY) {
  const nexusType = selectNexusType();
  const lifeSupport = Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale));

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
  if (nexusType.troopBonus) troopMultiplier = 1.35;

  return {
    name: nexusType.name,
    nexusType: nexusType.name,
    x,
    y,
    biomass: Math.floor(biomass),
    alloy: Math.floor(alloy),
    ore: Math.floor(ore),
    commandCore: Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    recruitmentCore: Math.max(0, Math.floor(Math.random() * 2) + Math.floor((difficultyScale - 0.6) * 2)),
    lifeSupport,
    storageVault: Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    biomassFarm: Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    alloyForge: Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    oreExtractor: Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    shieldGrid: Math.floor(Math.random() * 2),
    populationMax: getPopulationMax(lifeSupport),
    lancerDrone: scaleTroopCount(6, 14, troopMultiplier, difficultyScale),
    assaultTrooper: scaleTroopCount(10, 18, troopMultiplier, difficultyScale),
    breakerUnit: scaleTroopCount(2, 8, troopMultiplier, difficultyScale),
    reconOperative: scaleTroopCount(0, 4, troopMultiplier, difficultyScale),
    skimmerBike: scaleTroopCount(0, 4, troopMultiplier, difficultyScale),
    siegeMech: scaleTroopCount(0, 2, troopMultiplier, difficultyScale),
    bulwarkGuard: scaleTroopCount(0, 3, troopMultiplier, difficultyScale),
    suppressorTeam: scaleTroopCount(0, 3, troopMultiplier, difficultyScale),
    disruptorUnit: scaleTroopCount(0, 3, troopMultiplier, difficultyScale),
    interceptorBike: scaleTroopCount(0, 2, troopMultiplier, difficultyScale),
    annihilatorPlatform: scaleTroopCount(0, 1, troopMultiplier, difficultyScale),
    overseer: 0,
    ownerId: null,
  };
}

async function findOpenCoordinates(galaxyId) {
  for (let attempt = 0; attempt < MAP_SIZE * 2; attempt += 1) {
    const x = Math.floor(Math.random() * MAP_SIZE);
    const y = Math.floor(Math.random() * MAP_SIZE);
    const existing = await prisma.nexus.findFirst({ where: { galaxyId, x, y }, select: { id: true } });
    if (!existing) {
      return { x, y };
    }
  }

  return null;
}

export async function createNeutralNexus(galaxyId, difficultyScale = BASE_NEUTRAL_DIFFICULTY) {
  const coordinates = await findOpenCoordinates(galaxyId);
  if (!coordinates) {
    return null;
  }

  return prisma.nexus.create({
    data: { ...buildNeutralNexusData(coordinates.x, coordinates.y, difficultyScale), galaxyId },
  });
}

async function ensureNeutralNexusPoolForGalaxy(galaxyId) {
  const [playerCount, totalNexusCount, neutralCount] = await Promise.all([
    prisma.galaxyPlayer.count({ where: { galaxyId } }),
    prisma.nexus.count({ where: { galaxyId } }),
    prisma.nexus.count({ where: { galaxyId, ownerId: null } }),
  ]);

  const capturedCount = Math.max(0, totalNexusCount - playerCount - neutralCount);
  const neutralDifficulty = Math.min(
    MAX_NEUTRAL_DIFFICULTY,
    BASE_NEUTRAL_DIFFICULTY + playerCount * USER_DIFFICULTY_STEP + capturedCount * CAPTURE_DIFFICULTY_STEP,
  );
  const targetNeutralCount = Math.max(
    MIN_NEUTRALS,
    playerCount * NEUTRALS_PER_PLAYER + capturedCount * NEUTRALS_PER_CAPTURED,
  );
  const missingCount = Math.max(0, targetNeutralCount - neutralCount);

  if (missingCount === 0) {
    return { galaxyId, created: 0, neutralCount, targetNeutralCount };
  }

  let created = 0;
  for (let index = 0; index < missingCount; index += 1) {
    const nexus = await createNeutralNexus(galaxyId, neutralDifficulty);
    if (!nexus) {
      break;
    }
    created += 1;
  }

  return { galaxyId, created, neutralCount: neutralCount + created, targetNeutralCount };
}

export async function ensureNeutralNexusPool() {
  const galaxies = await prisma.galaxy.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  let totalCreated = 0;
  let totalNeutralCount = 0;
  let totalTarget = 0;
  for (const galaxy of galaxies) {
    const result = await ensureNeutralNexusPoolForGalaxy(galaxy.id);
    totalCreated += result.created;
    totalNeutralCount += result.neutralCount;
    totalTarget += result.targetNeutralCount;
  }

  return { created: totalCreated, neutralCount: totalNeutralCount, targetNeutralCount: totalTarget };
}

/**
 * Gradually levels up NPC nexus buildings over time so they remain a challenge
 * as players advance. Each tick bumps one building by 1 level per NPC nexus,
 * targeting the building furthest below its proportional cap relative to the
 * current player-driven difficulty. Troop counts are scaled up alongside
 * building levels so the nexus stays defensible.
 */
export async function levelUpNeutralNexuses() {
  const activeGalaxies = await prisma.galaxy.findMany({ where: { status: 'active' }, select: { id: true } });
  const activeGalaxyIds = activeGalaxies.map((g) => g.id);

  const [playerCount, totalNexusCount, neutralNexuses] = await Promise.all([
    prisma.galaxyPlayer.count({ where: { galaxyId: { in: activeGalaxyIds } } }),
    prisma.nexus.count({ where: { galaxyId: { in: activeGalaxyIds } } }),
    prisma.nexus.findMany({ where: { ownerId: null, galaxyId: { in: activeGalaxyIds } } }),
  ]);

  if (neutralNexuses.length === 0) return;

  const capturedCount = Math.max(0, totalNexusCount - playerCount - neutralNexuses.length);
  const difficulty = Math.min(
    MAX_NEUTRAL_DIFFICULTY,
    BASE_NEUTRAL_DIFFICULTY + playerCount * USER_DIFFICULTY_STEP + capturedCount * CAPTURE_DIFFICULTY_STEP,
  );

  // Target level for each building = difficulty ratio * NPC max level (minimum 1)
  const difficultyRatio = (difficulty - BASE_NEUTRAL_DIFFICULTY) / (MAX_NEUTRAL_DIFFICULTY - BASE_NEUTRAL_DIFFICULTY);

  for (const nexus of neutralNexuses) {
    // Find the building that is most behind its target level
    let bestBuilding = null;
    let bestGap = 0;

    for (const building of NPC_LEVELABLE_BUILDINGS) {
      const cap = NPC_MAX_LEVELS[building];
      const target = Math.max(1, Math.round(1 + difficultyRatio * (cap - 1)));
      const current = nexus[building] ?? 0;
      const gap = target - current;
      if (gap > bestGap) {
        bestGap = gap;
        bestBuilding = building;
      }
    }

    if (!bestBuilding) continue;

    const updates = { [bestBuilding]: (nexus[bestBuilding] ?? 0) + 1 };

    if (bestBuilding === 'lifeSupport') {
      updates.populationMax = getPopulationMax(updates.lifeSupport);
    }

    // Scale up a proportional number of troops when commandCore advances
    if (bestBuilding === 'commandCore') {
      updates.assaultTrooper = Math.ceil((nexus.assaultTrooper ?? 0) * 1.15);
      updates.lancerDrone = Math.ceil((nexus.lancerDrone ?? 0) * 1.1);
      updates.breakerUnit = Math.ceil((nexus.breakerUnit ?? 0) * 1.08);
    }

    await prisma.nexus.update({ where: { id: nexus.id }, data: updates });
  }
}

export async function seedNeutralNexuses(galaxyId, count) {
  let created = 0;
  for (let index = 0; index < count; index += 1) {
    const nexus = await createNeutralNexus(galaxyId);
    if (!nexus) {
      break;
    }
    created += 1;
  }
  return created;
}
