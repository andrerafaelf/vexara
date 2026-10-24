'use client';

import PublicNav from '@/components/PublicNav';
import { CombatIcon } from '@/components/VexaraIcons';
import { TROOP_ICONS } from '@/data/gameIcons';
import '@/styles/Calculator.css';
import {
	CLASS_COUNTERS,
	CONTROL_DRAIN_CLEAR,
	CONTROL_DRAIN_CRUSHING,
	CONTROL_MAX,
	CONTROL_REGEN_PER_HOUR,
	DEF_COUNTER_ADVANTAGE,
	DEF_COUNTER_DISADVANTAGE,
	forcePower,
	MAX_OVERSEERS_PER_ATTACK,
	predictCombat,
	SHIELD_GRID_DEFENSE_PER_LEVEL,
	SHIELD_GRID_MAX_LEVEL,
	shieldEfficiencyFor,
	TARGETING_CORE_BONUS_CAP,
	TARGETING_CORE_BONUS_PER_LEVEL,
	TARGETING_CORE_MAX_LEVEL,
	TROOP_CARRY,
	TROOP_CLASS,
	TROOP_KEYS,
	TROOP_STATS,
	type Force,
	type TroopClass,
	type TroopKey
} from '@/utils/combatSim';
import { ChevronDown, ChevronUp, Crosshair, RefreshCw, Shield, Skull, Trophy } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';

// ── Static data ────────────────────────────────────────────────────────────

const TROOP_LABELS: Record<TroopKey, string> = {
	sentinelLancer: 'Sentinel Lancer',
	assaultTrooper: 'Assault Trooper',
	vanguardBreaker: 'Vanguard Breaker',
	reconOperative: 'Recon Operative',
	wraithSkimmer: 'Wraith Skimmer',
	bulwarkGuard: 'Bulwark Guard',
	aegisSkirmisher: 'Aegis Skirmisher',
	pyreSuppressor: 'Pyre Suppressor',
	arcDisruptor: 'Arc Disruptor',
	phantomLance: 'Phantom Lance',
	siegeMech: 'Siege Mech',
	annihilatorPlatform: 'Annihilator Platform',
	voidStalker: 'Void Stalker',
	plasmaTurret: 'Plasma Turret',
	siegeColossus: 'Siege Colossus',
	overseer: 'Overseer'
};

const CLASS_LABEL: Record<TroopClass, string> = {
	mobile: 'Mobile',
	armor: 'Armor',
	fire: 'Fire',
	special: 'Special'
};

const CLASS_COLOR: Record<TroopClass, string> = {
	mobile: '#38bdf8',
	armor: '#fb923c',
	fire: '#f43f5e',
	special: '#a78bfa'
};

// CDN-backed troop art, keyed by troop key (see data/gameIcons.ts).
const TROOP_IMAGES: Record<TroopKey, string> = TROOP_ICONS as Record<TroopKey, string>;

// Both panels expose the full roster so the calculator can model oddball
// scenarios, including sending defensive units as attackers.
const ALL_TROOP_GROUPS: { cls: TroopClass; keys: TroopKey[] }[] = [
	{
		cls: 'mobile',
		keys: ['vanguardBreaker', 'wraithSkimmer', 'phantomLance', 'voidStalker', 'aegisSkirmisher']
	},
	{ cls: 'armor', keys: ['assaultTrooper', 'bulwarkGuard', 'siegeMech', 'siegeColossus'] },
	{
		cls: 'fire',
		keys: [
			'sentinelLancer',
			'pyreSuppressor',
			'arcDisruptor',
			'annihilatorPlatform',
			'plasmaTurret'
		]
	},
	{ cls: 'special', keys: ['reconOperative', 'overseer'] }
];

// Margin bands follow the server's control-drain tiers (see predictCombat).
const MARGIN_COPY: Record<string, string> = {
	blowout: 'Crushing win, the losing force is wiped out',
	decisive: 'Decisive win, clear outcome, manageable losses',
	close: 'Close fight, expect to bleed for it',
	coinflip: 'Coin-flip, costly win even on the good side'
};

