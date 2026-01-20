import Attack from '../models/Attack.js';
import Node from '../models/Node.js';
import User from '../models/User.js';

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

// Process attacks that have arrived
async function processArrivedAttacks() {
  try {
    const now = new Date();
    const arrivedAttacks = await Attack.find({
      status: 'traveling',
      arrivesAt: { $lte: now },
    })
      .populate('attacker.village')
      .populate('defender.village');

    for (const attack of arrivedAttacks) {
      await resolveCombat(attack);
    }
  } catch (err) {
    console.error('Error processing attacks:', err);
  }
}

// Resolve combat
async function resolveCombat(attack) {
  try {
    const defenderVillage = await Node.findById(attack.defender.village);

    // Calculate attack and defense power
    let attackPower = 0;
    let defensePower = 0;

    // Attacker power
    for (const [troopType, count] of Object.entries(attack.troops)) {
      if (count > 0 && TROOP_STATS[troopType]) {
        attackPower += TROOP_STATS[troopType].attack * count;
      }
    }

    // Defender power (troops + wall bonus)
    for (const [troopType, count] of Object.entries(defenderVillage.troops)) {
      if (count > 0 && TROOP_STATS[troopType]) {
        defensePower += TROOP_STATS[troopType].defense * count;
      }
    }

    // Shield Grid bonus (2% per level)
    const wallBonus = 1 + defenderVillage.buildings.shieldGrid * 0.02;
    defensePower *= wallBonus;

    // Determine winner
    const attackerWins = attackPower > defensePower;
    const powerRatio = attackerWins ? defensePower / attackPower : attackPower / defensePower;

    // Calculate losses
    const attackerLosses = {};
    const defenderLosses = {};

    // Attacker losses (proportional to defense power with randomness)
    for (const [troopType, count] of Object.entries(attack.troops)) {
      if (count > 0 && TROOP_STATS[troopType]) {
        // Skip overseer in initial loss calculation
        if (troopType === 'overseer') {
          attackerLosses[troopType] = 0;
          continue;
        }

        const baseLossRate = attackerWins ? powerRatio * 0.5 : 0.8;
        // Add randomness: ±25% variation (0.75 to 1.25)
        const randomFactor = 0.75 + Math.random() * 0.5;
        // Weaker troops (lower defense) die more easily
        const defenseFactor = 1 + (50 - TROOP_STATS[troopType].defense) / 100;
        const lossRate = Math.min(baseLossRate * randomFactor * defenseFactor, 1);
        attackerLosses[troopType] = Math.max(0, Math.ceil(count * lossRate));
      }
    }

    // Check if all non overseer troops died, if so, overseer dies too
    const totalAttackTroops = Object.entries(attack.troops)
      .filter(([type]) => type !== 'overseer')
      .reduce((sum, [type, count]) => sum + count, 0);
    const totalAttackLosses = Object.entries(attackerLosses)
      .filter(([type]) => type !== 'overseer')
      .reduce((sum, [type, losses]) => sum + losses, 0);

    if (attack.troops.overseer > 0 && totalAttackTroops > 0 && totalAttackLosses >= totalAttackTroops) {
      // All troops died, overseer dies too
      attackerLosses.overseer = attack.troops.overseer;
    }

    // Defender losses (proportional to attack power with randomness)
    for (const [troopType, count] of Object.entries(defenderVillage.troops)) {
      if (count > 0 && TROOP_STATS[troopType]) {
        const baseLossRate = attackerWins ? 0.8 : powerRatio * 0.5;
        // Add randomness (±25%)
        const randomFactor = 0.75 + Math.random() * 0.5;
        // Weaker troops (lower defense) die more easily
        const defenseFactor = 1 + (50 - TROOP_STATS[troopType].defense) / 100;
        const lossRate = Math.min(baseLossRate * randomFactor * defenseFactor, 1);
        const losses = Math.min(Math.ceil(count * lossRate), count);
        defenderLosses[troopType] = losses;
        const currentTroops = defenderVillage.troops[troopType] || 0;
        defenderVillage.troops[troopType] = Math.max(0, currentTroops - losses);
        // Update population for lost troops
        defenderVillage.population.current = Math.max(0, defenderVillage.population.current - losses);
      }
    }

    // Calculate loot if attacker wins
    let resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
    let conquered = false;

    if (attackerWins) {
      // Calculate carry capacity based on troop stats
      let lootCapacity = 0;
      for (const [troopType, count] of Object.entries(attack.troops)) {
        if (count > 0 && TROOP_STATS[troopType]) {
          lootCapacity += TROOP_STATS[troopType].carry * count;
        }
      }

      const availableResources =
        defenderVillage.resources.biomass + defenderVillage.resources.alloy + defenderVillage.resources.ore;

      const lootPercentage = Math.min(lootCapacity / availableResources, 0.5);

      resourcesStolen.biomass = Math.floor(defenderVillage.resources.biomass * lootPercentage);
      resourcesStolen.alloy = Math.floor(defenderVillage.resources.alloy * lootPercentage);
      resourcesStolen.ore = Math.floor(defenderVillage.resources.ore * lootPercentage);

      // Deduct resources from defender
      defenderVillage.resources.biomass -= resourcesStolen.biomass;
      defenderVillage.resources.alloy -= resourcesStolen.alloy;
      defenderVillage.resources.ore -= resourcesStolen.ore;

      // Add resources to attacker (if troops survived to carry it back)
      const attackerVillage = await Node.findById(attack.attacker.village);
      const survivingCarryCapacity =
        lootCapacity *
        (1 -
          Object.values(attackerLosses).reduce((a, b) => a + b, 0) /
            Object.values(attack.troops).reduce((a, b) => a + b, 0));
      const actualLoot = Math.min(
        resourcesStolen.biomass + resourcesStolen.alloy + resourcesStolen.ore,
        survivingCarryCapacity,
      );

      if (actualLoot > 0) {
        const lootRatio = actualLoot / (resourcesStolen.biomass + resourcesStolen.alloy + resourcesStolen.ore);
        attackerVillage.resources.biomass += Math.floor(resourcesStolen.biomass * lootRatio);
        attackerVillage.resources.alloy += Math.floor(resourcesStolen.alloy * lootRatio);
        attackerVillage.resources.ore += Math.floor(resourcesStolen.ore * lootRatio);
        await attackerVillage.save();
      }
    }

    // Handle node conquest if overseer is present and attacker wins
    if (attackerWins && attack.troops.overseer > 0 && (attackerLosses.overseer || 0) < attack.troops.overseer) {
      // Overseer survived, reduce control level by 50 (takes 2 attacks to conquer)
      defenderVillage.controlLevel = Math.max(0, (defenderVillage.controlLevel || 100) - 50);

      if (defenderVillage.controlLevel === 0) {
        // Node conquered! Transfer ownership
        const attackerVillage = await Node.findById(attack.attacker.village);
        const oldOwner = await User.findById(defenderVillage.owner);
        const newOwner = await User.findById(attackerVillage.owner);

        // Remove from old owner
        if (oldOwner) {
          oldOwner.villages = oldOwner.villages.filter((v) => !v.equals(defenderVillage._id));
          await oldOwner.save();
        }

        // Add to new owner
        if (newOwner) {
          newOwner.villages.push(defenderVillage._id);
          await newOwner.save();
        }

        // Transfer ownership
        defenderVillage.owner = attackerVillage.owner;
        // Reset control
        defenderVillage.controlLevel = 100;
        defenderVillage.name = `Conquered Node`;
        conquered = true;
      }
    }

    // Save defender village with updated control level
    await defenderVillage.save();

    // Return surviving troops to attacker village
    const attackerVillage = await Node.findById(attack.attacker.village);
    if (attackerVillage) {
      for (const [troopType, count] of Object.entries(attack.troops)) {
        if (count > 0) {
          const survived = count - (attackerLosses[troopType] || 0);
          attackerVillage.troops[troopType] = (attackerVillage.troops[troopType] || 0) + survived;
        }
      }
      await attackerVillage.save();
    }

    // Update attack with results
    attack.status = 'completed';
    attack.result = {
      attackerLosses,
      defenderLosses,
      resourcesStolen,
      victory: attackerWins,
      conquered: conquered,
      controlReduced: Boolean(
        attackerWins && attack.troops.overseer > 0 && (attackerLosses.overseer || 0) < attack.troops.overseer,
      ),
      remainingControl: defenderVillage.controlLevel,
    };
    await attack.save();

    console.log(
      `Combat resolved: Attack ${attack._id} - ${attackerWins ? 'Attacker' : 'Defender'} wins${
        conquered ? ' - NODE CONQUERED!' : ''
      }`,
    );
    console.log('Result saved to database:', JSON.stringify(attack.result, null, 2));
  } catch (err) {
    console.error('Error resolving combat:', err);
  }
}

export { processArrivedAttacks };
