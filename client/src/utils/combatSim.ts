// Deterministic combat simulator.
//
// Pure function: same (seed, forces, armoryLevel, shieldGrid) → same timeline.
// Used by the client to render watchable battle replays from a stored seed.
//
// The server uses combatMath.ts to determine the *final* losses; this sim
// produces a per-round timeline that converges to those exact same totals.
// We anchor the simulation to the server-known final losses so replays are
// always faithful — variance is purely visual sequencing.

export type TroopKey =
  | 'lancerDrone' | 'assaultTrooper' | 'breakerUnit' | 'reconOperative'
  | 'skimmerBike' | 'bulwarkGuard' | 'suppressorTeam' | 'disruptorUnit'
  | 'interceptorBike' | 'siegeMech' | 'annihilatorPlatform'
  | 'voidStalker' | 'plasmaTurret' | 'overseer';

export type TroopClass = 'light' | 'heavy' | 'ranged' | 'special';

export const TROOP_CLASS: Record<TroopKey, TroopClass> = {
  lancerDrone: 'ranged', assaultTrooper: 'heavy', breakerUnit: 'light',
  reconOperative: 'special', skimmerBike: 'light', bulwarkGuard: 'heavy',
  suppressorTeam: 'ranged', disruptorUnit: 'ranged', interceptorBike: 'light',
  siegeMech: 'heavy', annihilatorPlatform: 'ranged',
  voidStalker: 'light', plasmaTurret: 'ranged', overseer: 'special',
};

export const TROOP_STATS: Record<TroopKey, { attack: number; defense: number; speed: number }> = {
  lancerDrone:          { attack: 15,  defense: 28,  speed: 20 },
  assaultTrooper:       { attack: 30,  defense: 45,  speed: 18 },
  breakerUnit:          { attack: 55,  defense: 15,  speed: 16 },
  reconOperative:       { attack: 5,   defense: 20,  speed: 25 },
  skimmerBike:          { attack: 80,  defense: 65,  speed: 22 },
  bulwarkGuard:         { attack: 20,  defense: 130, speed: 12 },
  suppressorTeam:       { attack: 65,  defense: 45,  speed: 15 },
  disruptorUnit:        { attack: 75,  defense: 55,  speed: 17 },
  interceptorBike:      { attack: 95,  defense: 75,  speed: 28 },
  siegeMech:            { attack: 150, defense: 210, speed: 10 },
  annihilatorPlatform:  { attack: 210, defense: 140, speed: 8  },
  voidStalker:          { attack: 110, defense: 50,  speed: 32 },
  plasmaTurret:         { attack: 180, defense: 90,  speed: 0  },
  overseer:             { attack: 0,   defense: 30,  speed: 15 },
};

export const CLASS_COUNTERS: Record<TroopClass, Record<TroopClass, number>> = {
  light:   { light: 1.0, heavy: 1.35, ranged: 0.75, special: 1.0 },
  heavy:   { light: 0.75, heavy: 1.0, ranged: 1.0,  special: 1.35 },
  ranged:  { light: 1.35, heavy: 0.80, ranged: 1.0,  special: 1.0 },
  special: { light: 1.0, heavy: 1.0,  ranged: 1.0,  special: 1.0 },
};

export const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

