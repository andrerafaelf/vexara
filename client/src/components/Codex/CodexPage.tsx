'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
	TROOPS_DOC,
	BUILDINGS_DOC,
	BUILDING_SCALING_DOC,
	CLASS_COUNTERS,
	CLASS_COUNTERED_BY,
	type TroopClass
} from '@/data/gameDocs';
import { TROOP_ICONS, BUILDING_ICONS } from '@/data/gameIcons';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import { useTabParam } from '@/hooks/useTabParam';
import '@/styles/Codex.css';

type Tab = 'buildings' | 'troops' | 'scaling';
const CODEX_TABS: readonly Tab[] = ['buildings', 'troops', 'scaling'] as const;

export default function CodexPage() {
	const [tab, setTab] = useTabParam<Tab>(CODEX_TABS, 'buildings');
	const [activeAnchor, setActiveAnchor] = useState<string>('');

	// Track which entry is in view, to highlight in the rail.
	useEffect(() => {
		const entries = [
			...BUILDINGS_DOC.map((b) => `building-${b.key}`),
			...TROOPS_DOC.map((t) => `troop-${t.key}`)
		];
		const observers: IntersectionObserver[] = [];
		const seen = new Map<string, number>();

		// Observe each entry and track its intersection ratio. On change, pick the most visible entry to set as active.
		entries.forEach((id) => {
			const el = document.getElementById(id);
			if (!el) return;
			const io = new IntersectionObserver(
				([entry]) => {
					seen.set(id, entry.intersectionRatio);
					// Pick the most visible entry.
					let best: [string, number] = ['', 0];
					seen.forEach((ratio, key) => {
						if (ratio > best[1]) best = [key, ratio];
					});
					if (best[0]) setActiveAnchor(best[0]);
				},
				{ rootMargin: '-30% 0px -55% 0px', threshold: [0.1, 0.3, 0.6] }
			);
			io.observe(el);
			observers.push(io);
		});

		return () => observers.forEach((io) => io.disconnect());
	}, []);

	// On initial load, honor #troop-x / #building-x in the URL.
	useEffect(() => {
		const hash = window.location.hash.replace('#', '');
		if (!hash) return;
		if (hash.startsWith('troop-')) setTab('troops');
		else if (hash.startsWith('building-')) setTab('buildings');
		// small delay so the rendered tab content lands before we scroll
		setTimeout(() => {
			const el = document.getElementById(hash);
			if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
		}, 60);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="cx-root">
			<PublicNav loc="Codex" />
			<CodexHeader />

			<div className="cx-shell">
				<CodexRail tab={tab} setTab={setTab} activeAnchor={activeAnchor} />

				<main className="cx-main">
					<CodexTabs tab={tab} setTab={setTab} />

					{tab === 'buildings' && (
						<section className="cx-stream" aria-label="Buildings">
							<CodexStreamHead
								eyebrow="DOSSIER · CORE"
								title="Buildings"
								lede="Ten structures drive every nexus. Build order is identity."
							/>
							{BUILDINGS_DOC.map((b, i) => (
								<BuildingEntry key={b.key} doc={b} index={i + 1} />
							))}
						</section>
					)}

					{tab === 'troops' && (
						<section className="cx-stream" aria-label="Troops">
							<CodexStreamHead
								eyebrow="DOSSIER · MILITARY"
								title="Troops"
								lede="Fourteen units. Four stats. Composition wins fights."
							/>
							<ClassCountersPanel />
							{TROOPS_DOC.map((t, i) => (
								<TroopEntry key={t.key} doc={t} index={i + 1} />
							))}
						</section>
					)}


					{tab === 'scaling' && (
						<section className="cx-stream" aria-label="Scaling">
							<CodexStreamHead
								eyebrow="APPENDIX · MATH"
								title="Scaling"
								lede="Cost and time multipliers per construction stage."
							/>
							<ScalingPanel />
						</section>
					)}
				</main>
			</div>

			<SiteFooter />
		</div>
	);
}

/* ──────────────────────────────────────────────────────────── HEADER === */

function CodexHeader() {
	return (
		<section className="cx-header" aria-labelledby="cx-header-title">
			<div className="cx-header-inner">
				<div className="cx-header-label">{'// CODEX'}</div>

				<h1 id="cx-header-title" className="cx-header-title">
					<span className="cx-header-title-thin">A field manual</span>
					<span className="cx-header-title-shout">for the persistent galaxy.</span>
				</h1>

				<p className="cx-header-sub">
					Every building. Every unit. Every requirement. Updated by the developer, not crowdsourced.
					Read in order or jump in from the rail.
				</p>

				<dl className="cx-header-stats">
					<div>
						<dt>Buildings</dt>
						<dd>{BUILDINGS_DOC.length.toString().padStart(2, '0')}</dd>
					</div>
					<div>
						<dt>Unit types</dt>
						<dd>{TROOPS_DOC.length.toString().padStart(2, '0')}</dd>
					</div>
					<div>
						<dt>Max level</dt>
						<dd>{Math.max(...BUILDINGS_DOC.map((b) => b.maxLevel))}</dd>
					</div>
					<div>
						<dt>Pop cost</dt>
						<dd>{TROOPS_DOC.reduce((s, t) => s + t.cost.population, 0)}</dd>
					</div>
				</dl>
			</div>
		</section>
	);
}

/* ────────────────────────────────────────────────────────────── RAIL === */

function CodexRail({
	tab,
	setTab,
	activeAnchor
}: {
	tab: Tab;
	setTab: (t: Tab) => void;
	activeAnchor: string;
}) {
	return (
		<aside className="cx-rail" aria-label="Codex navigation">
			<div className="cx-rail-inner">
				<CodexRailGroup
					title="// Buildings"
					isOpen={tab === 'buildings'}
					onClick={() => setTab('buildings')}
				>
					{BUILDINGS_DOC.map((b) => {
						const id = `building-${b.key}`;
						const icon = BUILDING_ICONS[b.key];
						return (
							<a
								key={id}
								href={`#${id}`}
								className={`cx-rail-link ${activeAnchor === id ? 'is-active' : ''}`}
							>
								{icon ? (
									<span className="cx-rail-link-icon">
										<Image src={icon} alt="" width={30} height={30} />
									</span>
								) : (
									<span className="cx-rail-link-icon" />
								)}
								<span className="cx-rail-link-name">{b.name}</span>
							</a>
						);
					})}
				</CodexRailGroup>

				<CodexRailGroup
					title="// Troops"
					isOpen={tab === 'troops'}
					onClick={() => setTab('troops')}
				>
					{TROOPS_DOC.map((t) => {
						const id = `troop-${t.key}`;
						const icon = TROOP_ICONS[t.key];
						return (
							<a
								key={id}
								href={`#${id}`}
								className={`cx-rail-link ${activeAnchor === id ? 'is-active' : ''}`}
							>
								{icon ? (
									<span className="cx-rail-link-icon">
										<Image src={icon} alt="" width={30} height={30} />
									</span>
								) : (
									<span className="cx-rail-link-icon" />
								)}
								<span className="cx-rail-link-name">{t.name}</span>
							</a>
						);
					})}
				</CodexRailGroup>

				<CodexRailGroup
					title="// Appendix"
					isOpen={tab === 'scaling'}
					onClick={() => setTab('scaling')}
				>
					<a
						href="#scaling"
						className={`cx-rail-link ${tab === 'scaling' ? 'is-active' : ''}`}
						onClick={() => setTab('scaling')}
					>
						<span className="cx-rail-link-icon cx-rail-link-icon-text">∑</span>
						<span className="cx-rail-link-name">Scaling math</span>
					</a>
				</CodexRailGroup>
			</div>
		</aside>
	);
}

function CodexRailGroup({
	title,
	children,
	isOpen,
	onClick
}: {
	title: string;
	children: React.ReactNode;
	isOpen: boolean;
	onClick: () => void;
}) {
	return (
		<div className={`cx-rail-group ${isOpen ? 'is-open' : ''}`}>
			<button type="button" className="cx-rail-group-head" onClick={onClick}>
				<span>{title}</span>
				<span className="cx-rail-group-caret" aria-hidden="true">
					{isOpen ? '−' : '+'}
				</span>
			</button>
			{isOpen && <div className="cx-rail-group-body">{children}</div>}
		</div>
	);
}

/* ──────────────────────────────────────────────────── MOBILE TABS ===== */

function CodexTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
	return (
		<div className="cx-tabs" role="tablist" aria-label="Section selection">
			{(['buildings', 'troops', 'scaling'] as Tab[]).map((t) => (
				<button
					key={t}
					role="tab"
					aria-selected={tab === t}
					className={`cx-tab ${tab === t ? 'is-active' : ''}`}
					onClick={() => setTab(t)}
				>
					{t === 'buildings' && 'Buildings'}
					{t === 'troops' && 'Troops'}
					{t === 'scaling' && 'Scaling'}
				</button>
			))}
		</div>
	);
}

