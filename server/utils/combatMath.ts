import type { TroopKey, TroopStat } from '../types/index.js';

// Unit classes drive the rock-paper-scissors counter system.
// mobile → beats armor  (fast assault forces exploit armor gaps)
// armor  → beats fire   (armored units close distance and suppress emplacements)
// fire   → beats mobile (suppression fire pins fast movers)
// special → no combat advantage (recon/overseer roles - they don't fight)
export type TroopClass = 'mobile' | 'armor' | 'fire' | 'special';

export const TROOP_CLASS: Record<TroopKey, TroopClass> = {
  lancerDrone:          'fire',
  assaultTrooper:       'armor',
  breakerUnit:          'mobile',
  reconOperative:       'special',
  skimmerBike:          'mobile',
  bulwarkGuard:         'armor',
  suppressorTeam:       'fire',
  disruptorUnit:        'fire',
  interceptorBike:      'mobile',
  siegeMech:            'armor',
  annihilatorPlatform:  'fire',
  voidStalker:          'mobile',
  plasmaTurret:         'fire',
  overseer:             'special',
};

// Counter matrix: CLASS_COUNTERS[attackerClass][defenderClass] = damage multiplier.
// 1.0 = neutral, 1.35 = advantage, 0.75 = disadvantage.
// Triangle: mobile > armor > fire > mobile. Special is neutral in all matchups.
export const CLASS_COUNTERS: Record<TroopClass, Record<TroopClass, number>> = {
  mobile:  { mobile: 1.0,  armor: 1.35, fire: 0.75,  special: 1.0 },
  armor:   { mobile: 0.75, armor: 1.0,  fire: 1.35,  special: 1.0 },
  fire:    { mobile: 1.35, armor: 0.75, fire: 1.0,   special: 1.0 },
  special: { mobile: 1.0,  armor: 1.0,  fire: 1.0,   special: 1.0 },
};

export const TROOP_STATS: Record<TroopKey, TroopStat> = {
  lancerDrone:          { attack: 12,  defense: 22,  speed: 20, carry: 30  },
  assaultTrooper:       { attack: 18,  defense: 45,  speed: 18, carry: 60  },
  breakerUnit:          { attack: 55,  defense: 10,  speed: 16, carry: 60  },
  reconOperative:       { attack: 5,   defense: 20,  speed: 25, carry: 10  },
  skimmerBike:          { attack: 80,  defense: 40,  speed: 22, carry: 80  },
  bulwarkGuard:         { attack: 10,  defense: 130, speed: 12, carry: 25  },
  suppressorTeam:       { attack: 65,  defense: 30,  speed: 15, carry: 20  },
  disruptorUnit:        { attack: 75,  defense: 35,  speed: 17, carry: 25  },
  interceptorBike:      { attack: 95,  defense: 50,  speed: 28, carry: 100 },
  siegeMech:            { attack: 80,  defense: 210, speed: 10, carry: 20  },
  annihilatorPlatform:  { attack: 210, defense: 80,  speed: 8,  carry: 160 },
  voidStalker:          { attack: 110, defense: 32,  speed: 32, carry: 40  },
  plasmaTurret:         { attack: 0,   defense: 160, speed: 0,  carry: 0   },
  overseer:             { attack: 0,   defense: 30,  speed: 15, carry: 0   },
};

const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

export function computeTroopTotal(force: Partial<Record<TroopKey, number>>, includeOverseer = true): number {
  return TROOP_KEYS
    .filter((t) => includeOverseer || t !== 'overseer')
    .reduce((sum, t) => sum + (force[t] || 0), 0);
}

export function areAllDefendingTroopsEliminated(
  defenderForce: Partial<Record<TroopKey, number>>,
  defenderLosses: Partial<Record<TroopKey, number>>,
): boolean {
  const totalDefenders = computeTroopTotal(defenderForce, true);
  if (totalDefenders === 0) return true;
  const totalLost = TROOP_KEYS.reduce((sum, t) => sum + Math.min(defenderForce[t] || 0, defenderLosses[t] || 0), 0);
  return totalLost >= totalDefenders;
}

// Compute raw force power (attack or defense), used for outcome determination.
export function computeForcePower(
  forceTroops: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  statKey: keyof TroopStat,
): number {
  return TROOP_KEYS.reduce((sum, troopType) => {
    const count = Number((forceTroops as Record<string, unknown>)[troopType] || 0);
    const stat = TROOP_STATS[troopType]?.[statKey] || 0;
    return sum + count * stat;
  }, 0);
}

