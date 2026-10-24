import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

// Social card for a public commander profile. The /u/<username> page is
// client-rendered (no server metadata), so this server-side OG route fetches a
// dedicated NO-AUTH aggregates endpoint (/users/:username/og) — the full profile
// endpoint is auth-gated and would 401 here. force-dynamic: per-username + the
// numbers move over time.
export const dynamic = 'force-dynamic';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara commander profile';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ProfileOg {
	username: string;
	/** Ko-fi Alpha Commander supporter flag (User.isFounder). */
	isFounder: boolean;
	/** Beta Founder badge. Optional until /users/:username/og returns it. */
	isBetaFounder?: boolean;
	supporterTier: string | null;
	totalInfluence: number;
	galaxiesWon: number;
	galaxiesPlayed: number;
}

async function fetchProfile(username: string): Promise<ProfileOg | null> {
	try {
		const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}/og`, {
			next: { revalidate: 300 }
		});
		if (!res.ok) return null;
		return (await res.json()) as ProfileOg;
	} catch {
		return null;
	}
}

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params;
	const data = await fetchProfile(username);

	if (!data) {
		return await renderOgCard({
			eyebrow: 'Commander',
			title: decodeURIComponent(username),
			subtitle: 'A commander in the persistent galaxy of Vexara.',
			footer: 'vexara.world'
		});
	}

	const wins = data.galaxiesWon;
	const subtitleParts = [
		`${data.totalInfluence.toLocaleString()} total influence`,
		wins > 0 ? `${wins} galax${wins === 1 ? 'y' : 'ies'} won` : null,
		`${data.galaxiesPlayed} played`
	].filter(Boolean);

	const badge = data.isFounder
		? 'ALPHA COMMANDER'
		: data.isBetaFounder
			? 'BETA FOUNDER'
			: data.supporterTier
			? data.supporterTier.toUpperCase()
			: undefined;

	return await renderOgCard({
		eyebrow: 'Commander',
		kicker: 'Commander dossier',
		title: data.username,
		// Usernames can be long; ease the size down so they don't clip.
		titleSize: data.username.length > 14 ? 84 : 112,
		subtitle: subtitleParts.join('  ·  '),
		footer: `vexara.world // u // ${data.username}`,
		badge
	});
}
