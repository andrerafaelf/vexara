import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

// Brand tokens (mirrors globals.css)
const C = {
	bg: '#0d1117',
	border: '#30363d',
	accent: '#ff9e3d',
	accentSoft: 'rgba(255,158,61,0.08)',
	textStrong: '#f0f6fc',
	textDefault: '#c9d1d9',
	textMuted: '#8b949e',
	textFaint: '#6e7681'
};

interface OgCardOptions {
	/** Small uppercase label, e.g. "Transmission Log" (prefixed with "Vexara //"). */
	eyebrow?: string;
	/** Italic line above the big title. */
	kicker?: string;
	/** The dominant headline. */
	title: string;
	/** One- or two-line supporting copy under the title. */
	subtitle?: string;
	/** Footer path, e.g. "vexara.world / patch-notes". */
	footer?: string;
	/** Optional pill in the bottom-right, e.g. "Latest · ALPHA v0.22". */
	badge?: string;
	/** Title font size override (px). Default 104; drop for long titles. */
	titleSize?: number;
}

// Cache font buffers across requests (module-level, survives hot reloads in dev).
let _interRegular: ArrayBuffer | null = null;
let _interBold: ArrayBuffer | null = null;

async function loadFonts() {
	if (_interRegular && _interBold) return { regular: _interRegular, bold: _interBold };

	const [regular, bold] = await Promise.all([
		fetch(
			'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2'
		).then((r) => r.arrayBuffer()),
		fetch(
			'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff2'
		).then((r) => r.arrayBuffer())
	]);

	_interRegular = regular;
	_interBold = bold;
	return { regular, bold };
}

function HexGlyph() {
	return (
		<div
			style={{
				position: 'absolute',
				right: -80,
				top: 80,
				display: 'flex',
				opacity: 0.22
			}}
		>
			<svg width="520" height="520" viewBox="0 0 16 16" fill="none">
				<path
					d="M8 0.8l6.2 3.6v7.2L8 15.2l-6.2-3.6V4.4z"
					stroke={C.accent}
					strokeWidth="0.18"
					opacity="0.4"
				/>
				<path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" stroke={C.accent} strokeWidth="0.32" />
				<path
					d="M8 3.6l3.7 2.15v4.5L8 12.4l-3.7-2.15v-4.5z"
					stroke={C.accent}
					strokeWidth="0.22"
					opacity="0.7"
				/>
				<line x1="8" y1="1.8" x2="8" y2="14.2" stroke={C.accent} strokeWidth="0.12" opacity="0.3" />
				<line
					x1="2.6"
					y1="5.0"
					x2="13.4"
					y2="11.0"
					stroke={C.accent}
					strokeWidth="0.12"
					opacity="0.3"
				/>
				<line
					x1="13.4"
					y1="5.0"
					x2="2.6"
					y2="11.0"
					stroke={C.accent}
					strokeWidth="0.12"
					opacity="0.3"
				/>
				<circle cx="8" cy="8" r="1.6" stroke={C.accent} strokeWidth="0.28" />
				<circle cx="8" cy="8" r="0.7" fill={C.accent} />
				<circle cx="8" cy="1.8" r="0.25" fill={C.accent} opacity="0.6" />
				<circle cx="13.4" cy="4.9" r="0.25" fill={C.accent} opacity="0.6" />
				<circle cx="13.4" cy="11.1" r="0.25" fill={C.accent} opacity="0.6" />
				<circle cx="8" cy="14.2" r="0.25" fill={C.accent} opacity="0.6" />
				<circle cx="2.6" cy="11.1" r="0.25" fill={C.accent} opacity="0.6" />
				<circle cx="2.6" cy="4.9" r="0.25" fill={C.accent} opacity="0.6" />
			</svg>
		</div>
	);
}

