import prisma from '../lib/prisma.js';
import { computeForcePower, TROOP_STATS } from './combatMath.js';
import { buildDetailedScoutIntel } from './scouting.js';

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
      const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
      if (attackerNexus && defenderNexus) {
        await prisma.nexus.update({
          where: { id: attack.attackerNexusId },
          data: {
            reconOperative: attackerNexus.reconOperative + (attackTroops.reconOperative || 0),
          },
        });
      }

      await prisma.attack.update({
        where: { id: attack.id },
        data: {
          status: 'completed',
          result: {
            mission: 'scout',
            victory: true,
            intel: defenderNexus ? buildDetailedScoutIntel(defenderNexus) : null,
            attackerLosses: {},
            defenderLosses: {},
            resourcesStolen: { biomass: 0, alloy: 0, ore: 0 },
          },
        },
      });

      return;
    }

    // Calculate attack and defense power
    let attackPower = computeForcePower(attackTroops, 'attack');
    let defensePower = computeForcePower(defenderNexus, 'defense');

    // Shield Grid bonus (2% per level)
    defensePower *= 1 + defenderNexus.shieldGrid * 0.02;

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

    // Loot calculation
    let resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
    let conquered = false;
    const defenderResourceUpdates = {};

    if (attackerWins) {
      let lootCapacity = 0;
      for (const troopType of TROOP_KEYS) {
        const count = attackTroops[troopType] || 0;
        if (count > 0 && TROOP_STATS[troopType]) {
          lootCapacity += TROOP_STATS[troopType].carry * count;
        }
      }

      const availableResources = defenderNexus.biomass + defenderNexus.alloy + defenderNexus.ore;
      const lootPercentage = availableResources > 0 ? Math.min(lootCapacity / availableResources, 0.5) : 0;

      resourcesStolen.biomass = Math.floor(defenderNexus.biomass * lootPercentage);
      resourcesStolen.alloy = Math.floor(defenderNexus.alloy * lootPercentage);
      resourcesStolen.ore = Math.floor(defenderNexus.ore * lootPercentage);

      defenderResourceUpdates.biomass = defenderNexus.biomass - resourcesStolen.biomass;
      defenderResourceUpdates.alloy = defenderNexus.alloy - resourcesStolen.alloy;
      defenderResourceUpdates.ore = defenderNexus.ore - resourcesStolen.ore;

      // Calculate surviving carry capacity
      const totalTroopsSent = Object.values(attackTroops).reduce((a, b) => a + b, 0);
      const totalLost = Object.values(attackerLosses).reduce((a, b) => a + b, 0);
      const surviveRatio = totalTroopsSent > 0 ? 1 - totalLost / totalTroopsSent : 0;
      const survivingCarry = lootCapacity * surviveRatio;
      const totalLooted = resourcesStolen.biomass + resourcesStolen.alloy + resourcesStolen.ore;
      const actualLoot = Math.min(totalLooted, survivingCarry);

      if (actualLoot > 0 && totalLooted > 0) {
        const lootRatio = actualLoot / totalLooted;
        const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
        await prisma.nexus.update({
          where: { id: attack.attackerNexusId },
          data: {
            biomass: attackerNexus.biomass + Math.floor(resourcesStolen.biomass * lootRatio),
            alloy: attackerNexus.alloy + Math.floor(resourcesStolen.alloy * lootRatio),
            ore: attackerNexus.ore + Math.floor(resourcesStolen.ore * lootRatio),
          },
        });
      }
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

    // Return surviving troops to attacker nexus
    const attackerTroopReturns = {};
    for (const troopType of TROOP_KEYS) {
      const sent = attackTroops[troopType] || 0;
      if (sent > 0) {
        attackerTroopReturns[troopType] = Math.max(0, sent - (attackerLosses[troopType] || 0));
      }
    }
    const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
    if (attackerNexus) {
      const returnData = {};
      for (const [troopType, survived] of Object.entries(attackerTroopReturns)) {
        returnData[troopType] = (attackerNexus[troopType] || 0) + survived;
      }
      if (typeof returnData.overseer === 'undefined') {
        returnData.overseer = attackerNexus.overseer || 0;
      }
      let attackerPopFreed = 0;
      for (const [troopType, lost] of Object.entries(attackerLosses)) {
        attackerPopFreed += (lost || 0) * (TROOP_POPULATION_COST[troopType] || 1);
      }
      returnData.populationCurrent = Math.max(0, attackerNexus.populationCurrent - attackerPopFreed);
      await prisma.nexus.update({ where: { id: attack.attackerNexusId }, data: returnData });
    }

    // Mark attack as completed
    await prisma.attack.update({
      where: { id: attack.id },
      data: {
        status: 'completed',
        result: {
          attackerLosses,
          defenderLosses,
          resourcesStolen,
          victory: attackerWins,
          conquered,
          remainingControl: newControlLevel,
        },
      },
    });

    console.log(
      `Combat resolved: Attack ${attack.id} - ${attackerWins ? 'Attacker' : 'Defender'} wins${conquered ? ' - NEXUS CONQUERED!' : ''}`,
    );
  } catch (err) {
    console.error('Error resolving combat:', err);
  }
}

export { processArrivedAttacks };
