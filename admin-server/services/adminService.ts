// Get alpha signups who haven't created an account yet
export async function getPendingAlphaSignups() {
  // Find all AlphaSignup emails not present in User
  const signups = await prisma.alphaSignup.findMany({ select: { email: true, createdAt: true } });
  const users = await prisma.user.findMany({ select: { email: true } });
  const userEmails = new Set(users.map((u) => u.email.toLowerCase()));
  return signups.filter((s) => !userEmails.has(s.email.toLowerCase())).sort((a, b) => a.email.localeCompare(b.email));
}
import prisma from '../../server/lib/prisma.js';
import { hashPassword } from '../../server/models/User.js';
import { generateUniqueReferralCode } from '../../server/services/referralService.js';
import { getPopulationMax } from '../../server/utils/population.js';

const TROOP_KEYS = [
  'lancerDrone',
  'assaultTrooper',
  'breakerUnit',
  'reconOperative',
  'skimmerBike',
  'siegeMech',
  'bulwarkGuard',
  'suppressorTeam',
  'disruptorUnit',
  'interceptorBike',
  'annihilatorPlatform',
  'overseer',
] as const;

export const toInt = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function getAllGalaxies() {
  return prisma.galaxy.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { players: true, nexuses: true } } },
  });
}

export function createGalaxy(name: string, startsAt?: Date) {
  return prisma.galaxy.create({ data: { name, ...(startsAt ? { startsAt } : {}) } });
}

export function getGalaxyByName(name: string) {
  return prisma.galaxy.findUnique({ where: { name } });
}

