'use client';

import type { SupporterTier } from '@/types/game';
import { ALPHA_PLAYER_BADGE, ALPHA_COMMANDER_BADGE, VANGUARD_BADGE, badgeIcon } from '@/data/gameIcons';

interface ProfileBadgesProps {
	isAlphaFounder?: boolean | null;
	isFounder?: boolean | null;
	supporterTier?: SupporterTier | null;
	earnedBadges?: string[];
}

interface BadgeDef {
	key: string;
	src?: string;
	emoji?: string;
	name: string;
	description: string;
}

const PASS_BADGE_DEFS: Record<string, Omit<BadgeDef, 'key'>> = {
	bronze:   { src: badgeIcon('bronzeProtocol'),   name: 'Bronze Protocol',   description: 'Reached Level 10 of the Vex Protocol battle pass — Season 1.' },
	silver:   { src: badgeIcon('silverProtocol'),   name: 'Silver Protocol',   description: 'Reached Level 25 of the Vex Protocol battle pass — Season 1.' },
	gold:     { src: badgeIcon('goldProtocol'),     name: 'Gold Protocol',     description: 'Reached Level 40 of the Vex Protocol battle pass — Season 1.' },
	platinum: { src: badgeIcon('platinumProtocol'), name: 'Platinum Protocol', description: 'Reached Level 50 — completed the full Vex Protocol pass — Season 1.' },
};

export default function ProfileBadges({ isAlphaFounder, isFounder, supporterTier, earnedBadges }: ProfileBadgesProps) {
	const badges: BadgeDef[] = [];

	if (isAlphaFounder) {
		badges.push({
			key: 'alpha-player',
			src: ALPHA_PLAYER_BADGE,
			name: 'Alpha Player',
			description: 'Founding Vexara player - earned by establishing a Nexus during alpha.'
		});
	}

	if (supporterTier === 'commander') {
		if (isFounder) {
			badges.push({
				key: 'alpha-commander',
				src: ALPHA_COMMANDER_BADGE,
				name: 'Alpha Commander',
				description: 'Commander-tier supporter who backed Vexara during alpha.'
			});
		} else {
			badges.push({
				key: 'vanguard',
				src: VANGUARD_BADGE,
				name: 'Vanguard',
				description: 'Commander-tier supporter - thank you for backing Vexara.'
			});
		}
	}

	// Pass-tier badges in ascending order so the best badge shows last (most prominent)
	for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
		if (earnedBadges?.includes(tier)) {
			const def = PASS_BADGE_DEFS[tier];
			badges.push({ key: tier, src: def.src, name: def.name, description: def.description });
		}
	}

	if (badges.length === 0) return null;

	return (
		<div className="ps-badges">
			{badges.map((b) => (
				<div className="ps-badge" key={b.key}>
					{b.src ? (
						<img
							src={b.src}
							alt={`${b.name} badge`}
							className="ps-badge-img"
							loading="lazy"
							decoding="async"
							draggable={false}
						/>
					) : (
						<span className="ps-badge-emoji" aria-hidden="true">{b.emoji}</span>
					)}
					<div className="ps-badge-text">
						<div className="ps-badge-name">{b.name}</div>
						<div className="ps-badge-desc">{b.description}</div>
					</div>
				</div>
			))}
		</div>
	);
}
