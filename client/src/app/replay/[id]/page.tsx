// Public, shareable battle replay page.
// No auth required, anyone with the link can watch the battle.
// The page is server-rendered with OG/Twitter card meta so paste-into-Slack
// and tweets get a rich preview.

import type { Metadata } from 'next';
import Link from 'next/link';
import ReplayClient from './ReplayClient';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface ReplayPayload {
	id: string;
	type: 'attack' | 'support' | 'scout';
	attacker: {
		username: string | null;
		nexusName: string | null;
		x: number | null;
		y: number | null;
	};
	defender: {
		username: string | null;
		nexusName: string | null;
		x: number | null;
		y: number | null;
	};
	attackerInitial: Record<string, number>;
	defenderInitial: Record<string, number>;
	attackerLosses: Record<string, number>;
	defenderLosses: Record<string, number>;
	attackerPower: number | null;
	defenderPower: number | null;
	victory: boolean;
	conquered: boolean;
	resourcesStolen: { biomass: number; alloy: number; ore: number };
	combatSeed: number;
	mission: string | null;
	createdAt: string;
	arrivesAt: string | null;
}

async function fetchReplay(id: string): Promise<ReplayPayload | null> {
	try {
		const res = await fetch(`${API_URL}/replay/${id}`, { next: { revalidate: 3600 } });
		if (!res.ok) return null;
		return (await res.json()) as ReplayPayload;
	} catch {
		return null;
	}
}

export async function generateMetadata({
	params
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const data = await fetchReplay(id);

	if (!data) {
		return {
			title: 'Battle Replay · Vexara',
			description: 'Watch a Vexara battle replay.'
		};
	}

	const attacker = data.attacker.username || 'Attacker';
	const defender = data.defender.username || 'Defender';
	const outcomeText = data.conquered
		? `${attacker} CONQUERED ${defender}`
		: data.victory
			? `${attacker} defeated ${defender}`
			: `${defender} repelled ${attacker}`;

	const title = `${outcomeText} · Vexara Replay`;
	const totalA = Object.values(data.attackerInitial).reduce((a, b) => a + b, 0);
	const totalD = Object.values(data.defenderInitial).reduce((a, b) => a + b, 0);
	const description = `${totalA} vs ${totalD} units engaged. ${outcomeText}. Watch the deterministic 30-second replay on Vexara.`;
	const url = `${SITE_URL}/replay/${id}`;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			url,
			siteName: 'Vexara',
			type: 'article'
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description
		},
		alternates: { canonical: url }
	};
}

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const data = await fetchReplay(id);

	if (!data) {
		return (
			<div
				style={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: '#0D1117',
					color: '#C9D1D9',
					flexDirection: 'column',
					gap: 12,
					padding: 24
				}}
			>
				<h1 style={{ fontSize: 24, color: '#FF9E3D' }}>Replay not found</h1>
				<p>This battle either never happened or hasn&apos;t resolved yet.</p>
				<Link href="/" style={{ color: '#FF9E3D' }}>
					← Back to Vexara
				</Link>
			</div>
		);
	}

	if (data.type === 'scout' || data.mission === 'scout') {
		return (
			<div
				style={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: '#0D1117',
					color: '#C9D1D9',
					flexDirection: 'column',
					gap: 12,
					padding: 24
				}}
			>
				<h1 style={{ fontSize: 24, color: '#FF9E3D' }}>Scout missions don&apos;t have a replay</h1>
				<Link href="/" style={{ color: '#FF9E3D' }}>
					← Back to Vexara
				</Link>
			</div>
		);
	}

	return <ReplayClient data={data} />;
}
