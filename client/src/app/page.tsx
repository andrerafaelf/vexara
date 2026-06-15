import type { Metadata } from 'next';
import LandingPage from '@/components/Landing/LandingPage';

const TITLE = 'Vexara - Free Browser-Based 4X Strategy Game with Seasons & Commander Legacy';
const DESCRIPTION =
	'Play Vexara free in your browser. A 4X sci-fi strategy game shared by real players — build your nexus, command 12 unit types, forge alliances, and wage 24/7 war. Galaxies run to a winner. Your Vex Points and permanent commander legacy carry forward. No account wipes. No pay-to-win.';

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: '/' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: 'https://vexara.world/',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'website'
		// OG image comes from the generated card in ./opengraph-image.tsx — Next
		// only auto-attaches it when `images` isn't set explicitly here.
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Vexara - Free Browser 4X Strategy with Seasons & Legacy',
		description:
			'A living sci-fi galaxy shared by real players. Build, conquer, dominate 24/7. Seasons end with a winner. Your legacy never resets.'
		// Twitter image also comes from ./opengraph-image.tsx.
	},
	robots: { index: true, follow: true }
};

const faqSchema = {
	'@context': 'https://schema.org',
	'@type': 'FAQPage',
	mainEntity: [
		{
			'@type': 'Question',
			name: 'Is Vexara free to play?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Yes. Vexara is completely free to play in your browser. A season pass exists — the free track gives every player resources and badges through play. A paid track (1,000 Vex Points, equivalent to €4.99) adds season-scoped titles, temporary production boosts, and 600 Vex Points back over 30 levels. No pass reward affects combat stats or troop power.'
			}
		},
		{
			'@type': 'Question',
			name: 'What kind of game is Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Vexara is a browser-based 4X (eXplore, eXpand, eXploit, eXterminate) strategy game set in a persistent sci-fi galaxy shared by real players. It blends real-time strategy, diplomacy, scouting, and MMO-style faction warfare.'
			}
		},
		{
			'@type': 'Question',
			name: 'Do I need to download anything to play?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'No download required. Vexara runs in any modern web browser on desktop and mobile, and can be installed as a PWA for an app-like experience.'
			}
		},
		{
			'@type': 'Question',
			name: 'Does Vexara have server resets or wipes?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Galaxies run until a faction wins, then a fresh galaxy opens — but your permanent record carries forward. Vex Points, commander titles (earned through galaxies played and won), and your Hall of Champions entries persist across every galaxy. There are no forced account wipes.'
			}
		},
		{
			'@type': 'Question',
			name: 'Does Vexara have seasons?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "Yes. Each galaxy runs until a faction crosses the dominance threshold. The winning faction earns naming rights and a permanent Hall of Champions entry. A fresh galaxy then opens. Your Vex Points carry into every subsequent galaxy. Permanent commander titles — Veteran, Iron Commander, Conqueror, Warlord — are earned through galaxies played and won, not purchased."
			}
		},
		{
			'@type': 'Question',
			name: 'Is Vexara pay-to-win?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'No. Combat power — troops, buildings, attack stats, defense stats — cannot be purchased. The paid season pass track (1,000 Vex Points, equivalent to €4.99) adds season-scoped titles, temporary production boosts, and 600 Vex Points back over 30 levels. Production boosts are time-limited economic perks, not combat multipliers. Every player competes on the same military terms.'
			}
		}
	]
};

export default function Page() {
	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
			/>
			<LandingPage />
		</>
	);
}