function CodexStreamHead({
	eyebrow,
	title,
	lede
}: {
	eyebrow: string;
	title: string;
	lede: string;
}) {
	return (
		<header className="cx-stream-head">
			<span className="cx-stream-eyebrow">{eyebrow}</span>
			<h2 className="cx-stream-title">{title}</h2>
			<p className="cx-stream-lede">{lede}</p>
			<span className="cx-stream-rule" aria-hidden="true" />
		</header>
	);
}

/* ─────────────────────────────────────────────────── BUILDING ENTRY === */

function BuildingEntry({ doc, index }: { doc: (typeof BUILDINGS_DOC)[number]; index: number }) {
	const icon = BUILDING_ICONS[doc.key];
	return (
		<article id={`building-${doc.key}`} className="cx-entry cx-entry-building">
			<div className="cx-entry-head">
				<div className="cx-entry-icon">
					{icon && <Image src={icon} alt="" width={84} height={84} />}
				</div>
				<div className="cx-entry-titleblock">
					<span className="cx-entry-idx">№ {index.toString().padStart(2, '0')} / BLD</span>
					<h3 className="cx-entry-title">{doc.name}</h3>
					<p className="cx-entry-role">{doc.role}</p>
				</div>
				<div className="cx-entry-meta">
					<div className="cx-meta-cell">
						<span className="cx-meta-label">Max level</span>
						<span className="cx-meta-value">{doc.maxLevel}</span>
					</div>
					{doc.unlock && (
						<div className="cx-meta-cell">
							<span className="cx-meta-label">Unlocks at</span>
							<span className="cx-meta-value cx-meta-value-text">{doc.unlock}</span>
						</div>
					)}
				</div>
			</div>

			<p className="cx-entry-desc">{doc.description}</p>

			<div className="cx-entry-grid">
				<div className="cx-block">
					<span className="cx-block-label">{'// Base cost · Lv 1'}</span>
					<ul className="cx-resource-list">
						<li>
							<span className="cx-res-name">BIO</span>
							<span className="cx-res-value">{doc.baseCost.biomass}</span>
						</li>
						<li>
							<span className="cx-res-name">ALY</span>
							<span className="cx-res-value">{doc.baseCost.alloy}</span>
						</li>
						<li>
							<span className="cx-res-name">ORE</span>
							<span className="cx-res-value">{doc.baseCost.ore}</span>
						</li>
						<li>
							<span className="cx-res-name">TIME</span>
							<span className="cx-res-value">{doc.baseCost.timeSeconds}s</span>
						</li>
					</ul>
				</div>

				<div className="cx-block cx-block-track">
					<span className="cx-block-label">{'// Milestones'}</span>
					<MilestoneTrack doc={doc} />
				</div>
			</div>

			{doc.impact.length > 0 && (
				<aside className="cx-callout">
					<span className="cx-callout-tag">IMPACT</span>
					<ul>
						{doc.impact.map((line, i) => (
							<li key={i}>{line}</li>
						))}
					</ul>
				</aside>
			)}

			<span className="cx-entry-divider" aria-hidden="true" />
		</article>
	);
}

