'use client';

import { Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  LATEST_PATCH_HEADLINE,
  LATEST_PATCH_LABEL,
  LATEST_PATCH_VERSION,
} from '@/data/latestPatch';
import '@/styles/NewPatchToast.css';

const STORAGE_KEY = 'lastSeenPatchVersion';

// Lives mounted in GameLayout. Compares the last patch version this browser
// has acknowledged against LATEST_PATCH_VERSION and surfaces a one-shot prompt
// when they diverge. Suppressed on the very first session (no stored value)
// so new players aren't greeted with "new!" UI on day one . we silently
// initialize the flag to the current version.
//
// Two ways to clear the toast:
//   - "View" navigates to /patch-notes#v<version> (new tab so game session
//     is preserved) and marks the version seen
//   - "X" dismisses without navigating, also marks the version seen
//
// State lives in localStorage only . no backend round-trip, no per-user row,
// no analytics event for a player just dismissing a toast. If a user clears
// their storage they may see the prompt a second time; that cost is lower
// than the cost of a schema/migration for this feature.

export default function NewPatchToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* private mode / quota */ }
    if (stored === LATEST_PATCH_VERSION) return;
    if (stored === null) {
      // First-ever visit on this browser . don't startle the user with
      // a "new patch!" prompt for changes that shipped before they arrived.
      try { localStorage.setItem(STORAGE_KEY, LATEST_PATCH_VERSION); } catch { /* ignore */ }
      return;
    }
    setShow(true);
  }, []);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, LATEST_PATCH_VERSION); } catch { /* ignore */ }
    setShow(false);
  }, []);

  if (!show) return null;

  return (
    <div className="new-patch-toast" role="status" aria-live="polite">
      <div className="new-patch-toast-icon" aria-hidden="true">
        <Sparkles size={18} />
      </div>
      <div className="new-patch-toast-body">
        <div className="new-patch-toast-label">{LATEST_PATCH_LABEL} is live</div>
        <div className="new-patch-toast-headline">{LATEST_PATCH_HEADLINE}</div>
      </div>
      <div className="new-patch-toast-actions">
        <a
          href={`/patch-notes#v${LATEST_PATCH_VERSION}`}
          target="_blank"
          rel="noopener noreferrer"
          className="new-patch-toast-cta"
          onClick={markSeen}
        >
          Read
        </a>
        <button
          type="button"
          className="new-patch-toast-close"
          onClick={markSeen}
          aria-label="Dismiss new patch notification"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
