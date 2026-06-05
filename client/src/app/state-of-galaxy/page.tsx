import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import UpdatedAgo from './UpdatedAgo';
import { DISCORD_URL } from '@/constants/social';
import '@/styles/GuidePages.css';

// Refresh the prerendered HTML every 5 minutes. Search crawlers and link
// previews see fresh galaxy numbers without us hitting the API on every
// request, and "live" copy on the page stays believable.
export const revalidate = 300;

const SITE_URL = 'https://vexara.world';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const TITLE = 'Vexara Live Galaxy - Active Players, Battles & Top Factions';
const DESCRIPTION =
	'Real-time status of the Vexara MMO galaxy: active commanders, ongoing battles, top factions, and recent conquests. Free browser MMO RTS, no download.';

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	keywords: [
		'Vexara live galaxy',
		'Vexara galaxy status',
		'Vexara active players',
		'Vexara top factions',
		'browser mmo rts live',
		'live mmo rts galaxy',
		'mmo rts player count',
		'vexara stats',
		'persistent galaxy game',
		'free browser strategy game'
	],
	alternates: { canonical: '/state-of-galaxy' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: `${SITE_URL}/state-of-galaxy`,
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'website'
		// images: auto-populated by colocated opengraph-image.tsx
	},
	twitter: {
		card: 'summary_large_image',
		title: TITLE,
		description: DESCRIPTION
	},
	robots: { index: true, follow: true }
};

interface GalaxyStatus {
	galaxy: { id: number; name: string; createdAt: string } | null;
	activePlayers: number;
	totalRegistered: number;
	claimedNexuses: number;
	topFactions: {
		id: number;
		name: string;
		tag: string;
		members: number;
		points: number;
		nexuses: number;
	}[];
	latestBattles: {
		id: number;
		attacker: string;
		defender: string;
		victory: boolean;
		conquered: boolean;
		totalUnits: number;
		arrivesAt: string;
	}[];
}

// Empty fallback so the page still renders something indexable when the API
// is unreachable during a prerender. Empty states downstream branch on
// counts to swap in evergreen explanatory copy instead of "nothing here".
const EMPTY: GalaxyStatus = {
	galaxy: null,
	activePlayers: 0,
	totalRegistered: 0,
	claimedNexuses: 0,
	topFactions: [],
	latestBattles: []
};

async function fetchGalaxyStatus(): Promise<{ data: GalaxyStatus; fetchedAt: string }> {
	const fetchedAt = new Date().toISOString();
	try {
		const res = await fetch(`${API_URL}/galaxies/public/status`, {
			next: { revalidate: 300 }
		});
		if (!res.ok) return { data: EMPTY, fetchedAt };
		const json = (await res.json()) as GalaxyStatus;
		return { data: json, fetchedAt };
	} catch {
		return { data: EMPTY, fetchedAt };
	}
}

function battleText(battle: GalaxyStatus['latestBattles'][number]) {
	if (battle.conquered) return `${battle.attacker} conquered ${battle.defender}`;
	if (battle.victory) return `${battle.attacker} defeated ${battle.defender}`;
	return `${battle.defender} held against ${battle.attacker}`;
}

function breadcrumbSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
			{
				'@type': 'ListItem',
				position: 2,
				name: 'Galaxy Status',
				item: `${SITE_URL}/state-of-galaxy`
			}
		]
	};
}

