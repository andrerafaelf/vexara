import type { Metadata } from 'next';
import RegistrationForm from '@/components/RegistrationForm';

const TITLE = 'Create Your Account - Vexara';
const DESCRIPTION =
	'Join Vexara free. Pick a username, claim your nexus, and command your first fleet in a persistent 4X galaxy shared by real players. No download. No pay-to-win.';

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: '/register' },
	openGraph: {
		title: 'Join Vexara - Free Browser 4X Strategy',
		description:
			'Pick a username, claim your nexus, and command your first fleet. A persistent sci-fi galaxy - no resets, no pay-to-win.',
		url: 'https://vexara.world/register',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'website',
		images: [
			{
				url: 'https://vexara.world/vexara-overview.png',
				width: 1280,
				height: 720,
				alt: 'Join Vexara'
			}
		]
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Join Vexara - Free Browser 4X Strategy',
		description: 'Pick a username, claim your nexus, and command your first fleet.',
		images: ['https://vexara.world/vexara-overview.png']
	},
	robots: { index: true, follow: true }
};

export default function RegisterPage() {
	return <RegistrationForm />;
}
