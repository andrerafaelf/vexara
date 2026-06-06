import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

// Battle-replay social card. The replay page is explicitly shared to Discord
// ("Copy Discord" on the replay), so the preview should carry the actual
// matchup + outcome, not the generic site image. force-dynamic because each
// replay is unique and resolved at request time.
export const dynamic = 'force-dynamic';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara battle replay';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ReplayPayload {
	attacker: { username: string | null };
	defender: { username: string | null };
	attackerInitial: Record<string, number>;
	defenderInitial: Record<string, number>;
	victory: boolean;
	conquered: boolean;
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

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + (b || 0), 0);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const data = await fetchReplay(id);

	if (!data) {
		return renderOgCard({
			eyebrow: 'Combat Replay',
			title: 'Battle Replay',
			subtitle: 'Watch a deterministic 30-second Vexara battle replay.',
			footer: 'vexara.world / replay'
		});
	}

	const attacker = data.attacker.username || 'Attacker';
	const defender = data.defender.username || 'Defender';
	// Title is the outcome; keep it short so it doesn't wrap past one line.
	const title = data.conquered
		? `${attacker} took ${defender}`
		: data.victory
			? `${attacker} beat ${defender}`
			: `${defender} held off ${attacker}`;
	const totalA = sum(data.attackerInitial);
	const totalD = sum(data.defenderInitial);

	return renderOgCard({
		eyebrow: 'Combat Replay',
		kicker: `${totalA.toLocaleString()} vs ${totalD.toLocaleString()} units engaged`,
		title,
		// Long names can make the outcome wide; ease the title size down a touch.
		titleSize: title.length > 28 ? 84 : 100,
		subtitle: 'Watch the deterministic 30-second replay, blow by blow.',
		footer: 'vexara.world / replay',
		badge: data.conquered ? 'CONQUERED' : data.victory ? 'ATTACKER WIN' : 'DEFENDER WIN'
	});
}
