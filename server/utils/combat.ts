import type { Attack, Nexus, Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import {
  computeForcePower,
  computeClassWeightedAttack,
  computeLossesForLoser,
  computeLossesForWinner,
  computeTroopTotal,
  areAllDefendingTroopsEliminated,
  TROOP_STATS,
} from './combatMath.js';
import { buildDetailedScoutIntel } from './scouting.js';
import { NOTIF, sendPushToUser } from './push.js';
import { resolveEventForNexus } from './galaxyEvents.js';
import { notifyAttackUpdate, notifyTransferUpdate, notifyReportUpdate, notifyNexusConquered } from '../services/warRoomSocket.js';
import { getNexusTypeEffectiveMultipliers } from './economy.js';
import type { TroopKey } from '../types/index.js';
import { logInfo, logWarn } from './logger.js';

async function logFactionEvent(userId: number, galaxyId: number, type: string, actorName?: string, targetName?: string, meta?: string) {
  const membership = await prisma.factionMember.findUnique({
    where: { userId_galaxyId: { userId, galaxyId } },
    select: { factionId: true },
  });
  if (!membership) return;
  await prisma.factionEvent.create({ data: { factionId: membership.factionId, type, actorName, targetName, meta } });
}

const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

const TROOP_POPULATION_COST: Record<TroopKey, number> = {
  lancerDrone: 1, assaultTrooper: 1, breakerUnit: 1, reconOperative: 1,
  skimmerBike: 3, siegeMech: 4, bulwarkGuard: 2, suppressorTeam: 2,
  disruptorUnit: 2, interceptorBike: 3, annihilatorPlatform: 5,
  voidStalker: 3, plasmaTurret: 4,
  overseer: 5,
};

type AttackWithNexuses = Attack & { attackerNexus: Nexus | null; defenderNexus: Nexus | null };

function countTroops(troops: unknown): number {
  const source = troops && typeof troops === 'object' ? troops as Partial<Record<TroopKey, number>> : {};
  return TROOP_KEYS.reduce((sum, key) => sum + Math.max(0, Number(source[key] || 0)), 0);
}

function troopPopulationCost(troops: unknown): number {
  const source = troops && typeof troops === 'object' ? troops as Partial<Record<TroopKey, number>> : {};
  return TROOP_KEYS.reduce((sum, key) => sum + Math.max(0, Number(source[key] || 0)) * (TROOP_POPULATION_COST[key] || 1), 0);
}

async function freePopulationForDestroyedTroops(
  nexusId: number,
  troops: unknown,
  context: Record<string, unknown>,
): Promise<void> {
  const populationFreed = troopPopulationCost(troops);
  if (populationFreed <= 0) return;

  const nexus = await prisma.nexus.findUnique({ where: { id: nexusId }, select: { populationCurrent: true } });
  if (!nexus) return;

  await prisma.nexus.update({
    where: { id: nexusId },
    data: { populationCurrent: Math.max(0, nexus.populationCurrent - populationFreed) },
  });
  logInfo('destroyed_troops_population_freed', {
    nexusId,
    populationFreed,
    ...context,
  });
}

async function destroyInvalidInboundSupport(
  nexusId: number,
  galaxyId: number,
  newOwnerId: number | null,
  capturedByAttackId: number,
): Promise<number> {
  const supportAttacks = await prisma.attack.findMany({
    where: {
      galaxyId,
      defenderNexusId: nexusId,
      status: 'traveling',
      type: 'support',
    },
    select: { id: true, attackerUserId: true, attackerNexusId: true, defenderUserId: true, troops: true },
  });

  const invalidSupport = supportAttacks.filter((support) => support.defenderUserId !== newOwnerId);
  if (invalidSupport.length === 0) return 0;

  await prisma.attack.updateMany({
    where: { id: { in: invalidSupport.map((support) => support.id) } },
    data: {
      status: 'completed',
      result: {
        mission: 'support',
        victory: false,
        destroyed: true,
        reason: 'host_conquered',
        troopsDestroyed: true,
        attackerLosses: {},
        defenderLosses: {},
        resourcesStolen: { biomass: 0, alloy: 0, ore: 0 },
      } as Prisma.InputJsonObject,
    },
  });

  logWarn('conquest_destroyed_inbound_support', {
    nexusId,
    galaxyId,
    newOwnerId,
    capturedByAttackId,
    supportAttackIds: invalidSupport.map((support) => support.id),
    troopsDestroyed: invalidSupport.reduce((sum, support) => sum + countTroops(support.troops), 0),
  });

  for (const support of invalidSupport) {
    await freePopulationForDestroyedTroops(support.attackerNexusId, support.troops, {
      reason: 'inbound_support_destroyed_by_conquest',
      supportAttackId: support.id,
      conqueredNexusId: nexusId,
      capturedByAttackId,
    });
    notifyAttackUpdate(support.attackerUserId, support.defenderUserId, nexusId);
    if (support.attackerUserId) notifyReportUpdate(support.attackerUserId);
  }

  return invalidSupport.length;
}

async function destroyForeignTransfersAtConqueredNexus(
  nexusId: number,
  galaxyId: number,
  newOwnerId: number | null,
  capturedByAttackId: number,
): Promise<number> {
  const transfers = await prisma.troopTransfer.findMany({
    where: {
      galaxyId,
      hostNexusId: nexusId,
      status: { in: ['traveling', 'stationed'] },
    },
    include: { ownerNexus: { select: { ownerId: true } } },
  });
  const foreignTransfers = transfers.filter((transfer) => transfer.ownerNexus.ownerId !== newOwnerId);
  if (foreignTransfers.length === 0) return 0;

  await prisma.troopTransfer.deleteMany({ where: { id: { in: foreignTransfers.map((transfer) => transfer.id) } } });
  logWarn('conquest_destroyed_foreign_transfers', {
    nexusId,
    galaxyId,
    newOwnerId,
    capturedByAttackId,
    transferIds: foreignTransfers.map((transfer) => transfer.id),
    troopsDestroyed: foreignTransfers.reduce((sum, transfer) => sum + countTroops(transfer.troops), 0),
  });

  for (const transfer of foreignTransfers) {
    await freePopulationForDestroyedTroops(transfer.ownerNexusId, transfer.troops, {
      reason: 'foreign_transfer_destroyed_by_conquest',
      transferId: transfer.id,
      conqueredNexusId: nexusId,
      capturedByAttackId,
    });
    if (transfer.ownerNexus.ownerId) notifyTransferUpdate(transfer.ownerNexus.ownerId, transfer.ownerNexusId);
  }

  return foreignTransfers.length;
}

export async function processArrivedAttacks(): Promise<void> {
  try {
    const now = new Date();

    const arrivedAttacks = await prisma.attack.findMany({
      where: { status: 'traveling', arrivesAt: { lte: now } },
      include: { attackerNexus: true, defenderNexus: true },
    });
    for (const attack of arrivedAttacks) {
      await resolveCombat(attack as AttackWithNexuses);
    }

    const returningAttacks = await prisma.attack.findMany({
      where: { status: 'returning', returnsAt: { lte: now } },
    });
    for (const attack of returningAttacks) {
      await processReturnedTroops(attack);
    }
  } catch (err) {
    console.error('Error processing attacks:', err);
  }
}

async function resolveCombat(attack: AttackWithNexuses): Promise<void> {
  try {
    const defenderNexus = await prisma.nexus.findUnique({ where: { id: attack.defenderNexusId! } });
    let attackTroops = attack.troops as Record<TroopKey, number>;

    if (attack.type === 'support') {
      if (!defenderNexus || defenderNexus.ownerId !== attack.defenderUserId) {
        await prisma.attack.update({
          where: { id: attack.id },
          data: {
            status: 'completed',
            result: {
              mission: 'support',
              victory: false,
              destroyed: true,
              reason: 'host_owner_changed',
              troopsDestroyed: attackTroops,
              attackerLosses: {},
              defenderLosses: {},
              resourcesStolen: { biomass: 0, alloy: 0, ore: 0 },
            } as Prisma.InputJsonObject,
          },
        });
        logWarn('support_destroyed_host_owner_changed', {
          attackId: attack.id,
          hostNexusId: attack.defenderNexusId,
          expectedOwnerId: attack.defenderUserId,
          currentOwnerId: defenderNexus?.ownerId ?? null,
          troopsDestroyed: countTroops(attackTroops),
        });
        await freePopulationForDestroyedTroops(attack.attackerNexusId!, attackTroops, {
          reason: 'support_host_owner_changed',
          attackId: attack.id,
          hostNexusId: attack.defenderNexusId,
        });
        notifyAttackUpdate(attack.attackerUserId, attack.defenderUserId, attack.defenderNexusId!);
        if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
        return;
      }

      // Station the troops at the defender nexus via TroopTransfer
      await prisma.$transaction([
        prisma.troopTransfer.create({
          data: {
            galaxyId: attack.galaxyId,
            ownerNexusId: attack.attackerNexusId!,
            hostNexusId: attack.defenderNexusId!,
            troops: attackTroops as unknown as Prisma.InputJsonObject,
            status: 'stationed',
          },
        }),
        prisma.attack.update({
          where: { id: attack.id },
          data: {
            status: 'completed',
            result: {
              mission: 'support',
              victory: true,
              troopsStationed: attackTroops,
              attackerLosses: {},
              defenderLosses: {},
              resourcesStolen: { biomass: 0, alloy: 0, ore: 0 },
            } as Prisma.InputJsonObject,
          },
        }),
      ]);

      if (attack.attackerUserId) {
        void sendPushToUser(attack.attackerUserId, NOTIF.TROOP_TRANSFER, {
          title: 'Support Arrived',
          body: `Your support troops have arrived at the destination nexus.`,
          tag: `support-arrived-${attack.id}`, data: { url: '/' },
        });
      }
      if (attack.defenderUserId) {
        void sendPushToUser(attack.defenderUserId, NOTIF.TROOP_TRANSFER, {
          title: 'Reinforcements Arrived',
          body: `Allied support troops have arrived to defend your nexus.`,
          tag: `support-received-${attack.id}`, data: { url: '/' },
        });
      }
      return;
    }

    if (attack.type === 'scout') {
      const travelMs = attack.arrivesAt!.getTime() - attack.createdAt.getTime();
      const returnsAt = new Date(Date.now() + travelMs);

      await prisma.attack.update({
        where: { id: attack.id },
        data: {
          status: 'returning',
          returnsAt,
          result: {
            mission: 'scout', victory: true,
            intel: defenderNexus ? buildDetailedScoutIntel(defenderNexus) : null,
            survivingTroops: { reconOperative: attackTroops.reconOperative || 0 },
            attackerLosses: {}, defenderLosses: {},
            resourcesStolen: { biomass: 0, alloy: 0, ore: 0 },
          } as Prisma.InputJsonObject,
        },
      });

      if (attack.attackerUserId) {
        void sendPushToUser(attack.attackerUserId, NOTIF.ATTACK_RESOLVED, {
          title: '🛰️ Scout Returning',
          body: '🔭 Your scout mission is complete. Combat report ready!',
          tag: `scout-${attack.id}`, data: { url: '/combat-logs' },
        });
      }
      return;
    }

    if (!defenderNexus) return;

    // Plasma Turrets cannot leave their nexus, strip them from the attacking force.
    // They remain on the nexus and contribute to defense when under attack.
    const plasmaTurretsKept = attackTroops.plasmaTurret || 0;
    if (plasmaTurretsKept > 0) {
      attackTroops = { ...attackTroops, plasmaTurret: 0 };
    }

    // Aggregate support troops stationed at the defending nexus
    const supportTransfers = await prisma.troopTransfer.findMany({
      where: { hostNexusId: defenderNexus.id, status: 'stationed' },
    });
    const supportTroops: Record<TroopKey, number> = {} as Record<TroopKey, number>;
    for (const transfer of supportTransfers) {
      const t = transfer.troops as Record<TroopKey, number>;
      for (const key of TROOP_KEYS) {
        supportTroops[key] = (supportTroops[key] || 0) + (t[key] || 0);
      }
    }

    // Merged defender force (garrison + support)
    const mergedDefenderForce: Record<string, number> = {};
    for (const key of TROOP_KEYS) {
      mergedDefenderForce[key] = ((defenderNexus as unknown as Record<TroopKey, number>)[key] || 0) + (supportTroops[key] || 0);
    }

    // Attacker armory level amplifies class-counter bonuses
    const attackerNexusForArmory = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! } });
    const attackerArmoryLevel = (attackerNexusForArmory as unknown as { armory?: number } | null)?.armory ?? 0;

    // Class-weighted attack power vs raw defense power
    let attackPower = computeClassWeightedAttack(attackTroops, mergedDefenderForce, attackerArmoryLevel);
    let defensePower = computeForcePower(mergedDefenderForce, 'defense');

    const baseShieldEff = defenderNexus.nexusType === 'Military Outpost' ? 2.0 : 1;
    const nexusDoubled = (defenderNexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
    const shieldEfficiencyMultiplier = baseShieldEff === 1 ? 1 : 1 + (baseShieldEff - 1) * (nexusDoubled ? 2 : 1);
    defensePower *= 1 + defenderNexus.shieldGrid * 0.02 * shieldEfficiencyMultiplier;

    const attackerWins = attackPower > defensePower;
    // powerRatio is always loser/winner (0..1]; used to calibrate losses
    const powerRatio = attackerWins
      ? Math.min(1, defensePower / Math.max(1, attackPower))
      : Math.min(1, attackPower / Math.max(1, defensePower));

    // Deterministic seed from attack id so replays are reproducible
    const seed = attack.id * 2654435761;

    const attackerLosses: Partial<Record<TroopKey, number>> = attackerWins
      ? computeLossesForWinner(attackTroops, powerRatio, seed)
      : computeLossesForLoser(attackTroops, Math.max(1, 1 / Math.max(0.001, powerRatio)), seed);

    const rawDefenderLosses = attackerWins
      ? computeLossesForLoser(mergedDefenderForce, Math.max(1, 1 / Math.max(0.001, powerRatio)), seed ^ 0xabcd1234)
      : computeLossesForWinner(mergedDefenderForce, powerRatio, seed ^ 0xabcd1234);

    const defenderLosses: Partial<Record<TroopKey, number>> = {};
    const defenderTroopUpdates: Record<string, unknown> = {};

    // Clamp losses to actual troops present; split between garrison and support
    let defenderPopLost = 0;
    for (const troopType of TROOP_KEYS) {
      if (troopType === 'overseer') continue;
      const totalInForce = mergedDefenderForce[troopType] || 0;
      if (totalInForce <= 0) continue;
      const rawLoss = Math.min(rawDefenderLosses[troopType] ?? 0, totalInForce);
      defenderLosses[troopType] = rawLoss;
      const garrisonCount = (defenderNexus as unknown as Record<TroopKey, number>)[troopType] || 0;
      const garrisonLoss = Math.min(rawLoss, garrisonCount);
      defenderTroopUpdates[troopType] = Math.max(0, garrisonCount - garrisonLoss);
      defenderPopLost += garrisonLoss * (TROOP_POPULATION_COST[troopType] ?? 1);
    }

    // Overseer: destroyed only if all escort is wiped
    const totalNonOverseerSent = TROOP_KEYS.filter((t) => t !== 'overseer').reduce((sum, t) => sum + (attackTroops[t] || 0), 0);
    const totalNonOverseerLost = TROOP_KEYS.filter((t) => t !== 'overseer').reduce((sum, t) => sum + (attackerLosses[t] || 0), 0);
    attackerLosses.overseer = 0;
    if ((attackTroops.overseer || 0) > 0 && totalNonOverseerSent > 0 && totalNonOverseerLost >= totalNonOverseerSent) {
      attackerLosses.overseer = attackTroops.overseer;
    }

    const totalDefenderNonOverseer = TROOP_KEYS.filter((t) => t !== 'overseer').reduce((sum, t) => sum + (mergedDefenderForce[t] || 0), 0);
    const totalDefenderNonOverseerLost = TROOP_KEYS.filter((t) => t !== 'overseer').reduce((sum, t) => sum + (defenderLosses[t] || 0), 0);
    const defenderOverseerCount = mergedDefenderForce.overseer || 0;
    const garrisonOverseerCount = (defenderNexus as unknown as Record<TroopKey, number>).overseer || 0;
    if (defenderOverseerCount > 0) {
      if (attackerWins && totalDefenderNonOverseerLost >= totalDefenderNonOverseer) {
        defenderLosses.overseer = defenderOverseerCount;
        defenderTroopUpdates['overseer'] = 0;
        defenderPopLost += garrisonOverseerCount * (TROOP_POPULATION_COST.overseer ?? 5);
      } else {
        defenderTroopUpdates['overseer'] = garrisonOverseerCount;
      }
    }

    // Remove destroyed support troops from their TroopTransfer records.
    // Losses are applied garrison-first; the remainder is spread across transfers
    // in order. remainingSupportLosses tracks how many per-type losses are still
    // unallocated so each transfer only absorbs its fair share.
    if (supportTransfers.length > 0) {
      const remainingSupportLosses: Record<string, number> = {};
      for (const key of TROOP_KEYS) {
        const garrisonCount = (defenderNexus as unknown as Record<TroopKey, number>)[key] || 0;
        const totalLost = defenderLosses[key] || 0;
        remainingSupportLosses[key] = Math.max(0, totalLost - garrisonCount);
      }

      for (const transfer of supportTransfers) {
        const t = transfer.troops as Record<TroopKey, number>;
        const updatedTroops: Record<string, number> = {};
        const lostTroops: Partial<Record<TroopKey, number>> = {};
        let anyRemain = false;
        let anyLost = false;
        for (const key of TROOP_KEYS) {
          const inTransfer = t[key] || 0;
          const lost = Math.min(inTransfer, remainingSupportLosses[key] || 0);
          remainingSupportLosses[key] = (remainingSupportLosses[key] || 0) - lost;
          if (lost > 0) {
            lostTroops[key] = lost;
            anyLost = true;
          }
          const remaining = inTransfer - lost;
          updatedTroops[key] = remaining;
          if (remaining > 0) anyRemain = true;
        }
        if (!anyRemain) {
          await prisma.troopTransfer.delete({ where: { id: transfer.id } });
        } else {
          await prisma.troopTransfer.update({ where: { id: transfer.id }, data: { troops: updatedTroops as unknown as Prisma.InputJsonObject } });
        }
        if (anyLost) {
          await freePopulationForDestroyedTroops(transfer.ownerNexusId, lostTroops, {
            reason: 'support_transfer_combat_losses',
            transferId: transfer.id,
            attackId: attack.id,
            defenderNexusId: defenderNexus.id,
          });
        }
      }
    }

    // Building damage: if attacker wins and all defender troops are wiped, overflow attack damages buildings.
    // shieldGrid is always hit first (it's the wall). Each "hit" reduces one building by 1 level.
    const buildingDamageUpdates: Record<string, number> = {};
    const totalDefenderTroopsInForce = computeTroopTotal(mergedDefenderForce, true);
    const totalDefenderTroopsLost = TROOP_KEYS.reduce((s, t) => s + Math.min(mergedDefenderForce[t] || 0, defenderLosses[t] || 0), 0);
    const allDefenderTroopsWiped = areAllDefendingTroopsEliminated(mergedDefenderForce, defenderLosses);
    const buildingDamageLog: { building: string; from: number; to: number }[] = [];
    if (attackerWins && allDefenderTroopsWiped) {
      // Number of building levels reduced is proportional to how dominant the attack was
      const overflowRatio = Math.min(1, defensePower > 0 ? (attackPower - defensePower) / Math.max(1, attackPower) : 0.5);
      const maxHits = Math.max(1, Math.floor(overflowRatio * 5)); // 1–5 levels total
      const BUILDING_PRIORITY = [
        'shieldGrid', 'commandCore', 'recruitmentCore', 'lifeSupport',
        'storageVault', 'biomassFarm', 'alloyForge', 'oreExtractor', 'armory', 'stealthArray',
      ] as const;
      type BuildingKey = typeof BUILDING_PRIORITY[number];
      let hitsRemaining = maxHits;
      for (const building of BUILDING_PRIORITY) {
        if (hitsRemaining <= 0) break;
        const currentLevel = (defenderNexus as unknown as Record<BuildingKey, number>)[building] ?? 0;
        if (currentLevel <= 0) continue;
        const newLevel = Math.max(0, currentLevel - 1);
        buildingDamageUpdates[building] = newLevel;
        buildingDamageLog.push({ building, from: currentLevel, to: newLevel });
        hitsRemaining--;
      }
    }

    let resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
    let conquered = false;
    const defenderResourceUpdates: Record<string, number> = {};

    if (attackerWins) {
      let lootCapacity = 0;
      for (const troopType of TROOP_KEYS) {
        const count = attackTroops[troopType] || 0;
        if (count > 0) lootCapacity += TROOP_STATS[troopType].carry * count;
      }
      const totalTroopsSent = Object.values(attackTroops).reduce((a, b) => a + b, 0);
      const totalLost = Object.values(attackerLosses).reduce((a: number, b) => a + (b || 0), 0 as number);
      const surviveRatio = totalTroopsSent > 0 ? 1 - totalLost / totalTroopsSent : 0;
      const survivingCarry = lootCapacity * surviveRatio;

      const defenderBonuses = getNexusTypeEffectiveMultipliers(defenderNexus as Parameters<typeof getNexusTypeEffectiveMultipliers>[0]);
      const lootProtection = defenderBonuses?.lootProtection ?? 0;
      const lootableFraction = 1 - lootProtection;

      const totalAvailable = (defenderNexus.biomass + defenderNexus.alloy + defenderNexus.ore) * lootableFraction;
      if (totalAvailable > 0 && survivingCarry > 0) {
        const lootRatio = Math.min(survivingCarry / totalAvailable, 1);
        resourcesStolen = {
          biomass: Math.floor(defenderNexus.biomass * lootableFraction * lootRatio),
          alloy:   Math.floor(defenderNexus.alloy   * lootableFraction * lootRatio),
          ore:     Math.floor(defenderNexus.ore     * lootableFraction * lootRatio),
        };
      }
      defenderResourceUpdates.biomass = defenderNexus.biomass - resourcesStolen.biomass;
      defenderResourceUpdates.alloy   = defenderNexus.alloy   - resourcesStolen.alloy;
      defenderResourceUpdates.ore     = defenderNexus.ore     - resourcesStolen.ore;
    }

    const remainingResources = {
      biomass: Math.max(0, defenderResourceUpdates.biomass ?? defenderNexus.biomass),
      alloy: Math.max(0, defenderResourceUpdates.alloy ?? defenderNexus.alloy),
      ore: Math.max(0, defenderResourceUpdates.ore ?? defenderNexus.ore),
    };

    let newControlLevel = defenderNexus.controlLevel ?? 100;
    const overseerSent = attackTroops.overseer || 0;
    const overseerCanAct = attackerWins && overseerSent > 0 && attackerLosses.overseer === 0 && allDefenderTroopsWiped;

    if (attackerWins && overseerSent > 0 && !allDefenderTroopsWiped) {
      logWarn('conquest_blocked_defenders_remaining', {
        attackId: attack.id,
        defenderNexusId: defenderNexus.id,
        totalDefenderTroopsInForce,
        totalDefenderTroopsLost,
        supportTransferCount: supportTransfers.length,
      });
    }

    if (overseerCanAct) {
      newControlLevel = Math.max(0, newControlLevel - 34);
      if (newControlLevel <= 0) {
        const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! } });
        const newOwnerId = attackerNexus!.ownerId;
        defenderTroopUpdates['ownerId'] = newOwnerId;
        defenderTroopUpdates['name'] = 'Conquered Nexus';
        const NPC_TYPE_NAMES = ['Resource Depot', 'Military Outpost', 'Supply Cache', 'Neutral Settlement', 'Reclaimed Outpost'];
        const preservedType = defenderNexus.nexusType ?? (NPC_TYPE_NAMES.includes(defenderNexus.name) ? defenderNexus.name : null);
        defenderTroopUpdates['nexusType'] = preservedType;
        // Conquest always resets to base tier - nexusTypeDoubled is never inherited.
        // Player specialization (CC15) is the only path that grants doubled bonuses.
        defenderTroopUpdates['nexusTypeDoubled'] = false;
        defenderTroopUpdates['conqueredAt'] = new Date();
        conquered = true;
        await destroyForeignTransfersAtConqueredNexus(defenderNexus.id, attack.galaxyId, newOwnerId, attack.id);
        await destroyInvalidInboundSupport(defenderNexus.id, attack.galaxyId, newOwnerId, attack.id);
        logInfo('nexus_conquest_owner_changed', {
          attackId: attack.id,
          defenderNexusId: defenderNexus.id,
          previousOwnerId: defenderNexus.ownerId,
          newOwnerId,
          totalDefenderTroopsInForce,
          totalDefenderTroopsLost,
        });
        // Overseer survives conquest. Zero out the loss so survivingTroops
        // includes it, and a stationed TroopTransfer is created below.
        attackerLosses.overseer = 0;
      }
    }

    // If CC is damaged below 15 on a conquered NPC nexus (nexusTypeLockedAt null = auto-granted, not player-chosen),
    // revoke the T2 bonus so it doesn't stay doubled after the CC threshold is lost.
    const damagedCC = buildingDamageUpdates['commandCore'] as number | undefined;
    const nexusTypeLockedAt = (defenderNexus as unknown as { nexusTypeLockedAt?: Date | null }).nexusTypeLockedAt;
    const nexusTypeDoubled = (defenderNexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
    const shouldRevokeDoubled = damagedCC !== undefined && damagedCC < 15 && nexusTypeDoubled && !nexusTypeLockedAt;

    await prisma.nexus.update({
      where: { id: defenderNexus.id },
      data: {
        ...defenderTroopUpdates,
        ...defenderResourceUpdates,
        ...buildingDamageUpdates,
        ...(shouldRevokeDoubled ? { nexusTypeDoubled: false } : {}),
        populationCurrent: Math.max(0, defenderNexus.populationCurrent - defenderPopLost),
        controlLevel: conquered ? 0 : newControlLevel,
      },
    });

    if (conquered && attack.attackerUserId) {
      const attackerNexusInfo = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! }, select: { galaxyId: true, owner: { select: { username: true } } } });
      const attackerUsername = (attackerNexusInfo?.owner as { username?: string } | null)?.username;
      const nexusName = defenderNexus.name;
      if (attackerNexusInfo?.galaxyId && attackerUsername) {
        void logFactionEvent(attack.attackerUserId, attackerNexusInfo.galaxyId, 'nexus_captured', attackerUsername, undefined, nexusName);
      }
      // Resolve any galaxy events tied to this nexus (derelict ship / rogue AI captured)
      void resolveEventForNexus(defenderNexus.id);
    }

    const survivingTroops: Partial<Record<TroopKey, number>> = {};
    let attackerPopFreed = 0;
    for (const troopType of TROOP_KEYS) {
      const sent = attackTroops[troopType] || 0;
      const lost = attackerLosses[troopType] || 0;
      const survived = Math.max(0, sent - lost);
      if (survived > 0) survivingTroops[troopType] = survived;
      attackerPopFreed += lost * (TROOP_POPULATION_COST[troopType] || 1);
    }

    const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! } });
    if (attackerNexus && attackerPopFreed > 0) {
      await prisma.nexus.update({
        where: { id: attack.attackerNexusId! },
        data: { populationCurrent: Math.max(0, attackerNexus.populationCurrent - attackerPopFreed) },
      });
    }

    const travelMs = attack.arrivesAt!.getTime() - attack.createdAt.getTime();
    const returnsAt = new Date(Date.now() + travelMs);

    // Capture the defender's force composition at engagement time so replays are
    // reproducible. Without this, an observer only knows defender *losses*, not
    // who survived, which would make the replay underwhelming.
    const defenderInitial: Record<string, number> = {};
    const defenderSurvivors: Record<string, number> = {};
    for (const k of TROOP_KEYS) {
      const n = mergedDefenderForce[k] || 0;
      if (n > 0) defenderInitial[k] = n;
      const survived = Math.max(0, n - (defenderLosses[k] || 0));
      if (survived > 0) defenderSurvivors[k] = survived;
    }

    // Conquest attacks complete immediately. Surviving troops are handled via
    // a stationed TroopTransfer (created above) so the player can recall them.
    const resolvedStatus = conquered ? 'completed' : 'returning';

    if (conquered && Object.keys(survivingTroops).length > 0) {
      await prisma.troopTransfer.create({
        data: {
          galaxyId: attack.galaxyId,
          ownerNexusId: attack.attackerNexusId!,
          hostNexusId: attack.defenderNexusId!,
          troops: survivingTroops,
          status: 'stationed',
          arrivesAt: null,
          returnsAt: null,
        },
      });
    }

    await prisma.attack.update({
      where: { id: attack.id },
      data: {
        status: resolvedStatus, returnsAt: conquered ? null : returnsAt,
        result: {
          attackerLosses, defenderLosses, resourcesStolen, remainingResources, survivingTroops,
          defenderSurvivors,
          victory: attackerWins, conquered, remainingControl: newControlLevel,
          combatSeed: seed,
          attackerInitial: attackTroops,
          defenderInitial,
          attackerPower: Math.round(attackPower),
          defenderPower: Math.round(defensePower),
          buildingDamage: buildingDamageLog.length > 0 ? buildingDamageLog : undefined,
        },
      },
    });

    const [attackerNexusForNotif, defenderNexusForNotif] = await Promise.all([
      prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! }, select: { name: true } }),
      prisma.nexus.findUnique({ where: { id: attack.defenderNexusId! }, select: { name: true, ownerId: true } }),
    ]);

    if (attack.attackerUserId) {
      void sendPushToUser(attack.attackerUserId, NOTIF.ATTACK_RESOLVED, {
        title: attackerWins ? (conquered ? 'Nexus Conquered!' : 'Attack Victorious') : 'Attack Repelled',
        body: attackerWins
          ? conquered
            ? `Your forces conquered ${defenderNexusForNotif?.name || 'a nexus'}! Combat report ready.`
            : `You won the battle at ${defenderNexusForNotif?.name || 'a nexus'}. Troops returning, combat report ready!`
          : `Your attack on ${defenderNexusForNotif?.name || 'a nexus'} was repelled. Combat report ready.`,
        tag: `attack-resolved-${attack.id}`, data: { url: '/combat-logs' },
      });
    }

    if (attack.defenderUserId) {
      void sendPushToUser(attack.defenderUserId, NOTIF.ATTACK_INCOMING, {
        title: attackerWins ? (conquered ? 'Nexus Lost!' : 'Your Nexus Was Attacked!') : 'Attack Repelled',
        body: attackerWins
          ? conquered
            ? `${attackerNexusForNotif?.name || 'An enemy'} conquered your nexus! Combat report ready.`
            : `${attackerNexusForNotif?.name || 'An enemy'} raided your nexus and stole resources. Combat report ready.`
          : `You successfully defended against an attack on ${defenderNexusForNotif?.name || 'your nexus'}. Combat report ready.`,
        tag: `defended-${attack.id}`, data: { url: '/combat-logs' },
      });
    }

    // Socket push: tell both players to refresh their attack lists and reports.
    notifyAttackUpdate(attack.attackerUserId, attack.defenderUserId, attack.defenderNexusId!);
    if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
    if (attack.defenderUserId) notifyReportUpdate(attack.defenderUserId);

    if (conquered && attack.defenderUserId) {
      notifyNexusConquered(
        attack.defenderUserId,
        defenderNexusForNotif?.name || 'Unknown Nexus',
        attackerNexusForNotif?.name || 'Unknown',
      );
    }

    console.log(`Combat resolved: Attack ${attack.id} - ${attackerWins ? 'Attacker' : 'Defender'} wins${conquered ? ' - NEXUS CONQUERED!' : ''}`);
  } catch (err) {
    console.error('Error resolving combat:', err);
  }
}

