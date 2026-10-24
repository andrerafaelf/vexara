import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import '@/styles/GuidePages.css';

const TITLE = 'How to Play Vexara - Browser MMO RTS Beginner Guide';
const DESCRIPTION =
	'New to Vexara? Learn how to build your nexus, train troops, scout and raid enemies, and conquer territory in this free browser MMO RTS. No download required.';

export const metadata: Metadata = {
	title: { absolute: TITLE },
	description: DESCRIPTION,
	keywords: [
		'how to play browser rts',
		'browser strategy game guide',
		'Vexara guide',
		'Vexara beginners guide',
		'mmo rts tutorial',
		'how to play Vexara',
		'browser mmo rts tutorial'
	],
	alternates: { canonical: '/how-to-play' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: 'https://vexara.world/how-to-play',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'article'
	},
	robots: { index: true, follow: true }
};

const faqSchema = {
	'@context': 'https://schema.org',
	'@type': 'FAQPage',
	mainEntity: [
		{
			'@type': 'Question',
			name: 'How do I start playing Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Register at vexara.world/register - free, no download required. You start with one nexus, a stockpile of resources, and a short quest line that walks you through building your Command Core, training your first troops, and launching your first raid.'
			}
		},
		{
			'@type': 'Question',
			name: 'What is a nexus in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `A nexus is your base of operations. It generates resources, trains troops, houses your garrison, and can be upgraded through 12 core buildings. You can capture additional nexuses from neutral or enemy players.`
			}
		},
		{
			'@type': 'Question',
			name: 'How does combat work in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Vexara uses a rock-paper-scissors class system: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Sending the right composition matters more than raw numbers. Travel times are real - strikes take minutes to hours depending on distance.'
			}
		},
		{
			'@type': 'Question',
			name: 'How do you conquer a nexus in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `Train an Overseer unit (requires Command Core level 14 and Shield Grid level 13; max 3 per nexus and 1 per strike). A winning strike where the Overseer survives drains the target's control by 15, 34 or 50 depending on how decisive the win was, and control regenerates 10 per hour. Control starts at 100 and reaching 0 gives you the nexus, which takes a minimum of two crushing strikes (50 drain each).`
			}
		},
		{
			'@type': 'Question',
			name: 'What are factions in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Factions are player-created groups of up to 10 members. Factions can declare wars, sign treaties, and coordinate attacks. Joining a faction gives you allies, shared chat, and faction-wide diplomatic standing.'
			}
		},
		{
			'@type': 'Question',
			name: 'How do coordinated attacks work in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Use the Wave Planner (solo) or a War Room operation (faction) to schedule multiple waves against the same target at the same arrival time. Coordinated waves now merge into one combined battle instead of resolving as separate fights. This lets you concentrate force the way a defender already concentrates support, which is the only realistic way to crack an organized garrison. Loose simultaneous attacks that did not go through a coordination tool still resolve separately - the merge requires committing through the planner.'
			}
		},
		{
			'@type': 'Question',
			name: 'What are seasons in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `Each galaxy runs until one faction holds 65% of all nexuses for 36 hours. The winning faction earns a permanent Hall of Champions entry, then a fresh galaxy opens. Your Vex Points and earned commander titles carry across every galaxy. There are no account wipes. Titles earned through the Vex Pass (Veteran, Vex Commander, High Commander, Protocol Ascendant) are permanent and show on your profile forever.`
			}
		},
		{
			'@type': 'Question',
			name: 'What is the Vex Pass?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `The Vex Pass, also known in game as the Vex Protocol, has 50 levels. It is one permanent pass for your whole account: your pass XP, levels, claimed rewards and paid unlock carry across every galaxy, with no season timer and no resets. The free track pays out resources, Vex Points, badges and the Veteran title over 50 levels, and the paid track is a one-time 1,000 Vex Points unlock that adds titles, production boosts, supporter tokens and more Vex Points; each reward can be claimed once per account, and unlocking the paid track later also unlocks the paid rewards of every level you have already reached. After level 50, every 200 XP earns a repeatable Resource Cache (50,000 of each resource) for free and paid players alike. The free track (Protocol: Field) awards all three resources at every level, scaling from 500 each at L1 to 140,000 each at L49, plus badges at L10 (Bronze), L25 (Silver), L40 (Gold, with the Veteran title) and L50 (Platinum). The paid track (Protocol: Command) adds the titles Conscript, Operative, Proven, Vex Commander, High Commander and Protocol Ascendant, production boosts up to +35% for 120 hours, and 6 supporter tokens (level 20 x1, level 35 x1, level 50 x4). The paid track returns 520 Vex Points across 20 reward levels (the free track returns 250), so the 1,000 VP unlock nets out at 480 VP. 200 XP unlocks each level. Daily Quests give 200 XP once per day when you complete the full set, plus a 75 XP streak bonus from day 3, so quests alone take about 37 days to reach L50 (10,000 XP). Other XP: launching an attack (25), winning an attack (100), capturing a nexus (150), winning a defence (75), coordinated assaults and faction war operations (120 each), and signing a treaty (60). Resource rewards are delivered to a nexus you choose in the galaxy you are playing and must fit in its storage. In a galaxy you have just joined, rewards open up to level 10 right away and then 4 more levels per day, caches unlock after 10 days, pass XP is capped at 800 per day, and you can bank up to 10 unclaimed caches.`
			}
		},
		{
			'@type': 'Question',
			name: 'What is the Vexara Shop?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `The Shop lets you spend Vex Points on cosmetic items. Three titles rotate daily at a flat 50 VP each, plus one border collection (6 variants at 75 VP each, or 300 VP for the full bundle). Utility items are always available: Commander Rename (500 VP, 30-day cooldown) and Gift Vex Pass (1,000 VP, unlocks the paid track for another commander). Border collections rotate through 12 themes: Banner, Cube, Edge, Frame, Glitch, Gridlock, Mist, Monolith, Portal, Runner, Sunfall, and Terminal.`
			}
		},
		{
			'@type': 'Question',
			name: 'What are commander titles in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `Titles are permanent cosmetic labels that appear next to your name. Some are earned through the Vex Pass: Veteran at L40 on the free track, plus the paid-track titles Conscript, Operative, Proven, Vex Commander, High Commander, and Protocol Ascendant. Others are available in the daily Shop rotation at a flat 50 VP each. Titles earned in any galaxy stay on your account forever. You can set which title shows on your profile at any time.`
			}
		},
		{
			'@type': 'Question',
			name: 'What is the Hall of Champions?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `When a galaxy ends, the winning faction's roster is inscribed in the Hall of Champions, a permanent in-game record you can open from the game menu once you are logged in. Each entry shows the galaxy name, the winning faction, the final date, and every champion's profile. Your Hall of Champions entries accumulate across every galaxy you help win.`
			}
		},
		{
			'@type': 'Question',
			name: 'Does paying give an advantage?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `Vexara is free to play and every unit, building and mechanic is available without paying. Paying can speed you up, though: the Vex Pass paid track (a one-time 1,000 Vex Points unlock, equal to EUR 4.99) and Ko-fi support grant supporter tokens. Each token redeems for +2 levels on one building or a one-time troop grant scaled to your Command Core level. They are account items that persist. Titles, borders and badges are cosmetic. The paid track also adds temporary production boosts and more Vex Points.`
			}
		}
	]
};

const STEPS = [
	{
		num: '01',
		title: 'Your first build is accelerated, use the head start',
		body: `Three resources drive everything: Biomass, Alloy, and Ore. Your very first action is upgrading the Command Core from level 0 to 1, and that specific build is accelerated to ~25 seconds so the game opens up immediately. Every build after it takes its normal time. While the Core builds, a short coaching card explains the resource bar and build queue. Once it lands, the Ore Extractor is the only production building you can upgrade straight away: the Biomass Farm needs Life Support level 1, and the Alloy Forge needs Ore Extractor level 2, so follow the unlock chain. Production scales 1.35x per level, so early investment compounds fast. Build your Storage Vault early to avoid capping out and wasting ticks.`
	},
	{
		num: '02',
		title: 'Your resources are always on screen',
		body: 'The live resource bar (Biomass, Alloy, Ore with per-hour production rates) is pinned to the top bar on every page. You can be on the Starfield, in the Market, or browsing buildings and still see your economy at a glance. On mobile it condenses to a compact three-value strip. You never need to scroll back to the nexus Overview to check what you can afford.'
	},
	{
		num: '03',
		title: 'Unlock troops through your Command Core',
		body: 'The Command Core is your progression gate. Level it to 2 to unlock the three class production buildings (Hangar Bay for mobile units, Plasma Forge for fire units, Armor Foundry for armor units). Higher Command Core levels unlock the Shield Grid, Targeting Core, and Stealth Array. Rush it alongside your economy buildings - most unlock chains run through it.'
	},
	{
		num: '04',
		title: 'Learn the combat triangle before you train your first troops',
		body: "Vexara's combat is built on a class triangle: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. A primer appears right before you train your first troop so you know the system before you commit resources. Every unit card shows two badges: its role (Striker / Anvil / Scout / Conquest) and its class with what it counters. Strikers are built to attack; Anvils defend. Keep Anvils home, send Strikers out. Don't spam one class; a mixed force won't be hard-countered. Once you've scouted a target, the attack screen reads your scout data and tells you whether your composition is favoured or countered before you send a single troop."
	},
	{
		num: '05',
		title: 'Daily Quests follow you across every tab',
		body: "Daily Quests appear in the left sidebar on every nexus tab (Buildings, Troops, Overview, all of them). The 'upgrade a building' or 'train a unit' objective stays visible exactly when you switch to that tab to do it. Progress and a claim button are always one glance away. The full reward breakdown lives on the Overview panel; the sidebar version is your at-a-glance tracker."
	},
	{
		num: '06',
		title: 'Scout before you strike',
		body: `Train a Recon Operative and send it at a target to scout it before committing a raid. Scouts reveal troops, resources (above the target's Stealth Array hidden vault), buildings, population, control level, and stationed support, and the report comes straight back to your logs. The Recon Operative is the fastest unit in the game (speed 50), so a scout arrives ahead of any strike - send it first. It deals no damage; if the defender keeps recon stationed, your scouts have to fight through theirs (more operatives = better odds) before the intel comes home.`
	},
	{
		num: '07',
		title: 'Raid neutrals for early resources',
		body: `Neutral nexuses on the galaxy map are unowned and generate resources passively. Raiding them is low-risk and high-reward in the early game. Your carry capacity determines how much loot comes home - Assault Troopers and Vanguard Breakers carry well. You take the smaller of your surviving carry capacity and the lootable resources left after protections such as the Stealth Array vault.`
	},
	{
		num: '08',
		title: 'Defend with Shield Grid and garrison',
		body: `Each level of Shield Grid adds +1.5% to your entire garrison's effective defence power (+22.5% at level 15) - multiplicative with every troop's defence stat. Keep Recon Operatives stationed at home and raise your Stealth Array to make enemy scouts fight through your recon and risk interception before they learn anything. A Military Outpost nexus doubles your Shield Grid efficiency.`
	},
	{
		num: '09',
		title: 'Join or create a faction',
		body: `Factions are groups of up to 10 players that share a chat, coordinate attacks, and enter diplomatic relationships. Joining a faction early gives you allies who can station troops at your nexus as reinforcements, share intel, and back you in wars against larger coalitions. Faction dominance drives the season: the first faction to hold 65% of all nexuses for 36 hours wins a permanent Hall of Champions entry.`
	},
	{
		num: '10',
		title: 'Conquer with Overseers',
		body: `To take a nexus permanently you need an Overseer - a slow, expensive command unit (4h training, max 3 per nexus, 1 per strike). A winning strike where the Overseer survives drains the target's control by 15, 34 or 50, depending on how decisive the win was. Control starts at 100 and regenerates 10 per hour, so two crushing strikes (50 each) or three clear strikes landed close together conquer a nexus, while weak hits spaced far apart are outpaced by regeneration. The Overseer is consumed on the final strike.`
	},
	{
		num: '11',
		title: 'Coordinate strikes through Wave Planner or War Room',
		body: "Once you can build Overseers you will run into organized defenders who stack allied support on the same wall. A solo wave usually cannot crack that. Use the Wave Planner to schedule multiple waves from your own nexuses to land at the same time, or join a War Room operation to combine force with faction-mates. The War Room reads your scout intel and shows every pledge's matchup verdict, so the whole faction can see which commits have the class edge before anyone launches. Coordinated waves merge into one battle at landing. The trade: once launched, troops cannot be recalled before the fight resolves."
	},
	{
		num: '12',
		title: 'Earn XP and level the permanent Vex Pass',
		body: `The Vex Pass (in game, the Vex Protocol) has 50 levels. It is one permanent pass for your whole account: your pass XP, levels, claimed rewards and paid unlock carry across every galaxy, with no season timer and no resets. The free track pays out resources, Vex Points, badges and the Veteran title over 50 levels, and the paid track is a one-time 1,000 Vex Points unlock that adds titles, production boosts, supporter tokens and more Vex Points; each reward can be claimed once per account, and unlocking the paid track later also unlocks the paid rewards of every level you have already reached. After level 50, every 200 XP earns a repeatable Resource Cache (50,000 of each resource) for free and paid players alike. The free track (Protocol: Field) is available to everyone and awards resources at every level, scaling from 500 of each at L1 up to 140k each near L50, plus career badges at L10, L25, L40, and a Platinum badge at L50. Each level costs 200 XP. Completing the full Daily Quest set grants 200 XP once per day, with a 75 XP streak bonus from day 3, so quests alone take about 37 days to reach L50. Winning attacks (100 XP), capturing nexuses (150 XP), winning defences (75 XP), and running faction war operations (120 XP) add more, up to 800 XP per day. Upgrade to the paid track (Protocol: Command, a one-time 1,000 VP) to add commander titles, production boosts, and 6 supporter tokens on top of the free rewards. Resource rewards are delivered to a nexus you choose in the galaxy you are playing and must fit in its storage. In a galaxy you have just joined, rewards open up to level 10 right away and then 4 more levels per day, caches unlock after 10 days, pass XP is capped at 800 per day, and you can bank up to 10 unclaimed caches.`
	},
	{
		num: '13',
		title: 'Spend Vex Points in the Shop',
		body: `Vex Points (VP) are your persistent currency that carry across every galaxy. Spend them in the Shop on cosmetic titles (a flat 50 VP each), portrait borders, a Commander Rename (500 VP, 30-day cooldown), or to gift the Vex Pass paid track to another commander (1,000 VP). Three titles rotate daily. One border collection (6 variants) rotates daily at 75 VP each or 300 VP for the bundle. 12 collections cycle through over 12 days. The paid track returns 520 VP as you level, so its effective net cost is 480 VP. Supporter tokens from the paid track and Ko-fi support: Each token redeems for +2 levels on one building or a one-time troop grant scaled to your Command Core level. They are account items that persist.`
	}
];

