'use client';

import { useEffect } from 'react';

export default function GlobalError({
	error,
	reset
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	// Log the error to an external service, or just the console for now
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
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					background: '#0b0d12',
					color: '#e6e8ee',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
					padding: '24px',
					textAlign: 'center',
					gap: '16px'
				}}
			>
				<p
					style={{
						margin: 0,
						fontSize: '13px',
						letterSpacing: '0.08em',
						color: '#7aa2ff',
						textTransform: 'uppercase'
					}}
				>
					Critical error
				</p>
				<h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#fff' }}>
					Vexara is temporarily unavailable
				</h1>
				<p
					style={{
						margin: 0,
						fontSize: '14px',
						color: '#8a8fa8',
						maxWidth: '360px',
						lineHeight: 1.6
					}}
				>
					The application encountered a fatal error. Please try refreshing or come back shortly.
				</p>
				<div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
					<button
						onClick={reset}
						style={{
							padding: '9px 20px',
							background: '#1e2236',
							border: '1px solid #2e3450',
							borderRadius: '8px',
							color: '#e6e8ee',
							fontSize: '14px',
							cursor: 'pointer'
						}}
					>
						Try again
					</button>
					<a
						href="/"
						style={{
							padding: '9px 20px',
							background: '#7aa2ff',
							border: 'none',
							borderRadius: '8px',
							color: '#0b0d12',
							fontSize: '14px',
							fontWeight: 600,
							textDecoration: 'none',
							cursor: 'pointer'
						}}
					>
						Refresh
					</a>
				</div>
			</body>
		</html>
	);
}