async function processReturnedTroops(attack: Attack): Promise<void> {
  try {
    const result = attack.result as { survivingTroops?: Partial<Record<TroopKey, number>>; resourcesStolen?: { biomass: number; alloy: number; ore: number } } | null;
    const survivingTroops = result?.survivingTroops || {};
    const resourcesStolen = result?.resourcesStolen || { biomass: 0, alloy: 0, ore: 0 };

    const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! } });
    if (!attackerNexus) {
      await prisma.attack.update({ where: { id: attack.id }, data: { status: 'completed' } });
      return;
    }

    const returnData: Record<string, unknown> = {};
    for (const [troopType, count] of Object.entries(survivingTroops)) {
      if ((count ?? 0) > 0) returnData[troopType] = ((attackerNexus as unknown as Record<string, number>)[troopType] || 0) + count!;
    }
    returnData['biomass'] = attackerNexus.biomass + (resourcesStolen.biomass || 0);
    returnData['alloy']   = attackerNexus.alloy   + (resourcesStolen.alloy   || 0);
    returnData['ore']     = attackerNexus.ore      + (resourcesStolen.ore     || 0);

    await prisma.$transaction([
      prisma.nexus.update({ where: { id: attack.attackerNexusId! }, data: returnData }),
      prisma.attack.update({ where: { id: attack.id }, data: { status: 'completed' } }),
    ]);

    const totalReturned = Object.values(survivingTroops).reduce((a, b) => a + (b || 0), 0);
    const loot = resourcesStolen;
    const hasLoot = (loot.biomass || 0) + (loot.alloy || 0) + (loot.ore || 0) > 0;

    if (attack.attackerUserId) {
      void sendPushToUser(attack.attackerUserId, NOTIF.TROOPS_RETURNED, {
        title: '🪖 Troops Returned',
        body: totalReturned > 0
          ? `🎖️ ${totalReturned} troop${totalReturned !== 1 ? 's' : ''} returned${hasLoot ? ' with loot 💰' : ''}. Combat report ready!`
          : '💔 Your troops have returned (no survivors). Combat report ready.',
        tag: `returned-${attack.id}`, data: { url: '/combat-logs' },
      });
    }

    // Socket push: attacker sees their outgoing attack disappear and nexus resources update.
    notifyAttackUpdate(attack.attackerUserId, null, attack.attackerNexusId!);
  } catch (err) {
    console.error(`Error processing returned troops for attack ${attack.id}:`, err);
  }
}

