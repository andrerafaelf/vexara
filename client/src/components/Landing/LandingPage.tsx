'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TROOPS_DOC, BUILDINGS_DOC } from '@/data/gameDocs';
import { TROOP_ICONS, BUILDING_ICONS, screenshot } from '@/data/gameIcons';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import { getPublicGalaxyStatus } from '@/services/api';
import { DISCORD_URL } from '@/constants/social';
import '@/styles/Landing.css';

const FOOTAGE: { src: string; label: string; code: string; caption: string }[] = [
	{
		src: screenshot('overview'),
		code: 'VX-01',
		label: 'Overview',
		caption: 'Your nexus at a glance - resources, buildings, queues.'
	},
	{
		src: screenshot('galaxy'),
		code: 'VX-02',
		label: 'Galaxy Map',
		caption: 'A living galaxy shared by real players, running 24/7.'
	},
	{
		src: screenshot('factions'),
		code: 'VX-03',
		label: 'Factions',
		caption: 'Join a faction. Climb. Wage galaxy-wide war.'
	},
	{
		src: screenshot('reports'),
		code: 'VX-04',
		label: 'combat log',
		caption: 'Blow-by-blow after every raid, strike, or conquest.'
	},
	{
		src: screenshot('troops'),
		code: 'VX-05',
		label: 'Troops',
		caption: 'Twelve unit types - composition wins fights, not numbers.'
	},
	{
		src: screenshot('buildings'),
		code: 'VX-06',
		label: 'Buildings',
		caption: 'Eight core structures drive your economy and military.'
	},
	{
		src: screenshot('market'),
		code: 'VX-07',
		label: 'Market',
		caption: 'Trade with players at dynamic exchange rates.'
	},
	{
		src: screenshot('profile'),
		code: 'VX-08',
		label: 'Profile',
		caption: 'Track your stats, badges, and founder status.'
	}
];

const PILLARS = [
	{
		idx: '01',
		title: 'Run a three-resource economy',
		body: 'Biomass, alloy, and ore tick 24/7. Storage and production scale per building level. Capture a Resource Depot - double your output overnight.'
	},
	{
		idx: '02',
		title: 'Train twelve unit types across three classes',
		body: 'From 53s Sentinel Lancers to 4h Overseers. Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Every unit card shows its class, its role (Striker / Anvil / Scout / Conquest), and what it counters. You know before you commit.'
	},
	{
		idx: '03',
		title: 'Scout, raid, intercept in real time',
		body: 'Travel times are real. Send Recon Operatives - the fastest unit in the game - to map a target, then commit a strike fleet before the picture goes stale. The attack screen reads your scout data and tells you whether your composition is favoured before you send a single troop.'
	},
	{
		idx: '04',
		title: 'Conquer with Overseers',
		body: 'Train an Overseer (4h, max 3 per nexus). Each surviving strike drops enemy control by 34. Hit zero - the nexus is yours.'
	},
	{
		idx: '05',
		title: 'Compete in seasons. Build a permanent record.',
		body: 'Every galaxy runs to a winner. The champion faction earns naming rights and a permanent Hall of Champions entry. Your Vex Points carry to the next galaxy. Permanent commander titles (Veteran, Iron Commander, Conqueror, Warlord) are earned by galaxies played and won, not purchased. Every season you play compounds into a record no wipe can touch.'
	},
	{
		idx: '06',
		title: 'Faction diplomacy and wars',
		body: 'Declare war on rivals or sign non-aggression pacts, trade agreements, and vassal treaties. Coordinate strikes through the War Room, where every faction-mate\'s pledge shows a live matchup verdict against the actual defending garrison. Every alliance is public.'
	}
];

interface PublicGalaxyStatus {
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
	recentConquests: { id: number; attacker: string; defender: string; arrivesAt: string }[];
}

