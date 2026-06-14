import { ArrowLeft, Share2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import {
	getReadReportIds,
	getReports,
	markAllReportsRead,
	markReportRead,
	sendAttack,
	sendFactionMessage
} from '../services/api';
import '../styles/Reports.css';
import { Attack, Nexus } from '../types/game';
import { formatDateTime } from '../utils/date';
import CombatAAR from './CombatAAR';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';
import ScoutIntelCard from './ScoutIntelCard';
import Username from './Username';

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
	targetingCore: 'Targeting Core',
	stealthArray: 'Stealth Array'
};

// Includes legacy keys (lancerDrone, breakerUnit, skimmerBike,
// suppressorTeam, disruptorUnit, interceptorBike) so completed historical
// combat logs stored under those keys still resolve to a label. New
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

	const [markingAllRead, setMarkingAllRead] = useState(false);

	const handleMarkAllRead = async () => {
		if (markingAllRead) return;
		setMarkingAllRead(true);
		try {
			const res = await markAllReportsRead(nexus._id);
			// Server returns { ids: string[] }; fall back to all local report IDs.
			const ids: string[] = res.data?.ids?.length ? res.data.ids : reports.map((r) => r._id);
			setReadIds((prev) => new Set([...prev, ...ids]));
			onReadStateChange?.();
		} catch (err) {
			console.error('Error marking all reports as read:', err);
			toast('Failed to mark all as read', 'error');
		} finally {
			setMarkingAllRead(false);
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
		const scoutReport = isScoutReport(selectedReport);

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
					<h2>{scoutReport ? 'Recon Operative Log' : 'Combat Log'}</h2>
				</div>

				<div className="report-detail">
					{scoutReport && (
						<div
							className={`report-result ${(isMyAttack ? selectedReport.result.victory : !selectedReport.result.victory) ? 'victory' : 'defeat'}`}
						>
							{selectedReport.result.gate1Failed ? (
								<span>Scouts defeated by enemy recon garrison. No intel returned.</span>
							) : selectedReport.result.scoutFailed ? (
								<span>Scouts broke through but intercepted by Stealth Array. No intel returned.</span>
							) : (
								<span>Recon complete. Intelligence updated.</span>
							)}
						</div>
					)}

					{scoutReport && selectedReport.result.scoutCombat && (
						<div className="report-section">
							<p className="report-scout-combat-summary">
								Your scouts: {selectedReport.result.scoutCombat.attackerSent} sent,{' '}
								{selectedReport.result.scoutCombat.attackerSurvivorsGate1} survived.{' '}
								Enemy garrison: {selectedReport.result.scoutCombat.defenderGarrison} recon ops,{' '}
								{selectedReport.result.scoutCombat.defenderLost} lost.
							</p>
						</div>
					)}

					{!scoutReport && (
						<CombatAAR
							report={selectedReport}
							isMyAttack={isMyAttack}
							amAlly={amAlly}
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
					<h2>Reports</h2>
					{unreadCount > 0 && (
						<button className="btn-read-all" onClick={handleMarkAllRead} disabled={markingAllRead}>
							{markingAllRead ? 'Marking…' : `Mark all read (${unreadCount})`}
						</button>
					)}
				</div>
			</div>

			<>
				{reports.length === 0 ? (
					<div className="no-reports">
						<p>No reports yet. Strike other nexuses or defend yours to see reports here!</p>
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
											) : scoutReport ? (
												'Recon Operative Log'
											) : (
												'Combat Log'
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
