'use client';

import { Calculator, Crosshair, Shield, Skull, Swords, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import '../styles/CombatCalculator.css';
import { predictCombat, type Force, type TroopKey } from '../utils/combatSim';

interface Props {
	// The force the player is about to send (live from the attack form).
	attacker: Force;
	// Best-known enemy garrison. Null when the target hasn't been scouted.
	defender: Force | null;
	defenderShieldGrid?: number;
	attackerTargetingCore?: number;
	// Military Outpost (and doubled variants) boost shield efficiency.
	shieldEfficiencyMultiplier?: number;
	// Whether we actually have intel on the defender. Without it the prediction is
	// a guess, so we say so plainly instead of showing false confidence.
	hasIntel: boolean;
}

const MARGIN_COPY: Record<string, string> = {
	blowout: 'Crushing, you dominate this fight',
	decisive: 'Decisive, a clear win with light losses',
	close: 'Close, expect to bleed for it',
	coinflip: 'Coin-flip, costly even if you win'
};

function pct(n: number): string {
	return `${Math.round(n * 100)}%`;
}

export default function CombatCalculator({
	attacker,
	defender,
	defenderShieldGrid = 0,
	attackerTargetingCore = 0,
	shieldEfficiencyMultiplier = 1,
	hasIntel
}: Props) {
	const totalAttacker = useMemo(
		() => (Object.values(attacker) as number[]).reduce((s, n) => s + (n || 0), 0),
		[attacker]
	);

	const prediction = useMemo(() => {
		if (totalAttacker <= 0) return null;
		return predictCombat({
			attacker,
			defender: defender ?? {},
			attackerTargetingCore,
			defenderShieldGrid,
			shieldEfficiencyMultiplier
		});
	}, [
		attacker,
		defender,
		attackerTargetingCore,
		defenderShieldGrid,
		shieldEfficiencyMultiplier,
		totalAttacker
	]);

	if (totalAttacker <= 0) {
		return (
			<div className="cc-root cc-root--idle">
				<Calculator size={13} aria-hidden="true" />
				<span>Select troops to preview the outcome</span>
			</div>
		);
	}

	const p = prediction!;
	const hasOverseer = (attacker.overseer as number | undefined) ?? 0 > 0;

	return (
		<div className={`cc-root ${p.attackerWins ? 'cc-root--win' : 'cc-root--loss'}`}>
			<div className="cc-verdict">
				{p.attackerWins ? (
					<Trophy size={14} aria-hidden="true" />
				) : (
					<Skull size={14} aria-hidden="true" />
				)}
				<span className="cc-verdict-text">
					{p.attackerWins ? 'Predicted: Victory' : 'Predicted: Defeat'}
				</span>
				<span className={`cc-margin cc-margin--${p.marginLabel}`}>
					{MARGIN_COPY[p.marginLabel]}
				</span>
			</div>

			<div className="cc-power-row">
				<span className="cc-power cc-power--atk">
					<Swords size={11} aria-hidden="true" /> {Math.round(p.attackPower).toLocaleString()}
				</span>
				<span className="cc-power-vs">vs</span>
				<span className="cc-power cc-power--def">
					<Shield size={11} aria-hidden="true" /> {Math.round(p.defensePower).toLocaleString()}
				</span>
			</div>

			<div className="cc-stats">
				<div className="cc-stat">
					<span className="cc-stat-label">Your est. losses</span>
					<span className="cc-stat-value cc-stat-value--loss">{pct(p.attackerLossPct)}</span>
				</div>
				<div className="cc-stat">
					<span className="cc-stat-label">Enemy est. losses</span>
					<span className="cc-stat-value">{pct(p.defenderLossPct)}</span>
				</div>
				{p.attackerWins && p.estLootCapacity > 0 && (
					<div className="cc-stat">
						<span className="cc-stat-label">Loot capacity</span>
						<span className="cc-stat-value">{Math.round(p.estLootCapacity).toLocaleString()}</span>
					</div>
				)}
			</div>

			{hasOverseer && (
				<div className={`cc-conquest ${p.conquerCapable ? 'cc-conquest--yes' : 'cc-conquest--no'}`}>
					<Crosshair size={12} aria-hidden="true" />
					{p.conquerCapable
						? 'This strike should clear the garrison, Overseer can drive control down.'
						: 'Garrison likely survives, Overseer needs the defenders fully wiped to act. Send more force.'}
				</div>
			)}

			{!hasIntel && (
				<div className="cc-note">
					No scout intel on this target, prediction assumes an empty garrison. Scout first for an
					accurate estimate.
				</div>
			)}
		</div>
	);
}

// Re-export so callers can type their force objects without importing combatSim directly.
export type { Force, TroopKey };
