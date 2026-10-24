import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import { BUILDINGS_DOC } from '@/data/gameDocs';
import '@/styles/GuidePages.css';

const TITLE = `Vexara Buildings Guide - All ${BUILDINGS_DOC.length} Core Structures & Scaling`;
const DESCRIPTION =
	'Complete buildings reference for Vexara, the free browser MMO RTS. Costs, max levels, unlock requirements, milestones, and production scaling for all 12 structures - Command Core to Stealth Array.';

export const metadata: Metadata = {
	title: { absolute: TITLE },
	description: DESCRIPTION,
	keywords: [
		'Vexara buildings',
		'Vexara buildings guide',
		'Vexara structures',
		'browser rts buildings',
		'Vexara base building',
		'Vexara command core',
		'mmo rts base building'
	],
	alternates: { canonical: '/buildings' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: 'https://vexara.world/buildings',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'article'
	},
	robots: { index: true, follow: true }
};

const CATEGORY: Record<string, string> = {
	commandCore: 'Progression',
	hangarBay: 'Military',
	plasmaForge: 'Military',
	armorFoundry: 'Military',
	lifeSupport: 'Population',
	storageVault: 'Economy',
	biomassFarm: 'Economy',
	alloyForge: 'Economy',
	oreExtractor: 'Economy',
	shieldGrid: 'Defence',
	targetingCore: 'Military',
	stealthArray: 'Defence'
};

const CATEGORY_ORDER = ['Progression', 'Economy', 'Population', 'Military', 'Defence'];

function formatTime(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function BuildingsPage() {
	const byCategory: Record<string, typeof BUILDINGS_DOC> = {};
	for (const b of BUILDINGS_DOC) {
		const cat = CATEGORY[b.key] ?? 'Other';
		if (!byCategory[cat]) byCategory[cat] = [];
		byCategory[cat].push(b);
	}

	return (
		<>
			<PublicNav loc="Buildings" />

			<main className="gp-root">
				<header className="gp-header">
					<div className="gp-header-label">// INFRASTRUCTURE</div>
					<h1 className="gp-title">Vexara Buildings - All {BUILDINGS_DOC.length} Structures</h1>
					<p className="gp-subtitle">
						{BUILDINGS_DOC.length} core buildings drive every nexus in Vexara. Economy, military, and defence -
						each structure unlocks new capabilities and scales with investment. All available
						free, in your browser.
					</p>
				</header>

				<section className="gp-section">
					<h2 className="gp-section-title">Cost scaling</h2>
					<p className="gp-prose">
						Build costs increase per level in three stages: upgrades to levels 2–5 scale at ×1.5
						per level, levels 6–10 at ×1.65, and levels 11+ at ×1.8. Build time scales more gently,
						at ×1.25, ×1.35 and ×1.45 per level over the same stages, before the Command Core
						construction speed bonus. Life Support, which goes to level 25, uses a compressed curve
						so its level 25 cost and time match a level 20 building. Plan your upgrade order around
						the steepest scaling gates - pushing past level 10 on any building is a significant
						investment.
					</p>
				</section>

				{CATEGORY_ORDER.filter((cat) => byCategory[cat]).map((cat) => (
					<section key={cat} className="gp-section">
						<h2 className="gp-section-title">{cat}</h2>
						<div className="gp-building-grid">
							{byCategory[cat].map((b) => (
								<article key={b.key} className="gp-building-card">
									<div className="gp-building-card-head">
										<h3 className="gp-building-name">{b.name}</h3>
										<span className="gp-building-role">{b.role}</span>
										<span className="gp-building-maxlvl">Max Lv{b.maxLevel}</span>
									</div>
									<p className="gp-building-desc">{b.description}</p>
									<div className="gp-building-cost">
										<span className="gp-cost-item">🌿 {b.baseCost.biomass.toLocaleString()}</span>
										<span className="gp-cost-item">⚙️ {b.baseCost.alloy.toLocaleString()}</span>
										<span className="gp-cost-item">🪨 {b.baseCost.ore.toLocaleString()}</span>
										<span className="gp-cost-item">
											⏱ {formatTime(b.baseCost.timeSeconds)} base
										</span>
									</div>
									{b.unlock && (
										<div className="gp-building-unlock">
											Unlocks at: <span className="gp-req-tag">{b.unlock}</span>
										</div>
									)}
									{b.impact.length > 0 && (
										<ul className="gp-building-impact">
											{b.impact.map((line, i) => (
												<li key={i}>{line}</li>
											))}
										</ul>
									)}
									{b.milestones.length > 0 && (
										<div className="gp-building-milestones">
											<span className="gp-milestones-label">Milestones:</span>
											{b.milestones.map((m) => (
												<div key={m.level} className="gp-milestone">
													<span className="gp-req-tag">Lv{m.level}</span>
													{m.requires.map((r) => (
														<span key={r} className="gp-req-tag gp-req-dep">
															{r}
														</span>
													))}
												</div>
											))}
										</div>
									)}
								</article>
							))}
						</div>
					</section>
				))}

				<div className="gp-cta-block">
					<p className="gp-cta-text">Ready to build your first nexus?</p>
					<Link href="/register" className="gp-cta-btn">
						Join the live galaxy
					</Link>
				</div>
			</main>

			<SiteFooter />
		</>
	);
}
