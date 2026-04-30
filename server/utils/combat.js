import prisma from '../lib/prisma.js';

// Troop stats
const TROOP_STATS = {
  lancerDrone: { attack: 15, defense: 25, speed: 20, carry: 20 },
  assaultTrooper: { attack: 30, defense: 40, speed: 18, carry: 15 },
  breakerUnit: { attack: 50, defense: 15, speed: 16, carry: 10 },
  reconOperative: { attack: 5, defense: 20, speed: 25, carry: 10 },
  skimmerBike: { attack: 80, defense: 70, speed: 22, carry: 60 },
  siegeMech: { attack: 150, defense: 200, speed: 10, carry: 80 },
  bulwarkGuard: { attack: 20, defense: 120, speed: 12, carry: 25 },
  suppressorTeam: { attack: 60, defense: 50, speed: 15, carry: 20 },
  disruptorUnit: { attack: 70, defense: 60, speed: 17, carry: 25 },
  interceptorBike: { attack: 90, defense: 80, speed: 28, carry: 50 },
  annihilatorPlatform: { attack: 200, defense: 150, speed: 8, carry: 100 },
  overseer: { attack: 0, defense: 30, speed: 15, carry: 0 },
};

const TROOP_KEYS = Object.keys(TROOP_STATS);

// Process attacks that have arrived
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

    // Calculate attack and defense power
    let attackPower = 0;
    let defensePower = 0;

    for (const troopType of TROOP_KEYS) {
      const atkCount = attackTroops[troopType] || 0;
      if (atkCount > 0 && TROOP_STATS[troopType]) {
        attackPower += TROOP_STATS[troopType].attack * atkCount;
      }
      const defCount = defenderNexus[troopType] || 0;
      if (defCount > 0 && TROOP_STATS[troopType]) {
        defensePower += TROOP_STATS[troopType].defense * defCount;
      }
    }

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

    // Handle nexus conquest via overseer
    let newControlLevel = defenderNexus.controlLevel;
    const overseerSurvived =
      attackerWins && (attackTroops.overseer || 0) > 0 && (attackerLosses.overseer || 0) < (attackTroops.overseer || 0);

    if (overseerSurvived) {
      newControlLevel = Math.max(0, (defenderNexus.controlLevel || 100) - 50);

      if (newControlLevel === 0) {
        const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
        const newOwnerId = attackerNexus.ownerId;

        // Transfer ownership — no nexuses array to update in SQL, just set ownerId
        defenderTroopUpdates.ownerId = newOwnerId;
        defenderTroopUpdates.controlLevel = 100;
        defenderTroopUpdates.name = 'Conquered Nexus';
        conquered = true;
      }
    }

    // Save defender nexus
    await prisma.nexus.update({
      where: { id: defenderNexus.id },
      data: {
        ...defenderTroopUpdates,
        ...defenderResourceUpdates,
        populationCurrent: Math.max(0, defenderNexus.populationCurrent - defenderPopLost),
        controlLevel: conquered ? 100 : newControlLevel,
      },
    });

    // Return surviving troops to attacker nexus
    const attackerTroopReturns = {};
    for (const troopType of TROOP_KEYS) {
      const sent = attackTroops[troopType] || 0;
      if (sent > 0) {
        attackerTroopReturns[troopType] = sent - (attackerLosses[troopType] || 0);
      }
    }
    const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId } });
    if (attackerNexus) {
      const returnData = {};
      for (const [troopType, survived] of Object.entries(attackerTroopReturns)) {
        returnData[troopType] = (attackerNexus[troopType] || 0) + survived;
      }
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
          controlReduced: overseerSurvived,
          remainingControl: newControlLevel,
        },
      },
    });

    console.log(
      `Combat resolved: Attack ${attack.id} - ${attackerWins ? 'Attacker' : 'Defender'} wins${conquered ? ' - NODE CONQUERED!' : ''}`,
    );
  } catch (err) {
    console.error('Error resolving combat:', err);
  }
}

export { processArrivedAttacks };
