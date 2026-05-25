import Link from 'next/link';
import type { SupporterTier } from '@/types/game';

interface UsernameProps {
  name: string;
  isSupporter?: boolean | null;
  supporterTier?: SupporterTier | null;
  isFounder?: boolean | null;
  className?: string;
  title?: string;
  linkToProfile?: boolean;
  /** Show the Alpha Commander badge alongside the name when isFounder is true. */
  showFounderBadge?: boolean;
  /** Compact badge form (diamond glyph only, no label) for tight rows like chat. */
  compactBadge?: boolean;
}

const TIER_CLASS: Record<SupporterTier, string> = {
  recruit: 'supporter-tier-recruit',
  officer: 'supporter-tier-officer',
  commander: 'supporter-tier-commander',
};

export default function Username({
  name,
  isSupporter,
  supporterTier,
  isFounder,
  className,
  title,
  linkToProfile,
  showFounderBadge = true,
  compactBadge,
}: UsernameProps) {
  const tierClass = supporterTier ? TIER_CLASS[supporterTier] : null;
  const classes = [
    className,
    isSupporter ? 'supporter-name' : null,
    tierClass,
  ].filter(Boolean).join(' ');

  const resolvedTitle =
    title ??
    (isFounder
      ? 'Alpha Commander — Vexara founding supporter'
      : supporterTier === 'commander'
        ? 'Commander supporter'
        : supporterTier === 'officer'
          ? 'Officer supporter'
          : isSupporter
            ? 'Vexara supporter'
            : undefined);

  const founderBadge = showFounderBadge && isFounder ? (
    <span
      className={`alpha-commander-badge${compactBadge ? ' alpha-commander-badge--compact' : ''}`}
      title="Alpha Commander — granted during alpha for €25+ donation"
      aria-label="Alpha Commander badge"
    >
      <span>Alpha Commander</span>
    </span>
  ) : null;

  if (linkToProfile && name) {
    return (
      <>
        <Link
          href={`/u/${encodeURIComponent(name)}`}
          className={classes || undefined}
          title={resolvedTitle}
          onClick={(e) => e.stopPropagation()}
        >
          {name}
        </Link>
        {founderBadge}
      </>
    );
  }

  return (
    <>
      <span className={classes || undefined} title={resolvedTitle}>
        {name}
      </span>
      {founderBadge}
    </>
  );
}
