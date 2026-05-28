import prisma from '../lib/prisma.js';
import { getPopulationMax } from './population.js';
import { getMaxStorage } from './economy.js';

const NPC_LEVELABLE_BUILDINGS = [
  'commandCore', 'lifeSupport', 'storageVault', 'biomassFarm',
  'alloyForge', 'oreExtractor', 'recruitmentCore', 'shieldGrid',
] as const;

type LevelableBuilding = (typeof NPC_LEVELABLE_BUILDINGS)[number];

const NPC_MAX_LEVELS: Record<LevelableBuilding, number> = {
  commandCore: 15, recruitmentCore: 11, lifeSupport: 15, storageVault: 15,
  biomassFarm: 15, alloyForge: 15, oreExtractor: 15, shieldGrid: 11,
};

const MAP_SIZE = 50;
// Minimum gap (Chebyshev distance) between any two nexuses.
// Distance 2 means no nexus can be placed in the 3x3 ring around an
// existing one - visually they always have at least one empty cell between
// them, so the map never looks like a solid wall of icons.
const MIN_NEXUS_SPACING = 2;
// Hard cap: at spacing=2 each nexus "owns" a 5×5 footprint, so the
// theoretical maximum is 2500/25 = 100. We cap well below that so the map
// never gets completely saturated regardless of player count.
const MAX_NEUTRALS = 80;
// MIN floor stops a brand-new galaxy from feeling empty, but the
// per-player multiplier dominates once a galaxy fills out.
const MIN_NEUTRALS = 12;
const NEUTRALS_PER_CAPTURED = 1;
const NEUTRALS_PER_PLAYER = 1.2;
const DAILY_NEXUS_GROWTH = 2;
// Tuned so a fresh player's first 20 Assault Troopers can take a Neutral
// Settlement (the most common pick, 40% weight). The opening loop is built
// around "train 5 troopers, then scavenge", so the easiest neutrals must
// be soft enough that a small early force is a winning bet, not a coin flip.
const BASE_NEUTRAL_DIFFICULTY = 0.5;
const MAX_NEUTRAL_DIFFICULTY = 1.35;
const USER_DIFFICULTY_STEP = 0.015;
const CAPTURE_DIFFICULTY_STEP = 0.004;

const NEXUS_TYPES = [
  { name: 'Neutral Settlement', weight: 40 },
  { name: 'Resource Depot',     weight: 20, resourceBonus: true },
  { name: 'Military Outpost',   weight: 15, troopBonus: true },
  { name: 'Supply Cache',       weight: 15, highResources: true },
  { name: 'Forward Base',  weight: 10 },
] as const;

type NexusTypeConfig = { name: string; weight: number; resourceBonus?: boolean; troopBonus?: boolean; highResources?: boolean };

function selectNexusType(): NexusTypeConfig {
  const totalWeight = NEXUS_TYPES.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  for (const type of NEXUS_TYPES) {
    random -= type.weight;
    if (random <= 0) return type;
  }
  return NEXUS_TYPES[0];
}

function scaleTroopCount(min: number, max: number, troopMultiplier: number, difficultyScale: number): number {
  const raw = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.max(0, Math.floor(raw * troopMultiplier * difficultyScale));
}

