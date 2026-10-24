import type { Metadata } from 'next';
import LandingPage from '@/components/Landing/LandingPage';

const TITLE = 'Vexara - Free Browser-Based 4X Strategy Game with Seasons & Commander Legacy';

const PASS_DESCRIPTION =
	'The Vex Pass is one permanent pass for your whole account: your pass XP, levels, claimed rewards and paid unlock carry across every galaxy, with no season timer and no resets. The free track pays out resources, Vex Points, badges and the Veteran title over 50 levels, and the paid track is a one-time 1,000 Vex Points unlock that adds titles, production boosts, supporter tokens and more Vex Points; each reward can be claimed once per account, and unlocking the paid track later also unlocks the paid rewards of every level you have already reached. After level 50, every 200 XP earns a repeatable Resource Cache (50,000 of each resource) for free and paid players alike.';

const DESCRIPTION =
	'Play Vexara free in your browser. A 4X sci-fi strategy game shared by real players. Build your nexus, command 16 unit types, forge alliances, and wage 24/7 war. Galaxies run to a winner. Your Vex Points and permanent commander legacy carry forward. No account wipes. Free to play.';

export const metadata: Metadata = {
	title: { absolute: TITLE },
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
				text: `Yes. Vexara is free to play in your browser, and every unit, building and mechanic is available without paying. ${PASS_DESCRIPTION}`
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
				text: 'Galaxies run until a faction wins, then a fresh galaxy opens. Your permanent record carries forward. Vex Points, commander titles (earned through galaxies played and won), and your Hall of Champions entries persist across every galaxy. There are no forced account wipes.'
			}
		},
		{
			'@type': 'Question',
			name: 'Does Vexara have seasons?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: "Yes. Each galaxy runs until a faction crosses the dominance threshold. The winning faction earns a permanent Hall of Champions entry. A fresh galaxy then opens. Your Vex Points carry into every subsequent galaxy. Permanent commander titles (Veteran, Iron Commander, Conqueror, Warlord) are earned through galaxies played and won."
			}
		},
		{
			'@type': 'Question',
			name: 'Does paying give an advantage?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: `Vexara is free to play and every unit, building and mechanic is available without paying. Paying can speed you up, though: the Vex Pass paid track (a one-time 1,000 Vex Points unlock, equal to EUR 4.99) and Ko-fi support grant supporter tokens, and each token redeems for +2 levels on one building or a one-time troop grant scaled to your Command Core level. Titles, borders and badges are cosmetic. The paid track also adds temporary production boosts and more Vex Points.`
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
