import { AlertTriangle, Shield, Users, Zap } from 'lucide-react';
import React from 'react';
import '../styles/ScoutIntelCard.css';
import ResourceIcon from './ResourceIcon';

interface IntelData {
	resources: { biomass: number; alloy: number; ore: number };
	buildings: {
		commandCore: number;
		hangarBay: number;
		plasmaForge: number;
		armorFoundry: number;
		lifeSupport: number;
		storageVault: number;
		biomassFarm: number;
		alloyForge: number;
		oreExtractor: number;
		shieldGrid: number;
	};
	troops: Record<string, number>;
	supportTroops?: Record<string, number>;
	population: { current: number; max: number };
	controlLevel: number;
}

interface ScoutIntelCardProps {
	intel: IntelData;
	targetName: string;
	targetCoords: { x: number; y: number };
	scoutedAt?: string;
}

const TROOP_STATS: Record<string, { attack: number; defense: number }> = {
	sentinelLancer: { attack: 3, defense: 22 },
	assaultTrooper: { attack: 5, defense: 45 },
	vanguardBreaker: { attack: 35, defense: 3 },
	reconOperative: { attack: 1, defense: 20 },
	wraithSkimmer: { attack: 80, defense: 10 },
	siegeMech: { attack: 40, defense: 260 },
	bulwarkGuard: { attack: 3, defense: 130 },
	aegisSkirmisher: { attack: 50, defense: 90 },
	pyreSuppressor: { attack: 65, defense: 8 },
	arcDisruptor: { attack: 75, defense: 9 },
	phantomLance: { attack: 95, defense: 13 },
	voidStalker: { attack: 150, defense: 15 },
	plasmaTurret: { attack: 0, defense: 160 },
	annihilatorPlatform: { attack: 320, defense: 35 },
	siegeColossus: { attack: 280, defense: 280 },
	overseer: { attack: 0, defense: 8 },
	// Legacy keys preserved so a historical scout report stored under the
	// pre-Stage-2d names still scores threat correctly.
	lancerDrone: { attack: 3, defense: 22 },
	breakerUnit: { attack: 35, defense: 3 },
	skimmerBike: { attack: 80, defense: 10 },
	suppressorTeam: { attack: 65, defense: 8 },
	disruptorUnit: { attack: 75, defense: 9 },
	interceptorBike: { attack: 95, defense: 13 }
};

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
	annihilatorPlatform: 'Annihilator Platform',
	voidStalker: 'Void Stalker',
	plasmaTurret: 'Plasma Turret',
	siegeColossus: 'Siege Colossus',
	overseer: 'Overseer',
	// Legacy keys (historical scout reports).
	lancerDrone: 'Sentinel Lancer',
	breakerUnit: 'Vanguard Breaker',
	skimmerBike: 'Wraith Skimmer',
	suppressorTeam: 'Pyre Suppressor',
	disruptorUnit: 'Arc Disruptor',
	interceptorBike: 'Phantom Lance'
};

// Merge garrison + allied support into one count map (for total defense/threat).
function mergeTroops(
	a: Record<string, number>,
	b?: Record<string, number>
): Record<string, number> {
	if (!b) return a;
	const out: Record<string, number> = { ...a };
	for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + (v ?? 0);
	return out;
}

function computeDefensePower(troops: Record<string, number>, shieldLevel: number): number {
	const raw = Object.entries(troops).reduce((sum, [type, count]) => {
		return sum + count * (TROOP_STATS[type]?.defense ?? 0);
	}, 0);
	return Math.round(raw * (1 + shieldLevel * 0.02));
}

function getThreatLevel(defensePower: number): { label: string; className: string; icon: string } {
	if (defensePower === 0) return { label: 'Undefended', className: 'threat-none', icon: '○' };
	if (defensePower < 500) return { label: 'Minimal', className: 'threat-minimal', icon: '▲' };
	if (defensePower < 2000) return { label: 'Moderate', className: 'threat-moderate', icon: '▲▲' };
	if (defensePower < 6000) return { label: 'High', className: 'threat-high', icon: '▲▲▲' };
	return { label: 'Extreme', className: 'threat-extreme', icon: '▲▲▲▲' };
}

const BUILDING_LABELS: Record<string, string> = {
	commandCore: 'Command Core',
	hangarBay: 'Hangar Bay',
	plasmaForge: 'Plasma Forge',
	armorFoundry: 'Armor Foundry',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid'
};