// Compute class-weighted attack power of an attacker force against a defender force.
// armoryLevel amplifies counter bonuses beyond 1.0 by (armoryLevel * 0.015) each.
export function computeClassWeightedAttack(
  attackers: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  defenders: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  armoryLevel: number = 0,
): number {
  // Build defender class composition ratios
  const defenderClassCounts: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
  for (const key of TROOP_KEYS) {
    const count = Number((defenders as Record<string, unknown>)[key] || 0);
    if (count > 0) defenderClassCounts[TROOP_CLASS[key]] += count;
  }
  const totalDefenders = Object.values(defenderClassCounts).reduce((a, b) => a + b, 0);

  const armoryBonus = Math.min(armoryLevel * 0.015, 0.3); // cap at +30% extra bonus at lv20

  let totalAttack = 0;
  for (const key of TROOP_KEYS) {
    const count = Number((attackers as Record<string, unknown>)[key] || 0);
    if (count <= 0) continue;
    const stat = TROOP_STATS[key].attack;
    const attackerClass = TROOP_CLASS[key];

    // Weighted average of counter multipliers against defender composition
    let effectiveMultiplier = 1.0;
    if (totalDefenders > 0) {
      let weightedMult = 0;
      for (const defClass of ['mobile', 'armor', 'fire', 'special'] as TroopClass[]) {
        const ratio = defenderClassCounts[defClass] / totalDefenders;
        const baseMult = CLASS_COUNTERS[attackerClass][defClass];
        // Amplify counter advantage/disadvantage with armory bonus
        const amplifiedMult = baseMult > 1.0
          ? baseMult + armoryBonus
          : baseMult < 1.0
            ? baseMult - armoryBonus * 0.5
            : 1.0;
        weightedMult += ratio * amplifiedMult;
      }
      effectiveMultiplier = weightedMult;
    }

    totalAttack += count * stat * effectiveMultiplier;
  }
  return totalAttack;
}

// Compute per-unit loss count for a force that lost the engagement.
//
// The loss rate scales with how badly the side lost (powerRatio =
// loser_power / winner_power, in (0, 1]):
//   - a decisive blowout (ratio <= LOSER_WIPE_RATIO) wipes the ENTIRE force —
//     no survivors. A 15:1 fight leaving a few stragglers alive never made
//     sense; a crushing victory is now a total annihilation.
//   - between the wipe threshold and an even fight, losses scale from 100%
//     down to LOSER_MIN_LOSS_RATE, so only genuinely close fights leave a
//     remnant.
//   - a near-even loss (ratio -> 1) still costs LOSER_MIN_LOSS_RATE, leaving a
//     real remnant that can limp home.
//
// powerRatio defaults to 0 so existing callers that don't pass it (and the
// genuine "no resistance" case) keep total-wipe behaviour.
export const LOSER_MIN_LOSS_RATE = 0.85; // floor at an even loss
export const LOSER_MAX_LOSS_RATE = 1.0;  // a blowout
// At or below this loser/winner power ratio the loss is a total wipe (0
// survivors). 0.33 ≈ a 3:1 power advantage. Anything more lopsided than this
// annihilates the losing army outright.
export const LOSER_WIPE_RATIO = 0.33;

// Winner's loss rate at a coin-flip (powerRatio -> 1); scales down to 0 for a
// blowout. See computeLossesForWinner for the full rationale.
export const WINNER_COINFLIP_LOSS_RATE = 0.45;

// Map a loser/winner power ratio to the fraction of the losing force destroyed.
// Shared by server resolution and the client calculator so predictions match.
export function loserLossRate(powerRatio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, powerRatio));
  if (clampedRatio <= LOSER_WIPE_RATIO) return 1.0;
  // Linearly interpolate from total wipe (at the threshold) up to the even-fight
  // floor (at ratio = 1).
  const t = (clampedRatio - LOSER_WIPE_RATIO) / (1 - LOSER_WIPE_RATIO); // 0..1
  return LOSER_MAX_LOSS_RATE + (LOSER_MIN_LOSS_RATE - LOSER_MAX_LOSS_RATE) * t;
}

export function computeLossesForLoser(
  force: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  powerRatio = 0,
): Partial<Record<TroopKey, number>> {
  const lossRate = loserLossRate(powerRatio);
  const totalWipe = lossRate >= 1.0;

  const losses: Partial<Record<TroopKey, number>> = {};
  for (const key of TROOP_KEYS) {
    if (key === 'overseer') continue;
    const count = Number((force as Record<string, unknown>)[key] || 0);
    if (count <= 0) continue;
    // On a total wipe destroy every unit. Otherwise ceil so a lost engagement
    // always costs at least one of each present unit; clamp to the actual count
    // so we never report more losses than exist.
    losses[key] = totalWipe ? count : Math.min(count, Math.ceil(count * lossRate));
  }
  return losses;
}