export default function LandingPage() {
	const router = useRouter();
	const [redirectingAuthed, setRedirectingAuthed] = useState(false);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (localStorage.getItem('token')) {
			setRedirectingAuthed(true);
			router.replace('/play');
		}
	}, [router]);

	if (redirectingAuthed) return null;

	return (
		<div className="lp-root">
			<BetaBanner />
			<PublicNav />
			<Hero />
			<BetaCountdown />
			<GalaxyStatus />
			<Marquee />
			<Pillars />
			<Footage items={FOOTAGE} />
			<RosterTeaser />
			<Seasons />
			<Founder />
			<BuiltBy />
			<Enlist />
			<SiteFooter />
		</div>
	);
}

/* ──────────────────────────────────────────────────────────── */

function Hero() {
	return (
		<section className="lp-hero" aria-labelledby="lp-hero-title">
			<div className="lp-hero-bg" aria-hidden="true">
				<Image
					src={screenshot('galaxy')}
					alt=""
					fill
					priority
					sizes="100vw"
					className="lp-hero-bg-img"
				/>
				<div className="lp-hero-bg-veil" />
				<div className="lp-hero-bg-scanlines" />
				<div className="lp-hero-bg-grain" />
			</div>

			<div className="lp-hero-grid">
				<div className="lp-hero-stamp" aria-hidden="true">
					<span>{'// TRANSMISSION 01'}</span>
					<span className="lp-hero-stamp-dot" />
					<span>LIVE GALAXY · OPEN ENLISTMENT</span>
				</div>

				<h1 id="lp-hero-title" className="lp-hero-title">
					<span className="lp-hero-title-thin">A living galaxy.</span>
					<span className="lp-hero-title-shout">Real opponents.</span>
					<span className="lp-hero-title-edge">Every move counts.</span>
				</h1>

				<p className="lp-hero-sub">
					Browser-based 4X strategy. Galaxies run to a winner. Your record, titles, and Vex
					Points carry forward forever.
					<br className="lp-hero-sub-br" /> No account wipes. No pay-to-win. Just you, your nexus,
					and the cold math of empire.
				</p>

				<div className="lp-hero-ctas">
					<Link href="/register" className="lp-btn lp-btn-primary">
						<span className="lp-btn-label">Join the live galaxy</span>
						<span className="lp-btn-arrow" aria-hidden="true">
							→
						</span>
					</Link>
					<Link href="/codex" className="lp-btn lp-btn-ghost">
						<span className="lp-btn-label">Read the codex</span>
					</Link>
				</div>

				<dl className="lp-hero-stats">
					<div>
						<dt>Live target</dt>
						<dd>100</dd>
					</div>
					<div>
						<dt>Unit types</dt>
						<dd>12</dd>
					</div>
					<div>
						<dt>Uptime</dt>
						<dd>24/7</dd>
					</div>
					<div>
						<dt>Account wipe</dt>
						<dd>NEVER</dd>
					</div>
				</dl>
			</div>

			<div className="lp-hero-corner" aria-hidden="true">
				<span className="lp-hero-corner-id">VEXARA · v0.1</span>
				<span className="lp-hero-corner-bar" />
				<span className="lp-hero-corner-coord">QUADRANT 04-7A · LIVE</span>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

// Beta launch: 28 Jun 2026 18:30 UTC. Sign-up reward window closes 1 Jul 2026.
const BETA_LAUNCH = new Date('2026-06-28T18:30:00Z');
const SIGNUP_DEADLINE = new Date('2026-07-01T23:59:59Z');

interface Countdown {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	done: boolean;
}

function useCountdown(target: Date): Countdown {
	const compute = (): Countdown => {
		const diff = target.getTime() - Date.now();
		if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
		const s = Math.floor(diff / 1000);
		return {
			days: Math.floor(s / 86400),
			hours: Math.floor((s % 86400) / 3600),
			minutes: Math.floor((s % 3600) / 60),
			seconds: s % 60,
			done: false
		};
	};
	const [cd, setCd] = useState<Countdown>(compute);
	useEffect(() => {
		const id = setInterval(() => setCd(compute()), 1000);
		return () => clearInterval(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [target]);
	return cd;
}

function BetaBanner() {
	const [dismissed, setDismissed] = useState(true);
	const launched = useCountdown(BETA_LAUNCH).done;
	const windowClosed = useCountdown(SIGNUP_DEADLINE).done;

	useEffect(() => {
		// Hide once the signup window fully closes, or if the user dismissed it.
		if (windowClosed) return;
		if (localStorage.getItem('vx-beta-banner-dismissed') === '1') return;
		setDismissed(false);
	}, [windowClosed]);

	if (dismissed || windowClosed) return null;

	return (
		<div className="lp-beta-banner" role="region" aria-label="Beta announcement">
			<span className="lp-beta-banner-dot" aria-hidden="true" />
			<p className="lp-beta-banner-text">
				{launched ? (
					<>
						<strong>Beta is LIVE.</strong> Sign up before <strong>July 1</strong> for{' '}
						<strong>500 Vex Points</strong> free — found a nexus to earn permanent{' '}
						<strong>Beta Founder</strong> status.
					</>
				) : (
					<>
						<strong>Beta launches June 28.</strong> Sign up before <strong>July 1</strong> for{' '}
						<strong>500 Vex Points</strong> free, plus <strong>Beta Founder</strong> status when you
						found a nexus.
					</>
				)}
			</p>
			<Link
				href="/register?utm_source=site&utm_medium=banner&utm_campaign=beta_launch"
				className="lp-beta-banner-cta"
			>
				Claim 500 VP →
			</Link>
			<button
				type="button"
				className="lp-beta-banner-close"
				aria-label="Dismiss"
				onClick={() => {
					localStorage.setItem('vx-beta-banner-dismissed', '1');
					setDismissed(true);
				}}
			>
				✕
			</button>
		</div>
	);
}

function BetaCountdown() {
	const launchCd = useCountdown(BETA_LAUNCH);
	const deadlineCd = useCountdown(SIGNUP_DEADLINE);
	const launched = launchCd.done;
	const cd = launched ? deadlineCd : launchCd;

	// Once the signup window closes entirely, retire the section.
	if (launched && deadlineCd.done) return null;

	const units = [
		{ v: cd.days, l: 'Days' },
		{ v: cd.hours, l: 'Hours' },
		{ v: cd.minutes, l: 'Min' },
		{ v: cd.seconds, l: 'Sec' }
	];

	return (
		<section className="lp-section lp-beta" aria-labelledby="lp-beta-title">
			<div className="lp-beta-inner">
				<span className="lp-beta-eyebrow">
					{launched ? '// BETA LIVE · 500 VP ENDS JULY 1' : '// TRANSMISSION 01A · BETA COUNTDOWN'}
				</span>
				<h2 id="lp-beta-title" className="lp-beta-title">
					{launched ? '500 Vex Points end July 1.' : 'Beta launches June 28.'}
				</h2>
				<p className="lp-beta-sub">
					{launched
						? 'Sign up before July 1 to claim 500 Vex Points free. Found a nexus any time during the beta to earn the permanent Beta Founder badge — never re-issued.'
						: 'Enlist now and you are ready the moment the galaxy opens. Sign up before July 1 for 500 Vex Points free, then found a nexus during the beta for permanent Beta Founder status.'}
				</p>

				<div className="lp-beta-clock" aria-label="Countdown">
					{units.map((u) => (
						<div key={u.l} className="lp-beta-unit">
							<span className="lp-beta-unit-num">{String(u.v).padStart(2, '0')}</span>
							<span className="lp-beta-unit-label">{u.l}</span>
						</div>
					))}
				</div>

				<div className="lp-beta-perks">
					<span className="lp-beta-perk">◆ 500 Vex Points on signup</span>
					<span className="lp-beta-perk">◆ Permanent Beta Founder badge</span>
					<span className="lp-beta-perk">◆ No download · plays in your browser</span>
				</div>

				<Link
					href="/register?utm_source=site&utm_medium=countdown&utm_campaign=beta_launch"
					className="lp-btn lp-btn-primary lp-btn-lg"
				>
					<span className="lp-btn-label">Claim your 500 VP</span>
					<span className="lp-btn-arrow" aria-hidden="true">
						→
					</span>
				</Link>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function GalaxyStatus() {
	const [status, setStatus] = useState<PublicGalaxyStatus | null>(null);

	useEffect(() => {
		let alive = true;
		getPublicGalaxyStatus()
			.then((res) => {
				if (alive) setStatus(res.data as PublicGalaxyStatus);
			})
			.catch(() => {
				if (alive) setStatus(null);
			});
		return () => {
			alive = false;
		};
	}, []);

	const latest = status?.latestBattles ?? [];
	const topFactions = status?.topFactions ?? [];

	return (
		<section className="lp-section lp-galaxy-status" aria-labelledby="lp-galaxy-status-title">
			<SectionHead
				label="TRANSMISSION 01B"
				title="Galaxy status"
				subtitle="Public proof from the live galaxy."
				titleId="lp-galaxy-status-title"
			/>

			<div className="lp-status-grid">
				<div className="lp-status-command">
					<span className="lp-status-kicker">Recruitment objective</span>
					<strong>40-ish commanders are already in-galaxy. Next stop: 100 active players.</strong>
					<p>
						New commanders get starter protection, guided quests, a relocation token, and a
						faction-first path into the war.
					</p>
					<div className="lp-status-actions">
						<Link
							href="/register?utm_source=site&utm_medium=status&utm_campaign=100_active"
							className="lp-btn lp-btn-primary"
						>
							<span className="lp-btn-label">Join the live galaxy</span>
						</Link>
						<Link href="/state-of-galaxy" className="lp-btn lp-btn-ghost">
							<span className="lp-btn-label">Read state of the galaxy</span>
						</Link>
					</div>
				</div>

				<dl className="lp-status-metrics">
					<div>
						<dt>Active players</dt>
						<dd>{status ? status.activePlayers.toLocaleString() : '...'}</dd>
					</div>
					<div>
						<dt>Registered</dt>
						<dd>{status ? status.totalRegistered.toLocaleString() : '...'}</dd>
					</div>
					<div>
						<dt>Claimed nexuses</dt>
						<dd>{status ? status.claimedNexuses.toLocaleString() : '...'}</dd>
					</div>
				</dl>

				<div className="lp-status-panel">
					<h3>Top factions</h3>
					{topFactions.length > 0 ? (
						<ol className="lp-status-list">
							{topFactions.map((faction) => (
								<li key={faction.id}>
									<span>
										[{faction.tag}] {faction.name}
									</span>
									<strong>{faction.points.toLocaleString()} pts</strong>
								</li>
							))}
						</ol>
					) : (
						<p className="lp-status-empty">Faction openings are still forming.</p>
					)}
				</div>

				<div className="lp-status-panel">
					<h3>Latest battles</h3>
					{latest.length > 0 ? (
						<ol className="lp-status-list">
							{latest.map((battle) => (
								<li key={battle.id}>
									<Link href={`/replay/${battle.id}`}>
										{battle.conquered
											? `${battle.attacker} conquered ${battle.defender}`
											: battle.victory
												? `${battle.attacker} defeated ${battle.defender}`
												: `${battle.defender} held against ${battle.attacker}`}
									</Link>
									<strong>{battle.totalUnits.toLocaleString()} units</strong>
								</li>
							))}
						</ol>
					) : (
						<p className="lp-status-empty">No public battles yet. Be the first headline.</p>
					)}
				</div>
			</div>
		</section>
	);
}

function Marquee() {
	const items = [
		'12 UNIT TYPES',
		'08 CORE BUILDINGS',
		'24/7 LIVE GALAXY',
		'SEASONAL GALAXIES',
		'NO PAY-TO-WIN',
		'REAL TRAVEL TIMES',
		'COMMANDER LEGACY',
		'HALL OF CHAMPIONS',
		'BATTLE PASS',
		'PERSISTENT WORLD'
	];
	const doubled = [...items, ...items];
	return (
		<div className="lp-marquee" aria-hidden="true">
			<div className="lp-marquee-track">
				{doubled.map((s, i) => (
					<span key={i} className="lp-marquee-item">
						{s} <span className="lp-marquee-sep">◆</span>
					</span>
				))}
			</div>
		</div>
	);
}

/* ──────────────────────────────────────────────────────────── */

function Pillars() {
	return (
		<section className="lp-section lp-pillars" aria-labelledby="lp-pillars-title">
			<SectionHead
				label="TRANSMISSION 02"
				title="What you actually do"
				subtitle="Six systems. Real consequences."
				titleId="lp-pillars-title"
			/>
			<ol className="lp-pillars-list">
				{PILLARS.map((p, i) => (
					<li key={p.idx} className={`lp-pillar lp-pillar-${i % 2 === 0 ? 'l' : 'r'}`}>
						<span className="lp-pillar-idx" aria-hidden="true">
							{p.idx}
						</span>
						<div className="lp-pillar-body">
							<h3 className="lp-pillar-title">{p.title}</h3>
							<p>{p.body}</p>
						</div>
						<span className="lp-pillar-rule" aria-hidden="true" />
					</li>
				))}
			</ol>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function Footage({ items }: { items: typeof FOOTAGE }) {
	const [active, setActive] = useState(0);
	const current = items[active];

	return (
		<section className="lp-section lp-footage" aria-labelledby="lp-footage-title">
			<SectionHead
				label="TRANSMISSION 03"
				title="Field footage"
				subtitle="Recorded from active nexuses across the galaxy."
				titleId="lp-footage-title"
			/>

			<div className="lp-footage-stage">
				<div className="lp-footage-screen">
					<div className="lp-footage-screen-bezel">
						<span className="lp-footage-screen-id">{current.code}</span>
						<span className="lp-footage-screen-rec" aria-hidden="true">
							<span className="lp-footage-screen-rec-dot" /> REC
						</span>
					</div>
					<div className="lp-footage-screen-img">
						<Image
							key={current.src}
							src={current.src}
							alt={current.caption}
							fill
							sizes="(max-width: 900px) 100vw, 70vw"
							className="lp-footage-img"
						/>
						<div className="lp-footage-screen-scan" aria-hidden="true" />
					</div>
					<p className="lp-footage-caption">{current.caption}</p>
				</div>

				<div className="lp-footage-list" role="tablist" aria-label="Footage selection">
					{items.map((s, i) => (
						<button
							key={s.src}
							role="tab"
							aria-selected={i === active}
							className={`lp-footage-item ${i === active ? 'is-active' : ''}`}
							onClick={() => setActive(i)}
						>
							<span className="lp-footage-item-code">{s.code}</span>
							<span className="lp-footage-item-label">{s.label}</span>
							<span className="lp-footage-item-cursor" aria-hidden="true" />
						</button>
					))}
				</div>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function RosterTeaser() {
	// Show 8 troops + 4 buildings in a deliberately broken grid.
	const troops = TROOPS_DOC.slice(0, 8);
	const buildings = BUILDINGS_DOC.slice(0, 4);

	return (
		<section className="lp-section lp-roster" aria-labelledby="lp-roster-title">
			<SectionHead
				label="TRANSMISSION 04"
				title="The roster"
				subtitle="A sample. The full dossier lives in the codex."
				titleId="lp-roster-title"
			/>

			<div className="lp-roster-grid">
				{troops.map((t, i) => {
					const icon = TROOP_ICONS[t.key];
					return (
						<Link
							key={t.key}
							href={`/codex#troop-${t.key}`}
							className={`lp-tile lp-tile-troop lp-tile-skew-${i % 4}`}
						>
							<span className="lp-tile-icon">
								{icon && <Image src={icon} alt="" width={56} height={56} />}
							</span>
							<span className="lp-tile-meta">
								<span className="lp-tile-kind">TRP</span>
								<span className="lp-tile-name">{t.name}</span>
								<span className="lp-tile-role">{t.role}</span>
							</span>
							<span className="lp-tile-corner" aria-hidden="true" />
						</Link>
					);
				})}
				{buildings.map((b, i) => {
					const icon = BUILDING_ICONS[b.key];
					return (
						<Link
							key={b.key}
							href={`/codex#building-${b.key}`}
							className={`lp-tile lp-tile-building lp-tile-skew-${i % 4}`}
						>
							<span className="lp-tile-icon">
								{icon && <Image src={icon} alt="" width={56} height={56} />}
							</span>
							<span className="lp-tile-meta">
								<span className="lp-tile-kind">BLD</span>
								<span className="lp-tile-name">{b.name}</span>
								<span className="lp-tile-role">{b.role}</span>
							</span>
							<span className="lp-tile-corner" aria-hidden="true" />
						</Link>
					);
				})}
			</div>

			<div className="lp-roster-cta">
				<Link href="/codex" className="lp-btn lp-btn-ghost">
					<span className="lp-btn-label">Open the codex</span>
					<span className="lp-btn-arrow" aria-hidden="true">
						→
					</span>
				</Link>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

const PASS_TIERS = [
	{ level: 1,  track: 'Free',  reward: 'Resources: Biomass' },
	{ level: 1,  track: 'Paid',  reward: 'Season title: Conscript' },
	{ level: 5,  track: 'Free',  reward: 'Bronze badge' },
	{ level: 6,  track: 'Paid',  reward: 'Season title: Operative' },
	{ level: 15, track: 'Free',  reward: 'Silver badge' },
	{ level: 15, track: 'Paid',  reward: 'Season title: Proven' },
	{ level: 25, track: 'Free',  reward: 'Gold badge' },
	{ level: 25, track: 'Paid',  reward: 'Season title: Vex Commander' },
	{ level: 30, track: 'Free',  reward: 'Title: Veteran + Platinum badge' },
	{ level: 30, track: 'Paid',  reward: 'Title: Season Conqueror + 200 Vex Points + +25% production 72h' }
];

function Seasons() {
	return (
		<section className="lp-section lp-seasons" aria-labelledby="lp-seasons-title">
			<SectionHead
				label="TRANSMISSION 05"
				title="Seasons &amp; the Vex Pass"
				subtitle="Every galaxy ends with a winner. Your Vex Points carry forward."
				titleId="lp-seasons-title"
			/>

			<div className="lp-seasons-grid">
				<div className="lp-seasons-desc">
					<p>
						Each galaxy runs to a dominance threshold. When a faction crosses the line, the season
						closes: the winning faction earns naming rights and a permanent{' '}
						<strong>Hall of Champions</strong> entry. Then a fresh galaxy opens.
					</p>
					<p>
						<strong>Vex Points</strong> carry across every galaxy. Permanent commander titles
						(Veteran, Iron Commander, Conqueror, Warlord) are earned through galaxies played and
						won, not purchased.
					</p>
					<p>
						A 30-level <strong>Vex Pass</strong> runs alongside every season. The free track
						(included for everyone) gives resources and badges as you play. The paid track costs
						1,000 Vex Points (equivalent to €4.99), which adds season-scoped titles, temporary
						production boosts, and 600 Vex Points back over 30 levels. No pass reward touches
						combat stats or troop power.
					</p>
				</div>

				<div className="lp-seasons-pass">
					<div className="lp-seasons-pass-head">
						<span className="lp-seasons-pass-label">// VEX PASS · KEY REWARDS</span>
					</div>
					<ol className="lp-seasons-pass-list">
						{PASS_TIERS.map((tier, i) => (
							<li key={i} className="lp-seasons-pass-tier">
								<span className="lp-seasons-pass-lvl">LV {tier.level}</span>
								<span className={`lp-seasons-pass-track lp-seasons-pass-track--${tier.track.toLowerCase()}`}>{tier.track}</span>
								<span className="lp-seasons-pass-reward">{tier.reward}</span>
							</li>
						))}
					</ol>
					<p className="lp-seasons-pass-note">Paid track: 1,000 Vex Points (€4.99). Free track included for all players.</p>
				</div>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function Founder() {
	return (
		<section className="lp-section lp-founder" aria-labelledby="lp-founder-title">
			<SectionHead
				label="TRANSMISSION 06"
				title="Founders cohort"
				subtitle="Permanent. Never re-issued."
				titleId="lp-founder-title"
			/>

			<div className="lp-founder-grid">
				<ul className="lp-founder-list">
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Founder&apos;s badge.</strong> Permanent, never re-issued.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Leaderboard mark</strong> on all rankings, every galaxy.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Hall of Champions entry:</strong> when your faction wins a galaxy season, your
							name is engraved permanently. No future player can claim that slot.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Naming rights</strong> if your faction wins the current season.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Permanent commander title</strong> earned through galaxies played: Veteran,
							Iron Commander, Conqueror, Warlord. Never purchased, never reset.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Recruitment Orders.</strong> Invite one friend each week for public cosmetic
							bragging rights, Discord recognition, and your existing account referral rewards.
						</span>
					</li>
				</ul>

				<div className="lp-founder-stamp" aria-hidden="true">
					<div className="lp-founder-stamp-inner">
						<span className="lp-founder-stamp-arc-top">VEXARA · FOUNDERS COHORT</span>
						<span className="lp-founder-stamp-id">№ ∞</span>
						<span className="lp-founder-stamp-arc-bot">PERMANENT · NEVER REISSUED</span>
					</div>
				</div>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function BuiltBy() {
	return (
		<section className="lp-section lp-builtby" aria-labelledby="lp-builtby-title">
			<div className="lp-builtby-card">
				<span className="lp-builtby-tag">{'// DEV LOG · ENTRY 042'}</span>
				<h2 id="lp-builtby-title" className="lp-builtby-title">
					Built by one developer.
				</h2>
				<p>
					Vexara is a solo project. No publisher. No investors. No roadmap dictated by quarterly
					targets. Just a strategy-game player building the kind of persistent MMO that doesn&apos;t
					sell wins.
				</p>
				<p>
					Discord is the command center: #new-commanders, #battle-replays, #faction-recruitment,
					#patch-notes, and #war-stories.
				</p>
				<p className="lp-builtby-sig">
					<span className="lp-builtby-sig-line" aria-hidden="true" />
					<span>- andre, sole dev</span>
				</p>
				<a
					href={`${DISCORD_URL}?utm_source=landing`}
					target="_blank"
					rel="noopener noreferrer"
					className="lp-btn lp-btn-ghost lp-builtby-discord"
				>
					<span className="lp-btn-label">Join the Discord</span>
					<span className="lp-btn-arrow" aria-hidden="true">
						→
					</span>
				</a>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function Enlist() {
	return (
		<section className="lp-section lp-enlist" aria-labelledby="lp-enlist-title">
			<div className="lp-enlist-inner">
				<span className="lp-enlist-eyebrow">{'// TRANSMISSION 07 · FINAL'}</span>
				<h2 id="lp-enlist-title" className="lp-enlist-title">
					The galaxy
					<br />
					is already running.
				</h2>
				<p className="lp-enlist-sub">
					Pick a username. Claim your nexus. Command your first fleet.
				</p>
				<div className="lp-enlist-ctas">
					<Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
						<span className="lp-btn-label">Join the live galaxy</span>
						<span className="lp-btn-arrow" aria-hidden="true">
							→
						</span>
					</Link>
					<Link href="/login" className="lp-btn lp-btn-ghost lp-btn-lg">
						<span className="lp-btn-label">I already have an account</span>
					</Link>
				</div>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

function SectionHead({
	label,
	title,
	subtitle,
	titleId
}: {
	label: string;
	title: string;
	subtitle: string;
	titleId?: string;
}) {
	const ref = useRef<HTMLElement | null>(null);
	const [seen, setSeen] = useState(false);
	useEffect(() => {
		if (!ref.current) return;
		const el = ref.current;
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setSeen(true);
					io.unobserve(el);
				}
			},
			{ threshold: 0.2 }
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);
	return (
		<header ref={ref} className={`lp-section-head ${seen ? 'is-seen' : ''}`}>
			<span className="lp-section-head-label">{label}</span>
			<h2 id={titleId} className="lp-section-head-title">
				{title}
			</h2>
			<p className="lp-section-head-sub">{subtitle}</p>
			<span className="lp-section-head-rule" aria-hidden="true" />
		</header>
	);
}
