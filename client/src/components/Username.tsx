'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, type MouseEvent } from 'react';
import type { SupporterTier } from '@/types/game';

interface UsernameProps {
	name: string;
	isSupporter?: boolean | null;
	isFounder?: boolean | null;
	supporterTier?: SupporterTier | null;
	className?: string;
	title?: string;
	linkToProfile?: boolean;
}

const TIER_CLASS: Record<SupporterTier, string> = {
	recruit: 'supporter-tier-recruit',
	officer: 'supporter-tier-officer',
	vanguard: 'supporter-tier-vanguard',
	commander: 'supporter-tier-commander'
};

/**
 * Renders a player's name with supporter-tier coloring and an optional link to
 * their profile. Rank badges (Alpha Player / Alpha Commander) intentionally do
 * NOT render here: every Username lives in a width-constrained row (leaderboard,
 * chat, member lists, commander card) where a badge truncates the name. Badges
 * are shown in the dedicated "Badges" section on the profile page instead
 * (see ProfileBadges).
 */
export default function Username({
	name,
	isSupporter,
	isFounder,
	supporterTier,
	className,
	title,
	linkToProfile
}: UsernameProps) {
	const router = useRouter();
	// Cyan commander glow is for alpha founders only; non-founder commanders
	// fall back to vanguard-style if they somehow hold the legacy tier.
	const effectiveTier =
		supporterTier === 'commander' && !isFounder ? 'vanguard' : supporterTier;
	const tierClass = effectiveTier ? TIER_CLASS[effectiveTier] : null;
	const classes = [className, isSupporter ? 'supporter-name' : null, tierClass]
		.filter(Boolean)
		.join(' ');

	const resolvedTitle =
		title ??
		(supporterTier === 'commander'
			? 'Alpha Commander'
			: supporterTier === 'vanguard'
				? 'Vanguard supporter'
				: supporterTier === 'officer'
					? 'Officer supporter'
					: isSupporter
						? 'Vexara supporter'
						: undefined);

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
		<span className={classes || undefined} title={resolvedTitle}>
			{name}
		</span>
	);
}
