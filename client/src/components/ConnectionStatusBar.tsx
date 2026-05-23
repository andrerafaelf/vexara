'use client';

import { useEffect, useState } from 'react';
import { useGameConnectionStatus } from '@/hooks/useGameSocket';

// How long the socket can be in 'reconnecting' before we surface the banner.
// Brief flaps (sub-second wifi blips, deploys with rolling restart) shouldn't
// produce a UI jolt; only show the banner once it's been a real outage.
const RECONNECT_GRACE_MS = 1500;

/**
 * Thin top-of-page banner that appears when the realtime socket is unhealthy.
 * Stays hidden in the 'idle' and 'connected' states. Renders nothing during
 * SSR so it never participates in initial paint.
 */
export default function ConnectionStatusBar() {
  const status = useGameConnectionStatus();
  // Debounce 'reconnecting' so brief network flaps don't flash the banner.
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    if (status !== 'reconnecting') {
      setShowReconnecting(false);
      return;
    }
    const id = setTimeout(() => setShowReconnecting(true), RECONNECT_GRACE_MS);
    return () => clearTimeout(id);
  }, [status]);

  if (status === 'idle' || status === 'connected') return null;
  if (status === 'reconnecting' && !showReconnecting) return null;

  const isHardFail = status === 'disconnected';
  const message = isHardFail
    ? 'Live updates disconnected — refresh to reconnect.'
    : 'Reconnecting to live updates…';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`connection-status-bar ${isHardFail ? 'connection-status-bar--fail' : 'connection-status-bar--retry'}`}
    >
      <span className="connection-status-dot" aria-hidden="true" />
      <span className="connection-status-text">{message}</span>
      {isHardFail && (
        <button
          type="button"
          className="connection-status-action"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      )}
    </div>
  );
}
