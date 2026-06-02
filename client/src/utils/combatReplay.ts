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
	lancerDrone: 3,
	assaultTrooper: 5,
	breakerUnit: 35,
	reconOperative: 1,
	skimmerBike: 80,
	bulwarkGuard: 3,
	suppressorTeam: 65,
	disruptorUnit: 75,
	interceptorBike: 95,
	siegeMech: 40,
	annihilatorPlatform: 320,
	voidStalker: 150,
	plasmaTurret: 0,
	overseer: 0
};

const TROOP_DEFENSE: Record<string, number> = {
	lancerDrone: 22,
	assaultTrooper: 45,
	breakerUnit: 3,
	reconOperative: 20,
	skimmerBike: 10,
	bulwarkGuard: 130,
	suppressorTeam: 8,
	disruptorUnit: 9,
	interceptorBike: 13,
	siegeMech: 260,
	annihilatorPlatform: 35,
	voidStalker: 15,
	plasmaTurret: 160,
	overseer: 8
};

function forcePower(troops: Record<string, number>, stat: Record<string, number>): number {
	return Object.entries(troops).reduce((sum, [type, count]) => sum + count * (stat[type] ?? 0), 0);
}

function clone(obj: Record<string, number>): Record<string, number> {
	return { ...obj };
}

function positiveForce(
	source: Record<string, number | undefined> | undefined
): Record<string, number> {
	const out: Record<string, number> = {};
	if (!source) return out;
	for (const [type, value] of Object.entries(source)) {
		const count = Number(value ?? 0);
		if (Number.isFinite(count) && count > 0) out[type] = count;
	}
	return out;
}

function hasForce(source: Record<string, number>): boolean {
	return Object.values(source).some((count) => count > 0);
}

function distributeOverRounds(
	totalLosses: Record<string, number>,
	numRounds: number
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

	const attackerInitial = positiveForce(
		hasForce(positiveForce(report.result.attackerInitial))
			? report.result.attackerInitial
			: report.troops
	);

	// The replay visualizes the full battle, so the defender side must include
	// allied support. defenderInitial/defenderLosses on the report are now
	// garrison-only; prefer the merged figures (garrison + support) when present,
	// falling back to the garrison-only fields for legacy reports.
	const mergedDefenderLosses = positiveForce(
		(report.result as { mergedDefenderLosses?: Record<string, number> }).mergedDefenderLosses
	);
	const mergedDefenderInitial = positiveForce(
		(report.result as { mergedDefenderInitial?: Record<string, number> }).mergedDefenderInitial
	);
	const defenderLosses = hasForce(mergedDefenderLosses)
		? mergedDefenderLosses
		: positiveForce(report.result.defenderLosses);
	const reportedDefenderInitial = hasForce(mergedDefenderInitial)
		? mergedDefenderInitial
		: positiveForce(report.result.defenderInitial);
	const defenderInitial = hasForce(reportedDefenderInitial)
		? reportedDefenderInitial
		: defenderLosses;

	const attackerLosses: Record<string, number> = {};
	for (const [k, v] of Object.entries(report.result.attackerLosses ?? {})) {
		if ((v ?? 0) > 0) attackerLosses[k] = v as number;
	}

	const ROUNDS = 5;

	const attackerLossPerRound = distributeOverRounds(attackerLosses, ROUNDS);
	const defenderLossPerRound = distributeOverRounds(defenderLosses, ROUNDS);

	const attackerCurrent = clone(attackerInitial);
	const defenderCurrent = clone(defenderInitial);
	const attackerPowerBase = forcePower(attackerInitial, TROOP_ATTACK);
	const defenderPowerBase = forcePower(defenderInitial, TROOP_DEFENSE);
	const attackerPowerScale =
		attackerPowerBase > 0 && report.result.attackerPower
			? report.result.attackerPower / attackerPowerBase
			: 1;
	const defenderPowerScale =
		defenderPowerBase > 0 && report.result.defenderPower
			? report.result.defenderPower / defenderPowerBase
			: 1;

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

		const aPow = forcePower(attackerCurrent, TROOP_ATTACK) * attackerPowerScale;
		const dPow = forcePower(defenderCurrent, TROOP_DEFENSE) * defenderPowerScale;

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
			event
		});
	}

	const attackerFinal: Record<string, number> = {};
	for (const [k, v] of Object.entries(attackerInitial)) {
		const lost = (report.result.attackerLosses?.[k] ?? 0) as number;
		const survived = v - lost;
		if (survived > 0) attackerFinal[k] = survived;
	}

	const defenderFinal: Record<string, number> = {};
	for (const [k, v] of Object.entries(defenderInitial)) {
		const lost = defenderLosses[k] ?? 0;
		const survived = v - lost;
		if (survived > 0) defenderFinal[k] = survived;
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
		resourcesStolen: report.result.resourcesStolen ?? { biomass: 0, alloy: 0, ore: 0 }
	};
}