function buildNeutralNexusData(x: number, y: number, difficultyScale = BASE_NEUTRAL_DIFFICULTY) {
  const nexusType = selectNexusType();
  const lifeSupport = Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale));

  // Resources scale linearly with difficulty: 1× at base (0.5) up to 3× at max (1.35)
  const difficultyResourceScale = 1 + ((difficultyScale - BASE_NEUTRAL_DIFFICULTY) / (MAX_NEUTRAL_DIFFICULTY - BASE_NEUTRAL_DIFFICULTY)) * 2;

  let biomass = (Math.floor(Math.random() * 4000) + 1000) * difficultyResourceScale;
  let alloy   = (Math.floor(Math.random() * 4000) + 1000) * difficultyResourceScale;
  let ore     = (Math.floor(Math.random() * 2000) + 500)  * difficultyResourceScale;

  if (nexusType.resourceBonus || nexusType.highResources) {
    const multiplier = nexusType.highResources ? 1.5 : 2;
    biomass *= multiplier; alloy *= multiplier; ore *= multiplier;
  }

  const troopMultiplier = nexusType.troopBonus ? 1.35 : 1;

  return {
    name: nexusType.name, nexusType: nexusType.name, x, y,
    biomass: Math.floor(biomass), alloy: Math.floor(alloy), ore: Math.floor(ore),
    commandCore:    Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    recruitmentCore: Math.max(0, Math.floor(Math.random() * 2) + Math.floor((difficultyScale - 0.6) * 2)),
    lifeSupport,
    storageVault:   Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    biomassFarm:    Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    alloyForge:     Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    oreExtractor:   Math.max(1, Math.floor(Math.random() * 3) + Math.floor(difficultyScale)),
    shieldGrid:     Math.floor(Math.random() * 2),
    populationMax:  getPopulationMax(lifeSupport),
    lancerDrone:         scaleTroopCount(6,  14, troopMultiplier, difficultyScale),
    assaultTrooper:      scaleTroopCount(10, 18, troopMultiplier, difficultyScale),
    breakerUnit:         scaleTroopCount(2,  8,  troopMultiplier, difficultyScale),
    reconOperative:      scaleTroopCount(0,  4,  troopMultiplier, difficultyScale),
    skimmerBike:         scaleTroopCount(0,  4,  troopMultiplier, difficultyScale),
    siegeMech:           scaleTroopCount(0,  2,  troopMultiplier, difficultyScale),
    bulwarkGuard:        scaleTroopCount(0,  3,  troopMultiplier, difficultyScale),
    suppressorTeam:      scaleTroopCount(0,  3,  troopMultiplier, difficultyScale),
    disruptorUnit:       scaleTroopCount(0,  3,  troopMultiplier, difficultyScale),
    interceptorBike:     scaleTroopCount(0,  2,  troopMultiplier, difficultyScale),
    annihilatorPlatform: scaleTroopCount(0,  1,  troopMultiplier, difficultyScale),
    overseer: 0,
    ownerId: null,
  };
}

async function findOpenCoordinates(galaxyId: number): Promise<{ x: number; y: number } | null> {
  const existing = await prisma.nexus.findMany({ where: { galaxyId }, select: { x: true, y: true } });
  for (let attempt = 0; attempt < MAP_SIZE * 4; attempt++) {
    const x = Math.floor(Math.random() * MAP_SIZE);
    const y = Math.floor(Math.random() * MAP_SIZE);
    const tooClose = existing.some(n => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) < MIN_NEXUS_SPACING);
    if (!tooClose) return { x, y };
  }
  return null;
}

export async function createNeutralNexus(galaxyId: number, difficultyScale = BASE_NEUTRAL_DIFFICULTY) {
  const coordinates = await findOpenCoordinates(galaxyId);
  if (!coordinates) return null;
  return prisma.nexus.create({
    data: { ...buildNeutralNexusData(coordinates.x, coordinates.y, difficultyScale), galaxyId },
  });
}

async function ensureNeutralNexusPoolForGalaxy(galaxyId: number) {
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
  const targetNeutralCount = Math.max(MIN_NEUTRALS, Math.floor(playerCount * NEUTRALS_PER_PLAYER + capturedCount * NEUTRALS_PER_CAPTURED));
  const missingCount = Math.max(0, targetNeutralCount - neutralCount);

  if (missingCount === 0) return { galaxyId, created: 0, neutralCount, targetNeutralCount };

  let created = 0;
  for (let i = 0; i < missingCount; i++) {
    const nexus = await createNeutralNexus(galaxyId, neutralDifficulty);
    if (!nexus) break;
    created++;
  }

  return { galaxyId, created, neutralCount: neutralCount + created, targetNeutralCount };
}