function MilestoneTrack({ doc }: { doc: (typeof BUILDINGS_DOC)[number] }) {
	// Build a track from 1 to maxLevel with marks at milestone levels.
	const max = doc.maxLevel;
	const milestoneByLevel = new Map(doc.milestones.map((m) => [m.level, m.requires]));

	// Render a horizontal segmented bar.
	const segments = useMemo(() => {
		return Array.from({ length: max }, (_, i) => i + 1);
	}, [max]);

	return (
		<div className="cx-track">
			<div className="cx-track-bar">
				{segments.map((lvl) => {
					const isMilestone = milestoneByLevel.has(lvl);
					return (
						<span
							key={lvl}
							className={`cx-track-seg ${isMilestone ? 'is-milestone' : ''}`}
							title={
								isMilestone
									? `Lv ${lvl}: requires ${milestoneByLevel.get(lvl)?.join(', ')}`
									: `Lv ${lvl}`
							}
						>
							{isMilestone && <span className="cx-track-diamond" aria-hidden="true" />}
						</span>
					);
				})}
			</div>
			<div className="cx-track-legend">
				<span>Lv 01</span>
				<span>Lv {max.toString().padStart(2, '0')}</span>
			</div>
			{doc.milestones.length > 0 && (
				<ul className="cx-milestones">
					{doc.milestones.map((m) => (
						<li key={m.level}>
							<span className="cx-milestone-mark">Lv {m.level}</span>
							<span className="cx-milestone-req">requires {m.requires.join(' + ')}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/* ────────────────────────────────────────────────────── TROOP ENTRY === */

function TroopEntry({ doc, index }: { doc: (typeof TROOPS_DOC)[number]; index: number }) {
	const icon = TROOP_ICONS[doc.key];
	// Normalize stat bars to a per-page max so the visual is comparable.
	const STAT_MAX = { attack: 360, defense: 340, speed: 32, carry: 250 };
	return (
		<article id={`troop-${doc.key}`} className="cx-entry cx-entry-troop">
			<div className="cx-entry-head">
				<div className="cx-entry-icon">
					{icon && <Image src={icon} alt="" width={84} height={84} />}
				</div>
				<div className="cx-entry-titleblock">
					<span className="cx-entry-idx">№ {index.toString().padStart(2, '0')} / TRP</span>
					<h3 className="cx-entry-title">{doc.name}</h3>
					<p className="cx-entry-role">{doc.role}</p>
				</div>
				<div className="cx-entry-meta">
					<div className="cx-meta-cell">
						<span className="cx-meta-label">Class</span>
						<span
							className={`cx-class-chip cx-class-chip-${doc.unitClass}`}
							title={
								CLASS_COUNTERED_BY[doc.unitClass]
									? `${CLASS_LABELS[doc.unitClass]} - countered by ${CLASS_LABELS[CLASS_COUNTERED_BY[doc.unitClass]!]}`
									: `${CLASS_LABELS[doc.unitClass]} - neutral matchup`
							}
						>
							{CLASS_LABELS[doc.unitClass]}
						</span>
					</div>
					<div className="cx-meta-cell">
						<span className="cx-meta-label">Pop cost</span>
						<span className="cx-meta-value">{doc.cost.population}</span>
					</div>
					<div className="cx-meta-cell">
						<span className="cx-meta-label">Build time</span>
						<span className="cx-meta-value cx-meta-value-text">{doc.cost.time}</span>
					</div>
				</div>
			</div>

			<p className="cx-entry-desc">{doc.description}</p>

			<div className="cx-entry-grid">
				<div className="cx-block">
					<span className="cx-block-label">{'// Stats'}</span>
					<ul className="cx-statbars">
						<StatBar label="ATK" value={doc.stats.attack} max={STAT_MAX.attack} tone="attack" />
						<StatBar label="DEF" value={doc.stats.defense} max={STAT_MAX.defense} tone="defense" />
						<StatBar label="SPD" value={doc.stats.speed} max={STAT_MAX.speed} tone="speed" />
						<StatBar label="CRG" value={doc.stats.carry} max={STAT_MAX.carry} tone="carry" />
					</ul>
				</div>

				<div className="cx-block">
					<span className="cx-block-label">{'// Cost · per unit'}</span>
					<ul className="cx-resource-list">
						<li>
							<span className="cx-res-name">BIO</span>
							<span className="cx-res-value">{doc.cost.biomass}</span>
						</li>
						<li>
							<span className="cx-res-name">ALY</span>
							<span className="cx-res-value">{doc.cost.alloy}</span>
						</li>
						<li>
							<span className="cx-res-name">ORE</span>
							<span className="cx-res-value">{doc.cost.ore}</span>
						</li>
						<li>
							<span className="cx-res-name">POP</span>
							<span className="cx-res-value">{doc.cost.population}</span>
						</li>
					</ul>
				</div>
			</div>

			{doc.requirements.length > 0 && (
				<div className="cx-reqs">
					<span className="cx-reqs-label">{'// Requires'}</span>
					<div className="cx-reqs-chips">
						{doc.requirements.map((r) => (
							<span key={r} className="cx-chip">
								{r}
							</span>
						))}
					</div>
				</div>
			)}

			{doc.notes && doc.notes.length > 0 && (
				<aside className="cx-callout">
					<span className="cx-callout-tag">FIELD NOTES</span>
					<ul>
						{doc.notes.map((n, i) => (
							<li key={i}>{n}</li>
						))}
					</ul>
				</aside>
			)}

			<span className="cx-entry-divider" aria-hidden="true" />
		</article>
	);
}

const CLASS_LABELS: Record<TroopClass, string> = {
	mobile: 'MOBILE',
	armor: 'ARMOR',
	fire: 'FIRE',
	special: 'SPECIAL'
};

function ClassCountersPanel() {
	return (
		<div className="cx-class-counters">
			<div className="cx-class-counters-head">
				<span className="cx-class-counters-eyebrow">{'// Class counters'}</span>
				<p className="cx-class-counters-lede">
					Every unit belongs to a class. Class advantage adds <strong>+35%</strong> damage on
					attack; being countered subtracts <strong>20–25%</strong>. The Targeting Core amplifies this gap
					by +1.5%/level (capped at +30% extra at Lv20).
				</p>
			</div>
			<ul className="cx-class-counters-list">
				{CLASS_COUNTERS.map((c) => (
					<li key={c.attacker} className="cx-class-counter-row">
						<span className={`cx-class-chip cx-class-chip-${c.attacker}`}>
							{CLASS_LABELS[c.attacker]}
						</span>
						<span className="cx-class-counter-arrow" aria-hidden="true">
							beats
						</span>
						<span className={`cx-class-chip cx-class-chip-${c.beats}`}>
							{CLASS_LABELS[c.beats]}
						</span>
						<span className="cx-class-counter-mult">×{c.multiplier.toFixed(2)}</span>
					</li>
				))}
				<li className="cx-class-counter-row cx-class-counter-row-note">
					<span className={`cx-class-chip cx-class-chip-special`}>{CLASS_LABELS.special}</span>
					<span className="cx-class-counter-arrow">no combat advantage (recon/overseer roles)</span>
				</li>
			</ul>
			<p className="cx-class-counters-footer">
				Mix your composition to match counters against the defender&apos;s class split. A pure stack
				gets eaten by its hard counter; a balanced force loses less to one bad matchup.
			</p>
		</div>
	);
}

const STAT_TOOLTIPS: Record<string, string> = {
	attack: 'Attack - damage output in combat',
	defense: 'Defense - damage absorbed before casualties',
	speed: 'Speed - movement rate on the map (higher = faster travel)',
	carry: 'Cargo - resources this unit can haul home as loot per raid'
};

function StatBar({
	label,
	value,
	max,
	tone
}: {
	label: string;
	value: number;
	max: number;
	tone: 'attack' | 'defense' | 'speed' | 'carry';
}) {
	const pct = Math.max(2, Math.min(100, (value / max) * 100));
	return (
		<li className="cx-statbar" title={STAT_TOOLTIPS[tone]}>
			<span className="cx-statbar-label">{label}</span>
			<span className="cx-statbar-track">
				<span className={`cx-statbar-fill cx-statbar-${tone}`} style={{ width: `${pct}%` }} />
				{/* Tick marks every 25% */}
				<span className="cx-statbar-ticks" aria-hidden="true">
					<span style={{ left: '25%' }} />
					<span style={{ left: '50%' }} />
					<span style={{ left: '75%' }} />
				</span>
			</span>
			<span className="cx-statbar-value">{value}</span>
		</li>
	);
}


/* ──────────────────────────────────────────────────────── SCALING ===== */

function ScalingPanel() {
	return (
		<div id="scaling" className="cx-scaling">
			<div className="cx-scaling-grid">
				<div className="cx-scaling-card">
					<span className="cx-scaling-label">{'// Cost multiplier per level'}</span>
					<table className="cx-scaling-table">
						<thead>
							<tr>
								<th>Stage</th>
								<th>Multiplier</th>
								<th>Applies to</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Early</td>
								<td>×{BUILDING_SCALING_DOC.costScaling.early}</td>
								<td>Lv 1–5</td>
							</tr>
							<tr>
								<td>Mid</td>
								<td>×{BUILDING_SCALING_DOC.costScaling.mid}</td>
								<td>Lv 6–10</td>
							</tr>
							<tr>
								<td>Late</td>
								<td>×{BUILDING_SCALING_DOC.costScaling.late}</td>
								<td>Lv 11+</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div className="cx-scaling-card">
					<span className="cx-scaling-label">{'// Build-time multiplier per level'}</span>
					<table className="cx-scaling-table">
						<thead>
							<tr>
								<th>Stage</th>
								<th>Multiplier</th>
								<th>Applies to</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Early</td>
								<td>×{BUILDING_SCALING_DOC.timeScaling.early}</td>
								<td>Lv 1–5</td>
							</tr>
							<tr>
								<td>Mid</td>
								<td>×{BUILDING_SCALING_DOC.timeScaling.mid}</td>
								<td>Lv 6–10</td>
							</tr>
							<tr>
								<td>Late</td>
								<td>×{BUILDING_SCALING_DOC.timeScaling.late}</td>
								<td>Lv 11+</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<aside className="cx-callout">
				<span className="cx-callout-tag">RULE OF THUMB</span>
				<ul>
					{BUILDING_SCALING_DOC.stages.map((s, i) => (
						<li key={i}>{s}</li>
					))}
				</ul>
			</aside>
		</div>
	);
}
