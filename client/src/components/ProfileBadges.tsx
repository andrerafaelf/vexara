'use client';

import type { SupporterTier } from '@/types/game';
import {
	ALPHA_PLAYER_BADGE,
	ALPHA_COMMANDER_BADGE,
	VANGUARD_BADGE,
	badgeIcon
} from '@/data/gameIcons';

interface ProfileBadgesProps {
	isAlphaFounder?: boolean | null;
	isFounder?: boolean | null;
	supporterTier?: SupporterTier | null;
	earnedBadges?: string[];
}

interface BadgeDef {
	key: string;
	src: string;
	name: string;
	description: string;
}

const PASS_BADGE_DEFS: Record<string, Omit<BadgeDef, 'key'>> = {
	bronze: {
		src: badgeIcon('bronzeProtocol'),
		name: 'Bronze Service Badge',
		description: 'Awarded at rank 10 of the Season One campaign.'
	},
	silver: {
		src: badgeIcon('silverProtocol'),
		name: 'Silver Service Badge',
		description: 'Awarded at rank 25 of the Season One campaign.'
	},
	gold: {
		src: badgeIcon('goldProtocol'),
		name: 'Gold Service Badge',
		description: 'Awarded at rank 40 of the Season One campaign.'
	},
	platinum: {
		src: badgeIcon('platinumProtocol'),
		name: 'Campaign Service Medal',
		description: 'Awarded for completing all 50 ranks of the Season One campaign.'
	}
};

export default function ProfileBadges({
	isAlphaFounder,
	isFounder,
	supporterTier,
	earnedBadges
}: ProfileBadgesProps) {
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

	// Campaign badges in ascending order so the highest award reads last.
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
					<img
						src={b.src}
						alt={`${b.name} insignia`}
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
