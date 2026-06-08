'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import PublicNav from '@/components/PublicNav';
import {
	Shield,
	Swords,
	Trophy,
	Skull,
	Crosshair,
	RefreshCw,
	ChevronDown,
	ChevronUp
} from 'lucide-react';
import {
	predictCombat,
	TROOP_STATS,
	TROOP_CLASS,
	TROOP_CARRY,
	TROOP_KEYS,
	forcePower,
	type Force,
	type TroopKey,
	type TroopClass
} from '@/utils/combatSim';
import { TROOP_ICONS } from '@/data/gameIcons';
import '@/styles/Calculator.css';

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

const MARGIN_COPY: Record<string, string> = {
	blowout: 'Crushing victory — total dominance',
	decisive: 'Decisive win — clear outcome, manageable losses',
	close: 'Close fight — expect to bleed for it',
	coinflip: 'Coin-flip — costly win even on the good side'
};

function fmt(n: number) {
	return Math.round(n).toLocaleString();
}
function pct(n: number) {
	return `${Math.round(n * 100)}%`;
}

// ── Force editor ──────────────────────────────────────────────────────────

interface ForceEditorProps {
	label: string;
	side: 'atk' | 'def';
	force: Force;
	groups: { cls: TroopClass; keys: TroopKey[] }[];
	shieldGrid: number;
	targetingCore: number;
	onChange: (force: Force) => void;
	onShieldChange: (v: number) => void;
	onTargetingCoreChange: (v: number) => void;
}

function ForceEditor({
	label,
	side,
	force,
	groups,
	shieldGrid,
	targetingCore,
	onChange,
	onShieldChange,
	onTargetingCoreChange
}: ForceEditorProps) {
	const [collapsed, setCollapsed] = useState<Record<TroopClass, boolean>>({
		mobile: false,
		armor: false,
		fire: false,
		special: false
	});

	const set = (key: TroopKey, raw: string) => {
		const v = Math.max(0, parseInt(raw, 10) || 0);
		onChange({ ...force, [key]: v });
	};

	const visibleKeys = groups.flatMap((g) => g.keys);
	const setAll = (val: number) => {
		const next: Force = { ...force };
		for (const k of visibleKeys) next[k] = val;
		onChange(next);
	};

	const total = visibleKeys.reduce((s, k) => s + (force[k] || 0), 0);

	return (
		<div className={`calc-panel calc-panel--${side}`}>
			<div className="calc-panel-header">
				<span className="calc-panel-label">
					{side === 'atk' ? (
						<Swords size={14} aria-hidden="true" />
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
								const st = TROOP_STATS[key];
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
												<span className="calc-troop-stat-hint">
													{side === 'atk'
														? `ATK ${st.attack} · CRG ${TROOP_CARRY[key]}`
														: `DEF ${st.defense}${key === 'plasmaTurret' ? ' · stationary' : ''}`}
												</span>
											</div>
										</div>
										<input
											className="calc-troop-input"
											type="number"
											min={0}
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
							max={20}
							value={targetingCore || ''}
							placeholder="0"
							onChange={(e) =>
								onTargetingCoreChange(Math.min(20, Math.max(0, parseInt(e.target.value, 10) || 0)))
							}
						/>
						<span className="calc-mod-hint">
							+{Math.min(targetingCore * 1.5, 30).toFixed(0)}% counter bonus
						</span>
					</label>
				)}
				{side === 'def' && (
					<label className="calc-mod-row">
						<span className="calc-mod-label">Shield Grid level</span>
						<input
							className="calc-mod-input"
							type="number"
							min={0}
							max={20}
							value={shieldGrid || ''}
							placeholder="0"
							onChange={(e) => onShieldChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
						/>
						<span className="calc-mod-hint">+{(shieldGrid * 2).toFixed(0)}% defence</span>
					</label>
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
}

function ResultPanel({ atk, def, targetingCore, shieldGrid }: ResultPanelProps) {
	const atkTotal = TROOP_KEYS.reduce((s, k) => s + (atk[k] || 0), 0);
	const defTotal = TROOP_KEYS.reduce((s, k) => s + (def[k] || 0), 0);

	const result = useMemo(() => {
		if (atkTotal === 0) return null;
		return predictCombat({
			attacker: atk,
			defender: def,
			attackerTargetingCore: targetingCore,
			defenderShieldGrid: shieldGrid
		});
	}, [atk, def, targetingCore, shieldGrid, atkTotal]);

	// Surviving unit estimates
	const survivors = useMemo(() => {
		if (!result) return null;
		const atkSurv: Force = {};
		const defSurv: Force = {};
		for (const k of TROOP_KEYS) {
			const a = atk[k] || 0;
			const d = def[k] || 0;
			atkSurv[k] = Math.round(a * (1 - result.attackerLossPct));
			defSurv[k] = Math.round(d * (1 - result.defenderLossPct));
		}
		return { atk: atkSurv, def: defSurv };
	}, [result, atk, def]);

	if (atkTotal === 0) {
		return (
			<div className="calc-result calc-result--idle">
				<Swords size={20} className="calc-result-idle-icon" aria-hidden="true" />
				<p>Enter your attacking force to see the predicted outcome.</p>
			</div>
		);
	}

	const r = result!;
	const hasOverseer = (atk.overseer || 0) > 0;

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
						<Swords size={12} aria-hidden="true" /> Attack power
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
				<div className="calc-loot">
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
					{r.conquerCapable
						? 'Garrison cleared — Overseer can drive control down.'
						: 'Garrison likely survives — Overseer needs full wipe to act.'}
				</div>
			)}

			{/* Surviving units table */}
			{survivors && (
				<details className="calc-survivors">
					<summary className="calc-survivors-toggle">Estimated survivors by unit type</summary>
					<div className="calc-survivors-grid">
						<div className="calc-survivors-col">
							<div className="calc-survivors-heading">
								<Swords size={11} aria-hidden="true" /> Attackers
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
										<Swords size={9} aria-hidden="true" />
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

export default function CalculatorPage() {
	const [atk, setAtk] = useState<Force>({});
	const [def, setDef] = useState<Force>({});
	const [targetingCore, setTargetingCore] = useState(0);
	const [shieldGrid, setShieldGrid] = useState(0);

	const swap = () => {
		setAtk(def);
		setDef(atk);
		setTargetingCore(shieldGrid);
		setShieldGrid(targetingCore);
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
				<span className="calc-triangle-sep">— ×1.35 / ×0.75</span>
			</div>

			<div className="calc-layout">
				<ForceEditor
					label="Attacker"
					side="atk"
					force={atk}
					groups={ALL_TROOP_GROUPS}
					shieldGrid={shieldGrid}
					targetingCore={targetingCore}
					onChange={setAtk}
					onShieldChange={setShieldGrid}
					onTargetingCoreChange={setTargetingCore}
				/>

				<div className="calc-center">
					<ResultPanel atk={atk} def={def} targetingCore={targetingCore} shieldGrid={shieldGrid} />
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
					onChange={setDef}
					onShieldChange={setShieldGrid}
					onTargetingCoreChange={setTargetingCore}
				/>
			</div>
		</div>
	);
}