// Compute per-unit loss count for a force that WON the engagement.
//
// Two factors modulate the per-unit loss rate on top of baseLossRate:
//   1. defFactor . higher defense stat = lower loss rate. /600 divisor makes
//      the spread between a Breaker Unit (def 10) and a Siege Mech (def 210)
//      meaningful (~10pp survival difference). The earlier /1200 divisor
//      compressed every unit into a ~5pp band, so "tank" units didn't feel
//      meaningfully tankier than glass cannons in reports.
//   2. matchupFactor . per-unit class advantage against the opposing force's
//      composition. Armor sent into a Fire-heavy enemy now takes fewer
//      casualties (the counter triangle helps you survive, not just kill).
//      Reuses the same composition-weighting style as computeClassWeightedAttack
//      so attack power and survival both react to class matchup consistently.
//      The factor is much milder than the attack-side multiplier (.85x to
//      1.15x) so it nudges feel without dominating the loss math.
export function computeLossesForWinner(
  force: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  powerRatio: number, // loser_power / winner_power, always <= 1
  seed: number,
  opposingForce: Partial<Record<TroopKey, number>> | Record<string, unknown> = {},
): Partial<Record<TroopKey, number>> {
  const losses: Partial<Record<TroopKey, number>> = {};
  let prng = seed ^ 0xdeadbeef;
  const lcg = () => {
    prng = (prng * 1664525 + 1013904223) & 0xffffffff;
    return (prng >>> 0) / 4294967296;
  };

  // When powerRatio is 0 (defender had no troops), the attacker walked in
  // unopposed - they lose nothing. Scale linearly from 0 up to a meaningful cap.
  // baseLossRate: 0% at ratio=0, up to ~45% at ratio=1 (evenly matched win).
  //
  // The cap was 30%, which made winning a coin-flip nearly as cheap as a
  // blowout and removed the tension from army-vs-army fights — there was almost
  // no downside to attacking a force of comparable strength. 45% makes a
  // near-even victory a genuine Pyrrhic cost (you win, but bleed badly) while
  // dominant wins (low ratio) stay cheap, preserving the power-advantage
  // fantasy. Pairs with the softened loser curve so the win/lose gradient is
  // smooth rather than a "win = safe, lose = dead" cliff.
  const baseLossRate = Math.min(WINNER_COINFLIP_LOSS_RATE, powerRatio * WINNER_COINFLIP_LOSS_RATE);

  // No resistance at all — skip variance so positive noise can't manufacture losses.
  if (powerRatio === 0) return losses;

  // Build opposing-force class composition once so the per-unit loop just looks
  // up matchupFactor instead of re-summing for every troop type.
  const opposingClassCounts: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
  for (const key of TROOP_KEYS) {
    const count = Number((opposingForce as Record<string, unknown>)[key] || 0);
    if (count > 0) opposingClassCounts[TROOP_CLASS[key]] += count;
  }
  const totalOpposing = Object.values(opposingClassCounts).reduce((a, b) => a + b, 0);

  for (const key of TROOP_KEYS) {
    if (key === 'overseer') continue;
    const count = Number((force as Record<string, unknown>)[key] || 0);
    if (count <= 0) continue;

    const varianceMagnitude = count < 20 ? 0.10 : count < 200 ? 0.05 : 0.03;
    const variance = (lcg() - 0.5) * 2 * varianceMagnitude;

    const defFactor = 1 - (TROOP_STATS[key].defense / 600);

    // Class matchup: weighted average of CLASS_COUNTERS against the opposing
    // composition, then mapped to a survival modifier centered at 1.0.
    // counterMult > 1.0 = unit has advantage = survives better = matchupFactor < 1.0
    // counterMult < 1.0 = unit has disadvantage = takes more losses = matchupFactor > 1.0
    let matchupFactor = 1.0;
    if (totalOpposing > 0) {
      const myClass = TROOP_CLASS[key];
      let weightedCounter = 0;
      for (const oppClass of ['mobile', 'armor', 'fire', 'special'] as TroopClass[]) {
        const ratio = opposingClassCounts[oppClass] / totalOpposing;
        weightedCounter += ratio * CLASS_COUNTERS[myClass][oppClass];
      }
      // weightedCounter sits in roughly [0.75, 1.35]. Invert and dampen so the
      // survival modifier lands in a controlled [0.85, 1.15] window . class
      // matchup nudges loss rate without dominating it.
      matchupFactor = Math.max(0.85, Math.min(1.15, 2.0 - weightedCounter));
    }

    const rawRate = Math.min(0.50, Math.max(0, baseLossRate * defFactor * matchupFactor + variance));
    losses[key] = Math.max(0, Math.ceil(count * rawRate));
  }
  return losses;
}
