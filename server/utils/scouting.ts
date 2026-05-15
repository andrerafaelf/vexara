import type { Nexus } from '@prisma/client';
import prisma from '../lib/prisma.js';
import type { BuildingLevels, ResourceAmounts, TroopCounts } from '../types/index.js';

interface PublicNexusData {
  _id: number;
  id: number;
  name: string;
  x: number;
  y: number;
  points: number;
  owner: { _id: number; id: number; username: string; points: number } | null;
  intelLevel: string;
}

export interface ScoutIntel {
  resources: ResourceAmounts;
  buildings: BuildingLevels;
  troops: TroopCounts;
  population: { current: number; max: number };
  controlLevel: number;
}

function buildPublicNexusData(
  nexus: Nexus & { owner?: { id: number; username: string } | null },
  ownerPoints?: number | null,
): PublicNexusData {
  return {
    _id: nexus.id,
    id: nexus.id,
    name: nexus.name,
    x: nexus.x,
    y: nexus.y,
    points: nexus.points,
    owner: nexus.owner
      ? { _id: nexus.owner.id, id: nexus.owner.id, username: nexus.owner.username, points: ownerPoints ?? 0 }
      : null,
    intelLevel: 'public',
  };
}

export function buildDetailedScoutIntel(nexus: Nexus): ScoutIntel {
  return {
    resources: {
      biomass: Math.floor(nexus.biomass),
      alloy:   Math.floor(nexus.alloy),
      ore:     Math.floor(nexus.ore),
    },
    buildings: {
      commandCore:    nexus.commandCore,
      recruitmentCore: nexus.recruitmentCore,
      lifeSupport:    nexus.lifeSupport,
      storageVault:   nexus.storageVault,
      biomassFarm:    nexus.biomassFarm,
      alloyForge:     nexus.alloyForge,
      oreExtractor:   nexus.oreExtractor,
      shieldGrid:     nexus.shieldGrid,
    },
    troops: {
      lancerDrone:         nexus.lancerDrone,
      assaultTrooper:      nexus.assaultTrooper,
      breakerUnit:         nexus.breakerUnit,
      reconOperative:      nexus.reconOperative,
      skimmerBike:         nexus.skimmerBike,
      siegeMech:           nexus.siegeMech,
      bulwarkGuard:        nexus.bulwarkGuard,
      suppressorTeam:      nexus.suppressorTeam,
      disruptorUnit:       nexus.disruptorUnit,
      interceptorBike:     nexus.interceptorBike,
      annihilatorPlatform: nexus.annihilatorPlatform,
      overseer:            nexus.overseer,
    },
    population: {
      current: nexus.populationCurrent,
      max:     nexus.populationMax,
    },
    controlLevel: nexus.controlLevel,
  };
}

async function isFriendlyNexus(userId: number, galaxyId: number, ownerUserId: number): Promise<boolean> {
  const [sameFaction, areFriends] = await Promise.all([
    prisma.factionMember.findFirst({ where: { galaxyId, userId } })
      .then(async (m1) => {
        if (!m1) return false;
        const m2 = await prisma.factionMember.findFirst({ where: { galaxyId, userId: ownerUserId } });
        return !!(m2 && m1.factionId === m2.factionId);
      }),
    prisma.friendship.findFirst({
      where: { OR: [{ userAId: userId, userBId: ownerUserId }, { userAId: ownerUserId, userBId: userId }] },
    }).then(Boolean),
  ]);
  return sameFaction || areFriends;
}

export async function getNexusIntelForUser(
  userId: number,
  nexusId: number,
  galaxyId: number | null,
): Promise<(PublicNexusData & Partial<ScoutIntel> & { intelLevel: string; scoutedAt?: unknown; isFriendly?: boolean; newbieProtectionEndsAt?: string | null }) | null> {
  const nexus = await prisma.nexus.findUnique({
    where: { id: nexusId },
    include: { owner: { select: { id: true, username: true } } },
  });

  if (!nexus) return null;
  if (galaxyId != null && nexus.galaxyId !== galaxyId) return null;

  const ownerPlayer = nexus.owner
    ? await prisma.galaxyPlayer.findUnique({
        where: { userId_galaxyId: { userId: nexus.owner.id, galaxyId: nexus.galaxyId } },
        select: { points: true },
      })
    : null;

  const publicData = buildPublicNexusData(nexus, ownerPlayer?.points);
  const newbieProtectionEndsAt = nexus.newbieProtectionEndsAt ? nexus.newbieProtectionEndsAt.toISOString() : null;

  if (nexus.ownerId === userId) {
    return { ...publicData, ...buildDetailedScoutIntel(nexus), intelLevel: 'owned', scoutedAt: new Date().toISOString(), newbieProtectionEndsAt };
  }

  const friendly = nexus.ownerId && galaxyId != null
    ? await isFriendlyNexus(userId, galaxyId, nexus.ownerId)
    : false;

  const scoutReport = await prisma.attack.findFirst({
    where: { attackerUserId: userId, defenderNexusId: nexusId, type: 'scout', status: 'completed' },
    orderBy: { arrivesAt: 'desc' },
  });

  const intel = (scoutReport?.result as { intel?: ScoutIntel } | null)?.intel;
  if (!intel) return { ...publicData, isFriendly: friendly, newbieProtectionEndsAt };

  return { ...publicData, ...intel, intelLevel: 'scouted', scoutedAt: scoutReport!.arrivesAt, isFriendly: friendly, newbieProtectionEndsAt };
}
