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
// Uses the opposing side's attack power distributed against each unit's defense.
// Variance shrinks as stack size grows (law of large numbers feel).
export function computeLossesForLoser(
  force: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  powerRatio: number, // winner_power / loser_power, always >= 1
  seed: number,       // deterministic seed for reproducibility
): Partial<Record<TroopKey, number>> {
  const losses: Partial<Record<TroopKey, number>> = {};
  let prng = seed;
  const lcg = () => {
    prng = (prng * 1664525 + 1013904223) & 0xffffffff;
    return (prng >>> 0) / 4294967296;
  };

  // Base loss rate scales with how badly they lost. At powerRatio=1 (evenly
  // matched loss) ~50%; at ratio=2 (badly outmatched) ~75%; capped at 90%.
  const baseLossRate = Math.min(0.90, 0.50 + (powerRatio - 1) * 0.20);

  for (const key of TROOP_KEYS) {
    if (key === 'overseer') continue;
    const count = Number((force as Record<string, unknown>)[key] || 0);
    if (count <= 0) continue;

    // Variance: ±10% for small stacks (<20), ±5% for large stacks (>200)
    const varianceMagnitude = count < 20 ? 0.10 : count < 200 ? 0.06 : 0.03;
    const variance = (lcg() - 0.5) * 2 * varianceMagnitude;

    // Higher defense stat = more survivable; higher defense → lower loss rate.
    // defSurvivalBonus ranges 0..0.35 (max defense 210 of 600 scale).
    const defSurvivalBonus = TROOP_STATS[key].defense / 600;
    const rawRate = Math.min(0.95, Math.max(0.05, baseLossRate * (1 - defSurvivalBonus * 0.5) + variance));
    losses[key] = Math.max(0, Math.ceil(count * rawRate));
  }
  return losses;
}

// Compute per-unit loss count for a force that WON the engagement.
export function computeLossesForWinner(
  force: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  powerRatio: number, // loser_power / winner_power, always <= 1
  seed: number,
): Partial<Record<TroopKey, number>> {
  const losses: Partial<Record<TroopKey, number>> = {};
  let prng = seed ^ 0xdeadbeef;
  const lcg = () => {
    prng = (prng * 1664525 + 1013904223) & 0xffffffff;
    return (prng >>> 0) / 4294967296;
  };

  // When powerRatio is 0 (defender had no troops), the attacker walked in
  // unopposed - they lose nothing. Scale linearly from 0 up to a meaningful cap.
  // baseLossRate: 0% at ratio=0, up to ~30% at ratio=1 (evenly matched win).
  // 30% makes a coin-flip victory feel genuinely costly without punishing dominant wins.
  const baseLossRate = Math.min(0.30, powerRatio * 0.30);

  // No resistance at all — skip variance so positive noise can't manufacture losses.
  if (powerRatio === 0) return losses;

  for (const key of TROOP_KEYS) {
    if (key === 'overseer') continue;
    const count = Number((force as Record<string, unknown>)[key] || 0);
    if (count <= 0) continue;

    const varianceMagnitude = count < 20 ? 0.10 : count < 200 ? 0.05 : 0.03;
    const variance = (lcg() - 0.5) * 2 * varianceMagnitude;

    // Higher defense stat = more survivable; scale loss down proportionally.
    // Using /1200 (half-weight) so tanky units still benefit but not excessively -
    // a Siege Mech (def 210) reduces its loss rate by ~17% rather than ~35%.
    const defFactor = 1 - (TROOP_STATS[key].defense / 1200);
    const rawRate = Math.min(0.50, Math.max(0, baseLossRate * defFactor + variance));
    losses[key] = Math.max(0, Math.ceil(count * rawRate));
  }
  return losses;
}