export default function HowToPlayPage() {
	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
			/>
			<PublicNav loc="How to Play" />

			<main className="gp-root">
				<header className="gp-header">
					<div className="gp-header-label">// FIELD MANUAL</div>
					<h1 className="gp-title">How to Play Vexara</h1>
					<p className="gp-subtitle">
						A free browser MMO RTS. No download. Build a nexus, train armies, conquer territory, and
						fight real players across galaxies that run to a winner. Your permanent record never
						resets.
					</p>
					<Link href="/register" className="gp-hero-cta">
						Join the live galaxy
					</Link>
				</header>

				<section className="gp-section">
					<h2 className="gp-section-title">The core loop</h2>
					<p className="gp-prose">
						Vexara is a real-time strategy game that runs in your browser 24/7. You start with one
						nexus, a base that generates three resources (Biomass, Alloy, Ore) and trains troops.
						You use those resources to build, expand, raid, and eventually conquer other nexuses
						from neutral spawns or rival players. Galaxies run until a faction wins, then a fresh
						one opens. Your Vex Points, earned commander titles, badges, and Hall of Champions
						entries carry forward permanently. Your record never resets. Every action you take
						has real consequences.
					</p>
				</section>

				<section className="gp-section">
					<h2 className="gp-section-title">Step-by-step: your first session</h2>
					<div className="gp-steps">
						{STEPS.map((step) => (
							<div key={step.num} className="gp-step">
								<div className="gp-step-num">{step.num}</div>
								<div className="gp-step-body">
									<h3 className="gp-step-title">{step.title}</h3>
									<p className="gp-step-text">{step.body}</p>
								</div>
							</div>
						))}
					</div>
				</section>

				<section className="gp-section">
					<h2 className="gp-section-title">Frequently asked questions</h2>
					<div className="gp-faq">
						{faqSchema.mainEntity.map((item, i) => (
							<details key={i} className="gp-faq-item">
								<summary className="gp-faq-q">{item.name}</summary>
								<p className="gp-faq-a">{item.acceptedAnswer.text}</p>
							</details>
						))}
					</div>
				</section>

				<div className="gp-cta-block">
					<p className="gp-cta-text">Ready to join? The galaxy is live right now.</p>
					<Link href="/register" className="gp-cta-btn">
						Join the live galaxy
					</Link>
				</div>
			</main>

			<SiteFooter />
		</>
	);
}
