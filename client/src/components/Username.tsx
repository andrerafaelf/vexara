'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, type MouseEvent } from 'react';
import type { SupporterTier } from '@/types/game';
import RankBadges from './RankBadges';

interface UsernameProps {
	name: string;
	isSupporter?: boolean | null;
	supporterTier?: SupporterTier | null;
	/** Early/founding player. Renders the Alpha Player badge. */
	isAlphaFounder?: boolean | null;
	className?: string;
	title?: string;
	linkToProfile?: boolean;
	/** Show rank badges (Alpha Player / Alpha Commander) alongside the name. */
	showFounderBadge?: boolean;
	/** Compact badge form (smaller glyphs) for tight rows like chat. */
	compactBadge?: boolean;
	/** Override rank-badge size. Defaults to 'sm' when compactBadge, else 'md'.
	 *  Use 'lg' for prominent headers (profile page). */
	badgeSize?: 'sm' | 'md' | 'lg';
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
	isAlphaFounder,
	className,
	title,
	linkToProfile,
	showFounderBadge = true,
	compactBadge,
	badgeSize
}: UsernameProps) {
	const router = useRouter();
	const tierClass = supporterTier ? TIER_CLASS[supporterTier] : null;
	const classes = [className, isSupporter ? 'supporter-name' : null, tierClass]
		.filter(Boolean)
		.join(' ');

	const resolvedTitle =
		title ??
		(supporterTier === 'commander'
			? 'Commander supporter'
			: supporterTier === 'officer'
				? 'Officer supporter'
				: isSupporter
					? 'Vexara supporter'
					: undefined);

	// Image rank badges (Alpha Player / Alpha Commander). Compact rows (chat) use
	// the small size; everywhere else uses the standard inline size. hasBadges
	// gates the extra flex wrapper so badge-less usernames keep their bare layout.
	const hasBadges =
		showFounderBadge && (!!isAlphaFounder || supporterTier === 'commander');
	const resolvedBadgeSize = badgeSize ?? (compactBadge ? 'sm' : 'md');
	const rankBadges = hasBadges ? (
		<RankBadges
			isAlphaFounder={isAlphaFounder}
			supporterTier={supporterTier}
			size={resolvedBadgeSize}
		/>
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
		if (rankBadges) {
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
					{rankBadges}
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
			{rankBadges}
		</>
	);
}
