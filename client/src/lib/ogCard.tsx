import { ImageResponse } from 'next/og';

// Shared 1200x630 Open Graph card for every public Vexara page. One look across
// landing, codex, guides, calculator, patch notes, and replays so a Vexara link
// pasted into Discord/X/Slack always reads as Vexara — dark field, amber accent,
// faint tactical grid, and the hex command-node motif bleeding off the right.
//
// Each route's opengraph-image.tsx is a thin wrapper that calls renderOgCard()
// with its own copy. Re-export OG_SIZE / OG_CONTENT_TYPE for the route segment
// config so they all declare the same size + type.

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

const ACCENT = '#ff9e3d';

interface OgCardOptions {
	/** Small uppercase label, e.g. "Transmission Log" (prefixed with "Vexara //"). */
	eyebrow?: string;
	/** Italic line above the big title, e.g. "A persistent galaxy." */
	kicker?: string;
	/** The dominant headline. */
	title: string;
	/** One- or two-line supporting copy under the title. */
	subtitle?: string;
	/** Footer path, e.g. "vexara.world / codex". */
	footer?: string;
	/** Optional pill in the bottom-right, e.g. "Latest · ALPHA v0.22". */
	badge?: string;
	/** Title font size override (px). Default 116; drop it for long titles. */
	titleSize?: number;
}

function HexGlyph() {
	return (
		<div style={{ position: 'absolute', right: -120, top: 150, display: 'flex', opacity: 0.5 }}>
			<svg width="540" height="540" viewBox="0 0 16 16" fill="none">
				<path d="M8 1.5l5.5 3.25v6.5L8 14.5l-5.5-3.25v-6.5z" stroke={ACCENT} strokeWidth="0.35" />
				<path
					d="M8 3.4l3.85 2.27v4.66L8 12.6l-3.85-2.27V5.67z"
					stroke={ACCENT}
					strokeWidth="0.2"
					opacity="0.6"
				/>
				<circle cx="8" cy="8" r="1.4" stroke={ACCENT} strokeWidth="0.3" />
				<circle cx="8" cy="8" r="0.5" fill={ACCENT} />
			</svg>
		</div>
	);
}

export function renderOgCard({
	eyebrow = 'Vexara',
	kicker,
	title,
	subtitle,
	footer = 'vexara.world',
	badge,
	titleSize = 116
}: OgCardOptions) {
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
						'radial-gradient(ellipse at 85% -25%, rgba(255,158,61,0.20) 0%, transparent 55%), radial-gradient(ellipse at -10% 115%, rgba(255,158,61,0.10) 0%, transparent 50%)',
					color: '#f0f6fc',
					fontFamily: 'sans-serif',
					position: 'relative'
				}}
			>
				{/* Tactical grid wash */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						backgroundImage:
							'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
						backgroundSize: '48px 48px'
					}}
				/>

				<HexGlyph />

				{/* Eyebrow */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 16,
						fontSize: 22,
						letterSpacing: '0.18em',
						textTransform: 'uppercase',
						color: ACCENT
					}}
				>
					<div style={{ width: 12, height: 12, background: ACCENT }} />
					<div style={{ display: 'flex' }}>Vexara // {eyebrow}</div>
				</div>

				{/* Headline block, pushed to lower half */}
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						marginTop: 'auto',
						lineHeight: 1
					}}
				>
					{kicker && (
						<div
							style={{
								display: 'flex',
								fontStyle: 'italic',
								fontSize: 44,
								fontWeight: 300,
								color: '#c9d1d9',
								marginBottom: 14
							}}
						>
							{kicker}
						</div>
					)}
					<div
						style={{
							display: 'flex',
							fontSize: titleSize,
							fontWeight: 900,
							letterSpacing: '-0.04em',
							color: '#ffffff'
						}}
					>
						{title}
					</div>
				</div>

				{subtitle && (
					<div
						style={{
							display: 'flex',
							marginTop: 28,
							maxWidth: 760,
							fontSize: 29,
							lineHeight: 1.3,
							color: '#9aa4b2'
						}}
					>
						{subtitle}
					</div>
				)}

				{/* Footer row */}
				<div
					style={{
						display: 'flex',
						marginTop: subtitle ? 40 : 'auto',
						alignItems: 'center',
						justifyContent: 'space-between'
					}}
				>
					<div
						style={{
							display: 'flex',
							fontSize: 18,
							letterSpacing: '0.16em',
							textTransform: 'uppercase',
							color: '#6e7681'
						}}
					>
						{footer}
					</div>
					{badge && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 12,
								fontSize: 22,
								fontWeight: 700,
								letterSpacing: '0.04em',
								color: ACCENT,
								border: '1px solid rgba(255,158,61,0.5)',
								borderRadius: 6,
								padding: '8px 16px'
							}}
						>
							{badge}
						</div>
					)}
				</div>
			</div>
		),
		{ ...OG_SIZE }
	);
}