export async function renderOgCard({
	eyebrow = 'Vexara',
	kicker,
	title,
	subtitle,
	footer = 'vexara.world',
	badge,
	titleSize = 104
}: OgCardOptions) {
	const { regular, bold } = await loadFonts();

	return new ImageResponse(
		(
			<div
				style={{
					height: '100%',
					width: '100%',
					display: 'flex',
					flexDirection: 'column',
					background: C.bg,
					color: C.textDefault,
					fontFamily: '"Inter", sans-serif',
					position: 'relative',
					overflow: 'hidden'
				}}
			>
				{/* Amber top-border accent */}
				<div
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						height: 3,
						background: C.accent,
						display: 'flex'
					}}
				/>

				{/* Radial glow from top-right */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						backgroundImage: `radial-gradient(ellipse 900px 600px at 110% -20%, rgba(255,158,61,0.14) 0%, transparent 60%), radial-gradient(ellipse 600px 400px at -10% 120%, rgba(255,158,61,0.07) 0%, transparent 55%)`
					}}
				/>

				{/* Scanlines */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						backgroundImage:
							'repeating-linear-gradient(180deg, transparent 0, transparent 2px, rgba(255,255,255,0.018) 2px, rgba(255,255,255,0.018) 3px)'
					}}
				/>

				{/* Grid wash */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						backgroundImage:
							'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
						backgroundSize: '60px 60px'
					}}
				/>

				<HexGlyph />

				<div
					style={{
						position: 'absolute',
						inset: '3px 0 0 0',
						display: 'flex',
						flexDirection: 'column',
						padding: '56px 72px 52px 72px'
					}}
				>
					{/* Eyebrow */}
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 14,
							fontSize: 18,
							fontWeight: 400,
							letterSpacing: '0.2em',
							textTransform: 'uppercase',
							color: C.accent
						}}
					>
						<div
							style={{
								width: 8,
								height: 8,
								background: C.accent,
								display: 'flex',
								flexShrink: 0
							}}
						/>
						<div style={{ display: 'flex' }}>Vexara // {eyebrow}</div>
					</div>

					{/* Headline block */}
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							marginTop: 'auto',
							gap: 0
						}}
					>
						{kicker && (
							<div
								style={{
									display: 'flex',
									fontStyle: 'italic',
									fontSize: 40,
									fontWeight: 300,
									letterSpacing: '-0.015em',
									color: C.textDefault,
									marginBottom: 16
								}}
							>
								{kicker}
							</div>
						)}

						{/* Title with left amber accent bar */}
						<div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
							<div
								style={{
									width: 4,
									alignSelf: 'stretch',
									background: C.accent,
									marginRight: 28,
									flexShrink: 0,
									display: 'flex'
								}}
							/>
							<div
								style={{
									display: 'flex',
									fontSize: titleSize,
									fontWeight: 900,
									letterSpacing: '-0.045em',
									lineHeight: 0.92,
									color: '#ffffff'
								}}
							>
								{title}
							</div>
						</div>
					</div>

					{subtitle && (
						<div
							style={{
								display: 'flex',
								marginTop: 32,
								marginLeft: 32,
								maxWidth: 680,
								fontSize: 26,
								lineHeight: 1.45,
								color: C.textMuted
							}}
						>
							{subtitle}
						</div>
					)}

					{/* Footer row */}
					<div
						style={{
							display: 'flex',
							marginTop: subtitle ? 36 : 'auto',
							paddingTop: 24,
							borderTop: `1px solid ${C.border}`,
							alignItems: 'center',
							justifyContent: 'space-between'
						}}
					>
						<div
							style={{
								display: 'flex',
								fontSize: 16,
								fontWeight: 400,
								letterSpacing: '0.16em',
								textTransform: 'uppercase',
								color: C.textFaint
							}}
						>
							{footer}
						</div>

						{badge && (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									fontSize: 20,
									fontWeight: 700,
									letterSpacing: '0.06em',
									color: C.accent,
									border: `1px solid rgba(255,158,61,0.45)`,
									background: C.accentSoft,
									padding: '8px 18px'
								}}
							>
								{badge}
							</div>
						)}
					</div>
				</div>
			</div>
		),
		{
			...OG_SIZE,
			fonts: [
				{ name: 'Inter', data: regular, weight: 400, style: 'normal' },
				{ name: 'Inter', data: bold, weight: 900, style: 'normal' }
			]
		}
	);
}
