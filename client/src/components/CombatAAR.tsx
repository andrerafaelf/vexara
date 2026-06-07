import React from 'react';
import type { Attack } from '../types/game';
import ResourceIcon from './ResourceIcon';
import Username from './Username';

interface CombatAARProps {
	report: Attack;
	isMyAttack: boolean;
	amAlly: boolean;
}

const TROOP_NAMES: Record<string, string> = {
	sentinelLancer: 'Sentinel Lancer',
	assaultTrooper: 'Assault Trooper',
	vanguardBreaker: 'Vanguard Breaker',
	reconOperative: 'Recon Operative',
	wraithSkimmer: 'Wraith Skimmer',
	siegeMech: 'Siege Mech',
	bulwarkGuard: 'Bulwark Guard',
	aegisSkirmisher: 'Aegis Skirmisher',
	pyreSuppressor: 'Pyre Suppressor',
	arcDisruptor: 'Arc Disruptor',
	phantomLance: 'Phantom Lance',
	annihilatorPlatform: 'Annihilator',
	voidStalker: 'Void Stalker',
	plasmaTurret: 'Plasma Turret',
	siegeColossus: 'Siege Colossus',
	overseer: 'Overseer',
	lancerDrone: 'Sentinel Lancer',
	breakerUnit: 'Vanguard Breaker',
	skimmerBike: 'Wraith Skimmer',
	suppressorTeam: 'Pyre Suppressor',
	disruptorUnit: 'Arc Disruptor',
	interceptorBike: 'Phantom Lance'
};

const TROOP_ATTACK: Record<string, number> = {
	sentinelLancer: 3, assaultTrooper: 5, vanguardBreaker: 35, reconOperative: 1,
	wraithSkimmer: 80, bulwarkGuard: 3, aegisSkirmisher: 50, pyreSuppressor: 65,
	arcDisruptor: 75, phantomLance: 95, siegeMech: 40, annihilatorPlatform: 320,
	voidStalker: 150, plasmaTurret: 0, siegeColossus: 280, overseer: 0,
	lancerDrone: 3, breakerUnit: 35, skimmerBike: 80, suppressorTeam: 65,
	disruptorUnit: 75, interceptorBike: 95
};

const TROOP_DEFENSE: Record<string, number> = {
	sentinelLancer: 22, assaultTrooper: 45, vanguardBreaker: 3, reconOperative: 20,
	wraithSkimmer: 10, bulwarkGuard: 130, aegisSkirmisher: 90, pyreSuppressor: 8,
	arcDisruptor: 9, phantomLance: 13, siegeMech: 260, annihilatorPlatform: 35,
	voidStalker: 15, plasmaTurret: 160, siegeColossus: 280, overseer: 8,
	lancerDrone: 22, breakerUnit: 3, skimmerBike: 10, suppressorTeam: 8,
	disruptorUnit: 9, interceptorBike: 13
};

function calcPower(troops: Record<string, number>, stats: Record<string, number>): number {
	return Object.entries(troops).reduce((sum, [t, n]) => sum + n * (stats[t] ?? 0), 0);
}

function fmt(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'k';
	return n.toString();
}

function positiveEntries(obj?: Record<string, number> | null): [string, number][] {
	if (!obj) return [];
	return Object.entries(obj).filter(([, v]) => Number(v) > 0);
}

