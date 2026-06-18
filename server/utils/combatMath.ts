import type { TroopKey, TroopStat } from '../types/index.js';

// Unit classes drive the rock-paper-scissors counter system.
// mobile → beats armor  (fast assault forces exploit armor gaps)
// armor  → beats fire   (armored units close distance and suppress emplacements)
// fire   → beats mobile (suppression fire pins fast movers)
// special → no combat advantage (recon/overseer roles - they don't fight)
export type TroopClass = 'mobile' | 'armor' | 'fire' | 'special';

export const TROOP_CLASS: Record<TroopKey, TroopClass> = {
	sentinelLancer: 'fire',
	assaultTrooper: 'armor',
	vanguardBreaker: 'mobile',
	reconOperative: 'special',
	wraithSkimmer: 'mobile',
	bulwarkGuard: 'armor',
	pyreSuppressor: 'fire',
	arcDisruptor: 'fire',
	phantomLance: 'mobile',
	siegeMech: 'armor',
	annihilatorPlatform: 'fire',
	voidStalker: 'mobile',
	plasmaTurret: 'fire',
	overseer: 'special',
	siegeColossus: 'armor',
	aegisSkirmisher: 'mobile'
};

// Counter matrix: CLASS_COUNTERS[attackerClass][defenderClass] = damage multiplier.
// 1.0 = neutral, 1.35 = advantage, 0.75 = disadvantage.
// Triangle: mobile > armor > fire > mobile. Special is neutral in all matchups.
export const CLASS_COUNTERS: Record<TroopClass, Record<TroopClass, number>> = {
	mobile: { mobile: 1.0, armor: 1.35, fire: 0.75, special: 1.0 },
	armor: { mobile: 0.75, armor: 1.0, fire: 1.35, special: 1.0 },
	fire: { mobile: 1.35, armor: 0.75, fire: 1.0, special: 1.0 },
	special: { mobile: 1.0, armor: 1.0, fire: 1.0, special: 1.0 }
};

// Defender-side counter multipliers. The triangle is now SYMMETRIC: a defender
// whose class counters the incoming attacker gets its defense amplified, and a
// defender being countered loses some defensive value. We use a SMALLER spread
// than the attack side (1.25 / 0.80 vs 1.35 / 0.75) on purpose — it preserves a
// slight "attacker initiative" so a defender can't win a mirror just by sitting
// still, while still making the right garrison composition matter enormously.
// Special is neutral both ways. Mirrors the client combatSim DEF_COUNTER_* knobs.
export const DEF_COUNTER_ADVANTAGE = 1.25;
export const DEF_COUNTER_DISADVANTAGE = 0.8;
export function defenderCounterMultiplier(baseAttackMult: number): number {
	if (baseAttackMult > 1.0) return DEF_COUNTER_ADVANTAGE;
	if (baseAttackMult < 1.0) return DEF_COUNTER_DISADVANTAGE;
	return 1.0;
}

