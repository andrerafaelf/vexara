import prisma from '../lib/prisma.js';
import { logInfo } from './logger.js';
import { createNeutralNexus } from './neutralNexuses.js';

// How often events can fire per galaxy (ms between rolls)
const EVENT_ROLL_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
// Probability of an event firing each roll (per galaxy)
const EVENT_FIRE_CHANCE = 0.55;
// Max active events per galaxy at once
const MAX_ACTIVE_EVENTS = 3;
// Event TTL when no nexus involved
const DEFAULT_EVENT_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

const EVENT_TYPES = ['derelict_ship', 'resource_storm', 'rogue_ai'] as const;
type EventType = (typeof EVENT_TYPES)[number];

const MAP_SIZE = 50;

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickQuadrant(): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const qx = Math.floor(Math.random() * 2); // 0 or 1
  const qy = Math.floor(Math.random() * 2);
  return {
    xMin: qx * 25,
    xMax: qx * 25 + 24,
    yMin: qy * 25,
    yMax: qy * 25 + 24,
  };
}

async function spawnDerelictShip(galaxyId: number) {
  const nexus = await createNeutralNexus(galaxyId, 0.4); // easy difficulty
  if (!nexus) return null;

  // Tag it as a special derelict — very low troops, bonus on capture
  await prisma.nexus.update({
    where: { id: nexus.id },
    data: {
      name: 'Derelict Ship',
      nexusType: 'Resource Depot', // whoever captures gets 2x production
      // Zero most troops — should be easy to take
      lancerDrone: 0, assaultTrooper: 0, breakerUnit: 0,
      reconOperative: randInt(2, 6),
    },
  });

  const expiresAt = new Date(Date.now() + DEFAULT_EVENT_TTL_MS);
  return prisma.galaxyEvent.create({
    data: {
      galaxyId,
      type: 'derelict_ship',
      title: 'Derelict Ship Detected',
      description: `A derelict vessel has drifted into the galaxy at (${nexus.x}|${nexus.y}). The ship's systems are offline but its Resource Depot core is intact. First faction to capture it claims a permanent 2x production bonus.`,
      nexusId: nexus.id,
      x: nexus.x,
      y: nexus.y,
      expiresAt,
    },
  });
}

async function spawnResourceStorm(galaxyId: number) {
  const q = pickQuadrant();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const resource = (['biomass', 'alloy', 'ore'] as const)[Math.floor(Math.random() * 3)];

  return prisma.galaxyEvent.create({
    data: {
      galaxyId,
      type: 'resource_storm',
      title: `${resource.charAt(0).toUpperCase() + resource.slice(1)} Storm`,
      description: `A resource storm has swept through quadrant (${q.xMin}-${q.xMax}|${q.yMin}-${q.yMax}). All nexuses in this zone produce double ${resource} for the next 24 hours.`,
      x: Math.floor((q.xMin + q.xMax) / 2),
      y: Math.floor((q.yMin + q.yMax) / 2),
      expiresAt,
      meta: { resource, xMin: q.xMin, xMax: q.xMax, yMin: q.yMin, yMax: q.yMax },
    },
  });
}

async function spawnRogueAi(galaxyId: number) {
  const x = randInt(0, MAP_SIZE - 1);
  const y = randInt(0, MAP_SIZE - 1);

  // Check the spot is empty
  const existing = await prisma.nexus.findFirst({ where: { galaxyId, x, y }, select: { id: true } });
  if (existing) return null;

  // Create a stronger neutral that will auto-attack nearby players
  const nexus = await prisma.nexus.create({
    data: {
      galaxyId,
      name: 'Rogue AI Core',
      nexusType: 'Military Outpost',
      ownerId: null,
      x, y,
      biomass: 5000, alloy: 5000, ore: 3000,
      commandCore: 8, recruitmentCore: 6, lifeSupport: 5,
      storageVault: 6, biomassFarm: 5, alloyForge: 5,
      oreExtractor: 5, shieldGrid: 6,
      lancerDrone: randInt(40, 80),
      assaultTrooper: randInt(30, 60),
      breakerUnit: randInt(15, 30),
      bulwarkGuard: randInt(10, 25),
      suppressorTeam: randInt(8, 20),
      annihilatorPlatform: randInt(1, 3),
      populationMax: 200,
    },
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  return prisma.galaxyEvent.create({
    data: {
      galaxyId,
      type: 'rogue_ai',
      title: 'Rogue AI Expansion',
      description: `A rogue AI core has activated at (${x}|${y}) and is launching raids against nearby nexuses. It grows stronger over time. Destroy it before it becomes unstoppable.`,
      nexusId: nexus.id,
      x, y,
      expiresAt,
      meta: { nexusId: nexus.id },
    },
  });
}

async function expireOldEvents(galaxyId: number) {
  const now = new Date();
  const expired = await prisma.galaxyEvent.findMany({
    where: { galaxyId, resolvedAt: null, expiresAt: { lte: now } },
    select: { id: true, nexusId: true, type: true },
  });

  for (const ev of expired) {
    // For derelict/rogue AI, remove the nexus if it's still unowned
    if (ev.nexusId && (ev.type === 'derelict_ship' || ev.type === 'rogue_ai')) {
      const nexus = await prisma.nexus.findUnique({ where: { id: ev.nexusId }, select: { ownerId: true } });
      if (!nexus?.ownerId) {
        await prisma.nexus.delete({ where: { id: ev.nexusId } });
      }
    }
    await prisma.galaxyEvent.update({ where: { id: ev.id }, data: { resolvedAt: now } });
  }
}

export async function processGalaxyEvents(): Promise<void> {
  try {
    const galaxies = await prisma.galaxy.findMany({ where: { status: 'active' }, select: { id: true } });

    for (const galaxy of galaxies) {
      await expireOldEvents(galaxy.id);

      const activeCount = await prisma.galaxyEvent.count({
        where: { galaxyId: galaxy.id, resolvedAt: null },
      });

      if (activeCount >= MAX_ACTIVE_EVENTS) continue;
      if (Math.random() > EVENT_FIRE_CHANCE) continue;

      // Don't fire same type twice if already active
      const activeTypes = await prisma.galaxyEvent.findMany({
        where: { galaxyId: galaxy.id, resolvedAt: null },
        select: { type: true },
      });
      const activeTypeSet = new Set(activeTypes.map((e) => e.type));

      const available = (EVENT_TYPES as readonly string[]).filter((t) => !activeTypeSet.has(t));
      if (available.length === 0) continue;

      const chosen = available[Math.floor(Math.random() * available.length)] as EventType;
      let created = null;

      if (chosen === 'derelict_ship') created = await spawnDerelictShip(galaxy.id);
      else if (chosen === 'resource_storm') created = await spawnResourceStorm(galaxy.id);
      else if (chosen === 'rogue_ai') created = await spawnRogueAi(galaxy.id);

      if (created) {
        logInfo('galaxy_event_spawned', { galaxyId: galaxy.id, type: chosen, eventId: created.id });
      }
    }
  } catch (err) {
    console.error('Error processing galaxy events:', err);
  }
}

export async function getActiveGalaxyEvents(galaxyId: number) {
  return prisma.galaxyEvent.findMany({
    where: { galaxyId, resolvedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function resolveEventForNexus(nexusId: number) {
  await prisma.galaxyEvent.updateMany({
    where: { nexusId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}