// ─── Deterministic PRNG ───────────────────────────────────────────────────
// Mulberry32 — fast, decent distribution, fully reproducible from a u32 seed.
export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function rand(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Force helpers ────────────────────────────────────────────────────────
export type Force = Partial<Record<TroopKey, number>>;

export function forcePower(force: Force, stat: 'attack' | 'defense'): number {
  let total = 0;
  for (const k of TROOP_KEYS) {
    const n = force[k] || 0;
    if (n > 0) total += n * TROOP_STATS[k][stat];
  }
  return total;
}

export function totalUnits(force: Force): number {
  let total = 0;
  for (const k of TROOP_KEYS) total += force[k] || 0;
  return total;
}

export function cloneForce(force: Force): Force {
  const out: Force = {};
  for (const k of TROOP_KEYS) if ((force[k] || 0) > 0) out[k] = force[k];
  return out;
}

// Class composition: returns ratio of total units in each class.
export function classComposition(force: Force): Record<TroopClass, number> {
  const counts: Record<TroopClass, number> = { light: 0, heavy: 0, ranged: 0, special: 0 };
  let total = 0;
  for (const k of TROOP_KEYS) {
    const n = force[k] || 0;
    if (n > 0) { counts[TROOP_CLASS[k]] += n; total += n; }
  }
  if (total === 0) return counts;
  for (const c of ['light', 'heavy', 'ranged', 'special'] as TroopClass[]) counts[c] /= total;
  return counts;
}

// ─── Round-by-round simulation ────────────────────────────────────────────
//
// Approach:
// 1. Compute *total* losses (deterministic, server-authoritative).
// 2. Distribute losses across N rounds using a deterministic curve.
//    - Early rounds: probing, light losses
//    - Middle rounds: peak engagement, heavy losses
//    - Final round: cleanup, remainder
// 3. Per round, also compute which unit types are doing damage (for hits log).

export interface CombatHit {
  side: 'attacker' | 'defender';
  unit: TroopKey;            // attacking unit type
  target: TroopKey;          // unit type being damaged
  count: number;             // how many of `target` were destroyed this hit
  multiplier: number;        // class-counter multiplier applied
  critical: boolean;         // counter advantage triggered
}

export interface SimRound {
  round: number;
  // Full force state after this round's losses are applied
  attackerForce: Force;
  defenderForce: Force;
  // Per-side, per-unit losses *this round*
  attackerLost: Force;
  defenderLost: Force;
  // Aggregate power readings at end of round
  attackerPower: number;
  defenderPower: number;
  // Highlighted hits (for floating damage numbers, kill feed)
  hits: CombatHit[];
  // Optional cinematic event banner
  event: string | null;
  // Phase tag — drives camera/animation choices
  phase: 'engage' | 'clash' | 'rout' | 'final';
}

export interface SimResult {
  rounds: SimRound[];
  attackerInitial: Force;
  defenderInitial: Force;
  attackerFinal: Force;
  defenderFinal: Force;
  attackerLosses: Force;     // final totals
  defenderLosses: Force;
  attackerPowerInitial: number;
  defenderPowerInitial: number;
  victory: boolean;
  conquered: boolean;
  seed: number;
  totalRounds: number;
}

export interface SimulateInput {
  attackerInitial: Force;
  defenderInitial: Force;
  attackerLosses: Force;
  defenderLosses: Force;
  seed: number;
  victory: boolean;
  conquered?: boolean;
  totalRounds?: number;
}

// Deterministic distribution that sums *exactly* to total, using a falloff curve.
// curve[i] is the share weight for round i.
function distributeBucket(total: number, rounds: number, curve: number[], rand: () => number): number[] {
  if (total === 0) return new Array(rounds).fill(0);
  const sumCurve = curve.reduce((a, b) => a + b, 0);
  const raw = curve.map((w) => (w / sumCurve) * total);
  // Round each to nearest int, accumulate residual, fix off-by-one on last positive bucket
  const out = raw.map((v) => Math.floor(v));
  let remainder = total - out.reduce((a, b) => a + b, 0);
  // Distribute remainder with a deterministic random tie-break across rounds with raw fractional parts
  const idxs = raw
    .map((v, i) => ({ frac: v - Math.floor(v), i, jitter: rand() }))
    .sort((a, b) => b.frac - a.frac || b.jitter - a.jitter);
  for (let k = 0; k < idxs.length && remainder > 0; k++) {
    out[idxs[k].i]++;
    remainder--;
  }
  return out;
}

// Distribute total losses across rounds with a "bell-skewed" curve:
// light start, heavy middle, sharper end-of-engagement spike for the losing side.
function lossCurve(rounds: number, losingSide: boolean): number[] {
  const curve: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t = (i + 0.5) / rounds; // 0..1
    // Bell centered at 0.55 (middle-late)
    const bell = Math.exp(-Math.pow((t - 0.55) / 0.28, 2));
    // Loser has a sharper spike at the end (rout)
    const routSpike = losingSide ? Math.pow(t, 4) * 0.8 : 0;
    curve.push(bell + routSpike + 0.05); // 0.05 floor so all rounds get some activity
  }
  return curve;
}

