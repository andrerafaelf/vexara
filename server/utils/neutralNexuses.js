import prisma from '../lib/prisma.js';
import { getPopulationMax } from './population.js';

const MAP_SIZE = 35;
const MIN_NEUTRALS = 70;
const NEUTRALS_PER_CAPTURED = 3;
const NEUTRALS_PER_PLAYER = 9;
const BASE_NEUTRAL_DIFFICULTY = 0.7;
const MAX_NEUTRAL_DIFFICULTY = 1.35;
const USER_DIFFICULTY_STEP = 0.015;
const CAPTURE_DIFFICULTY_STEP = 0.004;

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
  if (nexusType.lowDefense) troopMultiplier = 0.55;

  return {
    name: nexusType.name,
    x,
    y,
    biomass: Math.floor(biomass),
    alloy: Math.floor(alloy),
    ore: Math.floor(ore),
    commandCore: Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    troopFabricator: Math.max(0, Math.floor(Math.random() * 2) + Math.floor((difficultyScale - 0.6) * 2)),
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

export async function createNeutralNexus(difficultyScale = BASE_NEUTRAL_DIFFICULTY) {
  const coordinates = await findOpenCoordinates();
  if (!coordinates) {
    return null;
  }

  return prisma.nexus.create({ data: buildNeutralNexusData(coordinates.x, coordinates.y, difficultyScale) });
}

export async function ensureNeutralNexusPool() {
  const [userCount, totalNexusCount, neutralCount] = await Promise.all([
    prisma.user.count(),
    prisma.nexus.count(),
    prisma.nexus.count({ where: { ownerId: null } }),
  ]);

  const capturedCount = Math.max(0, totalNexusCount - userCount - neutralCount);
  const neutralDifficulty = Math.min(
    MAX_NEUTRAL_DIFFICULTY,
    BASE_NEUTRAL_DIFFICULTY + userCount * USER_DIFFICULTY_STEP + capturedCount * CAPTURE_DIFFICULTY_STEP,
  );
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
    const nexus = await createNeutralNexus(neutralDifficulty);
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
