'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, type MouseEvent } from 'react';
import type { SupporterTier } from '@/types/game';
import { ALPHA_PLAYER_BADGE, ALPHA_COMMANDER_BADGE } from '@/data/gameIcons';

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
	compactBadge
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

	// Image rank badges, served from the CDN. Alpha Commander (commander tier)
	// renders alongside Alpha Player when a player has both.
	const showCommander = supporterTier === 'commander';
	const showAlphaPlayer = !!isAlphaFounder;
	const badgeClass = `username-badge${compactBadge ? ' username-badge--compact' : ''}`;
	const alphaPlayerTip = 'Alpha Player - founding Vexara player';
	const alphaCommanderTip = 'Alpha Commander - Commander-tier supporter';
	const rankBadges =
		showFounderBadge && (showAlphaPlayer || showCommander) ? (
			<span className="username-badges">
				{showAlphaPlayer && (
					<span className="username-badge-wrap" title={alphaPlayerTip} aria-label={alphaPlayerTip}>
						<img
							src={ALPHA_PLAYER_BADGE}
							alt=""
							className={badgeClass}
							loading="lazy"
							decoding="async"
							draggable={false}
							aria-hidden
						/>
					</span>
				)}
				{showCommander && (
					<span
						className="username-badge-wrap"
						title={alphaCommanderTip}
						aria-label={alphaCommanderTip}
					>
						<img
							src={ALPHA_COMMANDER_BADGE}
							alt=""
							className={badgeClass}
							loading="lazy"
							decoding="async"
							draggable={false}
							aria-hidden
						/>
					</span>
				)}
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
