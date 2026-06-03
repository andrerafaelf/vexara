import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import { TROOPS_DOC, CLASS_COUNTERS } from '@/data/gameDocs';
import '@/styles/GuidePages.css';

const TITLE = 'Vexara Units Guide - All 14 Troops, Stats & Class Counters';
const DESCRIPTION =
	'Complete unit roster for Vexara, the free browser MMO RTS. Stats, costs, unlock requirements, and class counter relationships for all 14 troop types - Lancer Drone to Annihilator Platform.';

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	keywords: [
		'Vexara units',
		'Vexara troops',
		'Vexara unit guide',
		'mmo rts unit types',
		'browser rts troops',
		'Vexara unit stats',
		'Vexara roster'
	],
	alternates: { canonical: '/units' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: 'https://vexara.world/units',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'article'
	},
	robots: { index: true, follow: true }
};

const CLASS_LABEL: Record<string, string> = {
	mobile: 'Mobile',
	armor: 'Armor',
	fire: 'Fire',
	special: 'Special'
};

const CLASS_COLOR: Record<string, string> = {
	mobile: '#38bdf8',
	armor: '#fb923c',
	fire: '#f43f5e',
	special: '#a78bfa'
};

export default function UnitsPage() {
	const byClass: Record<string, typeof TROOPS_DOC> = {};
	for (const t of TROOPS_DOC) {
		if (!byClass[t.unitClass]) byClass[t.unitClass] = [];
		byClass[t.unitClass].push(t);
	}
	const classOrder = ['mobile', 'armor', 'fire', 'special'];

	return (
		<>
			<PublicNav loc="Units" />

			<main className="gp-root">
				<header className="gp-header">
					<div className="gp-header-label">// UNIT ROSTER</div>
					<h1 className="gp-title">Vexara Units - All 14 Troops</h1>
					<p className="gp-subtitle">
						Vexara fields 14 unit types across four classes. Composition wins fights - not raw
						numbers. Every unit below is available in the free browser version with no download
						required.
					</p>
				</header>

				<section className="gp-section">
					<h2 className="gp-section-title">Class counter triangle</h2>
					<p className="gp-prose">
						Vexara uses a rock-paper-scissors damage system. Each of the three combat classes deals
						×1.35 damage against the class it counters, and receives ×0.75 effective damage when
						countered. Special units (Overseer, Recon Operative) are neutral - they do not fight.
					</p>
					<ul className="gp-counter-list">
						{CLASS_COUNTERS.map((c) => (
							<li key={c.attacker} className="gp-counter-item">
								<span className="gp-counter-tag" style={{ color: CLASS_COLOR[c.attacker] }}>
									{CLASS_LABEL[c.attacker]}
								</span>
								<span className="gp-counter-arrow">beats</span>
								<span className="gp-counter-tag" style={{ color: CLASS_COLOR[c.beats] }}>
									{CLASS_LABEL[c.beats]}
								</span>
								<span className="gp-counter-mult">×{c.multiplier}</span>
							</li>
						))}
					</ul>
				</section>

				{classOrder.map((cls) => (
					<section key={cls} className="gp-section">
						<h2 className="gp-section-title" style={{ color: CLASS_COLOR[cls] }}>
							{CLASS_LABEL[cls]} class
						</h2>
						<div className="gp-unit-grid">
							{(byClass[cls] ?? []).map((unit) => (
								<article key={unit.key} className="gp-unit-card">
									<div className="gp-unit-card-head">
										<h3 className="gp-unit-name">{unit.name}</h3>
										<span className="gp-unit-role">{unit.role}</span>
									</div>
									<p className="gp-unit-desc">{unit.description}</p>
									<div className="gp-unit-stats">
										<div className="gp-stat">
											<span className="gp-stat-label">ATK</span>
											<span className="gp-stat-val">{unit.stats.attack}</span>
										</div>
										<div className="gp-stat">
											<span className="gp-stat-label">DEF</span>
											<span className="gp-stat-val">{unit.stats.defense}</span>
										</div>
										<div className="gp-stat">
											<span className="gp-stat-label">SPD</span>
											<span className="gp-stat-val">{unit.stats.speed}</span>
										</div>
										<div className="gp-stat">
											<span className="gp-stat-label">CRG</span>
											<span className="gp-stat-val">{unit.stats.carry}</span>
										</div>
									</div>
									<div className="gp-unit-cost">
										<span className="gp-cost-item">🌿 {unit.cost.biomass.toLocaleString()}</span>
										<span className="gp-cost-item">⚙️ {unit.cost.alloy.toLocaleString()}</span>
										<span className="gp-cost-item">🪨 {unit.cost.ore.toLocaleString()}</span>
										<span className="gp-cost-item">👤 {unit.cost.population} pop</span>
										<span className="gp-cost-item">⏱ {unit.cost.time}</span>
									</div>
									{unit.requirements.length > 0 && (
										<div className="gp-unit-reqs">
											<span className="gp-reqs-label">Requires:</span>
											{unit.requirements.map((r) => (
												<span key={r} className="gp-req-tag">
													{r}
												</span>
											))}
										</div>
									)}
									{unit.notes && unit.notes.length > 0 && (
										<ul className="gp-unit-notes">
											{unit.notes.map((n, i) => (
												<li key={i}>{n}</li>
											))}
										</ul>
									)}
								</article>
							))}
						</div>
					</section>
				))}

				<div className="gp-cta-block">
					<p className="gp-cta-text">Want to see these units in action? The galaxy is live.</p>
					<Link href="/register" className="gp-cta-btn">
						Join the live galaxy
					</Link>
				</div>
			</main>

			<SiteFooter />
		</>
	);
}