export function getAllUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
      emailVerifiedAt: true,
      emailVerificationToken: true,
      _count: { select: { galaxyPlayers: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export function getUsersInGalaxy(galaxyId: number) {
  return prisma.user.findMany({
    where: { galaxyPlayers: { some: { galaxyId } } },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
      nexuses: {
        where: { galaxyId },
        select: {
          id: true,
          name: true,
          biomass: true,
          alloy: true,
          ore: true,
          populationCurrent: true,
          populationMax: true,
          commandCore: true,
          recruitmentCore: true,
          lifeSupport: true,
          storageVault: true,
          biomassFarm: true,
          alloyForge: true,
          oreExtractor: true,
          shieldGrid: true,
          armory: true,
          stealthArray: true,
          lancerDrone: true,
          assaultTrooper: true,
          breakerUnit: true,
          reconOperative: true,
          skimmerBike: true,
          siegeMech: true,
          bulwarkGuard: true,
          suppressorTeam: true,
          disruptorUnit: true,
          interceptorBike: true,
          annihilatorPlatform: true,
          overseer: true,
        },
      },
      galaxyPlayers: { where: { galaxyId }, select: { galaxyId: true, points: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export function getAdminStatsForGalaxy(galaxyId: number) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const troopSumSelect = TROOP_KEYS.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
  return Promise.all([
    prisma.galaxyPlayer.count({ where: { galaxyId } }),
    prisma.nexus.count({ where: { galaxyId } }),
    prisma.attack.count({ where: { galaxyId, status: 'traveling' } }),
    prisma.attack.count({ where: { galaxyId } }),
    prisma.galaxyPlayer.count({ where: { galaxyId, user: { createdAt: { gte: oneWeekAgo } } } }),
    prisma.galaxyPlayer.aggregate({ where: { galaxyId }, _avg: { points: true } }),
    prisma.marketListing.count({ where: { galaxyId } }),
    prisma.nexus.findMany({ where: { galaxyId, ownerId: { not: null } }, select: troopSumSelect }),
    prisma.user.count({ where: { galaxyPlayers: { some: { galaxyId } }, nexuses: { some: { galaxyId } } } }),
    prisma.galaxyPlayer.findMany({
      where: { galaxyId },
      select: { userId: true, points: true, user: { select: { id: true, username: true } } },
      orderBy: { points: 'desc' },
      take: 10,
    }),
  ]);
}

const ALPHA_FOUNDER_LIMIT = 150;

export function createUser(username: string, email: string, password: string) {
  return hashPassword(password).then(async (hashedPassword) => {
    const userCount = await prisma.user.count();
    const isAlphaFounder = userCount < ALPHA_FOUNDER_LIMIT;
    const referralCode = await generateUniqueReferralCode();
    // Do NOT auto-join a galaxy or create a nexus, the user picks a galaxy themselves on first login.
    const user = await prisma.user.create({
      data: { username, email: email.toLowerCase(), password: hashedPassword, isAlphaFounder, referralCode },
    });
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

export function findTargetNexus(userId: number, galaxyId: number, nexusId?: unknown) {
  if (nexusId) return prisma.nexus.findFirst({ where: { id: toInt(nexusId), ownerId: userId, galaxyId } });
  return prisma.nexus.findFirst({ where: { ownerId: userId, galaxyId }, orderBy: { createdAt: 'asc' } });
}

export async function findUserNexusWithQueue(userId: number, galaxyId: number, queueKey: string) {
  const nexuses = await prisma.nexus.findMany({ where: { ownerId: userId, galaxyId }, orderBy: { createdAt: 'asc' } });
  return (
    nexuses.find(
      (n) =>
        Array.isArray((n as unknown as Record<string, unknown>)[queueKey]) &&
        ((n as unknown as Record<string, unknown>)[queueKey] as unknown[]).length > 0,
    ) || null
  );
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
  return prisma.nexus.update({ where: { id }, data });
}

export function getAttack(attackerUserId: number, galaxyId: number) {
  return prisma.attack.findFirst({
    where: { attackerUserId, galaxyId, status: 'traveling' },
    orderBy: { arrivesAt: 'asc' },
  });
}

export function updateAttack(id: number, data: Parameters<typeof prisma.attack.update>[0]['data']) {
  return prisma.attack.update({ where: { id }, data });
}

export function deleteUser(userId: number) {
  return (async () => {
    const villages = await prisma.nexus.findMany({ where: { ownerId: userId }, select: { id: true } });
    const ids = villages.map((v) => v.id);
    await prisma.attack.deleteMany({
      where: { OR: [{ attackerNexusId: { in: ids } }, { defenderNexusId: { in: ids } }] },
    });
    await prisma.nexus.deleteMany({ where: { ownerId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  })();
}

export function resetUserAccount(userId: number, username: string, galaxyId: number) {
  return (async () => {
    const targetGalaxy = await prisma.galaxy.findUnique({
      where: { id: galaxyId },
      select: { id: true, status: true },
    });
    if (!targetGalaxy) throw new Error('Galaxy not found');
    if (targetGalaxy.status !== 'active') throw new Error('Cannot reset into a non-active galaxy');
    const STARTER_NEXUS_DATA = {
      commandCore: 0,
      recruitmentCore: 0,
      lifeSupport: 1,
      storageVault: 1,
      biomassFarm: 1,
      alloyForge: 1,
      oreExtractor: 1,
      shieldGrid: 0,
    };
    return prisma.$transaction(async (tx) => {
      const userNexuses = await tx.nexus.findMany({ where: { ownerId: userId, galaxyId }, select: { id: true } });
      const nexusIds = userNexuses.map((n) => n.id);
      if (nexusIds.length > 0)
        await tx.attack.deleteMany({
          where: { OR: [{ attackerNexusId: { in: nexusIds } }, { defenderNexusId: { in: nexusIds } }] },
        });
      await tx.attack.deleteMany({ where: { galaxyId, OR: [{ attackerUserId: userId }, { defenderUserId: userId }] } });
      await tx.nexus.deleteMany({ where: { ownerId: userId, galaxyId } });
      await tx.galaxyPlayer.updateMany({
        where: { userId, galaxyId },
        data: { points: 0, questRewardClaims: [], completedQuestIds: [], nexusGroups: [] },
      });
      await tx.galaxyPlayer.upsert({
        where: { userId_galaxyId: { userId, galaxyId } },
        create: { userId, galaxyId },
        update: {},
      });
      await tx.user.update({ where: { id: userId }, data: { activeGalaxyId: galaxyId } });
      return tx.nexus.create({
        data: {
          name: `${username}'s Nexus`,
          ownerId: userId,
          galaxyId,
          x: Math.floor(Math.random() * 25),
          y: Math.floor(Math.random() * 25),
          ...STARTER_NEXUS_DATA,
          buildQueue: [],
          trainingQueue: [],
          populationCurrent: 5,
          populationMax: getPopulationMax(STARTER_NEXUS_DATA.lifeSupport),
          biomass: 500,
          alloy: 500,
          ore: 500,
          controlLevel: 100,
          points: 5,
          lastResourceUpdate: new Date(),
        },
      });
    });
  })();
}

export function deleteNexus(nexusId: number) {
  return (async () => {
    const { default: prismaClient } = await import('../../server/lib/prisma.js');
    await prismaClient.attack.deleteMany({
      where: { OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }] },
    });
    await prismaClient.nexus.delete({ where: { id: nexusId } });
  })();
}

export function getAdminAttacks(galaxyId: number) {
  return prisma.attack.findMany({
    where: { galaxyId, status: 'traveling' },
    include: {
      attackerNexus: { select: { id: true, name: true, x: true, y: true } },
      defenderNexus: { select: { id: true, name: true, x: true, y: true } },
    },
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
      OR: [{ username: { equals: value, mode: 'insensitive' } }, { email: value.toLowerCase() }],
    },
  });
}

export function sendTestNotification(userId: number) {
  return prisma.pushSubscription.count({ where: { userId } });
}

export async function getFactionsInGalaxy(galaxyId: number) {
  const factions = await prisma.faction.findMany({
    where: { galaxyId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              galaxyPlayers: { where: { galaxyId }, select: { points: true } },
              nexuses: { where: { galaxyId }, select: { id: true } },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      },
      _count: {
        select: {
          members: true,
          invites: true,
          joinRequests: true,
          targets: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const factionIds = factions.map((f) => f.id);
  const [activeWars, pendingWars, activeTreaties] = await Promise.all([
    prisma.factionWar.findMany({
      where: {
        galaxyId,
        status: 'active',
        OR: [{ declarerFactionId: { in: factionIds } }, { targetFactionId: { in: factionIds } }],
      },
      select: { declarerFactionId: true, targetFactionId: true },
    }),
    prisma.factionWar.findMany({
      where: {
        galaxyId,
        status: { in: ['pending', 'ceasefire_pending'] },
        OR: [{ declarerFactionId: { in: factionIds } }, { targetFactionId: { in: factionIds } }],
      },
      select: { declarerFactionId: true, targetFactionId: true },
    }),
    prisma.factionTreaty.findMany({
      where: {
        galaxyId,
        status: 'active',
        OR: [{ proposerFactionId: { in: factionIds } }, { targetFactionId: { in: factionIds } }],
      },
      select: { proposerFactionId: true, targetFactionId: true },
    }),
  ]);

  const activeWarCount = new Map<number, number>();
  for (const war of activeWars) {
    activeWarCount.set(war.declarerFactionId, (activeWarCount.get(war.declarerFactionId) ?? 0) + 1);
    activeWarCount.set(war.targetFactionId, (activeWarCount.get(war.targetFactionId) ?? 0) + 1);
  }

  const pendingWarCount = new Map<number, number>();
  for (const war of pendingWars) {
    pendingWarCount.set(war.declarerFactionId, (pendingWarCount.get(war.declarerFactionId) ?? 0) + 1);
    pendingWarCount.set(war.targetFactionId, (pendingWarCount.get(war.targetFactionId) ?? 0) + 1);
  }

  const treatyCount = new Map<number, number>();
  for (const treaty of activeTreaties) {
    treatyCount.set(treaty.proposerFactionId, (treatyCount.get(treaty.proposerFactionId) ?? 0) + 1);
    treatyCount.set(treaty.targetFactionId, (treatyCount.get(treaty.targetFactionId) ?? 0) + 1);
  }

  return factions.map((f) => {
    const members = f.members.map((m) => ({
      _id: String(m.id),
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
      points: m.user.galaxyPlayers[0]?.points ?? 0,
      nexusCount: m.user.nexuses.length,
    }));
    return {
      _id: String(f.id),
      id: f.id,
      galaxyId: f.galaxyId,
      name: f.name,
      tag: f.tag,
      description: f.description,
      motd: f.motd,
      createdAt: f.createdAt,
      dominanceSince: f.dominanceSince,
      memberCount: f._count.members,
      inviteCount: f._count.invites,
      joinRequestCount: f._count.joinRequests,
      targetCount: f._count.targets,
      activeWarCount: activeWarCount.get(f.id) ?? 0,
      pendingWarCount: pendingWarCount.get(f.id) ?? 0,
      activeTreatyCount: treatyCount.get(f.id) ?? 0,
      totalPoints: members.reduce((sum, m) => sum + m.points, 0),
      nexusCount: members.reduce((sum, m) => sum + m.nexusCount, 0),
      members,
    };
  });
}

export function getFactionById(factionId: number) {
  return prisma.faction.findUnique({ where: { id: factionId } });
}

export function updateFactionMemberRole(factionId: number, memberId: number, role: 'leader' | 'officer' | 'member') {
  return prisma.$transaction(async (tx) => {
    const member = await tx.factionMember.findFirst({ where: { id: memberId, factionId } });
    if (!member) throw Object.assign(new Error('Faction member not found'), { status: 404 });
    if (role === 'leader') {
      await tx.factionMember.updateMany({ where: { factionId, role: 'leader' }, data: { role: 'officer' } });
    } else if (member.role === 'leader') {
      const nextLeader = await tx.factionMember.findFirst({
        where: { factionId, NOT: { id: memberId } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      });
      if (!nextLeader) throw Object.assign(new Error('A faction must have at least one leader'), { status: 400 });
      await tx.factionMember.update({ where: { id: nextLeader.id }, data: { role: 'leader' } });
    }
    return tx.factionMember.update({ where: { id: memberId }, data: { role } });
  });
}

export function kickFactionMember(factionId: number, memberId: number) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.factionMember.findFirst({
      where: { id: memberId, factionId },
      include: { user: { select: { username: true } }, faction: { select: { name: true, tag: true } } },
    });
    if (!member) throw Object.assign(new Error('Faction member not found'), { status: 404 });

    const remaining = await tx.factionMember.findMany({
      where: { factionId, NOT: { id: memberId } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    if (remaining.length === 0) {
      await tx.warOperation.deleteMany({ where: { factionId } });
      await tx.faction.delete({ where: { id: factionId } });
      return { disbanded: true, username: member.user.username, factionName: member.faction.name };
    }

    await tx.factionMember.delete({ where: { id: memberId } });
    if (member.role === 'leader' && !remaining.some((m) => m.role === 'leader')) {
      const nextLeader = remaining.find((m) => m.role === 'officer') ?? remaining[0];
      await tx.factionMember.update({ where: { id: nextLeader.id }, data: { role: 'leader' } });
    }
    return { disbanded: false, username: member.user.username, factionName: member.faction.name };
  });
}

export function disbandFaction(factionId: number) {
  return prisma.$transaction(async (tx) => {
    const faction = await tx.faction.findUnique({ where: { id: factionId }, select: { id: true, name: true, tag: true } });
    if (!faction) throw Object.assign(new Error('Faction not found'), { status: 404 });
    await tx.warOperation.deleteMany({ where: { factionId } });
    await tx.faction.delete({ where: { id: factionId } });
    return faction;
  });
}
