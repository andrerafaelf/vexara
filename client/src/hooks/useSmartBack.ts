'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

// Smart back navigation for detail pages.
//
// Problem: a naive router.back() on a page entered via deep-link (notification,
// shared link, bookmark) sends the user to the previous *external* page . the
// referrer outside the app, or worst case a blank tab. We want:
//   - If there's a same-origin entry behind us, go back to it (preserves the
//     originating tab on /factions?tab=members etc).
//   - Otherwise, navigate forward to a sensible fallback inside the app.
//
// We can't read the history stack directly (security), but we can fingerprint
// at mount: was this page entered via in-app navigation, or fresh?
//   - history.length > 1  AND
//   - document.referrer is same-origin  →  back() is safe
//   - else                              →  fall back to the provided path
//
// The hook returns a stable callback you can wire to any <button onClick>.

export function useSmartBack(fallback: string): () => void {
  const router = useRouter();
  // Capture once at mount so later in-page interactions (modal opens, tab
  // changes via router.replace) don't confuse the heuristic. Same-origin
  // navigations don't change document.referrer, but they do bump history.length
  // . freezing the entry-time signal avoids that drift.
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const referrer = document.referrer;
    const sameOrigin = referrer ? new URL(referrer).origin === window.location.origin : false;
    setCanGoBack(window.history.length > 1 && sameOrigin);
  }, []);

  return useCallback(() => {
    if (canGoBack) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [canGoBack, fallback, router]);
}
