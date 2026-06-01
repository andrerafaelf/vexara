'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, type MouseEvent } from 'react';
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
	commander: 'supporter-tier-commander'
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
	compactBadge
}: UsernameProps) {
	const router = useRouter();
	const tierClass = supporterTier ? TIER_CLASS[supporterTier] : null;
	const classes = [className, isSupporter ? 'supporter-name' : null, tierClass]
		.filter(Boolean)
		.join(' ');

	const resolvedTitle =
		title ??
		(isFounder
			? 'Alpha Commander - Vexara founding supporter'
			: supporterTier === 'commander'
				? 'Commander supporter'
				: supporterTier === 'officer'
					? 'Officer supporter'
					: isSupporter
						? 'Vexara supporter'
						: undefined);

	const founderBadge =
		showFounderBadge && isFounder ? (
			<span
				className={`alpha-commander-badge${compactBadge ? ' alpha-commander-badge--compact' : ''}`}
				title="Alpha Commander - granted during alpha for €25+ donation"
				aria-label="Alpha Commander badge"
			>
				<span>Alpha Commander</span>
			</span>
		) : null;

	// Click handler appends ?from=<current location> at click-time and pushes
	// via the router, bypassing Next/Link's intercept which would otherwise
	// navigate to the static `href`. Reading window.location.* in the handler
	// (not via useSearchParams during render) keeps long Username lists
	// . chat, members, leaderboards . from rerendering on every URL change.
	const onProfileClick = useCallback(
		(e: MouseEvent<HTMLAnchorElement>) => {
			e.stopPropagation();
			// Let modifier-clicks (new tab/window) follow the static href as-is.
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
			e.preventDefault();
			if (typeof window === 'undefined') return;
			const from = window.location.pathname + window.location.search;
			router.push(`/u/${encodeURIComponent(name)}?from=${encodeURIComponent(from)}`);
		},
		[name, router]
	);

	if (linkToProfile && name) {
		const baseHref = `/u/${encodeURIComponent(name)}`;
		if (founderBadge) {
			return (
				<span
					style={{
						display: 'inline-flex',
						flexWrap: 'wrap',
						alignItems: 'center',
						minWidth: 0,
						gap: '4px'
					}}
				>
					<Link
						href={baseHref}
						className={classes || undefined}
						title={resolvedTitle}
						onClick={onProfileClick}
					>
						{name}
					</Link>
					{founderBadge}
				</span>
			);
		}
		return (
			<Link
				href={baseHref}
				className={classes || undefined}
				title={resolvedTitle}
				onClick={onProfileClick}
			>
				{name}
			</Link>
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
