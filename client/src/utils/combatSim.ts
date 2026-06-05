// Deterministic combat simulator.
//
// Pure function: same (seed, forces, targetingCoreLevel, shieldGrid) → same timeline.
// Used by the client to render watchable battle replays from a stored seed.
//
// The server uses combatMath.ts to determine the *final* losses; this sim
// produces a per-round timeline that converges to those exact same totals.
// We anchor the simulation to the server-known final losses so replays are
// always faithful, variance is purely visual sequencing.

export type TroopKey =
	| 'sentinelLancer'
	| 'assaultTrooper'
	| 'vanguardBreaker'
	| 'reconOperative'
	| 'wraithSkimmer'
	| 'bulwarkGuard'
	| 'aegisSkirmisher'
	| 'pyreSuppressor'
	| 'arcDisruptor'
	| 'phantomLance'
	| 'siegeMech'
	| 'annihilatorPlatform'
	| 'voidStalker'
	| 'plasmaTurret'
	| 'siegeColossus'
	| 'overseer';

export type TroopClass = 'mobile' | 'armor' | 'fire' | 'special';

export const TROOP_CLASS: Record<TroopKey, TroopClass> = {
	sentinelLancer: 'fire',
	assaultTrooper: 'armor',
	vanguardBreaker: 'mobile',
	reconOperative: 'special',
	wraithSkimmer: 'mobile',
	bulwarkGuard: 'armor',
	aegisSkirmisher: 'mobile',
	pyreSuppressor: 'fire',
	arcDisruptor: 'fire',
	phantomLance: 'mobile',
	siegeMech: 'armor',
	annihilatorPlatform: 'fire',
	voidStalker: 'mobile',
	plasmaTurret: 'fire',
	siegeColossus: 'armor',
	overseer: 'special'
};

// Mirror of server combatMath TROOP_STATS (v0.22 symmetric-triangle rebalance).
// Strikers = high attack / low defense; anvils = high defense / low attack.
// Every class has an anvil so every attacker has an equal-resource answer on
// defense. Keep in lockstep with server/utils/combatMath.ts.
export const TROOP_STATS: Record<TroopKey, { attack: number; defense: number; speed: number }> = {
	sentinelLancer: { attack: 28, defense: 14, speed: 20 },
	assaultTrooper: { attack: 16, defense: 30, speed: 16 },
	vanguardBreaker: { attack: 32, defense: 14, speed: 16 },
	reconOperative: { attack: 1, defense: 20, speed: 25 },
	wraithSkimmer: { attack: 105, defense: 22, speed: 22 },
	bulwarkGuard: { attack: 18, defense: 90, speed: 12 },
	aegisSkirmisher: { attack: 34, defense: 64, speed: 24 },
	pyreSuppressor: { attack: 80, defense: 20, speed: 15 },
	arcDisruptor: { attack: 55, defense: 95, speed: 17 },
	phantomLance: { attack: 125, defense: 26, speed: 28 },
	siegeMech: { attack: 70, defense: 215, speed: 10 },
	annihilatorPlatform: { attack: 360, defense: 55, speed: 8 },
	voidStalker: { attack: 215, defense: 36, speed: 32 },
	plasmaTurret: { attack: 0, defense: 340, speed: 0 },
	siegeColossus: { attack: 300, defense: 130, speed: 6 },
	overseer: { attack: 0, defense: 8, speed: 15 }
};

export const CLASS_COUNTERS: Record<TroopClass, Record<TroopClass, number>> = {
	mobile: { mobile: 1.0, armor: 1.35, fire: 0.75, special: 1.0 },
	armor: { mobile: 0.75, armor: 1.0, fire: 1.35, special: 1.0 },
	fire: { mobile: 1.35, armor: 0.75, fire: 1.0, special: 1.0 },
	special: { mobile: 1.0, armor: 1.0, fire: 1.0, special: 1.0 }
};

