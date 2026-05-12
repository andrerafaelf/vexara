import prisma from '../lib/prisma.js';
import { computeForcePower, TROOP_STATS } from './combatMath.js';
import { buildDetailedScoutIntel } from './scouting.js';
import { sendPushToUser, NOTIF } from './push.js';

const TROOP_KEYS = Object.keys(TROOP_STATS);

const TROOP_POPULATION_COST = {
  lancerDrone: 1,
  assaultTrooper: 1,
  breakerUnit: 1,
  reconOperative: 1,
  skimmerBike: 3,
  siegeMech: 4,
  bulwarkGuard: 2,
  suppressorTeam: 2,
  disruptorUnit: 2,
  interceptorBike: 3,
  annihilatorPlatform: 5,
  overseer: 5,
};

async function processArrivedAttacks() {
  try {
    const now = new Date();

    // Resolve attacks that have arrived at the target
    const arrivedAttacks = await prisma.attack.findMany({
      where: { status: 'traveling', arrivesAt: { lte: now } },
      include: {
        attackerNexus: true,
        defenderNexus: true,
      },
    });
    for (const attack of arrivedAttacks) {
      await resolveCombat(attack);
    }

    // Return surviving troops that have finished the trip back
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

// Resolve combat for a single attack
async function resolveCombat(attack) {
  try {
    // Reload defender nexus with fresh data
    const defenderNexus = await prisma.nexus.findUnique({ where: { id: attack.defenderNexusId } });
    const attackTroops = attack.troops; // JSON object from DB

    if (attack.type === 'scout') {
      const travelMs = attack.arrivesAt.getTime() - attack.createdAt.getTime();
      const returnsAt = new Date(Date.now() + travelMs);

      await prisma.attack.update({
        where: { id: attack.id },
        data: {
          status: 'returning',
          returnsAt,
          result: {
            mission: 'scout',
            victory: true,
            intel: defenderNexus ? buildDetailedScoutIntel(defenderNexus) : null,
            survivingTroops: { reconOperative: attackTroops.reconOperative || 0 },
            attackerLosses: {},
            defenderLosses: {},
            resourcesStolen: { biomass: 0, alloy: 0, ore: 0 },
          },
        },
      });

      // Notify attacker their scout is returning
      void sendPushToUser(attack.attackerUserId, NOTIF.ATTACK_RESOLVED, {
        title: '🛰️ Scout Returning',
        body: `🔭 Your scout mission is complete. Combat report ready!`,
        tag: `scout-${attack.id}`,
        data: { url: '/combat-logs' },
      });

      return;
    }

    // Calculate attack and defense power
    let attackPower = computeForcePower(attackTroops, 'attack');
    let defensePower = computeForcePower(defenderNexus, 'defense');

    // Shield Grid bonus: base 2% per level, Military Outpost raises efficiency to 2.5%/level
    const shieldEfficiencyMultiplier = defenderNexus.nexusType === 'Military Outpost' ? 1.25 : 1;
    const shieldBonusPerLevel = 0.02 * shieldEfficiencyMultiplier;
    defensePower *= 1 + defenderNexus.shieldGrid * shieldBonusPerLevel;

    const attackerWins = attackPower > defensePower;
    const powerRatio = attackerWins ? defensePower / attackPower : attackPower / defensePower;

    // Calculate losses
    const attackerLosses = {};
    const defenderLosses = {};
    const defenderTroopUpdates = {};

    // Attacker losses
    for (const troopType of TROOP_KEYS) {
      const count = attackTroops[troopType] || 0;
      if (count > 0 && TROOP_STATS[troopType]) {
        if (troopType === 'overseer') {
          attackerLosses[troopType] = 0;
          continue;
        }
        const baseLossRate = attackerWins ? powerRatio * 0.5 : 0.8;
        const randomFactor = 0.75 + Math.random() * 0.5;
        const defenseFactor = 1 + (50 - TROOP_STATS[troopType].defense) / 100;
        const lossRate = Math.min(baseLossRate * randomFactor * defenseFactor, 1);
        attackerLosses[troopType] = Math.max(0, Math.ceil(count * lossRate));
      }
    }

    // If all non-overseer troops died, overseer dies too
    const totalNonOverseerSent = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
      (sum, t) => sum + (attackTroops[t] || 0),
      0,
    );
    const totalNonOverseerLost = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
      (sum, t) => sum + (attackerLosses[t] || 0),
      0,
    );

    if ((attackTroops.overseer || 0) > 0 && totalNonOverseerSent > 0 && totalNonOverseerLost >= totalNonOverseerSent) {
      attackerLosses.overseer = attackTroops.overseer;
    }

    // Defender losses
    let defenderPopLost = 0;
    for (const troopType of TROOP_KEYS) {
      const count = defenderNexus[troopType] || 0;
      if (count > 0 && TROOP_STATS[troopType]) {
        if (troopType === 'overseer') {
          defenderLosses[troopType] = 0;
          continue;
        }
        const baseLossRate = attackerWins ? 0.8 : powerRatio * 0.5;
        const randomFactor = 0.75 + Math.random() * 0.5;
        const defenseFactor = 1 + (50 - TROOP_STATS[troopType].defense) / 100;
        const lossRate = Math.min(baseLossRate * randomFactor * defenseFactor, 1);
        const losses = Math.min(Math.ceil(count * lossRate), count);
        defenderLosses[troopType] = losses;
        defenderTroopUpdates[troopType] = Math.max(0, count - losses);
        defenderPopLost += losses;
      }
    }

    // Defender overseer dies only if all other defender troops are wiped out
    const totalDefenderNonOverseer = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
      (sum, t) => sum + (defenderNexus[t] || 0),
      0,
    );
    const totalDefenderNonOverseerLost = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
      (sum, t) => sum + (defenderLosses[t] || 0),
      0,
    );
    const defenderOverseerCount = defenderNexus.overseer || 0;
    if (defenderOverseerCount > 0) {
      if (totalDefenderNonOverseer > 0 && totalDefenderNonOverseerLost >= totalDefenderNonOverseer) {
        defenderLosses.overseer = defenderOverseerCount;
        defenderTroopUpdates.overseer = 0;
        defenderPopLost += defenderOverseerCount;
      } else {
        defenderTroopUpdates.overseer = defenderOverseerCount;
      }
    }

    // Loot calculation
    let resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
    let conquered = false;
    const defenderResourceUpdates = {};

    if (attackerWins) {
      // Total carry from sent troops
      let lootCapacity = 0;
      for (const troopType of TROOP_KEYS) {
        const count = attackTroops[troopType] || 0;
        if (count > 0 && TROOP_STATS[troopType]) {
          lootCapacity += TROOP_STATS[troopType].carry * count;
        }
      }

      // Surviving troops carry proportionally less
      const totalTroopsSent = Object.values(attackTroops).reduce((a, b) => a + b, 0);
      const totalLost = Object.values(attackerLosses).reduce((a, b) => a + b, 0);
      const surviveRatio = totalTroopsSent > 0 ? 1 - totalLost / totalTroopsSent : 0;
      const survivingCarry = lootCapacity * surviveRatio;

      // Distribute carry across resources proportionally to their availability
      const totalAvailable = defenderNexus.biomass + defenderNexus.alloy + defenderNexus.ore;
      if (totalAvailable > 0 && survivingCarry > 0) {
        const lootRatio = Math.min(survivingCarry / totalAvailable, 1);
        resourcesStolen.biomass = Math.floor(defenderNexus.biomass * lootRatio);
        resourcesStolen.alloy = Math.floor(defenderNexus.alloy * lootRatio);
        resourcesStolen.ore = Math.floor(defenderNexus.ore * lootRatio);
      }

      defenderResourceUpdates.biomass = defenderNexus.biomass - resourcesStolen.biomass;
      defenderResourceUpdates.alloy = defenderNexus.alloy - resourcesStolen.alloy;
      defenderResourceUpdates.ore = defenderNexus.ore - resourcesStolen.ore;
    }

    // Handle overseer conquest
    // Overseer is consumed on conquest. It can act if: attacker won, it was sent, and it wasn't
    // killed by the "all escort troops died" check above.
    let newControlLevel = defenderNexus.controlLevel ?? 100;
    const overseerSent = attackTroops.overseer || 0;
    const overseerCanAct = attackerWins && overseerSent > 0 && attackerLosses.overseer === 0;

    if (overseerCanAct) {
      newControlLevel = Math.max(0, newControlLevel - 50);

      if (newControlLevel <= 0) {
        const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
        defenderTroopUpdates.ownerId = attackerNexus.ownerId;
        defenderTroopUpdates.name = 'Conquered Nexus';
        // Preserve nexusType; fall back to name for pre-migration NPC nexuses that have nexusType=null
        const NPC_TYPE_NAMES = ['Resource Depot', 'Military Outpost', 'Supply Cache', 'Neutral Settlement', 'Reclaimed Outpost'];
        defenderTroopUpdates.nexusType = defenderNexus.nexusType ?? (NPC_TYPE_NAMES.includes(defenderNexus.name) ? defenderNexus.name : null);
        defenderTroopUpdates.conqueredAt = new Date();
        conquered = true;
        // Overseer is consumed on conquest
        attackerLosses.overseer = overseerSent;
      }
    }

    // Save defender nexus
    await prisma.nexus.update({
      where: { id: defenderNexus.id },
      data: {
        ...defenderTroopUpdates,
        ...defenderResourceUpdates,
        populationCurrent: Math.max(0, defenderNexus.populationCurrent - defenderPopLost),
        controlLevel: conquered ? 0 : newControlLevel,
      },
    });

    // Calculate surviving troops that will make the return journey
    const survivingTroops = {};
    let attackerPopFreed = 0;
    for (const troopType of TROOP_KEYS) {
      const sent = attackTroops[troopType] || 0;
      const lost = attackerLosses[troopType] || 0;
      const survived = Math.max(0, sent - lost);
      if (survived > 0) survivingTroops[troopType] = survived;
      attackerPopFreed += lost * (TROOP_POPULATION_COST[troopType] || 1);
    }

    // Free population for dead troops immediately
    const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
    if (attackerNexus && attackerPopFreed > 0) {
      await prisma.nexus.update({
        where: { id: attack.attackerNexusId },
        data: { populationCurrent: Math.max(0, attackerNexus.populationCurrent - attackerPopFreed) },
      });
    }

    // Send survivors on the return journey (same travel time as the outbound trip)
    const travelMs = attack.arrivesAt.getTime() - attack.createdAt.getTime();
    const returnsAt = new Date(Date.now() + travelMs);

    await prisma.attack.update({
      where: { id: attack.id },
      data: {
        status: 'returning',
        returnsAt,
        result: {
          attackerLosses,
          defenderLosses,
          resourcesStolen,
          survivingTroops,
          victory: attackerWins,
          conquered,
          remainingControl: newControlLevel,
        },
      },
    });

    // Notify attacker that combat has been resolved
    const attackerNexusForNotif = await prisma.nexus.findUnique({
      where: { id: attack.attackerNexusId },
      select: { name: true },
    });
    const defenderNexusForNotif = await prisma.nexus.findUnique({
      where: { id: attack.defenderNexusId },
      select: { name: true, ownerId: true },
    });

    void sendPushToUser(attack.attackerUserId, NOTIF.ATTACK_RESOLVED, {
      title: attackerWins
        ? conquered
          ? '👑 Nexus Conquered!'
          : '⚔️ Attack Victorious'
        : '🛡️ Attack Repelled',
      body: attackerWins
        ? conquered
          ? `🏆 Your forces conquered ${defenderNexusForNotif?.name || 'a nexus'}! Combat report ready.`
          : `💥 You won the battle at ${defenderNexusForNotif?.name || 'a nexus'}. Troops returning — combat report ready!`
        : `😞 Your attack on ${defenderNexusForNotif?.name || 'a nexus'} was repelled. Combat report ready.`,
      tag: `attack-resolved-${attack.id}`,
      data: { url: '/combat-logs' },
    });

    // Notify defender they were attacked
    if (attack.defenderUserId) {
      void sendPushToUser(attack.defenderUserId, NOTIF.ATTACK_INCOMING, {
        title: attackerWins
          ? conquered
            ? '💀 Nexus Lost!'
            : '🚨 Your Nexus Was Attacked!'
          : '🛡️ Attack Repelled',
        body: attackerWins
          ? conquered
            ? `⚠️ ${attackerNexusForNotif?.name || 'An enemy'} conquered your nexus! Combat report ready.`
            : `💥 ${attackerNexusForNotif?.name || 'An enemy'} raided your nexus and stole resources. Combat report ready.`
          : `✅ You successfully defended against an attack on ${defenderNexusForNotif?.name || 'your nexus'}. Combat report ready.`,
        tag: `defended-${attack.id}`,
        data: { url: '/combat-logs' },
      });
    }

    console.log(
      `Combat resolved: Attack ${attack.id} - ${attackerWins ? 'Attacker' : 'Defender'} wins${conquered ? ' - NEXUS CONQUERED!' : ''}`,
    );
  } catch (err) {
    console.error('Error resolving combat:', err);
  }
}