export default async function StateOfGalaxyPage() {
	const { data: status, fetchedAt } = await fetchGalaxyStatus();
	const { topFactions, latestBattles } = status;

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema()) }}
			/>
			<PublicNav loc="Galaxy Status" />
			<main className="gp-root">
				<header className="gp-header">
					<div className="gp-header-label">{'// LIVE GALAXY STATUS'}</div>
					<h1 className="gp-title">Vexara - Live Galaxy Status</h1>
					<p className="gp-subtitle">
						Real-time status of the Vexara MMO galaxy: active commanders, ongoing battles, top
						factions, and recent conquests. Free in the browser. No download, no resets, no
						pay-to-win.
					</p>
					<p className="gp-updated">
						<UpdatedAgo iso={fetchedAt} />
					</p>
					<Link
						href="/register?utm_source=site&utm_medium=galaxy_status&utm_campaign=100_active"
						className="gp-hero-cta"
					>
						Join the live galaxy
					</Link>
				</header>

				<section id="current-signal" className="gp-section">
					<h2 className="gp-section-title">Current signal</h2>
					<dl className="sog-metrics" aria-label="Live galaxy metrics">
						<div className="sog-metric">
							<dt>Active commanders</dt>
							<dd>{status.activePlayers.toLocaleString()}</dd>
						</div>
						<div className="sog-metric">
							<dt>Registered commanders</dt>
							<dd>{status.totalRegistered.toLocaleString()}</dd>
						</div>
						<div className="sog-metric">
							<dt>Claimed nexuses</dt>
							<dd>{status.claimedNexuses.toLocaleString()}</dd>
						</div>
					</dl>
					<p className="gp-prose">
						The goal is to grow the active galaxy to 100 commanders so scouting, faction diplomacy,
						raids, defenses, and conquest stories happen every day. Learn the basics in the{' '}
						<Link href="/how-to-play">how to play guide</Link> or browse the full{' '}
						<Link href="/codex">field manual</Link>.
					</p>
				</section>

				<section id="top-factions" className="gp-section">
					<h2 className="gp-section-title">Top factions</h2>
					{topFactions.length > 0 ? (
						<div className="gp-steps">
							{topFactions.map((faction, index) => (
								<div className="gp-step" key={faction.id}>
									<div className="gp-step-num">{String(index + 1).padStart(2, '0')}</div>
									<div className="gp-step-body">
										<h3 className="gp-step-title">
											[{faction.tag}] {faction.name}
										</h3>
										<p className="gp-step-text">
											{faction.points.toLocaleString()} points, {faction.nexuses} nexuses,{' '}
											{faction.members} members.
										</p>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="gp-prose">
							Factions form when 2 or more commanders sign a charter together. Once the live galaxy
							has its first faction, leaderboard rankings appear here. Factions share chat, support
							each other with stationed troops, declare wars, and sign ceasefires. See how factions
							work in the <Link href="/how-to-play">how to play guide</Link>.
						</p>
					)}
				</section>

				<section id="recent-battles" className="gp-section">
					<h2 className="gp-section-title">Recent battles</h2>
					{latestBattles.length > 0 ? (
						<div className="gp-steps">
							{latestBattles.map((battle) => (
								<div className="gp-step" key={battle.id}>
									<div className="gp-step-num">#{battle.id}</div>
									<div className="gp-step-body">
										<h3 className="gp-step-title">
											<Link href={`/replay/${battle.id}`}>{battleText(battle)}</Link>
										</h3>
										<p className="gp-step-text">
											{battle.totalUnits.toLocaleString()} units engaged.{' '}
											<time dateTime={battle.arrivesAt}>
												{new Date(battle.arrivesAt).toUTCString()}
											</time>
											. Replay links are public so commanders can share war stories outside the
											game.
										</p>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="gp-prose">
							Every resolved attack in Vexara becomes a public replay. Combat resolves with a fixed
							seed so the replay deterministically reconstructs the fight, troop by troop. Recent
							battles will appear here as soon as commanders start engaging. Learn what makes a good
							composition in the <Link href="/units">units guide</Link>.
						</p>
					)}
				</section>

				<section id="new-commander-path" className="gp-section">
					<h2 className="gp-section-title">New commander path</h2>
					<div className="gp-steps">
						<div className="gp-step">
							<div className="gp-step-num">01</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">Claim your starter nexus</h3>
								<p className="gp-step-text">
									You start protected, with guided quests and a one-time relocation token if your
									first position feels wrong. Review the{' '}
									<Link href="/buildings">10 core buildings</Link> before you spend your first
									resources.
								</p>
							</div>
						</div>
						<div className="gp-step">
							<div className="gp-step-num">02</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">Join a faction quickly</h3>
								<p className="gp-step-text">
									Factions are where Vexara becomes social: shared chat, invitations, support
									troops, war planning, treaties, and rivalries. Find a faction recruiting on the{' '}
									<a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
										Vexara Discord
									</a>
									.
								</p>
							</div>
						</div>
						<div className="gp-step">
							<div className="gp-step-num">03</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">Scout, raid, and share the replay</h3>
								<p className="gp-step-text">
									Every resolved attack can become a public replay. Good battles are the best way to
									show new commanders why the galaxy matters. The{' '}
									<Link href="/calculator">combat calculator</Link> tells you whether your raid
									wins before you commit troops.
								</p>
							</div>
						</div>
					</div>
				</section>

				<div className="gp-cta-block">
					<p className="gp-cta-text">The galaxy is already moving. Your first nexus is waiting.</p>
					<Link
						href="/register?utm_source=site&utm_medium=galaxy_status_bottom&utm_campaign=100_active"
						className="gp-cta-btn"
					>
						Claim your starter nexus
					</Link>
				</div>
			</main>
			<SiteFooter />
		</>
	);
}
