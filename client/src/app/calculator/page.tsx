import type { Metadata } from 'next';
import CalculatorClient from './CalculatorClient';

// Server wrapper so the route carries its own metadata (and canonical) instead
// of inheriting the root layout's canonical '/'. The interactive calculator is
// a client component.
const TITLE = 'Vexara Battle Calculator - Predict Losses, Survivors & Conquest';
const DESCRIPTION =
	'Model any Vexara attack against any garrison with the same combat math the game server uses: class counters, Targeting Core, Shield Grid, Military Outpost shields, per-unit losses, surviving carry, and Overseer control drain.';

export const metadata: Metadata = {
	title: { absolute: TITLE },
	description: DESCRIPTION,
	keywords: [
		'Vexara battle calculator',
		'Vexara combat calculator',
		'Vexara combat simulator',
		'Vexara losses',
		'Vexara conquest',
		'browser rts battle calculator'
	],
	alternates: { canonical: '/calculator' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: 'https://vexara.world/calculator',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'website'
		// OG image comes from the generated card in ./opengraph-image.tsx.
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Vexara Battle Calculator',
		description:
			'Predict losses, survivors, loot capacity, and Overseer control drain before you send.'
	},
	robots: { index: true, follow: true }
};

export default function CalculatorPage() {
	return <CalculatorClient />;
}
