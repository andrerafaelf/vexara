import type { Metadata } from 'next';
import LandingPage from '@/components/Landing/LandingPage';

const TITLE = 'Vexara - Free Browser-Based 4X Strategy Game in a Persistent Galaxy';
const DESCRIPTION =
	'Play Vexara free in your browser. A persistent 4X sci-fi galaxy shared by real players - build your nexus, command 12 unit types, forge alliances, and wage 24/7 real-time war. No resets. No pay-to-win.';

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
		title: 'Vexara - Free Browser 4X Strategy',
		description:
			'A living sci-fi galaxy shared by real players. Build, conquer, dominate 24/7. No resets. No pay-to-win.'
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
				text: 'Yes. Vexara is completely free to play in your browser. There is no pay-to-win store - supporter perks are cosmetic-only thank-yous for voluntary donations.'
			}
		},
		{
			'@type': 'Question',
			name: 'What kind of game is Vexara?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'Vexara is a browser-based 4X (eXplore, eXpand, eXploit, eXterminate) strategy game set in a persistent sci-fi galaxy shared by real players. It blends real-time strategy, diplomacy, espionage, and MMO-style faction warfare.'
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
				text: 'No. Vexara is a persistent galaxy - your nexus, fleets, and faction standing carry forward indefinitely. Progress is never wiped.'
			}
		},
		{
			'@type': 'Question',
			name: 'Is Vexara pay-to-win?',
			acceptedAnswer: {
				'@type': 'Answer',
				text: 'No. Vexara has no power purchases, no premium currency, and no paid boosts. Every player competes on the same economic and military terms.'
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