const TRANSFER_TROOP_FIELDS: TroopKey[] = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative',
  'skimmerBike', 'siegeMech', 'bulwarkGuard', 'suppressorTeam',
  'disruptorUnit', 'interceptorBike', 'annihilatorPlatform',
  'voidStalker', 'plasmaTurret',
  'overseer',
];

export async function processArrivedTransfers(): Promise<void> {
  const now = new Date();

  const arriving = await prisma.troopTransfer.findMany({
    where: { status: 'traveling', arrivesAt: { lte: now } },
    include: { hostNexus: true, ownerNexus: { include: { owner: true } } },
  });

  for (const transfer of arriving) {
    try {
      const troops = transfer.troops as Record<TroopKey, number>;
      const ownerId = transfer.ownerNexus.ownerId;
      if (!ownerId || transfer.hostNexus.ownerId !== ownerId) {
        await prisma.troopTransfer.delete({ where: { id: transfer.id } });
        await freePopulationForDestroyedTroops(transfer.ownerNexusId, troops, {
          reason: 'transfer_host_owner_changed',
          transferId: transfer.id,
          hostNexusId: transfer.hostNexusId,
        });
        logWarn('transfer_destroyed_host_owner_changed', {
          transferId: transfer.id,
          hostNexusId: transfer.hostNexusId,
          ownerNexusId: transfer.ownerNexusId,
          expectedOwnerId: ownerId,
          currentHostOwnerId: transfer.hostNexus.ownerId,
          troopsDestroyed: countTroops(troops),
        });
        if (ownerId) {
          notifyTransferUpdate(ownerId, transfer.ownerNexusId);
          void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
            title: 'Troops Lost',
            body: `Troops en route to ${transfer.hostNexus.name} were destroyed after the nexus changed hands.`,
            tag: `transfer-destroyed-${transfer.id}`, data: { url: '/' },
          });
        }
        continue;
      }

      // Stationed troops live on the transfer record only, not in host nexus columns.
      // Combat aggregates them from troopTransfer (status='stationed') alongside the host's garrison.
      // Writing to host columns here previously caused duplication (visible in train UI + double-counted in combat + cloned on recall).
      await prisma.troopTransfer.update({
        where: { id: transfer.id },
        data: { status: 'stationed', arrivesAt: null },
      });

      if (ownerId) {
        const total = TRANSFER_TROOP_FIELDS.reduce((s, f) => s + (troops[f] || 0), 0);
        void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
          title: '🚀 Troops Arrived',
          body: `📦 ${total} troop${total !== 1 ? 's' : ''} arrived at ${transfer.hostNexus.name}.`,
          tag: `transfer-arrived-${transfer.id}`, data: { url: '/' },
        });
        notifyTransferUpdate(ownerId, transfer.ownerNexusId);
      }
    } catch (err) {
      console.error(`Error processing arriving transfer ${transfer.id}:`, err);
    }
  }

  const returning = await prisma.troopTransfer.findMany({
    where: { status: 'returning', returnsAt: { lte: now } },
    include: { ownerNexus: { include: { owner: true } } },
  });

  for (const transfer of returning) {
    try {
      const troops = transfer.troops as Record<TroopKey, number>;
      const returnData: Record<string, number> = {};
      for (const field of TRANSFER_TROOP_FIELDS) {
        if (troops[field] > 0) returnData[field] = ((transfer.ownerNexus as unknown as Record<TroopKey, number>)[field] ?? 0) + troops[field];
      }
      await prisma.$transaction([
        prisma.nexus.update({ where: { id: transfer.ownerNexusId }, data: returnData }),
        prisma.troopTransfer.delete({ where: { id: transfer.id } }),
      ]);

      const ownerId = (transfer.ownerNexus as unknown as { owner?: { id: number } })?.owner?.id;
      if (ownerId) {
        const total = TRANSFER_TROOP_FIELDS.reduce((s, f) => s + (troops[f] || 0), 0);
        void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
          title: '🏠 Troops Returned Home',
          body: `🪖 ${total} troop${total !== 1 ? 's' : ''} returned to ${transfer.ownerNexus.name}.`,
          tag: `transfer-returned-${transfer.id}`, data: { url: '/' },
        });
        notifyTransferUpdate(ownerId, transfer.ownerNexusId);
      }
    } catch (err) {
      console.error(`Error processing returning transfer ${transfer.id}:`, err);
    }
  }
}
