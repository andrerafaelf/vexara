import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import UpdatedAgo from './UpdatedAgo';
import { DISCORD_URL } from '@/constants/social';
import { BUILDINGS_DOC } from '@/data/gameDocs';
import '@/styles/GuidePages.css';

// Live numbers only appear once enough commanders are active to be meaningful;
// below this the page shows honest evergreen early-galaxy framing instead.
const POPULATION_FLOOR = 10;

// Refresh the prerendered HTML every 5 minutes. Search crawlers and link
// previews see fresh galaxy numbers without us hitting the API on every
// request. The copy says "updated every few minutes", never "real-time".
export const revalidate = 300;

const SITE_URL = 'https://vexara.world';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const TITLE = 'Vexara Live Galaxy - Active Players, Battles & Top Factions';
const DESCRIPTION =
	'Status of the Vexara MMO galaxy, updated every few minutes: active commanders, top factions, and recent battles once the galaxy fills out. Free browser MMO RTS, no download.';

export const metadata: Metadata = {
	title: { absolute: TITLE },
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
	activePlayers24h: number;
	joinedPlayers: number;
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
	activePlayers24h: 0,
	joinedPlayers: 0,
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
	const showLive = status.activePlayers >= POPULATION_FLOOR;

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
						Status of the Vexara MMO galaxy, updated every few minutes: active commanders, top
						factions, and recent battles. Free to play in the browser. No download, no account
						wipes.
					</p>
					<p className="gp-updated">
						<UpdatedAgo iso={fetchedAt} />
					</p>
					<Link
						href="/register?utm_source=site&utm_medium=galaxy_status&utm_campaign=galaxy_status"
						className="gp-hero-cta"
					>
						Join the live galaxy
					</Link>
				</header>

				<section id="current-signal" className="gp-section">
					<h2 className="gp-section-title">
						{showLive ? 'Current signal' : 'Early galaxy'}
					</h2>
					{showLive ? (
						<>
							<dl className="sog-metrics" aria-label="Galaxy metrics">
								<div className="sog-metric">
									<dt>Active commanders (7d)</dt>
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
								Scouting, faction diplomacy, raids, defenses, and conquest stories happen every day.
								Learn the basics in the <Link href="/how-to-play">how to play guide</Link> or browse
								the full <Link href="/codex">field manual</Link>.
							</p>
						</>
					) : (
						<p className="gp-prose">
							Early galaxy. Prime territory is still unclaimed. New commanders get starter
							protection, guided quests, a relocation token, and a faction-first path into the war,
							and a single commander can found a faction. Learn the basics in the{' '}
							<Link href="/how-to-play">how to play guide</Link> or browse the full{' '}
							<Link href="/codex">field manual</Link>.
						</p>
					)}
				</section>

				<section id="top-factions" className="gp-section">
					<h2 className="gp-section-title">Top factions</h2>
					{showLive && topFactions.length > 0 ? (
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
							A single commander can found a faction. Factions share chat, support each other with
							stationed troops, declare wars, and sign non-aggression pacts. Once factions are
							competing, leaderboard rankings appear here. See how factions work in the{' '}
							<Link href="/how-to-play">how to play guide</Link>.
						</p>
					)}
				</section>

				<section id="recent-battles" className="gp-section">
					<h2 className="gp-section-title">Recent battles</h2>
					{showLive && latestBattles.length > 0 ? (
						<div className="gp-steps">
							{latestBattles.map((battle) => (
								<div className="gp-step" key={battle.id}>
									<div className="gp-step-num">#{battle.id}</div>
									<div className="gp-step-body">
										<h3 className="gp-step-title">{battleText(battle)}</h3>
										<p className="gp-step-text">
											{battle.totalUnits.toLocaleString()} units engaged.{' '}
											<time dateTime={battle.arrivesAt}>
												{new Date(battle.arrivesAt).toUTCString()}
											</time>
											.
										</p>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="gp-prose">
							Combat resolves with a fixed seed so a battle can be reconstructed troop by troop, and
							replays are visible only to the two commanders involved. Recent battles appear here
							once the galaxy fills out. Learn what makes a good composition in the{' '}
							<Link href="/units">units guide</Link>.
						</p>
					)}
				</section>

				<section id="new-commander-path" className="gp-section">
					<h2 className="gp-section-title">New commander path</h2>
					<div className="gp-steps">
						<div className="gp-step">
							<div className="gp-step-num">01</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">Your first build takes ~25 seconds</h3>
								<p className="gp-step-text">
									The opening Command Core upgrade (the one build every new commander hits first)
									is accelerated to a fixed ~25 seconds. The game opens up immediately. While it
									builds, a short coaching card walks you through the resource bar and build queue
									so the brief wait teaches instead of idles. Everything after that takes its
									normal time.
								</p>
							</div>
						</div>
						<div className="gp-step">
							<div className="gp-step-num">02</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">The combat triangle is taught, not discovered</h3>
								<p className="gp-step-text">
									Mobile beats Armor, Armor beats Fire, Fire beats Mobile. A primer appears before
									you train your first troop. Every unit card shows its class and what it counters.
									The attack screen reads your scout data and tells you whether your composition is
									favoured before you commit. Review the{' '}
									<Link href="/buildings">{BUILDINGS_DOC.length} core buildings</Link> and{' '}
									<Link href="/units">units guide</Link> before you spend your first resources.
								</p>
							</div>
						</div>
						<div className="gp-step">
							<div className="gp-step-num">03</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">Join a faction quickly</h3>
								<p className="gp-step-text">
									Factions are where Vexara becomes social: shared chat, invitations, support
									troops, war planning, treaties, and rivalries. Faction dominance drives the
									season. A faction wins by holding 65% of all nexuses for 36 hours, which earns a
									permanent Hall of Champions entry. Find a faction recruiting on the{' '}
									<a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
										Vexara Discord
									</a>
									.
								</p>
							</div>
						</div>
						<div className="gp-step">
							<div className="gp-step-num">04</div>
							<div className="gp-step-body">
								<h3 className="gp-step-title">Scout, raid, and learn from every fight</h3>
								<p className="gp-step-text">
									Scouts reveal a target&apos;s troops, resources, and buildings before you commit.
									The <Link href="/calculator">combat calculator</Link> tells you whether your raid
									wins before you send troops.
								</p>
							</div>
						</div>
					</div>
				</section>

				<div className="gp-cta-block">
					<p className="gp-cta-text">The galaxy is already moving. Your first nexus is waiting.</p>
					<Link
						href="/register?utm_source=site&utm_medium=galaxy_status_bottom&utm_campaign=galaxy_status"
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