export function simulateBattle(input: SimulateInput): SimResult {
  const ROUNDS = input.totalRounds ?? 7;
  const rand = mulberry32(input.seed);

  const attackerInitial = cloneForce(input.attackerInitial);
  const defenderInitial = cloneForce(input.defenderInitial);

  // Per-troop loss distribution across rounds
  const attackerLossPerRound: Record<TroopKey, number[]> = {} as Record<TroopKey, number[]>;
  const defenderLossPerRound: Record<TroopKey, number[]> = {} as Record<TroopKey, number[]>;

  const attackerLost = !input.victory;
  const defenderLost = input.victory;

  for (const k of TROOP_KEYS) {
    const aTotal = input.attackerLosses[k] || 0;
    const dTotal = input.defenderLosses[k] || 0;
    attackerLossPerRound[k] = distributeBucket(aTotal, ROUNDS, lossCurve(ROUNDS, attackerLost), rand);
    defenderLossPerRound[k] = distributeBucket(dTotal, ROUNDS, lossCurve(ROUNDS, defenderLost), rand);
  }

  const attackerCurrent = cloneForce(attackerInitial);
  const defenderCurrent = cloneForce(defenderInitial);

  const attackerPowerInitial = forcePower(attackerInitial, 'attack');
  const defenderPowerInitial = forcePower(defenderInitial, 'defense');

  const rounds: SimRound[] = [];

  for (let r = 0; r < ROUNDS; r++) {
    const aLost: Force = {};
    const dLost: Force = {};
    for (const k of TROOP_KEYS) {
      const a = attackerLossPerRound[k][r];
      const d = defenderLossPerRound[k][r];
      if (a > 0) aLost[k] = a;
      if (d > 0) dLost[k] = d;
    }

    // Apply losses, clamped
    for (const k of TROOP_KEYS) {
      if (aLost[k]) attackerCurrent[k] = Math.max(0, (attackerCurrent[k] || 0) - (aLost[k] || 0));
      if (dLost[k]) defenderCurrent[k] = Math.max(0, (defenderCurrent[k] || 0) - (dLost[k] || 0));
    }

    const aPow = forcePower(attackerCurrent, 'attack');
    const dPow = forcePower(defenderCurrent, 'defense');

    // Generate up to 6 "hits" for the kill feed: each hit pairs a damaging unit type
    // with a target unit type, weighted by counter advantage.
    const hits = generateHits(attackerInitial, defenderInitial, aLost, dLost, rand);

    // Phase + event banner
    let phase: SimRound['phase'] = 'engage';
    if (r === 0) phase = 'engage';
    else if (r === ROUNDS - 1) phase = 'final';
    else if (r >= ROUNDS - 2) phase = 'rout';
    else phase = 'clash';

    let event: string | null = null;
    if (r === 0) {
      event = 'Forces engage';
    } else if (r === Math.floor(ROUNDS / 2)) {
      const ratio = aPow / Math.max(1, dPow);
      if (ratio > 1.6) event = 'Defenses crumbling';
      else if (ratio < 0.6) event = 'Defenders hold the line';
      else event = 'Fierce exchange';
    } else if (r === ROUNDS - 1) {
      if (input.conquered) event = 'NEXUS CONQUERED';
      else if (input.victory) event = 'Defenses overrun';
      else event = 'Attack repelled';
    }

    rounds.push({
      round: r + 1,
      attackerForce: cloneForce(attackerCurrent),
      defenderForce: cloneForce(defenderCurrent),
      attackerLost: aLost,
      defenderLost: dLost,
      attackerPower: aPow,
      defenderPower: dPow,
      hits,
      event,
      phase,
    });
  }

  const attackerFinal = cloneForce(attackerCurrent);
  const defenderFinal = cloneForce(defenderCurrent);

  return {
    rounds,
    attackerInitial,
    defenderInitial,
    attackerFinal,
    defenderFinal,
    attackerLosses: cloneForce(input.attackerLosses),
    defenderLosses: cloneForce(input.defenderLosses),
    attackerPowerInitial,
    defenderPowerInitial,
    victory: input.victory,
    conquered: input.conquered ?? false,
    seed: input.seed,
    totalRounds: ROUNDS,
  };
}

// Pair attackers with their preferred targets for a satisfying kill feed.
// Weighted toward counter-advantage matchups.
function generateHits(
  attackerInitial: Force,
  defenderInitial: Force,
  attackerLostThisRound: Force,
  defenderLostThisRound: Force,
  rand: () => number,
): CombatHit[] {
  const hits: CombatHit[] = [];

  // Defender losses come from attacker units.
  const dlEntries = Object.entries(defenderLostThisRound) as [TroopKey, number][];
  for (const [targetUnit, lostCount] of dlEntries) {
    if (!lostCount || lostCount <= 0) continue;
    const attacker = pickBestAttacker(targetUnit, attackerInitial, rand);
    if (!attacker) continue;
    const mult = CLASS_COUNTERS[TROOP_CLASS[attacker]][TROOP_CLASS[targetUnit]];
    hits.push({
      side: 'attacker',
      unit: attacker,
      target: targetUnit,
      count: lostCount,
      multiplier: mult,
      critical: mult >= 1.3,
    });
  }

  // Attacker losses come from defender units.
  const alEntries = Object.entries(attackerLostThisRound) as [TroopKey, number][];
  for (const [targetUnit, lostCount] of alEntries) {
    if (!lostCount || lostCount <= 0) continue;
    const attacker = pickBestAttacker(targetUnit, defenderInitial, rand);
    if (!attacker) continue;
    const mult = CLASS_COUNTERS[TROOP_CLASS[attacker]][TROOP_CLASS[targetUnit]];
    hits.push({
      side: 'defender',
      unit: attacker,
      target: targetUnit,
      count: lostCount,
      multiplier: mult,
      critical: mult >= 1.3,
    });
  }

  // Deterministic shuffle for cinematic order, then cap
  hits.sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || b.count - a.count);
  return hits.slice(0, 8);
}

// Among the friendly force, pick the unit type with the biggest counter advantage
// against `target`. Ties broken by raw attack stat × count, then by PRNG.
function pickBestAttacker(target: TroopKey, friendlyForce: Force, rand: () => number): TroopKey | null {
  const targetClass = TROOP_CLASS[target];
  let best: { key: TroopKey; score: number; jitter: number } | null = null;
  for (const k of TROOP_KEYS) {
    const count = friendlyForce[k] || 0;
    if (count <= 0) continue;
    const mult = CLASS_COUNTERS[TROOP_CLASS[k]][targetClass];
    const score = mult * TROOP_STATS[k].attack * count;
    const jitter = rand();
    if (!best || score > best.score || (score === best.score && jitter > best.jitter)) {
      best = { key: k, score, jitter };
    }
  }
  return best?.key ?? null;
}