export async function ensureNeutralNexusPool() {
  const galaxies = await prisma.galaxy.findMany({ where: { status: 'active' }, select: { id: true } });

  let totalCreated = 0, totalNeutralCount = 0, totalTarget = 0;
  for (const galaxy of galaxies) {
    const result = await ensureNeutralNexusPoolForGalaxy(galaxy.id);
    totalCreated += result.created;
    totalNeutralCount += result.neutralCount;
    totalTarget += result.targetNeutralCount;
  }

  return { created: totalCreated, neutralCount: totalNeutralCount, targetNeutralCount: totalTarget };
}

// Troop "recruitment" rules for NPC nexuses. Each entry maps an RC level
// requirement to the count added per tick (scaled by difficulty). Garrison
// caps prevent a single NPC from spawning a runaway army; once at cap the
// type is skipped, so growth keeps shifting toward higher-tier units.
const NPC_TROOP_TRAINING: Array<{
  key: string;
  rcMin: number;
  perTick: number;
  cap: number;
}> = [
  // Basic line - always recruited once RC is up.
  { key: 'assaultTrooper',      rcMin: 1,  perTick: 12, cap: 220 },
  { key: 'lancerDrone',         rcMin: 2,  perTick: 8,  cap: 160 },
  { key: 'breakerUnit',         rcMin: 3,  perTick: 5,  cap: 110 },
  // Support / mid-tier.
  { key: 'bulwarkGuard',        rcMin: 5,  perTick: 4,  cap: 80  },
  { key: 'suppressorTeam',      rcMin: 7,  perTick: 3,  cap: 60  },
  { key: 'disruptorUnit',       rcMin: 7,  perTick: 3,  cap: 60  },
  { key: 'reconOperative',      rcMin: 4,  perTick: 2,  cap: 30  },
  // Heavy / late-game.
  { key: 'siegeMech',           rcMin: 10, perTick: 1,  cap: 18  },
  { key: 'annihilatorPlatform', rcMin: 12, perTick: 1,  cap: 8   },
];

