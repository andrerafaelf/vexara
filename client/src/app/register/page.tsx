import type { Metadata } from 'next';
import RegistrationForm from '@/components/RegistrationForm';

export const metadata: Metadata = {
  title: 'Create your account — Vexara',
  description: 'Join Vexara. Pick a username, claim your nexus, and command your first fleet in a living 4X galaxy shared by real players.',
  openGraph: {
    title: 'Join Vexara',
    description: 'Pick a username, claim your nexus, and command your first fleet. Browser-based 4X strategy — no resets, no pay-to-win.',
    url: 'https://vexara.world/register',
    images: [{ url: 'https://vexara.world/vexara-overview.png', width: 1280, height: 720, alt: 'Vexara nexus overview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Join Vexara',
    description: 'Pick a username, claim your nexus, and command your first fleet. Browser-based 4X strategy.',
    images: ['https://vexara.world/vexara-overview.png'],
  },
};

export default function RegisterPage() {
  return <RegistrationForm />;
}
