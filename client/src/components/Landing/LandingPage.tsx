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
import { PASS_LEVELS } from '@/constants/vexPass';
import { LATEST_PATCH_LABEL } from '@/data/latestPatch';
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
		caption: 'Sixteen unit types - composition wins fights, not numbers.'
	},
	{
		src: screenshot('buildings'),
		code: 'VX-06',
		label: 'Buildings',
		caption: 'Twelve core structures drive your economy and military.'
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
		body: 'Biomass, alloy, and ore tick 24/7. Storage and production scale per building level. A captured Resource Depot nexus produces at 2x.'
	},
	{
		idx: '02',
		title: 'Train sixteen unit types across three classes',
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
		body: 'Train an Overseer (4h, max 3 per nexus, 1 per strike). A winning strike where the Overseer survives drains 15, 34 or 50 control depending on how decisive the win was; control regenerates 10 per hour. Hit zero and the nexus is yours.'
	},
	{
		idx: '05',
		title: 'Compete in seasons. Build a permanent record.',
		body: 'Every galaxy runs to a winner. The champion faction earns a permanent Hall of Champions entry. Your Vex Points carry to the next galaxy. Permanent commander titles (Veteran, Iron Commander, Conqueror, Warlord) are earned by galaxies played and won. Every galaxy you play compounds into a record no wipe can touch.'
	},
	{
		idx: '06',
		title: 'Faction diplomacy and wars',
		body: 'Declare war on rivals or sign non-aggression pacts, trade agreements, and vassal treaties. Coordinate strikes through the War Room, where every faction-mate\'s pledge shows a live matchup verdict against your latest scout intel. Every alliance is public.'
	}
];

interface PublicGalaxyStatus {
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
	recentConquests: { id: number; attacker: string; defender: string; arrivesAt: string }[];
}

export default function LandingPage() {
	const router = useRouter();
	const [redirectingAuthed, setRedirectingAuthed] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (localStorage.getItem('token')) {
			setRedirectingAuthed(true);
			router.replace('/play');
		}
	}, [router]);

	if (redirectingAuthed) return null;

	return (
		<div ref={rootRef} className="lp-root">
			<PublicNav />
			<Hero />
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
					<br className="lp-hero-sub-br" /> No account wipes. Free to play. Just you, your nexus, and
					the cold math of empire.
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
						<dt>Unit types</dt>
						<dd>{TROOPS_DOC.length}</dd>
					</div>
					<div>
						<dt>Buildings</dt>
						<dd>{BUILDINGS_DOC.length}</dd>
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
				<span className="lp-hero-corner-id">VEXARA · {LATEST_PATCH_LABEL.toUpperCase()}</span>
				<span className="lp-hero-corner-bar" />
				<span className="lp-hero-corner-coord">QUADRANT 04-7A · LIVE</span>
			</div>
		</section>
	);
}

/* ──────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────── */

/** Live numbers are only shown once enough commanders are active to be meaningful. */
const POPULATION_FLOOR = 10;

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
	// Loading, error and low-population all fall back to the evergreen early-galaxy copy,
	// so the server-rendered page never shows a placeholder or a tiny number.
	const showLive = status !== null && status.activePlayers >= POPULATION_FLOOR;

	return (
		<section className="lp-section lp-galaxy-status" aria-labelledby="lp-galaxy-status-title">
			<SectionHead
				label="TRANSMISSION 01B"
				title="Galaxy status"
				subtitle={
					showLive ? 'Public proof from the live galaxy.' : 'The galaxy is open. The map is wide.'
				}
				titleId="lp-galaxy-status-title"
			/>

			<div className="lp-status-grid">
				<div className="lp-status-command">
					<span className="lp-status-kicker">
						{showLive ? 'Recruitment objective' : 'Early galaxy'}
					</span>
					<strong>
						{showLive
							? 'Commanders are already at war. Claim your place.'
							: 'Early galaxy. Prime territory is still unclaimed.'}
					</strong>
					<p>
						New commanders get starter protection, guided quests, a relocation token, and a
						faction-first path into the war.
					</p>
					<div className="lp-status-actions">
						<Link
							href="/register?utm_source=site&utm_medium=status&utm_campaign=galaxy_status"
							className="lp-btn lp-btn-primary"
						>
							<span className="lp-btn-label">Join the live galaxy</span>
						</Link>
						<Link href="/state-of-galaxy" className="lp-btn lp-btn-ghost">
							<span className="lp-btn-label">Read state of the galaxy</span>
						</Link>
					</div>
				</div>

				{showLive && status ? (
					<>
						<dl className="lp-status-metrics">
							<div>
								<dt>Active commanders (7d)</dt>
								<dd>{status.activePlayers.toLocaleString()}</dd>
							</div>
							<div>
								<dt>Registered commanders</dt>
								<dd>{status.totalRegistered.toLocaleString()}</dd>
							</div>
							<div>
								<dt>Claimed nexuses</dt>
								<dd>{status.claimedNexuses.toLocaleString()}</dd>
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
											<span>
												{battle.conquered
													? `${battle.attacker} conquered ${battle.defender}`
													: battle.victory
														? `${battle.attacker} defeated ${battle.defender}`
														: `${battle.defender} held against ${battle.attacker}`}
											</span>
											<strong>{battle.totalUnits.toLocaleString()} units</strong>
										</li>
									))}
								</ol>
							) : (
								<p className="lp-status-empty">No battles to report yet.</p>
							)}
						</div>
					</>
				) : (
					<div className="lp-status-panel">
						<h3>What you start with</h3>
						<ol className="lp-status-list">
							<li>
								<span>Starter protection on your first nexus</span>
								<strong>INCLUDED</strong>
							</li>
							<li>
								<span>Guided quests that walk you through your first build</span>
								<strong>INCLUDED</strong>
							</li>
							<li>
								<span>A relocation token to pick a better spot</span>
								<strong>INCLUDED</strong>
							</li>
							<li>
								<span>Factions to found (one commander is enough)</span>
								<strong>OPEN</strong>
							</li>
						</ol>
					</div>
				)}
			</div>
		</section>
	);
}