const NPC_BUILDS_PER_TICK = 2;

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
  const difficultyRatio = (difficulty - BASE_NEUTRAL_DIFFICULTY) / (MAX_NEUTRAL_DIFFICULTY - BASE_NEUTRAL_DIFFICULTY);

  for (const nexus of neutralNexuses) {
    const updates: Record<string, unknown> = {};

    // ── Buildings ────────────────────────────────────────────────────────
    // Each tick the NPC picks up to NPC_BUILDS_PER_TICK building levels
    // (chosen by widest gap to its difficulty-scaled target). Without this,
    // a single building per 6h tick meant a fresh neutral took weeks to
    // become a real threat - players reported they "weren't evolving".
    const buildingLevels: Record<string, number> = {};
    for (const b of NPC_LEVELABLE_BUILDINGS) {
      buildingLevels[b] = (nexus as Record<string, unknown>)[b] as number ?? 0;
    }

    for (let i = 0; i < NPC_BUILDS_PER_TICK; i++) {
      let bestBuilding: LevelableBuilding | null = null;
      let bestGap = 0;
      for (const building of NPC_LEVELABLE_BUILDINGS) {
        const cap = NPC_MAX_LEVELS[building];
        const target = Math.max(1, Math.round(1 + difficultyRatio * (cap - 1)));
        const current = buildingLevels[building];
        const gap = target - current;
        if (gap > bestGap) { bestGap = gap; bestBuilding = building; }
      }
      if (!bestBuilding) break;
      buildingLevels[bestBuilding] += 1;
      updates[bestBuilding] = buildingLevels[bestBuilding];
      if (bestBuilding === 'lifeSupport') {
        updates['populationMax'] = getPopulationMax(buildingLevels.lifeSupport);
      }
    }

    // ── Troops ───────────────────────────────────────────────────────────
    // NPCs recruit troops every tick based on their (now possibly newly
    // upgraded) RC level. We cap by difficulty so weak galaxies don't get
    // stomped, and respect a per-type garrison ceiling so each NPC keeps a
    // varied composition rather than swelling into a single deathball.
    const rcLevel = buildingLevels.recruitmentCore;
    const lifeSupport = buildingLevels.lifeSupport;
    const populationMax = getPopulationMax(lifeSupport);
    let populationCurrent = nexus.populationCurrent ?? 0;

    // Difficulty scales recruitment count - early galaxies grow slowly,
    // late galaxies fill fast. (0.5x..1.5x roughly)
    const trainScale = 0.5 + difficultyRatio;

    for (const rule of NPC_TROOP_TRAINING) {
      if (rcLevel < rule.rcMin) continue;
      const current = (nexus as Record<string, unknown>)[rule.key] as number ?? 0;
      const updatedFromThisTick = updates[rule.key] as number | undefined;
      const base = updatedFromThisTick ?? current;
      const cap = Math.floor(rule.cap * (0.6 + difficultyRatio));
      if (base >= cap) continue;
      const want = Math.max(1, Math.floor(rule.perTick * trainScale));
      const popRoom = Math.max(0, populationMax - populationCurrent);
      if (popRoom <= 0) break;
      const allowed = Math.min(want, cap - base, popRoom);
      if (allowed <= 0) continue;
      updates[rule.key] = base + allowed;
      populationCurrent += allowed;
    }
    if (populationCurrent !== (nexus.populationCurrent ?? 0)) {
      updates['populationCurrent'] = populationCurrent;
    }

    // ── Resources ────────────────────────────────────────────────────────
    // Refill stockpiles each tick so raided NPCs recover. Clamped to the
    // storage cap (computed from the *post-update* StorageVault level) so
    // we don't silently exceed the player-visible max.
    const biomassRate = (nexus.biomassFarm ?? 1) * 200 * difficulty;
    const alloyRate   = (nexus.alloyForge  ?? 1) * 200 * difficulty;
    const oreRate     = (nexus.oreExtractor ?? 1) * 100 * difficulty;
    const cappedNexus = {
      ...nexus,
      storageVault: buildingLevels.storageVault,
      nexusType: nexus.nexusType,
      nexusTypeDoubled: false,
    } as Parameters<typeof getMaxStorage>[0];
    const maxStorage = getMaxStorage(cappedNexus);
    updates['biomass'] = Math.min(maxStorage, Math.floor((nexus.biomass ?? 0) + biomassRate));
    updates['alloy']   = Math.min(maxStorage, Math.floor((nexus.alloy   ?? 0) + alloyRate));
    updates['ore']     = Math.min(maxStorage, Math.floor((nexus.ore     ?? 0) + oreRate));

    await prisma.nexus.update({ where: { id: nexus.id }, data: updates });
  }
}

export async function dailyNexusGrowth() {
  const galaxies = await prisma.galaxy.findMany({ where: { status: 'active' }, select: { id: true } });

  let totalCreated = 0;
  for (const galaxy of galaxies) {
    const totalCount = await prisma.nexus.count({ where: { galaxyId: galaxy.id } });
    const remaining = MAX_NEUTRALS - totalCount;
    if (remaining <= 0) continue;

    const toCreate = Math.min(DAILY_NEXUS_GROWTH, remaining);
    for (let i = 0; i < toCreate; i++) {
      const nexus = await createNeutralNexus(galaxy.id);
      if (!nexus) break;
      totalCreated++;
    }
  }

  return { created: totalCreated };
}

export async function seedNeutralNexuses(galaxyId: number, count: number) {
  let created = 0;
  for (let i = 0; i < count; i++) {
    const nexus = await createNeutralNexus(galaxyId);
    if (!nexus) break;
    created++;
  }
  return created;
}