const CombatAAR: React.FC<CombatAARProps> = ({ report, isMyAttack, amAlly }) => {
	const result = report.result;
	const won = isMyAttack ? result.victory : amAlly ? !result.victory : !result.victory;
	const outcomeLabel = won ? 'VICTORY' : 'DEFEAT';
	const outcomeSubline = won
		? result.conquered ? 'NEXUS CONQUERED' : 'STRIKE SUCCESSFUL'
		: 'STRIKE FAILED';

	// Attacker force
	const attackerInitial = positiveEntries(
		(result.attackerInitial as Record<string, number> | undefined) ?? report.troops
	);
	const attackerLosses = (result.attackerLosses ?? {}) as Record<string, number>;
	const totalAttackerSent = attackerInitial.reduce((s, [, n]) => s + n, 0);
	const totalAttackerLost = Object.values(attackerLosses).reduce((s, n) => s + (n ?? 0), 0);

	// Defender force
	const defenderInitial = positiveEntries(result.defenderInitial);
	const defenderLosses = (result.defenderLosses ?? {}) as Record<string, number>;

	// Allied support contributions
	const allies = result.alliedContributions ?? [];
	const alliedTotalInitial = allies.reduce((sum, c) =>
		sum + Object.values(c.initial).reduce((s, n) => s + n, 0), 0
	);

	// Power assessment — use stored values if available, else derive
	const attackerForceTroops: Record<string, number> = Object.fromEntries(attackerInitial);
	const defenderForceTroops: Record<string, number> = Object.fromEntries(defenderInitial);
	const alliedForceTroops: Record<string, number> = {};
	for (const contrib of allies) {
		for (const [t, n] of Object.entries(contrib.initial)) {
			alliedForceTroops[t] = (alliedForceTroops[t] ?? 0) + n;
		}
	}
	const mergedDefenderTroops: Record<string, number> = { ...defenderForceTroops };
	for (const [t, n] of Object.entries(alliedForceTroops)) {
		mergedDefenderTroops[t] = (mergedDefenderTroops[t] ?? 0) + n;
	}

	const attackerPow = result.attackerPower ?? calcPower(attackerForceTroops, TROOP_ATTACK);
	const defenderPow = result.defenderPower ?? calcPower(mergedDefenderTroops, TROOP_DEFENSE);
	const maxPow = Math.max(attackerPow, defenderPow, 1);
	const attackerPct = Math.round((attackerPow / maxPow) * 100);
	const defenderPct = Math.round((defenderPow / maxPow) * 100);
	const ratio = defenderPow > 0 ? (defenderPow / attackerPow) : 0;
	const ratioStr = ratio > 0 ? `1 : ${ratio.toFixed(1)}` : '—';

	// Loot
	const loot = result.resourcesStolen ?? { biomass: 0, alloy: 0, ore: 0 };
	const totalLoot = loot.biomass + loot.alloy + loot.ore;

	// Control
	const controlDrain = (result as { controlDrain?: number }).controlDrain;
	const remainingControl = result.remainingControl;

	// Overseer status — prefer recorded initial, fall back to dispatched troops
	const overseerSent = ((result.attackerInitial as any)?.overseer ?? report.troops?.overseer ?? 0) as number;
	const overseerLost = attackerLosses['overseer'] ?? 0;
	const overseerInbound = overseerSent > 0 && overseerLost === 0 && !result.victory;

	const attackerName = report.attacker.user?.username ?? 'Unknown';
	const defenderName = report.defender.user?.username ?? 'Unknown';

	return (
		<div className="aar-root">
			{/* ── Header bar ── */}
			<div className="aar-header">
				<div className="aar-header-left">
					<span className="aar-header-tag">// AFTER-ACTION REPORT</span>
					<span className="aar-header-target">
						{report.defender.nexus?.name ?? 'Unknown'}{' '}
						<span className="aar-header-coords">
							/ {report.defender.nexus?.x ?? '?'}·{report.defender.nexus?.y ?? '?'}
						</span>
						{' · '}OWNER{' '}
						<Username
							name={defenderName}
							isSupporter={report.defender.user?.isSupporter}
							supporterTier={report.defender.user?.supporterTier}
						/>
					</span>
				</div>
				<div className="aar-header-right">
					<span className="aar-header-tag">{isMyAttack ? 'ENGAGEMENT LOG' : 'DEFENSE LOG'}</span>
				</div>
			</div>

			{/* ── Outcome ── */}
			<div className={`aar-outcome aar-outcome--${won ? 'victory' : 'defeat'}`}>
				<div className="aar-outcome-word">{outcomeLabel}</div>
				<div className="aar-outcome-sub">{outcomeSubline}</div>
				{result.conquered && (
					<div className="aar-conquest-badge">NEXUS CONQUERED</div>
				)}
			</div>

			{/* ── Power assessment ── */}
			<div className="aar-power-section">
				<div className="aar-power-side aar-power-side--attacker">
					<div className="aar-power-role">ATTACKER</div>
					<div className="aar-power-value">{fmt(attackerPow)}</div>
					<div className="aar-power-bar-wrap">
						<div className="aar-power-bar-fill aar-power-bar-fill--attacker" style={{ width: `${attackerPct}%` }} />
					</div>
					<div className="aar-power-player">
						<Username
							name={attackerName}
							isSupporter={report.attacker.user?.isSupporter}
							supporterTier={report.attacker.user?.supporterTier}
						/>
						{' · '}
						{totalAttackerSent.toLocaleString()} sent
					</div>
				</div>

				<div className="aar-power-vs">
					<span>VS</span>
					{ratio > 1 && (
						<span className="aar-power-ratio">OUTGUNNED {ratioStr}</span>
					)}
				</div>

				<div className="aar-power-side aar-power-side--defender">
					<div className="aar-power-role">DEFENSE GRID</div>
					<div className="aar-power-value">{fmt(defenderPow)}</div>
					<div className="aar-power-bar-wrap">
						<div className="aar-power-bar-fill aar-power-bar-fill--defender" style={{ width: `${defenderPct}%` }} />
					</div>
					<div className="aar-power-player">
						{defenderName}
						{allies.length > 0 && ` + coalition`}
					</div>
				</div>
			</div>

			{/* ── Two-column body ── */}
			<div className="aar-body">
				{/* Fleet losses */}
				<div className="aar-panel">
					<div className="aar-panel-header">
						FLEET LOSSES
						<span className="aar-panel-header-meta">
							TOTAL · {totalAttackerLost.toLocaleString()} LOST
							{overseerInbound && <span className="aar-overseer-tag"> · 1 INBOUND</span>}
						</span>
					</div>
					{attackerInitial.length === 0 ? (
						<div className="aar-empty">No attacker data recorded.</div>
					) : (
						<div className="aar-loss-list">
							{attackerInitial.map(([type, initial]) => {
								const lost = attackerLosses[type] ?? 0;
								const survived = initial - lost;
								const isOverseerRow = type === 'overseer';
								const allLost = survived <= 0;
								return (
									<div key={type} className={`aar-loss-row ${allLost ? 'aar-loss-row--wiped' : ''}`}>
										<span className="aar-loss-name">{TROOP_NAMES[type] ?? type}</span>
										<span className="aar-loss-count">
											{lost > 0 ? (
												<span className="aar-loss-num">{lost.toLocaleString()}</span>
											) : isOverseerRow && overseerInbound ? (
												<span className="aar-inbound-tag">INBOUND</span>
											) : (
												<span className="aar-loss-zero">—</span>
											)}
										</span>
										<span className="aar-loss-survived">
											{survived > 0 ? survived.toLocaleString() : '0'} surv
										</span>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Hostile reinforcement / defender force */}
				<div className="aar-panel">
					<div className="aar-panel-header">
						DEFENSE BREAKDOWN
						<span className="aar-panel-header-meta">
							≈ {(
								defenderInitial.reduce((s, [, n]) => s + n, 0) + alliedTotalInitial
							).toLocaleString()} STATIONED
						</span>
					</div>

					{/* Garrison */}
					{defenderInitial.length > 0 && (
						<>
							<div className="aar-contrib-row aar-contrib-row--garrison">
								<span className="aar-contrib-name">
									{defenderName}
									<span className="aar-contrib-badge">GARRISON</span>
								</span>
								<span className="aar-contrib-total">
									{defenderInitial.reduce((s, [, n]) => s + n, 0).toLocaleString()}
								</span>
							</div>
							{(() => {
								const garrisonTotal = defenderInitial.reduce((s, [, n]) => s + n, 0);
								return defenderInitial.map(([type, initial]) => {
									const lost = defenderLosses[type] ?? 0;
									const pct = Math.round((initial / Math.max(garrisonTotal, 1)) * 100);
									return (
										<div key={type} className="aar-contrib-troop">
											<span className="aar-contrib-troop-name">{TROOP_NAMES[type] ?? type}</span>
											<div className="aar-contrib-bar-wrap">
												<div className="aar-contrib-bar-fill aar-contrib-bar-fill--garrison" style={{ width: `${pct}%` }} />
											</div>
											<span className="aar-contrib-troop-count">{initial.toLocaleString()}</span>
											<span className="aar-contrib-troop-lost">{lost > 0 ? `-${lost.toLocaleString()}` : ''}</span>
										</div>
									);
								});
							})()}
						</>
					)}

					{/* Allied contributions */}
					{allies.map((contrib) => {
						const contribTotal = Object.values(contrib.initial).reduce((s, n) => s + n, 0);
						const contribEntries = positiveEntries(contrib.initial);
						return (
							<div key={contrib.ownerNexusId} className="aar-contrib-block">
								<div className="aar-contrib-row">
									<span className="aar-contrib-name">
										{contrib.ownerUsername ?? contrib.ownerNexusName}
										<span className="aar-contrib-badge aar-contrib-badge--support">SUPPORT</span>
									</span>
									<span className="aar-contrib-total">{contribTotal.toLocaleString()}</span>
								</div>
								{contribEntries.map(([type, initial]) => {
									const lost = contrib.losses[type] ?? 0;
									const pct = Math.round((initial / Math.max(contribTotal, 1)) * 100);
									return (
										<div key={type} className="aar-contrib-troop">
											<span className="aar-contrib-troop-name">{TROOP_NAMES[type] ?? type}</span>
											<div className="aar-contrib-bar-wrap">
												<div className="aar-contrib-bar-fill aar-contrib-bar-fill--support" style={{ width: `${pct}%` }} />
											</div>
											<span className="aar-contrib-troop-count">{initial.toLocaleString()}</span>
											<span className="aar-contrib-troop-lost">{lost > 0 ? `-${lost.toLocaleString()}` : ''}</span>
										</div>
									);
								})}
							</div>
						);
					})}

					{defenderInitial.length === 0 && allies.length === 0 && (
						<div className="aar-empty">No defending garrison recorded.</div>
					)}
				</div>
			</div>

			{/* ── Footer strip: resources + control ── */}
			<div className="aar-footer">
				{/* Resources plundered */}
				<div className="aar-footer-block">
					<div className="aar-footer-kicker">RESOURCES {isMyAttack ? 'PLUNDERED' : 'LOST'}</div>
					{totalLoot > 0 ? (
						<div className="aar-loot-row">
							{loot.biomass > 0 && (
								<div className="aar-loot-item aar-loot-item--biomass">
									<ResourceIcon kind="biomass" size={14} />
									<span>{loot.biomass.toLocaleString()}</span>
								</div>
							)}
							{loot.alloy > 0 && (
								<div className="aar-loot-item aar-loot-item--alloy">
									<ResourceIcon kind="alloy" size={14} />
									<span>{loot.alloy.toLocaleString()}</span>
								</div>
							)}
							{loot.ore > 0 && (
								<div className="aar-loot-item aar-loot-item--ore">
									<ResourceIcon kind="ore" size={14} />
									<span>{loot.ore.toLocaleString()}</span>
								</div>
							)}
						</div>
					) : (
						<div className="aar-footer-value aar-footer-value--zero">0</div>
					)}
				</div>

				{/* Control */}
				{remainingControl !== undefined && remainingControl !== null && (
					<div className="aar-footer-block">
						<div className="aar-footer-kicker">CONTROL</div>
						<div className="aar-footer-value">
							{remainingControl}/100
							{controlDrain && controlDrain > 0 && (
								<span className="aar-control-drain"> (−{controlDrain})</span>
							)}
						</div>
						{result.conquered && (
							<div className="aar-control-conquered">CONQUERED</div>
						)}
					</div>
				)}

				{/* Building damage */}
				{result.buildingDamage && result.buildingDamage.length > 0 && (
					<div className="aar-footer-block">
						<div className="aar-footer-kicker">STRUCTURES HIT</div>
						<div className="aar-building-list">
							{result.buildingDamage.map((d, i) => (
								<div key={i} className="aar-building-row">
									<span className="aar-building-name">{d.building}</span>
									<span className="aar-building-change">Lv {d.from} → <span className="aar-building-after">Lv {d.to}</span></span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Nexus life */}
				{result.nexusLifeReduced && result.remainingNexusLife !== undefined && (
					<div className="aar-footer-block">
						<div className="aar-footer-kicker">NEXUS LIFE</div>
						<div className="aar-footer-value aar-footer-value--danger">
							{result.remainingNexusLife}/100
						</div>
					</div>
				)}
			</div>

			{/* ── Engagement meta ── */}
			<div className="aar-meta">
				<span className="aar-meta-item">
					<Username
						name={attackerName}
						isSupporter={report.attacker.user?.isSupporter}
						supporterTier={report.attacker.user?.supporterTier}
					/>
					{' × '}
					<Username
						name={defenderName}
						isSupporter={report.defender.user?.isSupporter}
						supporterTier={report.defender.user?.supporterTier}
					/>
				</span>
				<span className="aar-meta-item aar-meta-right">VEXARA // GALAXY WAR</span>
			</div>
		</div>
	);
};

export default CombatAAR;