// Defender nexus types that change combat. Only the Military Outpost does:
// it scales Shield Grid efficiency (see shieldEfficiencyFor in combatSim).
type DefenderNexusType = 'standard' | 'outpost' | 'outpostDoubled';
const NEXUS_TYPE_OPTIONS: { value: DefenderNexusType; label: string }[] = [
	{ value: 'standard', label: 'Standard' },
	{ value: 'outpost', label: 'Military Outpost' },
	{ value: 'outpostDoubled', label: 'Military Outpost (doubled)' }
];
function shieldEfficiencyForOption(option: DefenderNexusType): number {
	if (option === 'standard') return shieldEfficiencyFor(null);
	return shieldEfficiencyFor('Military Outpost', option === 'outpostDoubled');
}

function clampLevel(raw: string, max: number) {
	return Math.min(max, Math.max(0, parseInt(raw, 10) || 0));
}

function fmt(n: number) {
	return Math.round(n).toLocaleString();
}
function pct(n: number) {
	return `${Math.round(n * 100)}%`;
}
// Percentage with up to one decimal (1.5%, 22.5%), for per-level bonuses.
function pctFine(n: number) {
	return `${Number((n * 100).toFixed(1))}%`;
}
function mult(n: number) {
	return `×${n.toFixed(2)}`;
}

// ── Force editor ──────────────────────────────────────────────────────────

interface ForceEditorProps {
	label: string;
	side: 'atk' | 'def';
	force: Force;
	groups: { cls: TroopClass; keys: TroopKey[] }[];
	shieldGrid: number;
	targetingCore: number;
	nexusType: DefenderNexusType;
	onChange: (force: Force) => void;
	onShieldChange: (v: number) => void;
	onTargetingCoreChange: (v: number) => void;
	onNexusTypeChange: (v: DefenderNexusType) => void;
}