// ── Combat rebalance (v0.22): symmetric-triangle stat matrix ────────────────
// With the counter triangle now applied to BOTH attack and defense, raw stats
// were re-tuned so the COUNTER (not a unit's raw stat lead) decides equal-
// resource fights. The roster is organised by class × role:
//
//   STRIKERS  – high attack, low defense. Their job is to deal damage; the
//               triangle rewards them when they hit the class they counter.
//   ANVILS    – high defense, low attack. Their job is to hold a nexus; the
//               triangle rewards them when they defend against the class they
//               counter. EVERY class has an anvil so every attacker has an
//               equal-resource answer on defense:
//                 armor anvils → Assault Trooper / Bulwark Guard / Siege Mech
//                 mobile anvil → Aegis Skirmisher
//                 fire anvils  → Arc Disruptor (EMP) / Plasma Turret (static)
//
// Attack-per-pop rises with tier (T1<T2<T3) so cheap-unit spam is never the
// optimal late-game army. Glass-cannon strikers make TERRIBLE garrisons by
// design — defend with anvils, attack with strikers, and scout so you bring the
// class that counters what you find. Keep in lockstep with client combatSim.ts.
export const TROOP_STATS: Record<TroopKey, TroopStat> = {
	// ── Tier 1 (pop 1) — cheap openers ──
	// Attack deliberately trimmed (~-20% vs the first rebalance draft) so T1
	// resource-efficiency sits CLEARLY below T2/T3. Resources are abundant early,
	// so without this gap cheap-unit spam stayed near-optimal in the early-mid
	// window before population/training caps bind. T1 still wins its counter
	// matchups — it's just no longer a substitute for teching up.
	sentinelLancer: { attack: 28, defense: 14, speed: 20, carry: 30 }, // fire striker
	assaultTrooper: { attack: 16, defense: 30, speed: 16, carry: 60 }, // armor anvil
	vanguardBreaker: { attack: 32, defense: 14, speed: 16, carry: 40 }, // mobile striker
	reconOperative: { attack: 1, defense: 20, speed: 50, carry: 10 }, // scout (special)
	// ── Tier 2 (pop 2-3) — workhorses ──
	pyreSuppressor: { attack: 80, defense: 20, speed: 15, carry: 20 }, // fire striker
	wraithSkimmer: { attack: 105, defense: 22, speed: 22, carry: 80 }, // mobile striker
	bulwarkGuard: { attack: 18, defense: 90, speed: 12, carry: 25 }, // armor anvil
	// Aegis Skirmisher: the MOBILE-class anvil. High defense + speed lets it
	// intercept incoming Armor attackers (mobile counters armor on defense).
	// Defensive-first — modest attack so it's not a hybrid raider.
	aegisSkirmisher: { attack: 34, defense: 64, speed: 24, carry: 30 },
	// Arc Disruptor reworked into the T2 FIRE-class anvil (EMP interceptor). Fire
	// counters Mobile, so this is the mid-game answer to mobile raiders that the
	// old glass-cannon Arc could never be. Hybrid defense lead, modest attack.
	arcDisruptor: { attack: 55, defense: 95, speed: 17, carry: 25 },
	phantomLance: { attack: 125, defense: 26, speed: 28, carry: 100 }, // mobile raider
	// ── Tier 3 (pop 3-5) — endgame ──
	voidStalker: { attack: 215, defense: 36, speed: 32, carry: 60 }, // mobile striker (fastest)
	siegeMech: { attack: 70, defense: 215, speed: 10, carry: 20 }, // armor anvil (the great wall)
	// Plasma Turret: static FIRE emplacement and the heavy anti-mobile anchor.
	// Highest single-unit defense; can't leave the nexus that built it.
	plasmaTurret: { attack: 0, defense: 340, speed: 0, carry: 0 },
	annihilatorPlatform: { attack: 360, defense: 55, speed: 8, carry: 250 }, // fire artillery striker
	overseer: { attack: 0, defense: 8, speed: 15, carry: 0 }, // conquest (special)
	// Siege Colossus: T3 ARMOR striker — the siege hammer. High attack with
	// enough defense to survive its own assault; armor counters fire on the way
	// in. Paired with the Annihilator as the elite siege duo.
	siegeColossus: { attack: 300, defense: 130, speed: 6, carry: 150 }
};

const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

export function computeTroopTotal(
	force: Partial<Record<TroopKey, number>>,
	includeOverseer = true
): number {
	return TROOP_KEYS.filter((t) => includeOverseer || t !== 'overseer').reduce(
		(sum, t) => sum + (force[t] || 0),
		0
	);
}

export function areAllDefendingTroopsEliminated(
	defenderForce: Partial<Record<TroopKey, number>>,
	defenderLosses: Partial<Record<TroopKey, number>>
): boolean {
	const totalDefenders = computeTroopTotal(defenderForce, true);
	if (totalDefenders === 0) return true;
	const totalLost = TROOP_KEYS.reduce(
		(sum, t) => sum + Math.min(defenderForce[t] || 0, defenderLosses[t] || 0),
		0
	);
	return totalLost >= totalDefenders;
}

