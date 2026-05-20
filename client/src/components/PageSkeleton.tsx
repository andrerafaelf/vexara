'use client';

import { CSSProperties } from 'react';

/**
 * Generic page skeleton used as a low-contrast placeholder while a page's primary data
 * is loading. Renders inside the existing layout shell, header, sidebar, dominance bar
 * stay visible, so the user never sees a blank/black main area.
 *
 * Variant tunes the rough shape:
 *  - "rows"   : a list of horizontal bars (default, fits Reports, Friends, Profile, etc.)
 *  - "grid"   : a card grid (fits Market listings, Factions roster)
 *  - "canvas" : a single large filled rect (fits Starfield map)
 */
export type PageSkeletonVariant = 'rows' | 'grid' | 'canvas';

interface Props {
  variant?: PageSkeletonVariant;
  /** Number of rows / cards. Defaults vary per variant. */
  count?: number;
  style?: CSSProperties;
}

const baseBlock: CSSProperties = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.025) 100%)',
  backgroundSize: '200% 100%',
  animation: 'vex-skeleton-shimmer 1.4s linear infinite',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
};

export default function PageSkeleton({ variant = 'rows', count, style }: Props) {
  if (variant === 'canvas') {
    return (
      <>
        <SkeletonKeyframes />
        <div
          aria-hidden
          style={{
            width: '100%',
            height: '100%',
            minHeight: '60vh',
            ...baseBlock,
            ...style,
          }}
        />
      </>
    );
  }

  if (variant === 'grid') {
    const n = count ?? 8;
    return (
      <>
        <SkeletonKeyframes />
        <div
          aria-hidden
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
            ...style,
          }}
        >
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} style={{ ...baseBlock, height: 120, animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </>
    );
  }

  // rows (default)
  const n = count ?? 6;
  return (
    <>
      <SkeletonKeyframes />
      <div
        aria-hidden
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          ...style,
        }}
      >
        <div style={{ ...baseBlock, height: 28, width: '40%' }} />
        <div style={{ height: 'var(--space-2)' }} />
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} style={{ ...baseBlock, height: 64, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </>
  );
}

// Inject keyframes once, cheap, no global CSS dependency.
function SkeletonKeyframes() {
  return (
    <style>{`
      @keyframes vex-skeleton-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  );
}