function ForceEditor({
	label,
	side,
	force,
	groups,
	shieldGrid,
	targetingCore,
	nexusType,
	onChange,
	onShieldChange,
	onTargetingCoreChange,
	onNexusTypeChange
}: ForceEditorProps) {
	const [collapsed, setCollapsed] = useState<Record<TroopClass, boolean>>({
		mobile: false,
		armor: false,
		fire: false,
		special: false
	});

	// The server rejects strikes with more than MAX_OVERSEERS_PER_ATTACK Overseers.
	const maxFor = (key: TroopKey) =>
		side === 'atk' && key === 'overseer' ? MAX_OVERSEERS_PER_ATTACK : undefined;

	const set = (key: TroopKey, raw: string) => {
		const cap = maxFor(key);
		const v = Math.max(0, parseInt(raw, 10) || 0);
		onChange({ ...force, [key]: cap === undefined ? v : Math.min(cap, v) });
	};

	const visibleKeys = groups.flatMap((g) => g.keys);
	const setAll = (val: number) => {
		const next: Force = { ...force };
		for (const k of visibleKeys) next[k] = val;
		onChange(next);
	};

	const total = visibleKeys.reduce((s, k) => s + (force[k] || 0), 0);
	const shieldEfficiency = shieldEfficiencyForOption(nexusType);

	const statHint = (key: TroopKey) => {
		const st = TROOP_STATS[key];
		if (side === 'atk') {
			if (key === 'plasmaTurret') return 'Stationary, cannot attack';
			if (key === 'overseer') return `Max ${MAX_OVERSEERS_PER_ATTACK} per strike`;
			return `ATK ${st.attack} · CRG ${TROOP_CARRY[key]}`;
		}
		return `DEF ${st.defense}${key === 'plasmaTurret' ? ' · stationary' : ''}`;
	};

	return (
		<div className={`calc-panel calc-panel--${side}`}>
			<div className="calc-panel-header">
				<span className="calc-panel-label">
					{side === 'atk' ? (
						<CombatIcon size={14} aria-hidden="true" />
					) : (
						<Shield size={14} aria-hidden="true" />
					)}
					{label}
				</span>
				<span className="calc-panel-total">{fmt(total)} units</span>
				<button className="calc-clear-btn" onClick={() => setAll(0)} title="Clear all">
					<RefreshCw size={12} aria-hidden="true" /> Clear
				</button>
			</div>

			{groups.map(({ cls, keys }) => (
				<div key={cls} className="calc-class-group">
					<button
						className="calc-class-header"
						onClick={() => setCollapsed((p) => ({ ...p, [cls]: !p[cls] }))}
						style={{ '--cls-color': CLASS_COLOR[cls] } as React.CSSProperties}
					>
						<span className="calc-class-dot" />
						<span className="calc-class-name">{CLASS_LABEL[cls]}</span>
						{collapsed[cls] ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
					</button>

					{!collapsed[cls] && (
						<div className="calc-troop-rows">
							{keys.map((key) => {
								const img = TROOP_IMAGES[key] ?? null;
								return (
									<div key={key} className="calc-troop-row">
										<div className="calc-troop-info">
											{img && (
												<div className="calc-troop-img-wrap">
													<Image
														src={img}
														alt={TROOP_LABELS[key]}
														width={28}
														height={28}
														className="calc-troop-img"
														unoptimized
													/>
												</div>
											)}
											<div className="calc-troop-name-wrap">
												<span className="calc-troop-name">{TROOP_LABELS[key]}</span>
												<span className="calc-troop-stat-hint">{statHint(key)}</span>
											</div>
										</div>
										<input
											className="calc-troop-input"
											type="number"
											min={0}
											max={maxFor(key)}
											value={force[key] || ''}
											placeholder="0"
											onChange={(e) => set(key, e.target.value)}
										/>
									</div>
								);
							})}
						</div>
					)}
				</div>
			))}

			<div className="calc-modifiers">
				{side === 'atk' && (
					<label className="calc-mod-row">
						<span className="calc-mod-label">Targeting Core level</span>
						<input
							className="calc-mod-input"
							type="number"
							min={0}
							max={TARGETING_CORE_MAX_LEVEL}
							value={targetingCore || ''}
							placeholder="0"
							onChange={(e) =>
								onTargetingCoreChange(clampLevel(e.target.value, TARGETING_CORE_MAX_LEVEL))
							}
						/>
						<span className="calc-mod-hint">
							+
							{pctFine(
								Math.min(targetingCore * TARGETING_CORE_BONUS_PER_LEVEL, TARGETING_CORE_BONUS_CAP)
							)}{' '}
							counter bonus
						</span>
					</label>
				)}
				{side === 'def' && (
					<>
						<label className="calc-mod-row">
							<span className="calc-mod-label">Shield Grid level</span>
							<input
								className="calc-mod-input"
								type="number"
								min={0}
								max={SHIELD_GRID_MAX_LEVEL}
								value={shieldGrid || ''}
								placeholder="0"
								onChange={(e) => onShieldChange(clampLevel(e.target.value, SHIELD_GRID_MAX_LEVEL))}
							/>
							<span className="calc-mod-hint">
								+{pctFine(shieldGrid * SHIELD_GRID_DEFENSE_PER_LEVEL * shieldEfficiency)} defence
							</span>
						</label>
						<label className="calc-mod-row" style={{ marginTop: 8 }}>
							<span className="calc-mod-label">Nexus type</span>
							<select
								className="calc-mod-input"
								style={{ width: 'auto', textAlign: 'left' }}
								value={nexusType}
								onChange={(e) => onNexusTypeChange(e.target.value as DefenderNexusType)}
							>
								{NEXUS_TYPE_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
							<span className="calc-mod-hint">
								{shieldEfficiency === 1
									? 'No shield modifier'
									: `${mult(shieldEfficiency)} Shield Grid efficiency`}
							</span>
						</label>
					</>
				)}
			</div>
		</div>
	);
}

// ── Results panel ─────────────────────────────────────────────────────────

interface ResultPanelProps {
	atk: Force;
	def: Force;
	targetingCore: number;
	shieldGrid: number;
	shieldEfficiency: number;
}

function controlTierLabel(drain: number) {
	if (drain >= CONTROL_DRAIN_CRUSHING) return 'crushing';
	if (drain >= CONTROL_DRAIN_CLEAR) return 'clear';
	return 'narrow';
}

function ResultPanel({ atk, def, targetingCore, shieldGrid, shieldEfficiency }: ResultPanelProps) {
	const atkTotal = TROOP_KEYS.reduce((s, k) => s + (atk[k] || 0), 0);
	const defTotal = TROOP_KEYS.reduce((s, k) => s + (def[k] || 0), 0);

	const result = useMemo(() => {
		if (atkTotal === 0) return null;
		return predictCombat({
			attacker: atk,
			defender: def,
			attackerTargetingCore: targetingCore,
			defenderShieldGrid: shieldGrid,
			shieldEfficiencyMultiplier: shieldEfficiency
		});
	}, [atk, def, targetingCore, shieldGrid, shieldEfficiency, atkTotal]);

	// Surviving units, straight from the sim's per-type expected losses.
	const survivors = useMemo(() => {
		if (!result) return null;
		const atkSurv: Force = {};
		const defSurv: Force = {};
		for (const k of TROOP_KEYS) {
			atkSurv[k] = Math.max(0, (atk[k] || 0) - (result.attackerLosses[k] || 0));
			defSurv[k] = Math.max(0, (def[k] || 0) - (result.defenderLosses[k] || 0));
		}
		return { atk: atkSurv, def: defSurv };
	}, [result, atk, def]);

	if (atkTotal === 0) {
		return (
			<div className="calc-result calc-result--idle">
				<CombatIcon size={20} className="calc-result-idle-icon" aria-hidden="true" />
				<p>Enter your attacking force to see the predicted outcome.</p>
			</div>
		);
	}

	const r = result!;
	const hasOverseer = (atk.overseer || 0) > 0;
	const overseerLost = (r.attackerLosses.overseer || 0) > 0;

	let conquestCopy: string;
	if (r.conquerCapable) {
		conquestCopy = `Overseer survives the win and drains ${r.controlDrain} control (${controlTierLabel(r.controlDrain)} win). From full control that is ${Math.ceil(CONTROL_MAX / r.controlDrain)} strikes, and control regenerates +${CONTROL_REGEN_PER_HOUR} per hour in between.`;
	} else if (r.attackerWins) {
		conquestCopy = 'The escort is wiped, so the Overseer dies with it and drains no control.';
	} else if (overseerLost) {
		conquestCopy =
			'Attack fails and the escort is wiped, so the Overseer is lost. No control drain.';
	} else {
		conquestCopy = 'Attack fails, no control drain. The Overseer survives and returns home.';
	}

	// Class breakdown for power bar
	const atkClassPower = (() => {
		const map: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
		for (const k of TROOP_KEYS) {
			const n = atk[k] || 0;
			if (n > 0) map[TROOP_CLASS[k]] += n * TROOP_STATS[k].attack;
		}
		return map;
	})();
	const defClassPower = (() => {
		const map: Record<TroopClass, number> = { mobile: 0, armor: 0, fire: 0, special: 0 };
		for (const k of TROOP_KEYS) {
			const n = def[k] || 0;
			if (n > 0) map[TROOP_CLASS[k]] += n * TROOP_STATS[k].defense;
		}
		return map;
	})();
	const rawAtkPow = forcePower(atk, 'attack');
	const atkPowTotal = Math.max(rawAtkPow, 1);
	const defPowTotal = Math.max(forcePower(def, 'defense'), 1);

	return (
		<div className={`calc-result ${r.attackerWins ? 'calc-result--win' : 'calc-result--loss'}`}>
			{/* Verdict */}
			<div className="calc-verdict">
				<div className="calc-verdict-icon">
					{r.attackerWins ? (
						<Trophy size={22} aria-hidden="true" />
					) : (
						<Skull size={22} aria-hidden="true" />
					)}
				</div>
				<div>
					<div className="calc-verdict-title">
						{r.attackerWins ? 'Attacker Wins' : 'Defender Holds'}
					</div>
					<div className="calc-verdict-margin">{MARGIN_COPY[r.marginLabel]}</div>
				</div>
			</div>

			{/* Power comparison */}
			<div className="calc-power-block">
				<div className="calc-power-row">
					<span className="calc-power-label">
						<CombatIcon size={12} aria-hidden="true" /> Attack power
					</span>
					<span className="calc-power-value calc-power-value--atk">{fmt(r.attackPower)}</span>
				</div>
				<div className="calc-power-bar-wrap">
					<div
						className="calc-power-bar calc-power-bar--atk"
						style={{
							width: `${Math.min(100, (r.attackPower / Math.max(r.attackPower, r.defensePower)) * 100)}%`
						}}
					/>
				</div>
				<div className="calc-power-row">
					<span className="calc-power-label">
						<Shield size={12} aria-hidden="true" /> Defence power
					</span>
					<span className="calc-power-value calc-power-value--def">{fmt(r.defensePower)}</span>
				</div>
				<div className="calc-power-bar-wrap">
					<div
						className="calc-power-bar calc-power-bar--def"
						style={{
							width: `${Math.min(100, (r.defensePower / Math.max(r.attackPower, r.defensePower)) * 100)}%`
						}}
					/>
				</div>
			</div>

			{/* Loss estimates */}
			<div className="calc-losses">
				<div className="calc-loss-col">
					<span className="calc-loss-label">Attacker losses</span>
					<span
						className={`calc-loss-pct ${r.attackerWins ? 'calc-loss-pct--win' : 'calc-loss-pct--lose'}`}
					>
						{pct(r.attackerLossPct)}
					</span>
					{survivors && (
						<span className="calc-loss-abs">
							~{fmt(TROOP_KEYS.reduce((s, k) => s + (survivors.atk[k] || 0), 0))} survive
						</span>
					)}
				</div>
				<div className="calc-loss-divider" />
				<div className="calc-loss-col">
					<span className="calc-loss-label">Defender losses</span>
					<span
						className={`calc-loss-pct ${!r.attackerWins ? 'calc-loss-pct--win' : 'calc-loss-pct--lose'}`}
					>
						{pct(r.defenderLossPct)}
					</span>
					{survivors && defTotal > 0 && (
						<span className="calc-loss-abs">
							~{fmt(TROOP_KEYS.reduce((s, k) => s + (survivors.def[k] || 0), 0))} survive
						</span>
					)}
				</div>
			</div>

			{/* Loot capacity */}
			{r.attackerWins && r.estLootCapacity > 0 && (
				<div
					className="calc-loot"
					title="Carry capacity of the surviving force. The actual haul is capped by the defender's visible stockpile (after the Stealth Array vault) and reduced by any loot protection."
				>
					<span className="calc-loot-label">Estimated loot capacity</span>
					<span className="calc-loot-value">{fmt(r.estLootCapacity)}</span>
				</div>
			)}

			{/* Conquest indicator */}
			{hasOverseer && (
				<div
					className={`calc-conquest ${r.conquerCapable ? 'calc-conquest--yes' : 'calc-conquest--no'}`}
				>
					<Crosshair size={13} aria-hidden="true" />
					{conquestCopy}
				</div>
			)}

			{/* Surviving units table */}
			{survivors && (
				<details className="calc-survivors">
					<summary className="calc-survivors-toggle">Estimated survivors by unit type</summary>
					<div className="calc-survivors-grid">
						<div className="calc-survivors-col">
							<div className="calc-survivors-heading">
								<CombatIcon size={11} aria-hidden="true" /> Attackers
							</div>
							{TROOP_KEYS.filter((k) => (atk[k] || 0) > 0).map((k) => (
								<div key={k} className="calc-survivor-row">
									<span className="calc-survivor-name">{TROOP_LABELS[k]}</span>
									<span className="calc-survivor-vals">
										<span className="calc-survivor-sent">{fmt(atk[k] || 0)}</span>
										<span className="calc-survivor-arrow">→</span>
										<span className="calc-survivor-remain">{fmt(survivors.atk[k] || 0)}</span>
									</span>
								</div>
							))}
							{TROOP_KEYS.every((k) => (atk[k] || 0) === 0) && (
								<span className="calc-survivor-empty">None sent</span>
							)}
						</div>
						<div className="calc-survivors-col">
							<div className="calc-survivors-heading">
								<Shield size={11} aria-hidden="true" /> Defenders
							</div>
							{TROOP_KEYS.filter((k) => (def[k] || 0) > 0).map((k) => (
								<div key={k} className="calc-survivor-row">
									<span className="calc-survivor-name">{TROOP_LABELS[k]}</span>
									<span className="calc-survivor-vals">
										<span className="calc-survivor-sent">{fmt(def[k] || 0)}</span>
										<span className="calc-survivor-arrow">→</span>
										<span className="calc-survivor-remain">{fmt(survivors.def[k] || 0)}</span>
									</span>
								</div>
							))}
							{defTotal === 0 && <span className="calc-survivor-empty">Empty garrison</span>}
						</div>
					</div>
				</details>
			)}

			{/* Class composition breakdown */}
			<details className="calc-class-breakdown">
				<summary className="calc-survivors-toggle">Class composition</summary>
				<div className="calc-class-breakdown-grid">
					{(['mobile', 'armor', 'fire'] as TroopClass[]).map((cls) => (
						<div key={cls} className="calc-class-breakdown-row">
							<span className="calc-class-breakdown-name" style={{ color: CLASS_COLOR[cls] }}>
								{CLASS_LABEL[cls]}
							</span>
							<div className="calc-class-breakdown-bars">
								<div className="calc-class-bar-row">
									<span className="calc-class-bar-side">
										<CombatIcon size={9} aria-hidden="true" />
									</span>
									<div className="calc-class-bar-track">
										<div
											className="calc-class-bar-fill calc-class-bar-fill--atk"
											style={{
												width: `${Math.min(100, (atkClassPower[cls] / atkPowTotal) * 100)}%`
											}}
										/>
									</div>
									<span className="calc-class-bar-val">{fmt(atkClassPower[cls])}</span>
								</div>
								<div className="calc-class-bar-row">
									<span className="calc-class-bar-side">
										<Shield size={9} aria-hidden="true" />
									</span>
									<div className="calc-class-bar-track">
										<div
											className="calc-class-bar-fill calc-class-bar-fill--def"
											style={{
												width: `${Math.min(100, (defClassPower[cls] / defPowTotal) * 100)}%`
											}}
										/>
									</div>
									<span className="calc-class-bar-val">{fmt(defClassPower[cls])}</span>
								</div>
							</div>
						</div>
					))}
				</div>
			</details>
		</div>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function CalculatorClient() {
	const [atk, setAtk] = useState<Force>({});
	const [def, setDef] = useState<Force>({});
	const [targetingCore, setTargetingCore] = useState(0);
	const [shieldGrid, setShieldGrid] = useState(0);
	const [nexusType, setNexusType] = useState<DefenderNexusType>('standard');

	const swap = () => {
		// The new attacker is bound by the per-strike Overseer cap, and each level
		// is clamped to its own building's max. The new defender's nexus type is
		// unknown, so it resets to standard.
		setAtk({ ...def, overseer: Math.min(def.overseer || 0, MAX_OVERSEERS_PER_ATTACK) });
		setDef(atk);
		setTargetingCore(Math.min(shieldGrid, TARGETING_CORE_MAX_LEVEL));
		setShieldGrid(Math.min(targetingCore, SHIELD_GRID_MAX_LEVEL));
		setNexusType('standard');
	};

	return (
		<div className="calc-page">
			<PublicNav loc="Calculator" />

			<div className="calc-class-triangle">
				<span style={{ color: CLASS_COLOR.mobile }}>Mobile</span>
				<span className="calc-triangle-sep">beats</span>
				<span style={{ color: CLASS_COLOR.armor }}>Armor</span>
				<span className="calc-triangle-sep">·</span>
				<span style={{ color: CLASS_COLOR.armor }}>Armor</span>
				<span className="calc-triangle-sep">beats</span>
				<span style={{ color: CLASS_COLOR.fire }}>Fire</span>
				<span className="calc-triangle-sep">·</span>
				<span style={{ color: CLASS_COLOR.fire }}>Fire</span>
				<span className="calc-triangle-sep">beats</span>
				<span style={{ color: CLASS_COLOR.mobile }}>Mobile</span>
				<span className="calc-triangle-sep">
					- attack {mult(CLASS_COUNTERS.mobile.armor)} / {mult(CLASS_COUNTERS.mobile.fire)}, defence{' '}
					{mult(DEF_COUNTER_ADVANTAGE)} / {mult(DEF_COUNTER_DISADVANTAGE)}
				</span>
			</div>

			<div className="calc-layout">
				<ForceEditor
					label="Attacker"
					side="atk"
					force={atk}
					groups={ALL_TROOP_GROUPS}
					shieldGrid={shieldGrid}
					targetingCore={targetingCore}
					nexusType={nexusType}
					onChange={setAtk}
					onShieldChange={setShieldGrid}
					onTargetingCoreChange={setTargetingCore}
					onNexusTypeChange={setNexusType}
				/>

				<div className="calc-center">
					<ResultPanel
						atk={atk}
						def={def}
						targetingCore={targetingCore}
						shieldGrid={shieldGrid}
						shieldEfficiency={shieldEfficiencyForOption(nexusType)}
					/>
					<button
						className="calc-swap-btn"
						onClick={swap}
						title="Swap attacker and defender forces"
					>
						<RefreshCw size={14} aria-hidden="true" /> Swap sides
					</button>
				</div>

				<ForceEditor
					label="Defender"
					side="def"
					force={def}
					groups={ALL_TROOP_GROUPS}
					shieldGrid={shieldGrid}
					targetingCore={targetingCore}
					nexusType={nexusType}
					onChange={setDef}
					onShieldChange={setShieldGrid}
					onTargetingCoreChange={setTargetingCore}
					onNexusTypeChange={setNexusType}
				/>
			</div>
		</div>
	);
}
