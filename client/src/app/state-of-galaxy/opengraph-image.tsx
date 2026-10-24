import { ImageResponse } from 'next/og';

// Route segment config — keep the OG image in lockstep with the page's
// revalidate window so Discord/Twitter previews refresh on the same cadence
// as the underlying numbers.
export const revalidate = 300;
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };
export const alt = 'Vexara Galaxy Status';

// Live numbers only appear once enough commanders are active to be meaningful.
const POPULATION_FLOOR = 10;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface MinimalStatus {
	activePlayers: number;
	totalRegistered: number;
	claimedNexuses: number;
}

async function fetchCounts(): Promise<MinimalStatus> {
	try {
		const res = await fetch(`${API_URL}/galaxies/public/status`, {
			next: { revalidate: 300 }
		});
		if (!res.ok) return { activePlayers: 0, totalRegistered: 0, claimedNexuses: 0 };
		const json = (await res.json()) as MinimalStatus;
		return {
			activePlayers: json.activePlayers ?? 0,
			totalRegistered: json.totalRegistered ?? 0,
			claimedNexuses: json.claimedNexuses ?? 0
		};
	} catch {
		return { activePlayers: 0, totalRegistered: 0, claimedNexuses: 0 };
	}
}

// Brand-aligned 1200x630 OG image. Uses next/og (Edge runtime) to render
// flexbox-only JSX into a PNG so previews on Discord / X / Slack carry the
// page's live numbers. Replace by dropping a static PNG at
// /public/og-galaxy-status.png and pointing openGraph.images at it.
export default async function Image() {
	const { activePlayers, totalRegistered, claimedNexuses } = await fetchCounts();
	const showLive = activePlayers >= POPULATION_FLOOR;

	return new ImageResponse(
		(
			<div
				style={{
					height: '100%',
					width: '100%',
					display: 'flex',
					flexDirection: 'column',
					padding: '64px 72px',
					background: '#08090c',
					backgroundImage:
						'radial-gradient(ellipse at 80% -20%, rgba(255,158,61,0.16) 0%, transparent 55%), radial-gradient(ellipse at 0% 110%, rgba(255,158,61,0.08) 0%, transparent 50%)',
					color: '#f0f6fc',
					fontFamily: 'sans-serif'
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 16,
						fontSize: 22,
						letterSpacing: '0.18em',
						textTransform: 'uppercase',
						color: '#ff9e3d'
					}}
				>
					<div
						style={{
							width: 12,
							height: 12,
							background: '#ff9e3d'
						}}
					/>
					<div style={{ display: 'flex' }}>Vexara // Live Galaxy Status</div>
				</div>

				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						marginTop: 56,
						lineHeight: 1
					}}
				>
					<div
						style={{
							display: 'flex',
							fontStyle: 'italic',
							fontSize: 48,
							fontWeight: 300,
							color: '#c9d1d9',
							marginBottom: 8
						}}
					>
						{showLive ? 'A persistent galaxy.' : 'Early galaxy.'}
					</div>
					<div
						style={{
							display: 'flex',
							fontSize: 104,
							fontWeight: 900,
							letterSpacing: '-0.04em',
							color: '#ffffff'
						}}
					>
						{showLive ? 'Already moving.' : 'Territory unclaimed.'}
					</div>
				</div>

				<div
					style={{
						display: 'flex',
						marginTop: 'auto',
						borderTop: '1px solid #30363d',
						paddingTop: 28,
						gap: 64
					}}
				>
					{showLive ? (
						<>
							<Stat label="Active commanders" value={activePlayers} />
							<Stat label="Registered" value={totalRegistered} />
							<Stat label="Claimed nexuses" value={claimedNexuses} />
						</>
					) : (
						<div
							style={{
								display: 'flex',
								fontSize: 30,
								color: '#c9d1d9',
								maxWidth: 760,
								lineHeight: 1.3
							}}
						>
							Free to play. Starter protection, guided quests, and factions to found.
						</div>
					)}
				</div>

				<div
					style={{
						position: 'absolute',
						right: 72,
						bottom: 56,
						display: 'flex',
						fontSize: 18,
						letterSpacing: '0.16em',
						textTransform: 'uppercase',
						color: '#6e7681'
					}}
				>
					vexara.world / state-of-galaxy
				</div>
			</div>
		),
		{ ...size }
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column' }}>
			<div
				style={{
					fontSize: 18,
					letterSpacing: '0.16em',
					textTransform: 'uppercase',
					color: '#8b949e',
					marginBottom: 8
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 64,
					fontWeight: 800,
					color: '#ffffff',
					letterSpacing: '-0.02em'
				}}
			>
				{value.toLocaleString()}
			</div>
		</div>
	);
}