const ScoutIntelCard: React.FC<ScoutIntelCardProps> = ({ intel, targetName, targetCoords }) => {
	const support = intel.supportTroops;
	const hasSupport = !!support && Object.values(support).some((n) => n > 0);
	// Threat + defense power reflect the FULL force the attacker will face
	// (garrison + allied reinforcements), so the badge isn't misleadingly low.
	const mergedDefense = mergeTroops(intel.troops, support);
	const totalTroops = Object.values(intel.troops).reduce((s, n) => s + n, 0);
	const defensePower = computeDefensePower(mergedDefense, intel.buildings.shieldGrid);
	const threat = getThreatLevel(defensePower);
	const totalResources = intel.resources.biomass + intel.resources.alloy + intel.resources.ore;
	const popPct =
		intel.population.max > 0
			? Math.round((intel.population.current / intel.population.max) * 100)
			: 0;
	const activeTroops = Object.entries(intel.troops).filter(([, n]) => n > 0);
	const activeSupport = support ? Object.entries(support).filter(([, n]) => n > 0) : [];

	return (
		<div className="intel-card">
			{/* Header */}
			<div className="intel-card-header">
				<div className="intel-card-title-row">
					<span className="intel-card-label">Intelligence Report</span>
					<span className={`intel-threat-badge ${threat.className}`}>
						<AlertTriangle size={11} />
						{threat.label}
					</span>
				</div>
				<div className="intel-card-target">
					<span className="intel-target-name">{targetName}</span>
					<span className="intel-target-coords">
						({targetCoords.x}|{targetCoords.y})
					</span>
				</div>
			</div>

			{/* Summary row */}
			<div className="intel-summary-row">
				<div className="intel-summary-cell">
					<Zap size={13} className="intel-summary-icon intel-summary-icon--atk" />
					<span className="intel-summary-label">Est. Defense</span>
					<span className="intel-summary-value">{defensePower.toLocaleString()}</span>
				</div>
				<div className="intel-summary-cell">
					<Users size={13} className="intel-summary-icon intel-summary-icon--pop" />
					<span className="intel-summary-label">Population</span>
					<span className="intel-summary-value">
						{intel.population.current}/{intel.population.max}
					</span>
				</div>
				<div className="intel-summary-cell">
					<Shield size={13} className="intel-summary-icon intel-summary-icon--shield" />
					<span className="intel-summary-label">Control</span>
					<span className="intel-summary-value">{intel.controlLevel}/100</span>
				</div>
			</div>

			{/* Resources */}
			<div className="intel-section">
				<div className="intel-section-heading">Resources on Hand</div>
				<div className="intel-resources">
					<div className="intel-resource-item">
						<ResourceIcon kind="biomass" size={13} />
						<span className="intel-resource-label">Biomass</span>
						<span className="intel-resource-value">{intel.resources.biomass.toLocaleString()}</span>
					</div>
					<div className="intel-resource-item">
						<ResourceIcon kind="alloy" size={13} />
						<span className="intel-resource-label">Alloy</span>
						<span className="intel-resource-value">{intel.resources.alloy.toLocaleString()}</span>
					</div>
					<div className="intel-resource-item">
						<ResourceIcon kind="ore" size={13} />
						<span className="intel-resource-label">Ore</span>
						<span className="intel-resource-value">{intel.resources.ore.toLocaleString()}</span>
					</div>
					<div className="intel-resource-total">
						Total lootable: <strong>{totalResources.toLocaleString()}</strong>
					</div>
				</div>
			</div>

			{/* Garrison */}
			<div className="intel-section">
				<div className="intel-section-heading">
					Detected Garrison
					{totalTroops > 0 && <span className="intel-troop-total">{totalTroops} units</span>}
				</div>
				{activeTroops.length === 0 ? (
					<div className="intel-no-troops">No troops detected</div>
				) : (
					<div className="intel-troop-grid">
						{activeTroops.map(([type, count]) => {
							const stats = TROOP_STATS[type];
							const defContrib = count * (stats?.defense ?? 0);
							return (
								<div key={type} className="intel-troop-row">
									<span className="intel-troop-name">{TROOP_NAMES[type] ?? type}</span>
									<span className="intel-troop-count">{count}</span>
									<span className="intel-troop-def" title="Defense contribution">
										+{defContrib.toLocaleString()} def
									</span>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Allied reinforcements (stationed support from faction/friends) */}
			{hasSupport && (
				<div className="intel-section">
					<div className="intel-section-heading intel-section-heading--support">
						<AlertTriangle size={11} />
						Allied Reinforcements
						<span className="intel-troop-total">
							{activeSupport.reduce((s, [, n]) => s + n, 0)} units
						</span>
					</div>
					<div className="intel-troop-grid">
						{activeSupport.map(([type, count]) => {
							const stats = TROOP_STATS[type];
							const defContrib = count * (stats?.defense ?? 0);
							return (
								<div key={type} className="intel-troop-row intel-troop-row--support">
									<span className="intel-troop-name">{TROOP_NAMES[type] ?? type}</span>
									<span className="intel-troop-count">{count}</span>
									<span className="intel-troop-def" title="Defense contribution">
										+{defContrib.toLocaleString()} def
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Buildings */}
			<div className="intel-section">
				<div className="intel-section-heading">Infrastructure</div>
				<div className="intel-buildings-grid">
					{Object.entries(intel.buildings)
						.filter(([, lvl]) => lvl > 0)
						.sort(([, a], [, b]) => b - a)
						.map(([key, lvl]) => (
							<div key={key} className="intel-building-item">
								<span className="intel-building-name">{BUILDING_LABELS[key] ?? key}</span>
								<span className="intel-building-level">Lv {lvl}</span>
							</div>
						))}
				</div>
			</div>

			{/* Pop bar */}
			<div className="intel-pop-bar-wrap">
				<span className="intel-pop-bar-label">Population pressure</span>
				<div className="intel-pop-bar-track">
					<div
						className={`intel-pop-bar-fill ${popPct > 85 ? 'intel-pop-bar-fill--high' : ''}`}
						style={{ width: `${popPct}%` }}
					/>
				</div>
				<span className="intel-pop-bar-pct">{popPct}%</span>
			</div>
		</div>
	);
};

export default ScoutIntelCard;