async function processReturnedTroops(attack) {
  try {
    const result = attack.result;
    const survivingTroops = result?.survivingTroops || {};
    const resourcesStolen = result?.resourcesStolen || { biomass: 0, alloy: 0, ore: 0 };

    const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
    if (!attackerNexus) {
      await prisma.attack.update({ where: { id: attack.id }, data: { status: 'completed' } });
      return;
    }

    const returnData = {};
    for (const [troopType, count] of Object.entries(survivingTroops)) {
      if (count > 0) returnData[troopType] = (attackerNexus[troopType] || 0) + count;
    }
    returnData.biomass = attackerNexus.biomass + (resourcesStolen.biomass || 0);
    returnData.alloy = attackerNexus.alloy + (resourcesStolen.alloy || 0);
    returnData.ore = attackerNexus.ore + (resourcesStolen.ore || 0);

    await prisma.$transaction([
      prisma.nexus.update({ where: { id: attack.attackerNexusId }, data: returnData }),
      prisma.attack.update({ where: { id: attack.id }, data: { status: 'completed' } }),
    ]);

    const totalReturned = Object.values(survivingTroops).reduce((a, b) => a + b, 0);
    const loot = resourcesStolen;
    const hasLoot = (loot.biomass || 0) + (loot.alloy || 0) + (loot.ore || 0) > 0;

    void sendPushToUser(attack.attackerUserId, NOTIF.TROOPS_RETURNED, {
      title: '🪖 Troops Returned',
      body: totalReturned > 0
        ? `🎖️ ${totalReturned} troop${totalReturned !== 1 ? 's' : ''} returned${hasLoot ? ` with loot 💰` : ''}. Combat report ready!`
        : `💔 Your troops have returned (no survivors). Combat report ready.`,
      tag: `returned-${attack.id}`,
      data: { url: '/combat-logs' },
    });

    console.log(`Attack ${attack.id} troops returned to nexus ${attack.attackerNexusId}`);
  } catch (err) {
    console.error(`Error processing returned troops for attack ${attack.id}:`, err);
  }
}

