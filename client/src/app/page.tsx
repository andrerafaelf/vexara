import type { Metadata } from 'next';
import LandingPage from '@/components/Landing/LandingPage';

export const metadata: Metadata = {
  title: 'Vexara — A persistent galaxy. Real opponents.',
  description:
    'Browser-based 4X strategy. A living galaxy shared by real players — build, conquer, dominate 24/7. No resets. No pay-to-win.',
  openGraph: {
    title: 'Vexara — A persistent galaxy. Real opponents.',
    description:
      'Build a nexus, command twelve unit types, and wage real-time war with players in a galaxy that never stops running.',
    url: 'https://vexara.world',
    siteName: 'Vexara',
    images: [
      { url: 'https://vexara.world/vexara-overview.png', width: 1280, height: 720, alt: 'Vexara nexus overview' },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vexara — A persistent galaxy. Real opponents.',
    description: 'Browser-based 4X strategy. A living galaxy shared by real players — build, conquer, dominate.',
    images: ['https://vexara.world/vexara-overview.png'],
  },
};

export default function Page() {
  return <LandingPage />;
}