// Compute raw force power (attack or defense), used for outcome determination.
export function computeForcePower(
	forceTroops: Partial<Record<TroopKey, number>> | Record<string, unknown>,
	statKey: keyof TroopStat
): number {
	return TROOP_KEYS.reduce((sum, troopType) => {
		const count = Number((forceTroops as Record<string, unknown>)[troopType] || 0);
		const stat = TROOP_STATS[troopType]?.[statKey] || 0;
		return sum + count * stat;
	}, 0);
}

// Compute class-weighted attack power of an attacker force against a defender force.
// targetingCoreLevel amplifies counter bonuses beyond 1.0 by (targetingCoreLevel * 0.015) each.
export function computeClassWeightedAttack(
	attackers: Partial<Record<TroopKey, number>> | Record<string, unknown>,
	defenders: Partial<Record<TroopKey, number>> | Record<string, unknown>,
	targetingCoreLevel: number = 0
): number {
	// Build defender class composition ratios
	const defenderClassCounts: Record<TroopClass, number> = {
		mobile: 0,
		armor: 0,
		fire: 0,
		special: 0
	};
	for (const key of TROOP_KEYS) {
		const count = Number((defenders as Record<string, unknown>)[key] || 0);
		if (count > 0) defenderClassCounts[TROOP_CLASS[key]] += count;
	}
	const totalDefenders = Object.values(defenderClassCounts).reduce((a, b) => a + b, 0);

	const targetingCoreBonus = Math.min(targetingCoreLevel * 0.015, 0.3); // cap at +30% extra bonus at lv20

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
				// Amplify counter advantage/disadvantage with Targeting Core bonus
				const amplifiedMult =
					baseMult > 1.0
						? baseMult + targetingCoreBonus
						: baseMult < 1.0
							? baseMult - targetingCoreBonus * 0.5
							: 1.0;
				weightedMult += ratio * amplifiedMult;
			}
			effectiveMultiplier = weightedMult;
		}

		totalAttack += count * stat * effectiveMultiplier;
	}
	return totalAttack;
}

