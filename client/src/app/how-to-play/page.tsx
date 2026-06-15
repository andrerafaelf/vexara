import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import '@/styles/GuidePages.css';

const TITLE = 'How to Play Vexara - Browser MMO RTS Beginner Guide';
const DESCRIPTION =
	'New to Vexara? Learn how to build your nexus, train troops, scout and raid enemies, and conquer territory in this free browser MMO RTS. No download required.';

export const metadata: Metadata = {
	title: TITLE,
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
				text: 'A nexus is your base of operations. It generates resources, trains troops, houses your garrison, and can be upgraded through 10 core buildings. You can capture additional nexuses from neutral or enemy players.'
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
				text: "Train an Overseer unit (requires Command Core level 14 and Shield Grid level 13). Each successful strike that includes a surviving Overseer reduces the target's control by 34. Control starts at 100 - reach 0 and the nexus is yours. It takes a minimum of three strikes."
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
				text: "Each galaxy runs until a faction crosses the dominance threshold. The winning faction earns naming rights and a permanent Hall of Champions entry, then a fresh galaxy opens. Your Vex Points and earned commander titles carry across every galaxy. Nothing resets. Titles earned through the Vex Protocol (Veteran, Vex Commander, High Commander, Season Conqueror) are permanent and show on your profile forever."
			}
		},
		{
			'@type': 'Question',
			name: 'What is the Vex Protocol?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "The Vex Protocol is the season battle pass: 50 levels, reset each galaxy. Everyone plays the free track (Protocol: Field) at no cost: every level awards all three resources, scaling from 500 each at L1 to 140,000 each at L49, plus badge milestones at L10 (Bronze), L25 (Silver), L40 (Gold), and a Platinum badge at L50. The paid track (Protocol: Command) costs 1,000 Vex Points (~€4.99) and adds commander titles, production boosts up to +35% for 120 hours, and up to 4 relocation tokens. The paid track also returns 500 VP across 20 reward levels, so the effective net cost is 500 VP. Earn XP by completing Daily Quests (200 XP), winning attacks (100 XP), capturing a nexus (150 XP), winning defences (75 XP), and coordinating faction operations (120 XP). 200 XP unlocks each level; a casual player hits L50 in about 28 days."
			}
		},
		{
			'@type': 'Question',
			name: 'What is the Vexara Shop?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "The Shop lets you spend Vex Points on cosmetic items. Three titles rotate daily (100-400 VP each), plus one border collection (6 variants at 75 VP each, or 300 VP for the full bundle). Utility items are always available: Commander Rename (500 VP, 30-day cooldown), and Gift Vex Protocol Pass (1,000 VP, unlocks the paid pass for a galaxy mate). Border collections rotate through 12 themes: Banner, Cube, Edge, Frame, Glitch, Gridlock, Mist, Monolith, Portal, Runner, Sunfall, and Terminal. Alpha Commander supporters receive an exclusive non-purchasable border automatically."
			}
		},
		{
			'@type': 'Question',
			name: 'What are commander titles in Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "Titles are permanent cosmetic labels that appear next to your name. Some are earned free through the Vex Protocol pass (Veteran at L40, plus paid-track titles Recruit, Operative, Proven, Vex Commander, High Commander, and Season Conqueror). Others are available in the daily Shop rotation (100–400 VP). Titles earned in any galaxy stay on your account forever. You can set which title shows on your profile at any time."
			}
		},
		{
			'@type': 'Question',
			name: 'What is the Hall of Champions?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "When a galaxy ends, the winning faction's roster is inscribed in the Hall of Champions, a permanent record visible to everyone at vexara.world/hall-of-fame. Each entry shows the galaxy name, the winning faction, the final date, and every champion's profile. Your Hall of Champions entries accumulate across every galaxy you help win."
			}
		},
		{
			'@type': 'Question',
			name: 'Is Vexara pay-to-win?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "No. Combat power (troops, buildings, attack and defense stats) cannot be purchased. The paid Vex Protocol track adds commander titles, temporary production boosts (economic, not combat), and relocation tokens. Production boosts expire in hours and affect resource income only. Every combat-relevant stat is earned purely through gameplay. The free pass track gives resources and badges to every player with no purchase required."
			}
		}
	]
};

