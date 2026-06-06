'use client';

import type { SupporterTier } from '@/types/game';
import { ALPHA_PLAYER_BADGE, ALPHA_COMMANDER_BADGE } from '@/data/gameIcons';

type BadgeSize = 'sm' | 'md' | 'lg';

interface RankBadgesProps {
	/** Early/founding player. Renders the Alpha Player badge. */
	isAlphaFounder?: boolean | null;
	supporterTier?: SupporterTier | null;
	/** Badge scale: sm = chat rows, md = beside a name (default), lg = profile/commander card. */
	size?: BadgeSize;
}

const ALPHA_PLAYER_TIP = 'Alpha Player - founding Vexara player';
const ALPHA_COMMANDER_TIP = 'Alpha Commander - Commander-tier supporter';

/**
 * Image rank badges (Alpha Player / Alpha Commander) shown beside a username.
 * Commander-tier supporters who are also founding players get both, Alpha Player
 * first. Each badge carries a hover tooltip (title + aria-label) on its wrapper.
 * Shared by <Username>, the commander card, and profile headers so sizing and
 * markup stay in one place.
 */
export default function RankBadges({ isAlphaFounder, supporterTier, size = 'md' }: RankBadgesProps) {
	const showAlphaPlayer = !!isAlphaFounder;
	const showCommander = supporterTier === 'commander';
	if (!showAlphaPlayer && !showCommander) return null;

	const imgClass = `username-badge username-badge--${size}`;

	return (
		<span className="username-badges">
			{showAlphaPlayer && (
				<span
					className="username-badge-wrap"
					title={ALPHA_PLAYER_TIP}
					aria-label={ALPHA_PLAYER_TIP}
				>
					<img
						src={ALPHA_PLAYER_BADGE}
						alt=""
						className={imgClass}
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
					title={ALPHA_COMMANDER_TIP}
					aria-label={ALPHA_COMMANDER_TIP}
				>
					<img
						src={ALPHA_COMMANDER_BADGE}
						alt=""
						className={imgClass}
						loading="lazy"
						decoding="async"
						draggable={false}
						aria-hidden
					/>
				</span>
			)}
		</span>
	);
}