// Defender-side counter spread (milder than the attack side's 1.35/0.75 so the
// attacker keeps a slight initiative). Mirror of server combatMath
// DEF_COUNTER_ADVANTAGE / DEF_COUNTER_DISADVANTAGE.
export const DEF_COUNTER_ADVANTAGE = 1.25;
export const DEF_COUNTER_DISADVANTAGE = 0.8;
export function defenderCounterMultiplier(baseAttackMult: number): number {
	if (baseAttackMult > 1.0) return DEF_COUNTER_ADVANTAGE;
	if (baseAttackMult < 1.0) return DEF_COUNTER_DISADVANTAGE;
	return 1.0;
}

// Per-level Shield Grid bonus to defensive power. Mirror of server combat.ts
// (trimmed 0.02 → 0.015 in v0.22 alongside symmetric defense).
export const SHIELD_GRID_DEFENSE_PER_LEVEL = 0.015;

export const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

// Carry capacity per unit — mirrors server combatMath TROOP_STATS.carry. Used by
// the predictive calculator's loot estimate. Kept here (the replay sim doesn't
// need carry) so the calculator has a single client-side source.
export const TROOP_CARRY: Record<TroopKey, number> = {
	sentinelLancer: 30,
	assaultTrooper: 60,
	vanguardBreaker: 40,
	reconOperative: 10,
	wraithSkimmer: 80,
	bulwarkGuard: 25,
	aegisSkirmisher: 30,
	pyreSuppressor: 20,
	arcDisruptor: 25,
	phantomLance: 100,
	siegeMech: 20,
	annihilatorPlatform: 250,
	voidStalker: 60,
	plasmaTurret: 0,
	siegeColossus: 150,
	overseer: 0
};

// Mirror of LOOT_CARRY_THRESHOLD / loss-rate constants in server combat.ts +
// combatMath.ts. If those change, change these in the same commit.
export const LOOT_CARRY_THRESHOLD = 8000;
export const WINNER_MAX_LOSS_RATE = 0.45; // coin-flip cap; mirrors server WINNER_COINFLIP_LOSS_RATE
export const LOSER_MIN_LOSS_RATE = 0.85;
export const LOSER_MAX_LOSS_RATE = 1.0;
// At or below this loser/winner power ratio the loss is a total wipe (0
// survivors). Mirrors server combatMath LOSER_WIPE_RATIO — keep in sync.
export const LOSER_WIPE_RATIO = 0.33;

// Fraction of the losing force destroyed, given the loser/winner power ratio.
// Mirrors server combatMath loserLossRate so the calculator's prediction matches
// the resolved battle: a blowout (ratio <= LOSER_WIPE_RATIO) is a 100% wipe.
export function loserLossRate(powerRatio: number): number {
	const clamped = Math.max(0, Math.min(1, powerRatio));
	if (clamped <= LOSER_WIPE_RATIO) return 1.0;
	const t = (clamped - LOSER_WIPE_RATIO) / (1 - LOSER_WIPE_RATIO);
	return LOSER_MAX_LOSS_RATE + (LOSER_MIN_LOSS_RATE - LOSER_MAX_LOSS_RATE) * t;
}