const STEPS = [
	{
		num: '01',
		title: 'Your first build is accelerated, use the head start',
		body: "Three resources drive everything: Biomass, Alloy, and Ore. Your very first action is upgrading the Command Core from level 0 to 1, and that specific build is accelerated to ~25 seconds so the game opens up immediately. Every build after it takes its normal time. While the Core builds, a short coaching card explains the resource bar and build queue. Once it lands, invest in your Biomass Farm, Alloy Forge, and Ore Extractor. Production scales 1.35x per level, so early investment compounds fast. Build your Storage Vault early to avoid capping out and wasting ticks."
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
		body: "Train a Recon Operative and send it at a target to scout it before committing a raid. Scouts reveal troops, resources, buildings, and active queues, and the report comes straight back to your logs. The Recon Operative is the fastest unit in the game (speed 50), so a scout arrives ahead of any strike - send it first. It deals no damage; if the defender keeps recon stationed, your scouts have to fight through theirs (more operatives = better odds) before the intel comes home."
	},
	{
		num: '07',
		title: 'Raid neutrals for early resources',
		body: 'Neutral nexuses on the galaxy map are unowned and generate resources passively. Raiding them is low-risk and high-reward in the early game. Your carry capacity determines how much loot comes home - Assault Troopers and Vanguard Breakers carry well. Any army with 8,000+ carry takes 100% of lootable resources.'
	},
	{
		num: '08',
		title: 'Defend with Shield Grid and garrison',
		body: "Each level of Shield Grid adds +2% to your entire garrison's effective defence power - multiplicative with every troop's defence stat. Keep Recon Operatives stationed at home and raise your Stealth Array to make enemy scouts fight through your recon and risk interception before they learn anything. A Military Outpost nexus doubles your Shield Grid efficiency."
	},
	{
		num: '09',
		title: 'Join or create a faction',
		body: 'Factions are groups of up to 10 players that share a chat, coordinate attacks, and enter diplomatic relationships. Joining a faction early gives you allies who can station troops at your nexus as reinforcements, share intel, and back you in wars against larger coalitions. Faction dominance drives the season. The faction that crosses the threshold first wins naming rights and a permanent Hall of Champions entry.'
	},
	{
		num: '10',
		title: 'Conquer with Overseers',
		body: 'To take a nexus permanently you need an Overseer - a slow, expensive command unit (4h training, max 3 per nexus). Each successful strike with a surviving Overseer drops enemy control by 34. Control starts at 100, so three clean hits conquer any nexus. The Overseer is consumed on the final strike.'
	},
	{
		num: '11',
		title: 'Coordinate strikes through Wave Planner or War Room',
		body: "Once you can build Overseers you will run into organized defenders who stack allied support on the same wall. A solo wave usually cannot crack that. Use the Wave Planner to schedule multiple waves from your own nexuses to land at the same time, or join a War Room operation to combine force with faction-mates. The War Room reads your scout intel and shows every pledge's matchup verdict, so the whole faction can see which commits have the class edge before anyone launches. Coordinated waves merge into one battle at landing. The trade: once launched, troops cannot be recalled before the fight resolves."
	},
	{
		num: '12',
		title: 'Earn XP and level the Vex Protocol each season',
		body: "Every galaxy has a Vex Protocol, a 50-level seasonal pass that resets when the galaxy ends. The free track (Protocol: Field) is available to everyone and awards resources at every level, scaling from 500 of each at L1 up to 140k each near L50, plus career badges at L10, L25, L40, and a Platinum badge at L50. Earn XP by completing Daily Quests (200 XP each), winning attacks (100 XP), capturing nexuses (150 XP), winning defences (75 XP), and running faction war operations (120 XP). Each level costs 200 XP. A casual daily-quest player reaches L50 in roughly 28 days. Upgrade to the paid track (Protocol: Command, 1,000 VP) to add commander titles, production boosts, and relocation tokens on top of the free rewards."
	},
	{
		num: '13',
		title: 'Spend Vex Points in the Shop',
		body: "Vex Points (VP) are your persistent currency that carry across every galaxy. Spend them in the Shop on cosmetic titles, portrait borders, a Commander Rename (500 VP, 30-day cooldown), or to gift a Vex Protocol pass to a galaxy mate (1,000 VP). Three titles rotate daily at 100-400 VP. One border collection (6 variants) rotates daily at 75 VP each or 300 VP for the bundle. 12 collections cycle through over 12 days. VP earned from the Protocol pass reduces the effective cost of the paid track to around 500 VP net."
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
