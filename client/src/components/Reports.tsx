import { ArrowLeft, Coins, Share2, Skull, Swords, Trophy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
	getReadReportIds,
	getReports,
	markAllReportsRead,
	markReportRead,
	sendAttack,
	sendFactionMessage
} from '../services/api';
import '../styles/Reports.css';
import { useToast } from '../context/ToastContext';
import { Attack, Nexus } from '../types/game';
import { formatDateTime } from '../utils/date';
import BattleReplay from './BattleReplay';
import Username from './Username';
import ScoutIntelCard from './ScoutIntelCard';
import ResourceIcon from './ResourceIcon';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';

interface ReportsProps {
	nexus: Nexus;
	onReadStateChange?: () => void;
	factionId?: number;
	currentUserId?: number;
}

const buildingNames: Record<string, string> = {
	shieldGrid: 'Shield Grid',
	commandCore: 'Command Core',
	hangarBay: 'Hangar Bay',
	plasmaForge: 'Plasma Forge',
	armorFoundry: 'Armor Foundry',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	armory: 'Armory',
	stealthArray: 'Stealth Array'
};

// Includes legacy keys (lancerDrone, breakerUnit, skimmerBike,
// suppressorTeam, disruptorUnit, interceptorBike) so completed historical
// combat reports stored under those keys still resolve to a label. New
// reports use the renamed keys per the Stage 2d migration.
const troopNames: Record<string, string> = {
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
	annihilatorPlatform: 'Annihilator Platform',
	voidStalker: 'Void Stalker',
	plasmaTurret: 'Plasma Turret',
	siegeColossus: 'Siege Colossus',
	overseer: 'Overseer',
	// Legacy keys preserved for historical Attack.result reports.
	lancerDrone: 'Sentinel Lancer',
	breakerUnit: 'Vanguard Breaker',
	skimmerBike: 'Wraith Skimmer',
	suppressorTeam: 'Pyre Suppressor',
	disruptorUnit: 'Arc Disruptor',
	interceptorBike: 'Phantom Lance'
};

const ATTACKABLE_TROOP_TYPES = new Set(
	Object.keys(troopNames).filter((type) => type !== 'plasmaTurret')
);

function clampAttackAmount(type: string, available: number): number {
	if (type === 'plasmaTurret') return 0;
	if (type === 'overseer') return Math.min(available, 1);
	return available;
}

function formatNumber(value: unknown): string {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? Math.floor(n).toLocaleString() : '0';
}

function resourceTotal(resources?: Partial<ResourceSnapshot> | null): number {
	if (!resources) return 0;
	return RESOURCE_KEYS.reduce((sum, key) => sum + Math.max(0, Number(resources[key] ?? 0)), 0);
}

function getRemainingResources(report: Attack): ResourceSnapshot | null {
	return report.result?.remainingResources ?? report.defender.nexus?.resources ?? null;
}

function getDefenderSurvivors(report: Attack): Record<string, number> {
	if (report.result?.defenderSurvivors) return report.result.defenderSurvivors;
	const defenderInitial = report.result?.defenderInitial ?? {};
	const defenderLosses = report.result?.defenderLosses ?? {};
	return Object.fromEntries(
		Object.entries(defenderInitial)
			.map(([troop, initial]) => [
				troop,
				Math.max(0, Number(initial) - Number(defenderLosses[troop] ?? 0))
			])
			.filter(([, survived]) => Number(survived) > 0)
	) as Record<string, number>;
}

function getTroopEntries(troops?: Record<string, number> | null) {
	return Object.entries(troops ?? {}).filter(([, count]) => Number(count) > 0);
}

type ResourceSnapshot = { biomass: number; alloy: number; ore: number };
const RESOURCE_KEYS = ['biomass', 'alloy', 'ore'] as const;

