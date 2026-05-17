import prisma from '../../server/lib/prisma.js';
import { hashPassword } from '../../server/models/User.js';
import { getPopulationMax } from '../../server/utils/population.js';

const TROOP_KEYS = ['lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative', 'skimmerBike', 'siegeMech', 'bulwarkGuard', 'suppressorTeam', 'disruptorUnit', 'interceptorBike', 'annihilatorPlatform', 'overseer'] as const;

export const toInt = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function getAllGalaxies() {
  return prisma.galaxy.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { players: true, nexuses: true } } } });
}

export function createGalaxy(name: string) {
  return prisma.galaxy.create({ data: { name } });
}

export function getGalaxyByName(name: string) {
  return prisma.galaxy.findUnique({ where: { name } });
}

export function getAllUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, email: true, createdAt: true, nexuses: { select: { id: true, name: true } }, galaxyPlayers: { select: { galaxyId: true, points: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export function getAdminStats() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const troopSumSelect = TROOP_KEYS.reduce<Record<string, boolean>>((acc, key) => { acc[key] = true; return acc; }, {});
  return Promise.all([
    prisma.user.count(),
    prisma.nexus.count(),
    prisma.attack.count({ where: { status: 'traveling' } }),
    prisma.attack.count(),
    prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
    prisma.galaxyPlayer.aggregate({ _avg: { points: true } }),
    prisma.marketListing.count(),
    prisma.nexus.findMany({ where: { ownerId: { not: null } }, select: troopSumSelect }),
    prisma.user.count({ where: { nexuses: { some: {} } } }),
    prisma.galaxyPlayer.findMany({ select: { userId: true, points: true, user: { select: { id: true, username: true } } }, orderBy: { points: 'desc' }, take: 10 }),
  ]);
}

const ALPHA_FOUNDER_LIMIT = 150;

export function createUser(username: string, email: string, password: string) {
  return hashPassword(password).then(async (hashedPassword) => {
    const userCount = await prisma.user.count();
    const isAlphaFounder = userCount < ALPHA_FOUNDER_LIMIT;
    // Do NOT auto-join a galaxy or create a nexus — the user picks a galaxy themselves on first login.
    const user = await prisma.user.create({ data: { username, email: email.toLowerCase(), password: hashedPassword, isAlphaFounder } });
    return { user };
  });
}

export function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUserCredentials(userId: number, email?: string, password?: string) {
  const data: Record<string, string> = {};
  if (email) {
    const normalizedEmail = email.toLowerCase();
    const emailOwner = await prisma.user.findFirst({ where: { email: normalizedEmail, NOT: { id: userId } } });
    if (emailOwner) throw Object.assign(new Error('Email is already in use'), { status: 400 });
    data.email = normalizedEmail;
  }
  if (password) data.password = await hashPassword(password);
  if (!Object.keys(data).length) throw Object.assign(new Error('No changes provided'), { status: 400 });
  return prisma.user.update({ where: { id: userId }, data });
}

export function findTargetNexus(userId: number, nexusId?: unknown) {
  if (nexusId) return prisma.nexus.findFirst({ where: { id: toInt(nexusId), ownerId: userId } });
  return prisma.nexus.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
}

export async function findUserNexusWithQueue(userId: number, queueKey: string) {
  const nexuses = await prisma.nexus.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
  return nexuses.find((n) => Array.isArray((n as unknown as Record<string, unknown>)[queueKey]) && ((n as unknown as Record<string, unknown>)[queueKey] as unknown[]).length > 0) || null;
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
  return prisma.nexus.update({ where: { id }, data });
}

export function getAttack(id: number) {
  return prisma.attack.findFirst({ where: { attackerUserId: id, status: 'traveling' }, orderBy: { arrivesAt: 'asc' } });
}

export function updateAttack(id: number, data: Parameters<typeof prisma.attack.update>[0]['data']) {
  return prisma.attack.update({ where: { id }, data });
}

export function deleteUser(userId: number) {
  return (async () => {
    const villages = await prisma.nexus.findMany({ where: { ownerId: userId }, select: { id: true } });
    const ids = villages.map((v) => v.id);
    await prisma.attack.deleteMany({ where: { OR: [{ attackerNexusId: { in: ids } }, { defenderNexusId: { in: ids } }] } });
    await prisma.nexus.deleteMany({ where: { ownerId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  })();
}

export function resetUserAccount(userId: number, username: string) {
  return (async () => {
    const targetGalaxy = await prisma.galaxy.findFirst({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!targetGalaxy) throw new Error('No active galaxy available to place the reset user');
    const STARTER_NEXUS_DATA = { commandCore: 0, recruitmentCore: 0, lifeSupport: 1, storageVault: 1, biomassFarm: 1, alloyForge: 1, oreExtractor: 1, shieldGrid: 0 };
    return prisma.$transaction(async (tx) => {
      const userNexuses = await tx.nexus.findMany({ where: { ownerId: userId }, select: { id: true } });
      const nexusIds = userNexuses.map((n) => n.id);
      if (nexusIds.length > 0) await tx.attack.deleteMany({ where: { OR: [{ attackerNexusId: { in: nexusIds } }, { defenderNexusId: { in: nexusIds } }] } });
      await tx.attack.deleteMany({ where: { OR: [{ attackerUserId: userId }, { defenderUserId: userId }] } });
      await tx.nexus.deleteMany({ where: { ownerId: userId } });
      await tx.galaxyPlayer.updateMany({ where: { userId }, data: { points: 0, questRewardClaims: [], completedQuestIds: [], nexusGroups: [] } });
      await tx.galaxyPlayer.upsert({ where: { userId_galaxyId: { userId, galaxyId: targetGalaxy.id } }, create: { userId, galaxyId: targetGalaxy.id }, update: {} });
      await tx.user.update({ where: { id: userId }, data: { activeGalaxyId: targetGalaxy.id } });
      return tx.nexus.create({ data: { name: `${username}'s Nexus`, ownerId: userId, galaxyId: targetGalaxy.id, x: Math.floor(Math.random() * 25), y: Math.floor(Math.random() * 25), ...STARTER_NEXUS_DATA, buildQueue: [], trainingQueue: [], populationCurrent: 5, populationMax: getPopulationMax(STARTER_NEXUS_DATA.lifeSupport), biomass: 500, alloy: 500, ore: 500, controlLevel: 100, points: 5, lastResourceUpdate: new Date() } });
    });
  })();
}

export function deleteNexus(nexusId: number) {
  return (async () => {
    const { default: prismaClient } = await import('../../server/lib/prisma.js');
    await prismaClient.attack.deleteMany({ where: { OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }] } });
    await prismaClient.nexus.delete({ where: { id: nexusId } });
  })();
}

export function getAdminAttacks() {
  return prisma.attack.findMany({
    where: { status: 'traveling' },
    include: { attackerNexus: { select: { id: true, name: true, x: true, y: true } }, defenderNexus: { select: { id: true, name: true, x: true, y: true } } },
    orderBy: { arrivesAt: 'asc' },
  });
}

export function getAttackById(id: number) {
  return prisma.attack.findUnique({ where: { id } });
}

export async function getAttackUsernames(attackerUserId: number | null, defenderUserId: number | null) {
  const userIds = [attackerUserId, defenderUserId].filter((id): id is number => id != null);
  if (!userIds.length) return new Map<number, string>();
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } });
  return new Map(users.map((u) => [u.id, u.username]));
}

export function getUserByField(field: string, value: string) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: value, mode: 'insensitive' } },
        { email: value.toLowerCase() },
      ],
    },
  });
}

export function sendTestNotification(userId: number) {
  return prisma.pushSubscription.count({ where: { userId } });
}
