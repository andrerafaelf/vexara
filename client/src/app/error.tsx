'use client';

import { useEffect } from 'react';

export default function Error({
	error,
	reset
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	// Log the error to an external service, or just the console for now
	useEffect(() => {
		console.error('[ErrorBoundary]', error);
	}, [error]);

	return (
		<div className="vx-error-screen">
			<div className="vx-error-panel">
				<span className="vx-error-kicker">System fault</span>
				<h1 className="vx-error-title">An unexpected error occurred</h1>
				<p className="vx-error-text">
					The page crashed unexpectedly. You can try again or return to the command
					deck.
				</p>
				{error?.digest && <code className="vx-error-digest">REF {error.digest}</code>}
				<div className="vx-error-actions">
					<button type="button" className="vx-error-btn" onClick={reset}>
						Try again
					</button>
					<a href="/" className="vx-error-btn vx-error-btn--primary">
						Go home
					</a>
				</div>
			</div>
		</div>
	);
}