function Marquee() {
	const items = [
		`${TROOPS_DOC.length} UNIT TYPES`,
		`${String(BUILDINGS_DOC.length).padStart(2, '0')} CORE BUILDINGS`,
		'24/7 LIVE GALAXY',
		'SEASONAL GALAXIES',
		'FREE TO PLAY',
		'REAL TRAVEL TIMES',
		'COMMANDER LEGACY',
		'HALL OF CHAMPIONS',
		'PERMANENT VEX PASS',
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

// Headline milestones. Mirrors server/utils/battlePass.ts + constants/vexPass.ts exactly.
const PASS_TIERS = [
	{ level: 1,  track: 'Paid',  reward: 'Title: Conscript' },
	{ level: 8,  track: 'Paid',  reward: 'Title: Operative' },
	{ level: 10, track: 'Free',  reward: 'Bronze badge' },
	{ level: 18, track: 'Paid',  reward: 'Title: Proven' },
	{ level: 25, track: 'Free',  reward: 'Silver badge' },
	{ level: 30, track: 'Paid',  reward: 'Title: Vex Commander' },
	{ level: 40, track: 'Free',  reward: 'Title: Veteran + Gold badge' },
	{ level: 45, track: 'Paid',  reward: 'Title: High Commander' },
	{ level: 50, track: 'Free',  reward: 'Platinum badge + 20 Vex Points' },
	{ level: 50, track: 'Paid',  reward: 'Protocol Ascendant + 170 Vex Points + 4 supporter tokens + 35% production 120h' }
];

// Reward string → plain marketing label (public page, no in-game icons).
function fmtPassReward(raw: string | null): string {
	if (!raw) return '—';
	return raw
		.split(',')
		.map((part) => {
			const seg = part.trim();
			const [type, ...rest] = seg.split(':');
			if (type === 'resources') {
				const total = (Number(rest[0] ?? 0) + Number(rest[1] ?? 0) + Number(rest[2] ?? 0)).toLocaleString();
				return `${total} resources`;
			}
			if (type === 'boost') return `+${rest[1] ?? '?'}% production / ${rest[2] ?? '?'}h`;
			if (type === 'title') return `Title: ${rest.join(':')}`;
			if (type === 'badge') {
				const tier = rest[0] ?? '';
				return `${tier.charAt(0).toUpperCase()}${tier.slice(1)} badge`;
			}
			if (type === 'vexpoints') return `${rest[0]} Vex Points`;
			if (type === 'token') {
				const count = Number(rest[0] ?? 1);
				return `${count} supporter token${count !== 1 ? 's' : ''}`;
			}
			return seg;
		})
		.join(' · ');
}

function Seasons() {
	return (
		<section className="lp-section lp-seasons" aria-labelledby="lp-seasons-title">
			<SectionHead
				label="TRANSMISSION 05"
				title="Seasons &amp; the permanent Vex Pass"
				subtitle="Every galaxy ends with a winner. Your Vex Points and pass progress carry forward."
				titleId="lp-seasons-title"
			/>

			<div className="lp-seasons-grid">
				<div className="lp-seasons-desc">
					<p>
						Each galaxy runs to a dominance threshold: a faction must hold 65% of all nexuses for
						36 hours. When it does, the season closes and the winning faction earns a permanent{' '}
						<strong>Hall of Champions</strong> entry. Then a fresh galaxy opens.
					</p>
					<p>
						<strong>Vex Points</strong> carry across every galaxy. Permanent commander titles
						(Veteran, Iron Commander, Conqueror, Warlord) are earned through galaxies played and
						won.
					</p>
					<p>
						The <strong>Vex Pass</strong> is one permanent pass for your whole account: your pass
						XP, levels, claimed rewards and paid unlock carry across every galaxy, with no season
						timer and no resets. The free track pays out resources, Vex Points, badges and the
						Veteran title over 50 levels, and the paid track is a one-time 1,000 Vex Points unlock
						that adds titles, production boosts, supporter tokens and more Vex Points; each reward
						can be claimed once per account, and unlocking the paid track later also unlocks the
						paid rewards of every level you have already reached. After level 50, every 200 XP
						earns a repeatable Resource Cache (50,000 of each resource) for free and paid players
						alike.
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
					<p className="lp-seasons-pass-note">Paid track: one-time 1,000 Vex Points (€4.99). Free track included for all players.</p>
				</div>
			</div>

			<div className="lp-seasons-full">
				<div className="lp-seasons-full-head">
					<span className="lp-seasons-pass-label">// VEX PASS · FULL REWARD TABLE · 50 LEVELS</span>
				</div>
				<div className="lp-seasons-full-scroll">
					<table className="lp-seasons-table">
						<thead>
							<tr>
								<th className="lp-seasons-table-lvl">LV</th>
								<th>
									<span className="lp-seasons-pass-track lp-seasons-pass-track--free">Free</span> Field issue
								</th>
								<th>
									<span className="lp-seasons-pass-track lp-seasons-pass-track--paid">Paid</span> Command pass
								</th>
							</tr>
						</thead>
						<tbody>
							{PASS_LEVELS.map((row) => (
								<tr key={row.level} className={row.level % 10 === 0 ? 'lp-seasons-table-milestone' : undefined}>
									<td className="lp-seasons-table-lvl">{row.level}</td>
									<td>{fmtPassReward(row.free)}</td>
									<td className="lp-seasons-table-paid">{fmtPassReward(row.paid)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="lp-seasons-pass-note">
					Free track returns 250 Vex Points across 50 levels; the paid track returns a further 520 (770
					total), so a 1,000-point unlock nets out at 480. Titles and badges are permanent; production
					boosts are temporary; supporter tokens are account items that persist (6 on the paid track,
					each redeemable for +2 levels on one building or a one-time troop grant scaled to your Command
					Core level). After level 50, every 200 XP earns a repeatable Resource Cache (50,000 of each
					resource) on both tracks. Resource rewards are delivered to a nexus you choose in the galaxy
					you are playing and must fit in its storage. In a galaxy you have just joined, rewards open up
					to level 10 right away and then 4 more levels per day, caches unlock after 10 days, pass XP is
					capped at 800 per day, and you can bank up to 10 unclaimed caches.
				</p>
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
				title="Beta founders"
				subtitle="Permanent marks on your account."
				titleId="lp-founder-title"
			/>

			<div className="lp-founder-grid">
				<ul className="lp-founder-list">
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Beta Founder badge.</strong> Found a nexus during the beta and the badge is
							permanent on your account.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Hall of Champions entry:</strong> when your faction wins a galaxy, your name
							is engraved permanently.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Permanent commander titles</strong> earned through galaxies played and won:
							Veteran, Iron Commander, Conqueror, Warlord. They never reset.
						</span>
					</li>
					<li>
						<span className="lp-founder-bullet">◆</span>
						<span>
							<strong>Referral rewards.</strong> Share your invite link: recruits start with a bonus
							troop squad, you earn redeemable tokens as they grow, and you both get 250 Vex Points
							when they reach 5,000 influence.
						</span>
					</li>
				</ul>

				<div className="lp-founder-stamp" aria-hidden="true">
					<div className="lp-founder-stamp-inner">
						<span className="lp-founder-stamp-arc-top">VEXARA · BETA FOUNDERS</span>
						<span className="lp-founder-stamp-id">№ ∞</span>
						<span className="lp-founder-stamp-arc-bot">PERMANENT · ON YOUR ACCOUNT</span>
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
					targets. Just a strategy-game player building the kind of persistent MMO he wants to play:
					free to play, with no account wipes.
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