const Reports: React.FC<ReportsProps> = ({
	nexus,
	onReadStateChange,
	factionId,
	currentUserId
}) => {
	const toast = useToast();
	const [reports, setReports] = useState<Attack[]>([]);
	const [selectedReport, setSelectedReport] = useState<Attack | null>(null);
	const [loading, setLoading] = useState(true);
	usePageReady(!loading, 'reports');
	const [showAttackForm, setShowAttackForm] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [sharePreview, setSharePreview] = useState<string | null>(null);
	const [attackTroops, setAttackTroops] = useState({
		sentinelLancer: 0,
		assaultTrooper: 0,
		vanguardBreaker: 0,
		reconOperative: 0,
		wraithSkimmer: 0,
		siegeMech: 0,
		bulwarkGuard: 0,
		aegisSkirmisher: 0,
		pyreSuppressor: 0,
		arcDisruptor: 0,
		phantomLance: 0,
		annihilatorPlatform: 0,
		voidStalker: 0,
		plasmaTurret: 0,
		siegeColossus: 0,
		overseer: 0
	});
	const [readIds, setReadIds] = useState<Set<string>>(new Set());
	const [replayComplete, setReplayComplete] = useState(false);

	useEffect(() => {
		loadReports();
		getReadReportIds()
			.then((r) => setReadIds(new Set(r.data)))
			.catch(() => {});
	}, [nexus._id]);

	useEffect(() => {
		if (!selectedReport || readIds.has(selectedReport._id)) return;
		markReportRead(selectedReport._id).catch(() => {});
		setReadIds((prev) => new Set([...prev, selectedReport._id]));
		onReadStateChange?.();
	}, [selectedReport, readIds, onReadStateChange]);

	useEffect(() => {
		setShowAttackForm(false);
		setReplayComplete(false);
		setAttackTroops({
			sentinelLancer: 0,
			assaultTrooper: 0,
			vanguardBreaker: 0,
			reconOperative: 0,
			wraithSkimmer: 0,
			siegeMech: 0,
			bulwarkGuard: 0,
			aegisSkirmisher: 0,
			pyreSuppressor: 0,
			arcDisruptor: 0,
			phantomLance: 0,
			annihilatorPlatform: 0,
			voidStalker: 0,
			plasmaTurret: 0,
			siegeColossus: 0,
			overseer: 0
		});
	}, [selectedReport?._id]);

	const buildShareText = (report: Attack): string => {
		const myAttack = isAttacker(report);
		const scout = isScoutReport(report);
		const won = myAttack ? report.result.victory : !report.result.victory;
		const outcome = scout ? 'SCOUT REPORT' : won ? 'VICTORY' : 'DEFEAT';

		const attackerName = report.attacker.user?.username ?? 'Unknown';
		const defenderName = report.defender.user?.username ?? 'Unknown';
		const atkNexus = `${report.attacker.nexus?.name ?? 'Unknown'} (${report.attacker.nexus?.x ?? '?'}|${report.attacker.nexus?.y ?? '?'})`;
		const defNexus = `${report.defender.nexus?.name ?? 'Unknown'} (${report.defender.nexus?.x ?? '?'}|${report.defender.nexus?.y ?? '?'})`;

		const lines: string[] = [];
		const sep = '--------------------------------';

		lines.push(`[ COMBAT LOG - ${outcome} ]`);
		lines.push(sep);
		lines.push(`Date:     ${formatDate(report.arrivesAt)}`);
		lines.push(`Striker:  ${attackerName} from ${atkNexus}`);
		lines.push(`Defender: ${defenderName} from ${defNexus}`);

		if (!scout) {
			if (
				report.result?.remainingControl !== undefined &&
				report.result.remainingControl !== null
			) {
				lines.push(
					`Control:  ${report.result.remainingControl}/100${report.result.conquered ? ' (CONQUERED)' : ''}`
				);
			}
			if (
				report.result?.remainingNexusLife !== undefined &&
				report.result.remainingNexusLife !== null
			) {
				lines.push(`Nexus Life: ${report.result.remainingNexusLife}/100`);
			}
		}

		if (!scout) {
			const atkLosses: Record<string, number> = Object.fromEntries(
				Object.entries(report.result?.attackerLosses ?? {}).map(([k, v]) => [k, v ?? 0])
			);

			lines.push('');
			lines.push('[ ATTACKER FORCES ]');
			const atkRows = Object.entries(report.troops ?? {}).filter(([, c]) => Number(c) > 0);
			if (atkRows.length === 0) {
				lines.push('  (none)');
			} else {
				lines.push(
					`  ${'Unit'.padEnd(24)}${'Sent'.padStart(6)}${'Lost'.padStart(6)}${'Surv'.padStart(6)}`
				);
				for (const [type, count] of atkRows) {
					const lost = atkLosses[type] ?? 0;
					const surv = Number(count) - lost;
					lines.push(
						`  ${(troopNames[type] ?? type).padEnd(24)}${String(count).padStart(6)}${String(lost).padStart(6)}${String(surv).padStart(6)}`
					);
				}
			}

			lines.push('');
			lines.push('[ DEFENDER FORCES LEFT ]');
			const defenderSurvivors = getDefenderSurvivors(report);
			const defRows = Object.entries(defenderSurvivors).filter(([, v]) => Number(v) > 0);
			if (defRows.length === 0) {
				lines.push('  No defending troops survived.');
			} else {
				lines.push(`  ${'Unit'.padEnd(24)}${'Surv'.padStart(6)}`);
				for (const [type, survived] of defRows) {
					lines.push(`  ${(troopNames[type] ?? type).padEnd(24)}${String(survived).padStart(6)}`);
				}
			}

			const remainingResources = getRemainingResources(report);
			if (remainingResources) {
				lines.push('');
				lines.push('[ RESOURCES LEFT ON DEFENDER NEXUS ]');
				lines.push(`  Biomass: ${formatNumber(remainingResources.biomass)}`);
				lines.push(`  Alloy:   ${formatNumber(remainingResources.alloy)}`);
				lines.push(`  Ore:     ${formatNumber(remainingResources.ore)}`);
			}

			const loot = report.result?.resourcesStolen;
			if (loot && (loot.biomass > 0 || loot.alloy > 0 || loot.ore > 0)) {
				lines.push('');
				lines.push('[ RESOURCES PLUNDERED ]');
				if (loot.biomass > 0) lines.push(`  Biomass: ${loot.biomass}`);
				if (loot.alloy > 0) lines.push(`  Alloy:   ${loot.alloy}`);
				if (loot.ore > 0) lines.push(`  Ore:     ${loot.ore}`);
			}

			if (report.result?.buildingDamage && report.result.buildingDamage.length > 0) {
				lines.push('');
				lines.push('[ BUILDINGS DAMAGED ]');
				lines.push(`  ${'Building'.padEnd(22)}${'Before'.padStart(8)}${'After'.padStart(8)}`);
				for (const d of report.result.buildingDamage) {
					lines.push(
						`  ${(buildingNames[d.building] ?? d.building).padEnd(22)}${`Lv ${d.from}`.padStart(8)}${`Lv ${d.to}`.padStart(8)}`
					);
				}
			}

			if (report.result?.alliedContributions && report.result.alliedContributions.length > 0) {
				for (const contrib of report.result.alliedContributions) {
					const allyLabel = contrib.ownerUsername ?? contrib.ownerNexusName;
					lines.push('');
					lines.push(`[ ALLIED FORCES - ${allyLabel.toUpperCase()} ]`);
					const allyRows = Object.entries(contrib.initial).filter(([, c]) => Number(c) > 0);
					if (allyRows.length > 0) {
						lines.push(
							`  ${'Unit'.padEnd(24)}${'Present'.padStart(9)}${'Lost'.padStart(6)}${'Surv'.padStart(6)}`
						);
						for (const [type, initial] of allyRows) {
							const lost = contrib.losses[type] ?? 0;
							const surv = Number(initial) - lost;
							lines.push(
								`  ${(troopNames[type] ?? type).padEnd(24)}${String(initial).padStart(9)}${String(lost).padStart(6)}${String(surv).padStart(6)}`
							);
						}
					}
				}
			}
		}

		if (scout && report.result?.intel) {
			const troops = report.result.intel.troops ?? {};
			const detected = Object.entries(troops).filter(([, c]) => Number(c) > 0);
			lines.push('');
			lines.push('[ ENEMY TROOPS DETECTED ]');
			if (detected.length === 0) {
				lines.push('  No enemy troops detected.');
			} else {
				for (const [type, count] of detected) {
					lines.push(`  ${(troopNames[type] ?? type).padEnd(24)}${String(count).padStart(6)}`);
				}
			}
			const support = (report.result.intel as { supportTroops?: Record<string, number> })
				.supportTroops;
			const detectedSupport = support
				? Object.entries(support).filter(([, c]) => Number(c) > 0)
				: [];
			if (detectedSupport.length > 0) {
				lines.push('');
				lines.push('[ ALLIED REINFORCEMENTS ]');
				for (const [type, count] of detectedSupport) {
					lines.push(`  ${(troopNames[type] ?? type).padEnd(24)}${String(count).padStart(6)}`);
				}
			}
		}

		lines.push(sep);
		return lines.join('\n');
	};

	const handleOpenSharePreview = (report: Attack) => {
		setSharePreview(buildShareText(report));
	};

	const handleConfirmShare = async () => {
		if (!factionId || !sharePreview) return;
		setSharing(true);
		try {
			await sendFactionMessage(factionId, sharePreview);
			toast('Combat log shared to faction chat', 'success');
			setSharePreview(null);
		} catch {
			toast('Failed to share to chat', 'error');
		} finally {
			setSharing(false);
		}
	};

	const handleSendAttack = async () => {
		if (!selectedReport) return;
		const total = Object.values(attackTroops).reduce((a, b) => a + b, 0);
		if (total === 0) {
			toast('Select at least one troop', 'error');
			return;
		}
		try {
			await sendAttack(nexus._id, selectedReport.defender.nexus._id, attackTroops, 'attack');
			toast('Strike sent', 'success');
			setShowAttackForm(false);
			setAttackTroops({
				sentinelLancer: 0,
				assaultTrooper: 0,
				vanguardBreaker: 0,
				reconOperative: 0,
				wraithSkimmer: 0,
				siegeMech: 0,
				bulwarkGuard: 0,
				aegisSkirmisher: 0,
				pyreSuppressor: 0,
				arcDisruptor: 0,
				phantomLance: 0,
				annihilatorPlatform: 0,
				voidStalker: 0,
				plasmaTurret: 0,
				siegeColossus: 0,
				overseer: 0
			});
		} catch (err: any) {
			toast(err.response?.data?.error || 'Error sending strike', 'error');
		}
	};

	const loadReports = async () => {
		try {
			setLoading(true);
			const reportsRes = await getReports(nexus._id);
			setReports(reportsRes.data);
		} catch (err) {
			console.error('Error loading reports:', err);
		} finally {
			setLoading(false);
		}
	};

	const formatDate = (date: string | Date) => formatDateTime(date);

	const getTroopTotal = (troops: any) => {
		return Object.values(troops).reduce((a: any, b: any) => a + b, 0);
	};

	const isAttacker = (report: Attack) => report.attacker.nexus._id === nexus._id;

	const isAlly = (report: Attack) =>
		!isAttacker(report) &&
		report.defender.nexus._id !== nexus._id &&
		(report.result?.alliedNexusIds ?? []).includes(Number(nexus._id));

	const isScoutReport = (report: Attack) =>
		report.type === 'scout' || report.result?.mission === 'scout';

	const unreadCount = reports.reduce((acc, r) => (readIds.has(r._id) ? acc : acc + 1), 0);


	const handleMarkAllRead = async () => {
		try {
			const res = await markAllReportsRead(nexus._id);
			const ids: string[] = res.data?.ids || reports.map((r) => r._id);
			setReadIds((prev) => new Set([...prev, ...ids]));
			onReadStateChange?.();
		} catch (err) {
			console.error('Error marking all reports as read:', err);
		}
	};

	if (loading) {
		return <PageSkeleton variant="rows" count={5} />;
	}


	if (selectedReport) {
		const currentIndex = reports.findIndex((r) => r._id === selectedReport._id);
		const prevReport = currentIndex > 0 ? reports[currentIndex - 1] : null;
		const nextReport = currentIndex < reports.length - 1 ? reports[currentIndex + 1] : null;

		const isMyAttack = isAttacker(selectedReport);
		const amAlly = isAlly(selectedReport);
		const myRole = isMyAttack ? 'attacker' : amAlly ? 'ally' : 'defender';
		const scoutReport = isScoutReport(selectedReport);
		const attackerName = selectedReport.attacker.user?.username || 'Unknown';
		const defenderName = selectedReport.defender.user?.username || 'Unknown';
		const attackerLossesForDisplay = {
			...(selectedReport.result?.attackerLosses || {})
		} as Record<string, number>;
		// Attacker force prefers the recorded initial composition, falling back to
		// the dispatched troops for legacy reports that didn't store attackerInitial.
		const attackerForceEntries = getTroopEntries(
			(selectedReport.result?.attackerInitial as Record<string, number> | undefined) ??
				(selectedReport.troops as Record<string, number>)
		);
		const defenderSurvivors = getDefenderSurvivors(selectedReport);
		const defenderSurvivorEntries = getTroopEntries(defenderSurvivors);
		const defenderInitialEntries = getTroopEntries(selectedReport.result?.defenderInitial);
		const remainingResources = getRemainingResources(selectedReport);
		const hasRecordedRemainingResources = Boolean(selectedReport.result?.remainingResources);
		const remainingResourceTotal = resourceTotal(remainingResources);

		return (
			<div className="reports-container">
				<div className="reports-header">
					<div className="reports-detail-nav">
						<button
							onClick={() => setSelectedReport(null)}
							className="btn-back"
							aria-label="Back to reports list"
						>
							<ArrowLeft size={14} aria-hidden="true" />
							Back
						</button>
						<div className="reports-nav-arrows">
							<button
								className="btn-nav-arrow"
								onClick={() => prevReport && setSelectedReport(prevReport)}
								disabled={!prevReport}
								title="Previous report"
							>
								&lt;
							</button>
							<span className="reports-nav-count">
								{currentIndex + 1} / {reports.length}
							</span>
							<button
								className="btn-nav-arrow"
								onClick={() => nextReport && setSelectedReport(nextReport)}
								disabled={!nextReport}
								title="Next report"
							>
								&gt;
							</button>
						</div>
						{factionId && (
							<button
								className="btn-share-chat"
								onClick={() => handleOpenSharePreview(selectedReport)}
								disabled={sharing}
								title="Share this report to faction chat"
							>
								<Share2 size={13} aria-hidden="true" />
								{sharing ? 'Sharing...' : 'Share to Chat'}
							</button>
						)}
					</div>
					<h2>{scoutReport ? 'Scout Report' : 'Combat Report'}</h2>
				</div>

				<div className="report-detail">
					{(scoutReport || replayComplete) && (
						<div
							className={`report-result ${(isMyAttack ? selectedReport.result.victory : !selectedReport.result.victory) ? 'victory' : 'defeat'}`}
						>
							{scoutReport ? (
								selectedReport.result.scoutFailed ? (
									<span>
										Scout failed — operatives lost to enemy Stealth Array. No intel
										returned.
									</span>
								) : (
									<span>Recon complete. Intelligence updated.</span>
								)
							) : isMyAttack ? (
								selectedReport.result.victory ? (
									<>
										<span>Victory! You won the strike</span>
										{selectedReport.result.conquered && (
											<div className="conquest-notice">NEXUS CONQUERED!</div>
										)}
									</>
								) : (
									<span>Defeat! Your strike failed</span>
								)
							) : amAlly ? (
								selectedReport.result.victory ? (
									<span>Defence lost — the nexus you supported was raided</span>
								) : (
									<span>Defence held — your allied troops helped defend</span>
								)
							) : selectedReport.result.victory ? (
								<span>Defeat! Your nexus was raided</span>
							) : (
								<span>Victory! You defended successfully</span>
							)}
						</div>
					)}

					{!scoutReport && (
						<BattleReplay
							report={selectedReport}
							isMyAttack={isMyAttack}
							onComplete={() => setReplayComplete(true)}
						/>
					)}

					{isMyAttack && selectedReport.defender.nexus?._id && (
						<div className="report-section scout-attack-section">
							<div className="scout-target-bar">
								<div className="scout-target-info">
									<span className="scout-target-label">Target</span>
									<span className="scout-target-name">
										{selectedReport.defender.nexus?.name || 'Unknown'}{' '}
										<span className="scout-target-coords">
											({selectedReport.defender.nexus?.x ?? '?'}|
											{selectedReport.defender.nexus?.y ?? '?'})
										</span>
									</span>
								</div>
								<button className="scout-attack-btn" onClick={() => setShowAttackForm((v) => !v)}>
									<Swords size={14} aria-hidden="true" />{' '}
									{showAttackForm ? 'Cancel' : scoutReport ? 'Attack' : 'Attack Again'}
								</button>
							</div>
							{showAttackForm && (
								<div className="scout-attack-form">
									<div className="scout-troop-list">
										{Object.entries(nexus.troops)
											.filter(([type]) => ATTACKABLE_TROOP_TYPES.has(type))
											.map(([type, available]) => (
												<div key={type} className="scout-troop-row">
													<span className="scout-troop-label">{troopNames[type] || type}</span>
													<input
														type="number"
														min={0}
														max={clampAttackAmount(type, available)}
														value={attackTroops[type as keyof typeof attackTroops]}
														disabled={clampAttackAmount(type, available) <= 0}
														onChange={(e) =>
															setAttackTroops((prev) => ({
																...prev,
																[type]: Math.min(
																	Number(e.target.value),
																	clampAttackAmount(type, available)
																)
															}))
														}
													/>
													<span className="scout-troop-available">/{available}</span>
												</div>
											))}
									</div>
									<div className="scout-attack-actions">
										<button
											className="scout-send-all-btn"
											onClick={() =>
												setAttackTroops((prev) => {
													const next = { ...prev };
													for (const [type, available] of Object.entries(nexus.troops)) {
														next[type as keyof typeof next] = clampAttackAmount(type, available);
													}
													return next;
												})
											}
										>
											Send All
										</button>
										<button className="scout-send-btn" onClick={handleSendAttack}>
											Send Attack
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					{scoutReport && selectedReport.result?.intel && (
						<ScoutIntelCard
							intel={selectedReport.result.intel as any}
							targetName={
								(selectedReport.result.intel as any).nexusName ??
								selectedReport.defender.nexus?.name ??
								'Unknown'
							}
							targetCoords={{
								x:
									(selectedReport.result.intel as any).nexusX ??
									selectedReport.defender.nexus?.x ??
									0,
								y:
									(selectedReport.result.intel as any).nexusY ??
									selectedReport.defender.nexus?.y ??
									0
							}}
						/>
					)}

					{!scoutReport && (
						<>
							<div className="report-aftermath-grid">
								<div className="report-aftermath-card report-aftermath-card--troops">
									<div className="report-aftermath-kicker">Defender Survivors</div>
									<div className="report-aftermath-value">
										{defenderSurvivorEntries
											.reduce((sum, [, count]) => sum + Number(count), 0)
											.toLocaleString()}
									</div>
									<div className="report-aftermath-list">
										{defenderSurvivorEntries.length === 0 ? (
											<span>No defending troops survived.</span>
										) : (
											defenderSurvivorEntries.slice(0, 4).map(([troop, count]) => (
												<span key={troop}>
													{troopNames[troop] || troop}: <strong>{formatNumber(count)}</strong>
												</span>
											))
										)}
									</div>
								</div>

								<div className="report-aftermath-card report-aftermath-card--resources">
									<div className="report-aftermath-kicker">Resources Left on Defender Nexus</div>
									<div className="report-aftermath-value">
										{remainingResources ? remainingResourceTotal.toLocaleString() : '0'}
									</div>
									<div className="report-aftermath-resources">
										{remainingResources ? (
											RESOURCE_KEYS.map((key) => (
												<span key={key}>
													{key[0].toUpperCase() + key.slice(1)}{' '}
													<strong>{formatNumber(remainingResources[key])}</strong>
												</span>
											))
										) : (
											<span>No resource data recorded.</span>
										)}
									</div>
									{!hasRecordedRemainingResources && remainingResources && (
										<div className="report-aftermath-note">
											Legacy log: showing current defender resources.
										</div>
									)}
								</div>
							</div>

							{selectedReport.result.controlReduced && !selectedReport.result.conquered && (
								<div className="control-notice">
									Control reduced! Remaining: {selectedReport.result.remainingControl}/100
								</div>
							)}

							{selectedReport.result.nexusLifeReduced && (
								<div className="control-notice">
									Nexus life reduced! Remaining: {selectedReport.result.remainingNexusLife || 0}/
									{selectedReport.defender.nexus?.buildings?.shieldGrid ? 100 : 0}
								</div>
							)}

							<div className="report-section">
								<h3>Strike Information</h3>
								<p>
									<strong>Date:</strong> {formatDate(selectedReport.arrivesAt)}
								</p>
								<p>
									<strong>Striker:</strong>{' '}
									<Username
										name={selectedReport.attacker.user?.username || 'Unknown'}
										isSupporter={selectedReport.attacker.user?.isSupporter}
										supporterTier={selectedReport.attacker.user?.supporterTier}
									/>{' '}
									from {selectedReport.attacker.nexus?.name || 'Unknown'} (
									{selectedReport.attacker.nexus?.x ?? '?'}|
									{selectedReport.attacker.nexus?.y ?? '?'})
								</p>
								<p>
									<strong>Defender:</strong>{' '}
									<Username
										name={selectedReport.defender.user?.username || 'Unknown'}
										isSupporter={selectedReport.defender.user?.isSupporter}
										supporterTier={selectedReport.defender.user?.supporterTier}
									/>{' '}
									from {selectedReport.defender.nexus?.name || 'Unknown'} (
									{selectedReport.defender.nexus?.x ?? '?'}|
									{selectedReport.defender.nexus?.y ?? '?'})
								</p>
								{selectedReport.result?.remainingControl !== undefined &&
									selectedReport.result.remainingControl !== null && (
										<p>
											<strong>Nexus Control:</strong>{' '}
											{(() => {
												const after = selectedReport.result.remainingControl as number;
												const drain = (selectedReport.result as { controlDrain?: number })
													.controlDrain;
												const before = (selectedReport.result as { previousControl?: number })
													.previousControl;
												// Show this strike's actual effect (before -> after, -drain) when
												// the Overseer drained control, so the number is self-explanatory
												// and doesn't have to be diffed against other reports.
												if (drain && drain > 0 && before !== undefined) {
													return (
														<>
															{before} → {after}/100{' '}
															<span style={{ color: '#f85149' }}>(−{drain})</span>
														</>
													);
												}
												return <>{after}/100</>;
											})()}
											{selectedReport.result.conquered && ' (Conquered!)'}
										</p>
									)}
								{selectedReport.result?.remainingNexusLife !== undefined &&
									selectedReport.result.remainingNexusLife !== null && (
										<p>
											<strong>Nexus Life:</strong> {selectedReport.result.remainingNexusLife}/100
										</p>
									)}
							</div>

							{/*
                Combat reports always show exactly two force tables — Attacker
                and Defender, each labelled with the player's username and a
                "(You)" marker for whichever side the viewer is on — plus one
                table per supporting ally. The defender table is garrison-only
                (allied support is reported separately), so a supported defence
                is no longer double-counted across two tables.
              */}
							<div className="report-section">
								<h3>
									Attacker —{' '}
									<Username
										name={attackerName}
										isSupporter={selectedReport.attacker.user?.isSupporter}
										supporterTier={selectedReport.attacker.user?.supporterTier}
									/>
									{myRole === 'attacker' && <span className="report-force-you"> (You)</span>}
								</h3>
								<table className="report-table">
									<thead>
										<tr>
											<th>Unit</th>
											<th>Present</th>
											<th>Lost</th>
											<th>Survived</th>
										</tr>
									</thead>
									<tbody>
										{attackerForceEntries.length === 0 && (
											<tr>
												<td colSpan={4}>No attacking troops recorded.</td>
											</tr>
										)}
										{attackerForceEntries.map(([troopType, count]) => {
											const lost = Number(attackerLossesForDisplay[troopType] || 0);
											return (
												<tr key={troopType}>
													<td>{troopNames[troopType] || troopType}</td>
													<td>{formatNumber(count)}</td>
													<td className={lost > 0 ? 'losses' : undefined}>{formatNumber(lost)}</td>
													<td>{formatNumber(Number(count) - lost)}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>

							<div className="report-section">
								<h3>
									Defender —{' '}
									<Username
										name={defenderName}
										isSupporter={selectedReport.defender.user?.isSupporter}
										supporterTier={selectedReport.defender.user?.supporterTier}
									/>
									{myRole === 'defender' && <span className="report-force-you"> (You)</span>}
								</h3>
								<table className="report-table">
									<thead>
										<tr>
											<th>Unit</th>
											<th>Present</th>
											<th>Lost</th>
											<th>Survived</th>
										</tr>
									</thead>
									<tbody>
										{defenderInitialEntries.length === 0 && (
											<tr>
												<td colSpan={4}>No defending garrison.</td>
											</tr>
										)}
										{defenderInitialEntries.map(([troop, initial]) => {
											const lost = Number(selectedReport.result?.defenderLosses?.[troop] ?? 0);
											const survived = Number(defenderSurvivors[troop] ?? 0);
											return (
												<tr key={troop}>
													<td>{troopNames[troop] || troop}</td>
													<td>{formatNumber(initial)}</td>
													<td className={lost > 0 ? 'losses' : undefined}>{formatNumber(lost)}</td>
													<td className={survived > 0 ? 'survived' : undefined}>
														{formatNumber(survived)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>

							{selectedReport.result?.alliedContributions &&
								selectedReport.result.alliedContributions.length > 0 &&
								selectedReport.result.alliedContributions.map((contrib) => {
									const allyName = contrib.ownerUsername ?? contrib.ownerNexusName;
									const isMe = contrib.ownerNexusId === Number(nexus._id);
									return (
										<div className="report-section" key={contrib.ownerNexusId}>
											<h3>
												Allied support — {allyName}
												{isMe && <span className="report-force-you"> (You)</span>}
												<span className="allied-contrib-nexus"> ({contrib.ownerNexusName})</span>
											</h3>
											<table className="report-table">
												<thead>
													<tr>
														<th>Unit</th>
														<th>Present</th>
														<th>Lost</th>
														<th>Survived</th>
													</tr>
												</thead>
												<tbody>
													{Object.entries(contrib.initial).map(([troop, initial]) => {
														const lost = Number(contrib.losses[troop] ?? 0);
														const survived = Number(contrib.survivors[troop] ?? 0);
														return (
															<tr key={troop}>
																<td>{troopNames[troop] || troop}</td>
																<td>{formatNumber(initial)}</td>
																<td className={lost > 0 ? 'losses' : undefined}>
																	{formatNumber(lost)}
																</td>
																<td className={survived > 0 ? 'survived' : undefined}>
																	{formatNumber(survived)}
																</td>
															</tr>
														);
													})}
												</tbody>
											</table>
										</div>
									);
								})}
						</>
					)}

					{scoutReport && (
						<div className="report-section">
							<h3>Enemy Forces</h3>
							<table className="report-table">
								<thead>
									<tr>
										<th>Unit</th>
										<th>Detected</th>
									</tr>
								</thead>
								<tbody>
									{Object.entries(selectedReport.result?.intel?.troops || {}).map(
										([troop, count]) =>
											Number(count) > 0 && (
												<tr key={troop}>
													<td>{troopNames[troop] || troop}</td>
													<td>{count}</td>
												</tr>
											)
									)}
									{Object.values(selectedReport.result?.intel?.troops || {}).every(
										(count) => Number(count) <= 0
									) && (
										<tr>
											<td colSpan={2}>No enemy troops detected.</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					)}

					{selectedReport.result.resourcesStolen &&
						(selectedReport.result.resourcesStolen.biomass > 0 ||
							selectedReport.result.resourcesStolen.alloy > 0 ||
							selectedReport.result.resourcesStolen.ore > 0) && (
							<div className="report-section">
								<h3>Resources {isMyAttack ? 'Plundered' : 'Lost'}</h3>
								<div className="resources-stolen">
									{selectedReport.result.resourcesStolen.biomass > 0 && (
										<div className="resource-item resource-item--biomass">
											<span className="resource-item__label">Biomass</span>
											<span className="resource-item__value">
												{formatNumber(selectedReport.result.resourcesStolen.biomass)}
											</span>
										</div>
									)}
									{selectedReport.result.resourcesStolen.alloy > 0 && (
										<div className="resource-item resource-item--alloy">
											<span className="resource-item__label">Alloy</span>
											<span className="resource-item__value">
												{formatNumber(selectedReport.result.resourcesStolen.alloy)}
											</span>
										</div>
									)}
									{selectedReport.result.resourcesStolen.ore > 0 && (
										<div className="resource-item resource-item--ore">
											<span className="resource-item__label">Ore</span>
											<span className="resource-item__value">
												{formatNumber(selectedReport.result.resourcesStolen.ore)}
											</span>
										</div>
									)}
								</div>
							</div>
						)}
					{!scoutReport && remainingResources && (
						<div className="report-section">
							<h3>Resources Remaining on Defender Nexus</h3>
							<div className="resources-stolen resources-stolen--remaining">
								{RESOURCE_KEYS.map((key) => (
									<div className={`resource-item resource-item--${key}`} key={key}>
										<span className="resource-item__label">
											{key[0].toUpperCase() + key.slice(1)}
										</span>
										<span className="resource-item__value">
											{formatNumber(remainingResources[key])}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
					{selectedReport.result.buildingDamage &&
						selectedReport.result.buildingDamage.length > 0 && (
							<div className="report-section">
								<h3>Buildings Damaged {isMyAttack ? '(Enemy)' : '(Your Nexus)'}</h3>
								<table className="report-table">
									<thead>
										<tr>
											<th>Building</th>
											<th>Before</th>
											<th>After</th>
										</tr>
									</thead>
									<tbody>
										{selectedReport.result.buildingDamage.map((d, i) => (
											<tr key={i}>
												<td>{buildingNames[d.building] ?? d.building}</td>
												<td>Lv {d.from}</td>
												<td className="losses">Lv {d.to}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
				</div>

				{sharePreview !== null && (
					<div className="share-modal-backdrop" onClick={() => setSharePreview(null)}>
						<div className="share-modal" onClick={(e) => e.stopPropagation()}>
							<div className="share-modal-header">
								<span className="share-modal-title">Preview - Post to Faction Chat</span>
								<button
									className="share-modal-close"
									onClick={() => setSharePreview(null)}
									aria-label="Close"
								>
									X
								</button>
							</div>
							<div className="share-modal-body">
								<pre className="share-modal-preview">{sharePreview}</pre>
							</div>
							<div className="share-modal-footer">
								<button
									className="share-modal-cancel"
									onClick={() => setSharePreview(null)}
									disabled={sharing}
								>
									Cancel
								</button>
								<button
									className="share-modal-confirm"
									onClick={handleConfirmShare}
									disabled={sharing}
								>
									<Share2 size={13} aria-hidden="true" />
									{sharing ? 'Posting...' : 'Post to Faction Chat'}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="reports-container">
			<div className="reports-header">
				<div className="reports-header-row">
					<h2>Combat Logs</h2>
					{unreadCount > 0 && (
						<button className="btn-read-all" onClick={handleMarkAllRead}>
							Mark all read ({unreadCount})
						</button>
					)}
				</div>
			</div>

			<>
					{reports.length === 0 ? (
						<div className="no-reports">
							<p>
								No combat reports yet. Strike other nexuses or defend yours to see reports here!
							</p>
						</div>
					) : (
						<div className="reports-list">
							{reports.map((report) => {
								const isMyAttack = isAttacker(report);
								const amAllyReport = isAlly(report);
								const hasBeenViewed = readIds.has(report._id);
								const won = isMyAttack ? report.result.victory : !report.result.victory;
								const scoutReport = isScoutReport(report);

								return (
									<div
										key={report._id}
										className={`report-item ${hasBeenViewed ? (won ? 'won' : 'lost') : ''}`}
										onClick={() => setSelectedReport(report)}
									>
										<div className="report-icon" aria-hidden="true">
											{hasBeenViewed ? (
												won ? (
													<Trophy size={18} />
												) : (
													<Skull size={18} />
												)
											) : (
												<Swords size={18} />
											)}
										</div>
										<div className="report-info">
											<div className="report-title">
												{hasBeenViewed ? (
													scoutReport ? (
														<>
															Scout report on {report.defender.nexus?.name || 'Unknown'} (
															{report.defender.nexus?.x ?? '?'}|{report.defender.nexus?.y ?? '?'})
														</>
													) : isMyAttack ? (
														<>
															Strike on {report.defender.nexus?.name || 'Unknown'} (
															{report.defender.nexus?.x ?? '?'}|{report.defender.nexus?.y ?? '?'})
														</>
													) : amAllyReport ? (
														<>
															Allied support at {report.defender.nexus?.name || 'Unknown'} (
															{report.defender.nexus?.x ?? '?'}|{report.defender.nexus?.y ?? '?'})
														</>
													) : (
														<>
															Defense against{' '}
															<Username
																name={report.attacker.user?.username || 'Unknown'}
																isSupporter={report.attacker.user?.isSupporter}
																supporterTier={report.attacker.user?.supporterTier}
															/>{' '}
															from {report.attacker.nexus?.name || 'Unknown'} (
															{report.attacker.nexus?.x ?? '?'}|{report.attacker.nexus?.y ?? '?'})
														</>
													)
												) : (
													'Combat Report'
												)}
											</div>
											<div className="report-meta">
												{hasBeenViewed && !scoutReport && (
													<span className={won ? 'victory' : 'defeat'}>
														{won ? 'Victory' : 'Defeat'}
													</span>
												)}
												{hasBeenViewed && scoutReport && <span className="victory">Scout</span>}
												<span className="report-date">{formatDate(report.arrivesAt)}</span>
												{hasBeenViewed &&
													!scoutReport &&
													isMyAttack &&
													report.result.resourcesStolen && (
														<span className="loot">
															<Coins size={12} aria-hidden="true" />{' '}
															{report.result.resourcesStolen.biomass +
																report.result.resourcesStolen.alloy +
																report.result.resourcesStolen.ore}
														</span>
													)}
											</div>
										</div>
										<div className="report-arrow">-&gt;</div>
									</div>
								);
							})}
						</div>
					)}
				</>
		</div>
	);
};

export default Reports;
