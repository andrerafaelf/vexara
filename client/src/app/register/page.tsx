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
			'Pick a username, claim your nexus, and command your first fleet. Galaxies run to a winner. Your record and Vex Points carry forward. No account wipes. No pay-to-win.',
		url: 'https://vexara.world/register',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'website',
		images: [
			{
				url: 'https://cdn.vexara.world/screenshots/overview.webp',
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
		images: ['https://cdn.vexara.world/screenshots/overview.webp']
	},
	robots: { index: true, follow: true }
};

export default function RegisterPage() {
	return <RegistrationForm />;
}
