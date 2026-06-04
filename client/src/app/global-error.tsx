'use client';

import { useEffect } from 'react';

// NOTE: global-error replaces the root layout, so globals.css / design tokens
// are NOT loaded here. Every value below is inlined to match the Vexara design
// system (gunmetal base, amber accent, flat surfaces, mono kicker). Keep in
// sync with the .vx-error-* rules in globals.css used by app/error.tsx.

const CUT = 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)';

export default function GlobalError({
	error,
	reset
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error('[GlobalErrorBoundary]', error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: '24px',
					background:
						'radial-gradient(120% 80% at 50% -10%, rgba(255,158,61,0.06), transparent 60%), #0d1117',
					color: '#c9d1d9',
					fontFamily:
						"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
				}}
			>
				<div
					style={{
						position: 'relative',
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'flex-start',
						gap: '12px',
						width: '100%',
						maxWidth: '440px',
						padding: '32px 24px 24px',
						background: '#161b22',
						border: '1px solid #30363d',
						borderTop: '2px solid #ff9e3d'
					}}
				>
					<span
						style={{
							fontFamily:
								"'JetBrains Mono', source-code-pro, Menlo, Monaco, Consolas, monospace",
							fontSize: '11px',
							fontWeight: 800,
							letterSpacing: '0.16em',
							textTransform: 'uppercase',
							color: '#ff9e3d'
						}}
					>
						Critical fault
					</span>
					<h1
						style={{
							margin: 0,
							fontSize: '20px',
							fontWeight: 700,
							color: '#f0f6fc',
							lineHeight: 1.25
						}}
					>
						Vexara is temporarily unavailable
					</h1>
					<p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#8b949e' }}>
						The application encountered a fatal error. Please try refreshing or come back
						shortly.
					</p>
					{error?.digest && (
						<code
							style={{
								fontFamily:
									"'JetBrains Mono', source-code-pro, Menlo, Monaco, Consolas, monospace",
								fontSize: '11px',
								letterSpacing: '0.08em',
								color: '#6e7681',
								padding: '4px 8px',
								background: '#0d1117',
								border: '1px solid #30363d'
							}}
						>
							REF {error.digest}
						</code>
					)}
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
						<button
							type="button"
							onClick={reset}
							style={{
								padding: '10px 20px',
								fontFamily:
									"'JetBrains Mono', source-code-pro, Menlo, Monaco, Consolas, monospace",
								fontSize: '12px',
								fontWeight: 700,
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
								cursor: 'pointer',
								background: '#222831',
								border: '1px solid #444c56',
								color: '#c9d1d9',
								clipPath: CUT
							}}
						>
							Try again
						</button>
						<a
							href="/"
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								padding: '10px 20px',
								fontFamily:
									"'JetBrains Mono', source-code-pro, Menlo, Monaco, Consolas, monospace",
								fontSize: '12px',
								fontWeight: 700,
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
								textDecoration: 'none',
								cursor: 'pointer',
								background: '#ff9e3d',
								border: '1px solid #ff9e3d',
								color: '#0d1117',
								clipPath: CUT
							}}
						>
							Refresh
						</a>
					</div>
				</div>
			</body>
		</html>
	);
}
