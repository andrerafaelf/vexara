import type { Attack } from '../types/game';

export interface CombatRound {
  round: number;
  attackerForce: Record<string, number>;
  defenderForce: Record<string, number>;
  attackerLostThisRound: Record<string, number>;
  defenderLostThisRound: Record<string, number>;
  attackPower: number;
  defensePower: number;
  event: string | null;
}

export interface CombatReplay {
  rounds: CombatRound[];
  totalRounds: number;
  attackerInitial: Record<string, number>;
  defenderInitial: Record<string, number>;
  attackerFinal: Record<string, number>;
  defenderFinal: Record<string, number>;
  victory: boolean;
  conquered: boolean;
  resourcesStolen: { biomass: number; alloy: number; ore: number };
}

const TROOP_ATTACK: Record<string, number> = {
  lancerDrone: 15,
  assaultTrooper: 30,
  breakerUnit: 55,
  reconOperative: 5,
  skimmerBike: 80,
  bulwarkGuard: 20,
  suppressorTeam: 65,
  disruptorUnit: 75,
  interceptorBike: 95,
  siegeMech: 150,
  annihilatorPlatform: 210,
  voidStalker: 110,
  plasmaTurret: 180,
  overseer: 0,
};

const TROOP_DEFENSE: Record<string, number> = {
  lancerDrone: 28,
  assaultTrooper: 45,
  breakerUnit: 15,
  reconOperative: 20,
  skimmerBike: 65,
  bulwarkGuard: 130,
  suppressorTeam: 45,
  disruptorUnit: 55,
  interceptorBike: 75,
  siegeMech: 210,
  annihilatorPlatform: 140,
  voidStalker: 50,
  plasmaTurret: 90,
  overseer: 30,
};

function forcePower(troops: Record<string, number>, stat: Record<string, number>): number {
  return Object.entries(troops).reduce((sum, [type, count]) => sum + count * (stat[type] ?? 0), 0);
}

function clone(obj: Record<string, number>): Record<string, number> {
  return { ...obj };
}

function distributeOverRounds(
  totalLosses: Record<string, number>,
  numRounds: number,
): Record<string, number>[] {
  const rounds: Record<string, number>[] = Array.from({ length: numRounds }, () => ({}));
  for (const [type, total] of Object.entries(totalLosses)) {
    if (!total) continue;
    let remaining = total;
    for (let i = 0; i < numRounds; i++) {
      // Concentrate losses in early/middle rounds (combat accelerates as one side gains advantage)
      const weight = numRounds - i;
      const totalWeight = ((numRounds + 1) * numRounds) / 2;
      const share = i === numRounds - 1 ? remaining : Math.round((total * weight) / totalWeight);
      const actual = Math.min(share, remaining);
      rounds[i][type] = actual;
      remaining -= actual;
    }
  }
  return rounds;
}

export function deriveReplay(report: Attack): CombatReplay | null {
  if (report.type === 'scout' || report.result?.mission === 'scout') return null;
  if (!report.result?.attackerLosses || !report.result?.defenderLosses) return null;

  const attackerInitial: Record<string, number> = {};
  for (const [k, v] of Object.entries(report.troops)) {
    if (v > 0) attackerInitial[k] = v;
  }

  // Defender initial = their final survivors + what they lost
  const defenderLosses = report.result.defenderLosses;
  // We don't know exact defender starting counts, but we know losses and result.
  // Estimate defender initial from losses, if defender won, they kept most troops.
  // We can only reconstruct losses, so defender initial is losses (minimum visible force).
  const defenderInitial: Record<string, number> = {};
  for (const [k, v] of Object.entries(defenderLosses)) {
    if ((v ?? 0) > 0) defenderInitial[k] = v as number;
  }

  const attackerLosses: Record<string, number> = {};
  for (const [k, v] of Object.entries(report.result.attackerLosses ?? {})) {
    if ((v ?? 0) > 0) attackerLosses[k] = v as number;
    else if (report.result.conquered && k === 'overseer' && (report.troops.overseer ?? 0) > 0) {
      attackerLosses[k] = report.troops.overseer;
    }
  }
  if (report.result.conquered && (report.troops.overseer ?? 0) > 0 && !attackerLosses.overseer) {
    attackerLosses.overseer = report.troops.overseer;
  }

  const ROUNDS = 5;

  const attackerLossPerRound = distributeOverRounds(attackerLosses, ROUNDS);
  const defenderLossPerRound = distributeOverRounds(defenderLosses as Record<string, number>, ROUNDS);

  const attackerCurrent = clone(attackerInitial);
  const defenderCurrent = clone(defenderInitial);

  const rounds: CombatRound[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const aLost = attackerLossPerRound[i];
    const dLost = defenderLossPerRound[i];

    // Apply losses
    for (const [type, lost] of Object.entries(aLost)) {
      attackerCurrent[type] = Math.max(0, (attackerCurrent[type] ?? 0) - lost);
    }
    for (const [type, lost] of Object.entries(dLost)) {
      defenderCurrent[type] = Math.max(0, (defenderCurrent[type] ?? 0) - lost);
    }

    const aPow = forcePower(attackerCurrent, TROOP_ATTACK);
    const dPow = forcePower(defenderCurrent, TROOP_DEFENSE);

    let event: string | null = null;
    if (i === ROUNDS - 1) {
      if (report.result.conquered) {
        event = 'NEXUS CONQUERED';
      } else if (report.result.victory) {
        event = 'Attacker victorious';
      } else {
        event = 'Defense holds';
      }
    } else if (i === Math.floor(ROUNDS / 2)) {
      const ratio = aPow / (dPow + 1);
      if (ratio > 1.5) event = 'Attackers overwhelm defenses';
      else if (ratio < 0.67) event = 'Defenders repel the assault';
    }

    rounds.push({
      round: i + 1,
      attackerForce: clone(attackerCurrent),
      defenderForce: clone(defenderCurrent),
      attackerLostThisRound: aLost,
      defenderLostThisRound: dLost,
      attackPower: aPow,
      defensePower: dPow,
      event,
    });
  }

  const attackerFinal: Record<string, number> = {};
  for (const [k, v] of Object.entries(report.troops)) {
    const lost = (report.result.attackerLosses?.[k] ?? 0) as number;
    const survived = v - lost;
    if (survived > 0) attackerFinal[k] = survived;
  }

  const defenderFinal: Record<string, number> = {};
  // Defender final = we only know losses; survivors are unknown
  for (const [k, v] of Object.entries(defenderLosses)) {
    defenderFinal[k] = 0; // show as depleted
  }

  return {
    rounds,
    totalRounds: ROUNDS,
    attackerInitial,
    defenderInitial,
    attackerFinal,
    defenderFinal,
    victory: report.result.victory,
    conquered: report.result.conquered ?? false,
    resourcesStolen: report.result.resourcesStolen ?? { biomass: 0, alloy: 0, ore: 0 },
  };
}
