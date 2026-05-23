'use client';

import { useGameConnectionStatus } from '@/hooks/useGameSocket';

/**
 * Top-of-page banner that only appears in the hard-fail state, where the
 * socket gave up after the configured reconnect attempts and a page reload
 * is required. The transient 'reconnecting' state is intentionally silent —
 * recoveries usually happen in under a second and a flashing banner during
 * routine wifi blips is more noise than signal.
 */
export default function ConnectionStatusBar() {
  const status = useGameConnectionStatus();
  if (status !== 'disconnected') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="connection-status-bar connection-status-bar--fail"
    >
      <span className="connection-status-dot" aria-hidden="true" />
      <span className="connection-status-text">Live updates disconnected — refresh to reconnect.</span>
      <button
        type="button"
        className="connection-status-action"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  );
}