// Compute class-weighted DEFENSE power of a defender force against an attacker
// force. Symmetric counterpart to computeClassWeightedAttack: a defender whose
// class counters the attacker composition has its defense amplified, and one
// being countered loses some. Uses the (milder) DEF_COUNTER_* spread so the
// triangle decides composition fights without erasing attacker initiative.
//
// Unlike the attack side, defense does NOT take the Targeting Core amplifier — the
// Targeting Core is an offensive building (it sharpens YOUR strikes), so leaving the
// defender out of it keeps the building's identity clear and preserves the
// existing "attacker invests in Targeting Core" lever.
export function computeClassWeightedDefense(
	defenders: Partial<Record<TroopKey, number>> | Record<string, unknown>,
	attackers: Partial<Record<TroopKey, number>> | Record<string, unknown>
): number {
	// Build attacker class composition ratios.
	const attackerClassCounts: Record<TroopClass, number> = {
		mobile: 0,
		armor: 0,
		fire: 0,
		special: 0
	};
	for (const key of TROOP_KEYS) {
		const count = Number((attackers as Record<string, unknown>)[key] || 0);
		if (count > 0) attackerClassCounts[TROOP_CLASS[key]] += count;
	}
	const totalAttackers = Object.values(attackerClassCounts).reduce((a, b) => a + b, 0);

	let totalDefense = 0;
	for (const key of TROOP_KEYS) {
		const count = Number((defenders as Record<string, unknown>)[key] || 0);
		if (count <= 0) continue;
		const stat = TROOP_STATS[key].defense;
		const defenderClass = TROOP_CLASS[key];

		// Weighted average of the defender's counter multipliers against the
		// attacker composition.
		let effectiveMultiplier = 1.0;
		if (totalAttackers > 0) {
			let weightedMult = 0;
			for (const attClass of ['mobile', 'armor', 'fire', 'special'] as TroopClass[]) {
				const ratio = attackerClassCounts[attClass] / totalAttackers;
				const baseMult = CLASS_COUNTERS[defenderClass][attClass];
				weightedMult += ratio * defenderCounterMultiplier(baseMult);
			}
			effectiveMultiplier = weightedMult;
		}

		totalDefense += count * stat * effectiveMultiplier;
	}
	return totalDefense;
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
export const LOSER_MAX_LOSS_RATE = 1.0; // a blowout
// At or below this loser/winner power ratio the loss is a total wipe (0
// survivors). 0.33 ≈ a 3:1 power advantage. Anything more lopsided than this
// annihilates the losing army outright.
export const LOSER_WIPE_RATIO = 0.33;

// Winner's loss rate at a coin-flip (powerRatio -> 1); scales down to 0 for a
// blowout. See computeLossesForWinner for the full rationale.
export const WINNER_COINFLIP_LOSS_RATE = 0.45;

// Map a loser/winner power ratio to the fraction of the losing force destroyed.
// Shared by server resolution and the client calculator so predictions match.
//
// survivorFloor (0..1, default 0) is an optional EXTRA guarantee on top of the
// normal curve: the caller (combat.ts) derives it from the defender's
// post-protection taper window via getProtectionTaperSurvivorFloor. It can
// only ever lower the returned loss rate, never raise it — a floor of 0
// reproduces the exact pre-existing behaviour.
export function loserLossRate(powerRatio: number, survivorFloor = 0): number {
	const clampedRatio = Math.max(0, Math.min(1, powerRatio));
	const clampedFloor = Math.max(0, Math.min(1, survivorFloor));
	let rate: number;
	if (clampedRatio <= LOSER_WIPE_RATIO) {
		rate = 1.0;
	} else {
		// Linearly interpolate from total wipe (at the threshold) up to the
		// even-fight floor (at ratio = 1).
		const t = (clampedRatio - LOSER_WIPE_RATIO) / (1 - LOSER_WIPE_RATIO); // 0..1
		rate = LOSER_MAX_LOSS_RATE + (LOSER_MIN_LOSS_RATE - LOSER_MAX_LOSS_RATE) * t;
	}
	if (clampedFloor <= 0) return rate;
	return Math.min(rate, 1 - clampedFloor);
}

export function computeLossesForLoser(
	force: Partial<Record<TroopKey, number>> | Record<string, unknown>,
	powerRatio = 0,
	survivorFloor = 0
): Partial<Record<TroopKey, number>> {
	const lossRate = loserLossRate(powerRatio, survivorFloor);
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

type ResourceAmounts = { biomass: number; alloy: number; ore: number };

export function computeLootStolen(
	resources: ResourceAmounts,
	survivingCarry: number,
	lootableFraction = 1
): ResourceAmounts {
	const safeCarry = Math.max(0, Math.floor(survivingCarry || 0));
	const safeFraction = Math.max(0, Math.min(1, lootableFraction || 0));
	const lootable = {
		biomass: Math.max(0, Math.floor((resources.biomass || 0) * safeFraction)),
		alloy: Math.max(0, Math.floor((resources.alloy || 0) * safeFraction)),
		ore: Math.max(0, Math.floor((resources.ore || 0) * safeFraction))
	};
	const totalLootable = lootable.biomass + lootable.alloy + lootable.ore;
	const targetTotal = Math.min(safeCarry, totalLootable);

	if (targetTotal <= 0 || totalLootable <= 0) {
		return { biomass: 0, alloy: 0, ore: 0 };
	}

	const raw = {
		biomass: (lootable.biomass / totalLootable) * targetTotal,
		alloy: (lootable.alloy / totalLootable) * targetTotal,
		ore: (lootable.ore / totalLootable) * targetTotal
	};
	const stolen = {
		biomass: Math.min(lootable.biomass, Math.floor(raw.biomass)),
		alloy: Math.min(lootable.alloy, Math.floor(raw.alloy)),
		ore: Math.min(lootable.ore, Math.floor(raw.ore))
	};
	let remainder = targetTotal - stolen.biomass - stolen.alloy - stolen.ore;

	const order = (['biomass', 'alloy', 'ore'] as const)
		.map((key) => ({ key, fraction: raw[key] - Math.floor(raw[key]) }))
		.sort((a, b) => b.fraction - a.fraction);
	for (const { key } of order) {
		if (remainder <= 0) break;
		const room = lootable[key] - stolen[key];
		if (room <= 0) continue;
		const add = Math.min(room, remainder);
		stolen[key] += add;
		remainder -= add;
	}

	return stolen;
}

// Compute per-unit loss count for a force that WON the engagement.
//
// Two factors modulate the per-unit loss rate on top of baseLossRate:
//   1. defFactor . higher defense stat = lower loss rate. /250 divisor (with a
//      0.1 floor) makes defense a real economic lever for attackers: glass
//      cannons bleed ~99% of the base rate, mid units bleed ~85-95%, and
//      true tanks (Bulwark, Siege Mech) drop to 10-50% — so endgame anvil
//      units genuinely survive their own victories instead of being treated
//      almost the same as a Breaker Unit on the winning side.
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
	opposingForce: Partial<Record<TroopKey, number>> | Record<string, unknown> = {}
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
	const opposingClassCounts: Record<TroopClass, number> = {
		mobile: 0,
		armor: 0,
		fire: 0,
		special: 0
	};
	for (const key of TROOP_KEYS) {
		const count = Number((opposingForce as Record<string, unknown>)[key] || 0);
		if (count > 0) opposingClassCounts[TROOP_CLASS[key]] += count;
	}
	const totalOpposing = Object.values(opposingClassCounts).reduce((a, b) => a + b, 0);

	for (const key of TROOP_KEYS) {
		if (key === 'overseer') continue;
		const count = Number((force as Record<string, unknown>)[key] || 0);
		if (count <= 0) continue;

		const varianceMagnitude = count < 20 ? 0.1 : count < 200 ? 0.05 : 0.03;
		// Multiplicative jitter (1 ± magnitude), NOT an additive ± on the rate.
		// Additive variance manufactured losses out of nothing: against a near-
		// powerless attacker baseLossRate is ~0, but a positive additive term still
		// produced losses = count * (+variance) — e.g. a lone Breaker Unit "killing"
		// 22 of a 1181 Assault Trooper garrison. Scaling the rate instead means a
		// ~0 base stays ~0 regardless of the roll, while real losses still jitter.
		const varianceMult = 1 + (lcg() - 0.5) * 2 * varianceMagnitude;

		const defFactor = Math.max(0.1, 1 - TROOP_STATS[key].defense / 250);

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

		const rawRate = Math.min(
			0.5,
			Math.max(0, baseLossRate * defFactor * matchupFactor * varianceMult)
		);
		// Round (not ceil): a winner facing a near-powerless attacker should be able
		// to take ZERO losses on a unit type. Ceil forced >=1 loss of every type for
		// any positive rate, so a lone Breaker Unit still "killed" one of each
		// defender. Round means <0.5 expected losses -> 0, while real attrition
		// (>=0.5 expected) still costs the unit. The loser's losses keep ceil (you
		// always pay for a fight you lost); only the winner gets this softer floor.
		losses[key] = Math.max(0, Math.round(count * rawRate));
	}
	return losses;
}

/**
 * Coordinated Assault PR2 — split a per-troop-type loss total across the
 * participants in a merged combat, proportional to each participant's
 * contribution of that troop type.
 *
 * Conservation invariant (the conservation property test asserts this):
 *   for every troop type k: sum_i(out[i][k]) === totalLosses[k]
 *
 * Algorithm: largest-remainder rounding. Each participant first absorbs
 * floor(share). Any leftover (totalLosses[k] - sum of floors) is distributed
 * one unit at a time to participants in descending order of fractional
 * remainder. Stable tiebreak by index so the function is deterministic.
 *
 * Each participant is also clamped to its own contribution: a participant who
 * brought 5 of a unit can never lose more than 5 of that unit, even if their
 * share rounded high. The clamp can only happen at the unit level if a tiny
 * contributor + a rounding remainder collide; the clamped overflow rolls to
 * the next participant by remainder order until all losses are placed.
 */
export function splitProportionalByForce<P>(
	participants: P[],
	getContribution: (participant: P, troopType: TroopKey) => number,
	totalLosses: Partial<Record<TroopKey, number>>
): Map<P, Partial<Record<TroopKey, number>>> {
	const out = new Map<P, Partial<Record<TroopKey, number>>>();
	for (const p of participants) out.set(p, {});

	for (const k of TROOP_KEYS) {
		const total = Math.max(0, Math.floor(totalLosses[k] ?? 0));
		if (total === 0) continue;

		const contribs = participants.map((p, idx) => ({
			participant: p,
			idx,
			contrib: Math.max(0, Math.floor(getContribution(p, k)))
		}));
		const totalContrib = contribs.reduce((s, c) => s + c.contrib, 0);
		if (totalContrib === 0) continue; // nobody brought this troop — nobody loses it

		// Stage 1 — floor share per participant.
		const floors = contribs.map((c) => {
			const raw = (c.contrib * total) / totalContrib;
			return { ...c, floor: Math.floor(raw), frac: raw - Math.floor(raw) };
		});
		let placed = 0;
		for (const f of floors) {
			const lost = Math.min(f.floor, f.contrib);
			placed += lost;
			(out.get(f.participant)! as Record<string, number>)[k] = lost;
		}

		// Stage 2 — distribute the remainder by largest fractional first, stable
		// by index. Skip participants already at their contribution cap.
		let remainder = total - placed;
		if (remainder > 0) {
			const order = [...floors].sort((a, b) =>
				b.frac !== a.frac ? b.frac - a.frac : a.idx - b.idx
			);
			let pass = 0;
			// Loop in case clamping forces a re-distribution; bounded by participants.
			while (remainder > 0 && pass < order.length) {
				for (const f of order) {
					if (remainder <= 0) break;
					const cur = (out.get(f.participant)! as Record<string, number>)[k] || 0;
					const room = f.contrib - cur;
					if (room <= 0) continue;
					(out.get(f.participant)! as Record<string, number>)[k] = cur + 1;
					remainder--;
				}
				pass++;
			}
			// If remainder is still positive here, sum of contributions was lower
			// than the loss total — caller error; the math already clamped per
			// participant, so we simply leave the residue undistributed rather than
			// corrupt the conservation invariant downstream.
		}
	}

	// Strip zero entries so the result is clean for consumers that check key
	// presence (combat result writes, notifications).
	for (const [p, partial] of out) {
		for (const k of Object.keys(partial) as TroopKey[]) {
			if (!partial[k]) delete partial[k];
		}
	}
	return out;
}

/**
 * Coordinated Assault PR2 — split merged loot across participants by surviving
 * carry capacity. Loot belongs to the wave that can carry it home: a
 * participant who took heavy losses brings less back, naturally.
 *
 * Conservation invariant:
 *   for every resource r: sum_i(out[i][r]) === totalLoot[r]
 *
 * Largest-remainder, same shape as splitProportionalByForce. If every
 * participant lost everything (totalCarry === 0) loot evaporates — there's
 * literally nobody to carry it. This matches resolveCombat's existing
 * single-attack behavior where loot is bounded by survivor carry.
 */
type LootResources = { biomass: number; alloy: number; ore: number };
export function splitLootByCarry<P>(
	participants: P[],
	getSurvivingCarry: (participant: P) => number,
	totalLoot: LootResources
): Map<P, LootResources> {
	const out = new Map<P, LootResources>();
	for (const p of participants) out.set(p, { biomass: 0, alloy: 0, ore: 0 });

	const carries = participants.map((p, idx) => ({
		participant: p,
		idx,
		carry: Math.max(0, Math.floor(getSurvivingCarry(p)))
	}));
	const totalCarry = carries.reduce((s, c) => s + c.carry, 0);
	if (totalCarry === 0) return out;

	for (const r of ['biomass', 'alloy', 'ore'] as const) {
		const total = Math.max(0, Math.floor(totalLoot[r] || 0));
		if (total === 0) continue;
		const shares = carries.map((c) => {
			const raw = (c.carry * total) / totalCarry;
			return { ...c, floor: Math.floor(raw), frac: raw - Math.floor(raw) };
		});
		let placed = 0;
		for (const s of shares) {
			out.get(s.participant)![r] = s.floor;
			placed += s.floor;
		}
		let remainder = total - placed;
		const order = [...shares].sort((a, b) =>
			b.frac !== a.frac ? b.frac - a.frac : a.idx - b.idx
		);
		for (const s of order) {
			if (remainder <= 0) break;
			out.get(s.participant)![r] += 1;
			remainder--;
		}
	}
	return out;
}

export function computeScoutCombat(
	attackerCount: number,
	defenderCount: number,
	seed: number
): {
	attackerSurvivors: number;
	defenderSurvivors: number;
	attackerLosses: number;
	defenderLosses: number;
} {
	if (attackerCount <= 0)
		return {
			attackerSurvivors: 0,
			defenderSurvivors: defenderCount,
			attackerLosses: 0,
			defenderLosses: 0
		};
	if (defenderCount <= 0)
		return {
			attackerSurvivors: attackerCount,
			defenderSurvivors: 0,
			attackerLosses: 0,
			defenderLosses: 0
		};

	let prng = seed ^ 0xdeadbeef;
	const lcg = () => {
		prng = (prng * 1664525 + 1013904223) & 0xffffffff;
		return (prng >>> 0) / 4294967296;
	};

	const attackerPower = attackerCount * TROOP_STATS.reconOperative.defense;
	const defenderPower = defenderCount * TROOP_STATS.reconOperative.defense;

	const attackerWins = attackerPower >= defenderPower;
	const powerRatio =
		Math.min(attackerPower, defenderPower) / Math.max(attackerPower, defenderPower);

	const jitter = 1 + (lcg() - 0.5) * 0.1;

	const winnerCount = attackerWins ? attackerCount : defenderCount;
	const loserCount = attackerWins ? defenderCount : attackerCount;

	const winnerLossRate =
		Math.min(WINNER_COINFLIP_LOSS_RATE, powerRatio * WINNER_COINFLIP_LOSS_RATE) * jitter;
	const loserLoss = loserLossRate(powerRatio);

	const winnerLost = Math.max(0, Math.round(winnerCount * winnerLossRate));
	const loserLost = Math.max(0, Math.ceil(loserCount * loserLoss));

	const winnerSurvivors = winnerCount - winnerLost;
	const loserSurvivors = loserCount - loserLost;

	if (attackerWins) {
		return {
			attackerSurvivors: winnerSurvivors,
			defenderSurvivors: Math.max(0, loserSurvivors),
			attackerLosses: winnerLost,
			defenderLosses: loserLost
		};
	}
	return {
		attackerSurvivors: Math.max(0, loserSurvivors),
		defenderSurvivors: winnerSurvivors,
		attackerLosses: loserLost,
		defenderLosses: winnerLost
	};
}
