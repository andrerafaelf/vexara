import type { Metadata } from 'next';
import CodexPage from '@/components/Codex/CodexPage';

const TITLE = 'Vexara Codex — Field Manual: Buildings, Units, Stats & Milestones';
const DESCRIPTION =
  'The complete Vexara field manual. Browse all 10 core buildings, 14 unit types, full stats, build requirements, milestones, and scaling formulas for the free browser 4X strategy game Vexara.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Vexara codex',
    'Vexara buildings',
    'Vexara units',
    'Vexara troops',
    'Vexara field manual',
    'Vexara stats',
    'Vexara guide',
    'Vexara wiki',
    '4X strategy guide',
  ],
  alternates: { canonical: '/codex' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://vexara.world/codex',
    siteName: 'Vexara',
    locale: 'en_US',
    type: 'article',
    images: [
      {
        url: 'https://vexara.world/vexara-overview.png',
        width: 1280,
        height: 720,
        alt: 'Vexara Codex — field manual',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vexara Codex — Field Manual',
    description: 'Every building, every unit, every milestone in Vexara.',
    images: ['https://vexara.world/vexara-overview.png'],
  },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <CodexPage />;
}
