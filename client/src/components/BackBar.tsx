'use client';

import { ArrowLeft } from 'lucide-react';
import { useSmartBack } from '@/hooks/useSmartBack';
import '@/styles/BackBar.css';

interface BackBarProps {
  /** Where to go if there's no in-app history to pop (deep-linked entry). */
  fallback: string;
  /**
   * Short label for the destination the user is leaving back to.
   * Shown next to the arrow on screens that have room.
   */
  fallbackLabel?: string;
}

// Slim sticky strip placed at the top of detail pages (PublicProfile, Replay,
// other "leaves" of the nav tree). Provides:
//   - A persistent back affordance for mobile/PWA users with no browser chrome
//   - Smart back: uses router.back() when same-origin history exists, else
//     falls back to the passed path (e.g. '/factions?tab=members')
//
// The bar breaks out of .main-content's horizontal padding (negative margins)
// so it spans the full width of <main> and matches the visual language of the
// existing sticky top stack (header / connection bar / etc). The page's own
// header / H1 renders below it . the BackBar deliberately has no centered
// title so it doesn't duplicate the page's identity block.

export default function BackBar({ fallback, fallbackLabel }: BackBarProps) {
  const onBack = useSmartBack(fallback);

  return (
    <div className="backbar" role="navigation" aria-label="Page navigation">
      <button
        type="button"
        className="backbar-btn"
        onClick={onBack}
        aria-label={fallbackLabel ? `Back to ${fallbackLabel}` : 'Back'}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        <span className="backbar-btn-label">{fallbackLabel ?? 'Back'}</span>
      </button>
    </div>
  );
}