const TRANSFER_TROOP_FIELDS = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative',
  'skimmerBike', 'siegeMech', 'bulwarkGuard', 'suppressorTeam',
  'disruptorUnit', 'interceptorBike', 'annihilatorPlatform', 'overseer',
];

async function processArrivedTransfers() {
  const now = new Date();

  // Transfers that have arrived at the host nexus
  const arriving = await prisma.troopTransfer.findMany({
    where: { status: 'traveling', arrivesAt: { lte: now } },
    include: { hostNexus: true, ownerNexus: { include: { owner: true } } },
  });

  for (const transfer of arriving) {
    try {
      const troops = transfer.troops;
      const addData = {};
      for (const field of TRANSFER_TROOP_FIELDS) {
        if (troops[field] > 0) addData[field] = (transfer.hostNexus[field] ?? 0) + troops[field];
      }
      await prisma.$transaction([
        prisma.nexus.update({ where: { id: transfer.hostNexusId }, data: addData }),
        prisma.troopTransfer.update({ where: { id: transfer.id }, data: { status: 'stationed', arrivesAt: null } }),
      ]);

      if (transfer.ownerNexus?.owner?.id) {
        const total = TRANSFER_TROOP_FIELDS.reduce((s, f) => s + (troops[f] || 0), 0);
        void sendPushToUser(transfer.ownerNexus.owner.id, NOTIF.TROOP_TRANSFER, {
          title: '🚀 Troops Arrived',
          body: `📦 ${total} troop${total !== 1 ? 's' : ''} arrived at ${transfer.hostNexus.name}.`,
          tag: `transfer-arrived-${transfer.id}`,
          data: { url: '/' },
        });
      }
    } catch (err) {
      console.error(`Error processing arriving transfer ${transfer.id}:`, err);
    }
  }

  // Transfers that have finished returning to the owner nexus
  const returning = await prisma.troopTransfer.findMany({
    where: { status: 'returning', returnsAt: { lte: now } },
    include: { ownerNexus: { include: { owner: true } } },
  });

  for (const transfer of returning) {
    try {
      const troops = transfer.troops;
      const returnData = {};
      for (const field of TRANSFER_TROOP_FIELDS) {
        if (troops[field] > 0) returnData[field] = (transfer.ownerNexus[field] ?? 0) + troops[field];
      }
      await prisma.$transaction([
        prisma.nexus.update({ where: { id: transfer.ownerNexusId }, data: returnData }),
        prisma.troopTransfer.delete({ where: { id: transfer.id } }),
      ]);

      if (transfer.ownerNexus?.owner?.id) {
        const total = TRANSFER_TROOP_FIELDS.reduce((s, f) => s + (troops[f] || 0), 0);
        void sendPushToUser(transfer.ownerNexus.owner.id, NOTIF.TROOP_TRANSFER, {
          title: '🏠 Troops Returned Home',
          body: `🪖 ${total} troop${total !== 1 ? 's' : ''} returned to ${transfer.ownerNexus.name}.`,
          tag: `transfer-returned-${transfer.id}`,
          data: { url: '/' },
        });
      }
    } catch (err) {
      console.error(`Error processing returning transfer ${transfer.id}:`, err);
    }
  }
}

export { processArrivedAttacks, processArrivedTransfers };
