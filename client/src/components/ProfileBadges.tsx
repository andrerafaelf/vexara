'use client';

import type { SupporterTier } from '@/types/game';
import { ALPHA_PLAYER_BADGE, ALPHA_COMMANDER_BADGE, VANGUARD_BADGE } from '@/data/gameIcons';

interface ProfileBadgesProps {
	isAlphaFounder?: boolean | null;
	/** True if the user was granted the Commander tier during alpha (isFounder on User). */
	isFounder?: boolean | null;
	supporterTier?: SupporterTier | null;
}

interface BadgeDef {
	src: string;
	name: string;
	description: string;
}

/**
 * Dedicated profile "Badges" section: each earned rank badge shown at a fixed,
 * well-proportioned size with its name and a one-line description as visible
 * text (no reliance on hover, which doesn't work on touch). Renders nothing when
 * the player has earned no badges, so callers can drop it in unconditionally.
 */
export default function ProfileBadges({ isAlphaFounder, isFounder, supporterTier }: ProfileBadgesProps) {
	const badges: BadgeDef[] = [];

	if (isAlphaFounder) {
		badges.push({
			src: ALPHA_PLAYER_BADGE,
			name: 'Alpha Player',
			description: 'Founding Vexara player - earned by establishing a Nexus during alpha.'
		});
	}

	if (supporterTier === 'commander') {
		if (isFounder) {
			// Backed at Commander tier during alpha — permanent historical badge.
			badges.push({
				src: ALPHA_COMMANDER_BADGE,
				name: 'Alpha Commander',
				description: 'Commander-tier supporter who backed Vexara during alpha.'
			});
		} else {
			// Commander-tier supporter from beta onwards.
			badges.push({
				src: VANGUARD_BADGE,
				name: 'Vanguard',
				description: 'Commander-tier supporter - thank you for backing Vexara.'
			});
		}
	}

	if (badges.length === 0) return null;

	return (
		<div className="ps-badges">
			{badges.map((b) => (
				<div className="ps-badge" key={b.name}>
					<img
						src={b.src}
						alt={`${b.name} badge`}
						className="ps-badge-img"
						loading="lazy"
						decoding="async"
						draggable={false}
					/>
					<div className="ps-badge-text">
						<div className="ps-badge-name">{b.name}</div>
						<div className="ps-badge-desc">{b.description}</div>
					</div>
				</div>
			))}
		</div>
	);
}
