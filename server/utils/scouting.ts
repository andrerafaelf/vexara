import type { Nexus } from '@prisma/client';
import prisma from '../lib/prisma.js';
import type { BuildingLevels, ResourceAmounts, TroopCounts } from '../types/index.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
// BuildingLevels and TroopCounts are extended via their interfaces to include armory/voidStalker/plasmaTurret

interface PublicNexusData {
  _id: number;
  id: number;
  name: string;
  x: number;
  y: number;
  points: number;
  owner: { _id: number; id: number; username: string; isSupporter: boolean; supporterTier: string | null; avatarUrl: string | null; avatarUrlSm: string | null; points: number } | null;
  intelLevel: string;
}

export interface ScoutIntel {
  resources: ResourceAmounts;
  buildings: BuildingLevels;
  troops: TroopCounts;
  population: { current: number; max: number };
  controlLevel: number;
  nexusName: string;
  nexusX: number;
  nexusY: number;
}

function buildPublicNexusData(
  nexus: Nexus & { owner?: { id: number; username: string; isSupporter: boolean; supporterTier: string | null; avatarKey?: string | null } | null },
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
      ? {
          _id: nexus.owner.id,
          id: nexus.owner.id,
          username: nexus.owner.username,
          isSupporter: nexus.owner.isSupporter,
          supporterTier: nexus.owner.supporterTier,
          avatarUrl: avatarUrl(nexus.owner.id, nexus.owner.avatarKey ?? null),
          avatarUrlSm: avatarUrlSm(nexus.owner.id, nexus.owner.avatarKey ?? null),
          points: ownerPoints ?? 0,
        }
      : null,
    intelLevel: 'public',
  };
}

export function buildDetailedScoutIntel(nexus: Nexus): ScoutIntel {
  const n = nexus as unknown as Record<string, number>;
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
      armory:         n['armory'] ?? 0,
      stealthArray:   n['stealthArray'] ?? 0,
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
      voidStalker:         n['voidStalker'] ?? 0,
      plasmaTurret:        n['plasmaTurret'] ?? 0,
      overseer:            nexus.overseer,
    },
    population: {
      current: nexus.populationCurrent,
      max:     nexus.populationMax,
    },
    controlLevel: nexus.controlLevel,
    nexusName: nexus.name,
    nexusX: nexus.x,
    nexusY: nexus.y,
  };
}

type FriendlyRelation = 'faction' | 'friend' | null;

async function getFriendlyRelation(userId: number, galaxyId: number, ownerUserId: number): Promise<FriendlyRelation> {
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
  // Faction takes priority over friend so the map can colour shared-faction
  // nexuses differently from individual allies.
  if (sameFaction) return 'faction';
  if (areFriends) return 'friend';
  return null;
}

export async function getNexusIntelForUser(
  userId: number,
  nexusId: number,
  galaxyId: number | null,
): Promise<(PublicNexusData & Partial<ScoutIntel> & { intelLevel: string; scoutedAt?: unknown; isFriendly?: boolean; relation?: FriendlyRelation; newbieProtectionEndsAt?: string | null }) | null> {
  const nexus = await prisma.nexus.findUnique({
    where: { id: nexusId },
    include: { owner: { select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true } } },
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

  const relation = nexus.ownerId && galaxyId != null
    ? await getFriendlyRelation(userId, galaxyId, nexus.ownerId)
    : null;
  const friendly = relation !== null;

  // An embedded operative gives continuous live intel, so it overrides any
  // older scout report. Check for an active spy asset first.
  const spyAsset = await prisma.spyAsset.findFirst({
    where: { ownerUserId: userId, targetNexusId: nexusId, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });
  if (spyAsset) {
    return {
      ...publicData,
      ...buildDetailedScoutIntel(nexus),
      intelLevel: 'scouted',
      scoutedAt: new Date().toISOString(),
      isFriendly: friendly,
      relation,
      newbieProtectionEndsAt,
    };
  }

  const scoutReport = await prisma.attack.findFirst({
    where: { attackerUserId: userId, defenderNexusId: nexusId, type: 'scout', status: 'completed' },
    orderBy: { arrivesAt: 'desc' },
  });

  const intel = (scoutReport?.result as { intel?: ScoutIntel } | null)?.intel;
  if (!intel) return { ...publicData, isFriendly: friendly, relation, newbieProtectionEndsAt };

  return { ...publicData, ...intel, intelLevel: 'scouted', scoutedAt: scoutReport!.arrivesAt, isFriendly: friendly, relation, newbieProtectionEndsAt };
}
