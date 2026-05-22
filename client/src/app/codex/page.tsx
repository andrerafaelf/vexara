import type { Metadata } from 'next';
import CodexPage from '@/components/Codex/CodexPage';

export const metadata: Metadata = {
  title: 'Codex — Vexara field manual',
  description:
    'The complete Vexara field manual. Eight core buildings, twelve unit types, full stats, requirements, milestones, and scaling.',
  openGraph: {
    title: 'Vexara Codex',
    description: 'Full field manual: every building, every unit, every milestone.',
    url: 'https://vexara.world/codex',
    siteName: 'Vexara',
    images: [
      { url: 'https://vexara.world/vexara-overview.png', width: 1280, height: 720, alt: 'Vexara codex' },
    ],
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vexara Codex',
    description: 'Full field manual: every building, every unit, every milestone.',
    images: ['https://vexara.world/vexara-overview.png'],
  },
};

export default function Page() {
  return <CodexPage />;
}