// ─── Deterministic PRNG ───────────────────────────────────────────────────
// Mulberry32, fast, decent distribution, fully reproducible from a u32 seed.
export function mulberry32(seed: number) {
	let s = seed >>> 0;
	return function rand(): number {
		s = (s + 0x6d2b79f5) >>> 0;
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
	const counts: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
	let total = 0;
	for (const k of TROOP_KEYS) {
		const n = force[k] || 0;
		if (n > 0) {
			counts[TROOP_CLASS[k]] += n;
			total += n;
		}
	}
	if (total === 0) return counts;
	for (const c of ['mobile', 'armor', 'fire', 'special'] as TroopClass[]) counts[c] /= total;
	return counts;
}

// ─── Class-weighted attack (mirror of server combatMath) ───────────────────
// targetingCoreLevel amplifies counter advantage above 1.0 (and slightly deepens
// disadvantage) up to +30% at Lv20. Mirrors computeClassWeightedAttack.
export function classWeightedAttack(attackers: Force, defenders: Force, targetingCoreLevel = 0): number {
	const defComp: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
	let totalDef = 0;
	for (const k of TROOP_KEYS) {
		const n = defenders[k] || 0;
		if (n > 0) {
			defComp[TROOP_CLASS[k]] += n;
			totalDef += n;
		}
	}
	const targetingCoreBonus = Math.min(targetingCoreLevel * 0.015, 0.3);
	let total = 0;
	for (const k of TROOP_KEYS) {
		const n = attackers[k] || 0;
		if (n <= 0) continue;
		let mult = 1.0;
		if (totalDef > 0) {
			let weighted = 0;
			for (const dc of ['mobile', 'armor', 'fire', 'special'] as TroopClass[]) {
				const ratio = defComp[dc] / totalDef;
				const base = CLASS_COUNTERS[TROOP_CLASS[k]][dc];
				const amp = base > 1.0 ? base + targetingCoreBonus : base < 1.0 ? base - targetingCoreBonus * 0.5 : 1.0;
				weighted += ratio * amp;
			}
			mult = weighted;
		}
		total += n * TROOP_STATS[k].attack * mult;
	}
	return total;
}

// Class-weighted DEFENSE (mirror of server computeClassWeightedDefense). A
// defender whose class counters the attacker composition has its defense
// amplified (×1.25) and one being countered loses some (×0.80). Defense does
// NOT take the Targeting Core amplifier — Targeting Core is an offensive building.
export function classWeightedDefense(defenders: Force, attackers: Force): number {
	const attComp: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
	let totalAtt = 0;
	for (const k of TROOP_KEYS) {
		const n = attackers[k] || 0;
		if (n > 0) {
			attComp[TROOP_CLASS[k]] += n;
			totalAtt += n;
		}
	}
	let total = 0;
	for (const k of TROOP_KEYS) {
		const n = defenders[k] || 0;
		if (n <= 0) continue;
		let mult = 1.0;
		if (totalAtt > 0) {
			let weighted = 0;
			for (const ac of ['mobile', 'armor', 'fire', 'special'] as TroopClass[]) {
				const ratio = attComp[ac] / totalAtt;
				weighted += ratio * defenderCounterMultiplier(CLASS_COUNTERS[TROOP_CLASS[k]][ac]);
			}
			mult = weighted;
		}
		total += n * TROOP_STATS[k].defense * mult;
	}
	return total;
}

export interface CombatPrediction {
	attackerWins: boolean;
	conquerCapable: boolean; // would this strike clear the garrison (enable conquest)?
	attackPower: number;
	defensePower: number;
	powerRatio: number; // loser/winner, 0..1 — how close it was
	attackerLossPct: number; // 0..1 estimated
	defenderLossPct: number; // 0..1 estimated
	estLootCapacity: number; // surviving carry
	marginLabel: 'blowout' | 'decisive' | 'close' | 'coinflip';
}

// Forward prediction mirroring resolveCombat's outcome + loss model. Estimates
// are deterministic averages (no per-unit variance) so the calculator shows the
// expected result, not a single rolled outcome.
export function predictCombat(opts: {
	attacker: Force;
	defender: Force;
	attackerTargetingCore?: number;
	defenderShieldGrid?: number;
	shieldEfficiencyMultiplier?: number; // 2 for Military Outpost, etc.
}): CombatPrediction {
	const {
		attacker,
		defender,
		attackerTargetingCore = 0,
		defenderShieldGrid = 0,
		shieldEfficiencyMultiplier = 1
	} = opts;

	const attackPower = classWeightedAttack(attacker, defender, attackerTargetingCore);
	// Symmetric triangle: defense is class-weighted against the attacker too
	// (mirror of server resolveCombat), then amplified by the Shield Grid.
	let defensePower = classWeightedDefense(defender, attacker);
	defensePower *= 1 + defenderShieldGrid * SHIELD_GRID_DEFENSE_PER_LEVEL * shieldEfficiencyMultiplier;

	const defenderUnits = totalUnits(defender);
	const attackerUnits = totalUnits(attacker);
	const defenderHasNoTroops = defenderUnits === 0;
	const attackerWins = attackPower > defensePower || (defenderHasNoTroops && attackerUnits > 0);

	const powerRatio = attackerWins
		? Math.min(1, defensePower / Math.max(1, attackPower))
		: Math.min(1, attackPower / Math.max(1, defensePower));

	const winnerLossRate = Math.min(WINNER_MAX_LOSS_RATE, powerRatio * WINNER_MAX_LOSS_RATE);
	const loserRate = loserLossRate(powerRatio);

	const attackerLossPct = attackerWins ? winnerLossRate : loserRate;
	const defenderLossPct = attackerWins ? loserRate : winnerLossRate;

	// Conquest needs the garrison fully cleared. That only happens on a decisive
	// win — a blowout (ratio <= LOSER_WIPE_RATIO) wipes the defender to 0.
	const conquerCapable = attackerWins && (defenderHasNoTroops || defenderLossPct >= 0.999);

	// Loot estimate: surviving carry vs the 8k threshold.
	let carry = 0;
	for (const k of TROOP_KEYS) carry += (attacker[k] || 0) * TROOP_CARRY[k];
	const estLootCapacity = attackerWins ? carry * (1 - attackerLossPct) : 0;

	let marginLabel: CombatPrediction['marginLabel'];
	if (powerRatio < 0.4) marginLabel = 'blowout';
	else if (powerRatio < 0.7) marginLabel = 'decisive';
	else if (powerRatio < 0.9) marginLabel = 'close';
	else marginLabel = 'coinflip';

	return {
		attackerWins,
		conquerCapable,
		attackPower,
		defensePower,
		powerRatio,
		attackerLossPct,
		defenderLossPct,
		estLootCapacity,
		marginLabel
	};
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
	unit: TroopKey; // attacking unit type
	target: TroopKey; // unit type being damaged
	count: number; // how many of `target` were destroyed this hit
	multiplier: number; // class-counter multiplier applied
	critical: boolean; // counter advantage triggered
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
	// Phase tag, drives camera/animation choices
	phase: 'engage' | 'clash' | 'rout' | 'final';
}

export interface SimResult {
	rounds: SimRound[];
	attackerInitial: Force;
	defenderInitial: Force;
	attackerFinal: Force;
	defenderFinal: Force;
	attackerLosses: Force; // final totals
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
function distributeBucket(
	total: number,
	rounds: number,
	curve: number[],
	rand: () => number
): number[] {
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
		attackerLossPerRound[k] = distributeBucket(
			aTotal,
			ROUNDS,
			lossCurve(ROUNDS, attackerLost),
			rand
		);
		defenderLossPerRound[k] = distributeBucket(
			dTotal,
			ROUNDS,
			lossCurve(ROUNDS, defenderLost),
			rand
		);
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
			phase
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
		totalRounds: ROUNDS
	};
}

// Pair attackers with their preferred targets for a satisfying kill feed.
// Weighted toward counter-advantage matchups.
function generateHits(
	attackerInitial: Force,
	defenderInitial: Force,
	attackerLostThisRound: Force,
	defenderLostThisRound: Force,
	rand: () => number
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
			critical: mult >= 1.3
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
			critical: mult >= 1.3
		});
	}

	// Deterministic shuffle for cinematic order, then cap
	hits.sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || b.count - a.count);
	return hits.slice(0, 8);
}

// Among the friendly force, pick the unit type with the biggest counter advantage
// against `target`. Ties broken by raw attack stat × count, then by PRNG.
function pickBestAttacker(
	target: TroopKey,
	friendlyForce: Force,
	rand: () => number
): TroopKey | null {
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
