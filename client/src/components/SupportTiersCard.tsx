'use client';

import { Heart, Check } from 'lucide-react';
import type { SupporterTier } from '@/types/game';
import { KOFI_URL, SUPPORTER_TIERS } from '@/constants/support';
import '../styles/SupportTiers.css';

interface SupportTiersCardProps {
	/** `full` is the in-profile card (3 tiers expanded). `compact` is the sidebar / mobile drawer card (single CTA + condensed perks). */
	variant: 'full' | 'compact';
	currentTier?: SupporterTier | null;
	isFounder?: boolean | null;
	isSupporter?: boolean | null;
}

interface TierDef {
	key: SupporterTier;
	amount: string;
	label: string;
	tokens: number;
	perks: string[];
	highlight?: boolean;
	url: string;
}

const TIERS: TierDef[] = [
	{
		key: 'recruit',
		amount: '€5',
		label: 'Recruit Supporter',
		tokens: 1,
		perks: ['Glowing name in chat', '1 Supporter Token', '"Recruit" title in-game'],
		url: SUPPORTER_TIERS[0].url,
	},
	{
		key: 'officer',
		amount: '€10',
		label: 'Officer Supporter',
		tokens: 3,
		perks: ['Brighter amber glow', 'Animated profile border', '3 Supporter Tokens', '"Officer" title in-game'],
		highlight: true,
		url: SUPPORTER_TIERS[1].url,
	},
	{
		key: 'vanguard',
		amount: '€25',
		label: 'Vanguard Supporter',
		tokens: 8,
		perks: [
			'Violet elite glow',
			'Animated profile border',
			'8 Supporter Tokens',
			'"Vanguard" title in-game',
		],
		url: SUPPORTER_TIERS[2].url,
	}
];

const TIER_RANK: Record<SupporterTier, number> = { recruit: 1, officer: 2, vanguard: 3, commander: 4 };

export default function SupportTiersCard({
	variant,
	currentTier,
	isFounder,
	isSupporter
}: SupportTiersCardProps) {
	const currentRank = currentTier ? TIER_RANK[currentTier] : 0;

	if (variant === 'compact') {
		return (
			<div className="vx-support-card vx-support-card--compact">
				<div className="vx-support-card-header">
					<Heart size={14} aria-hidden="true" className="vx-support-card-heart" />
					<span className="vx-support-card-title">Support Vexara</span>
				</div>
				<div className="vx-support-card-pitch">
					Vexara runs on community support. Donate to unlock glow, borders, supporter tokens, and
					an{' '}
					<span className="vx-support-tier-cmd">exclusive in-game title</span>.
				</div>
				<ul className="vx-support-card-tier-list">
					<li>
						<strong>€5</strong> Recruit · 1 token + glow
					</li>
					<li>
						<strong>€10</strong> Officer · 3 tokens + border
					</li>
					<li>
						<strong>€25</strong> Vanguard · 8 tokens + violet glow
					</li>
				</ul>
				<a
					href={KOFI_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="vx-support-card-cta"
				>
					<Heart size={12} aria-hidden="true" />
					<span>See tiers on Ko-fi</span>
				</a>
			</div>
		);
	}

	return (
		<div className="vx-support-card vx-support-card--full">
			<div className="vx-support-card-header">
				<Heart size={18} aria-hidden="true" className="vx-support-card-heart" />
				<div>
					<div className="vx-support-card-title">
						{isSupporter ? 'Thanks for supporting Vexara' : 'Support Vexara'}
						{isFounder && (
							<span
								className="alpha-commander-badge"
								title="Alpha Founder — granted for supporting Vexara during alpha. Permanent."
							>
								<span>Alpha Founder</span>
							</span>
						)}
					</div>
					<div className="vx-support-card-subtitle">
						{isSupporter
							? 'Pick a higher tier any time — your highest tier sticks forever, and tokens always stack.'
							: 'Vexara runs on a small server. Donations keep the lights on and unlock exclusive supporter perks that last forever.'}
					</div>
				</div>
			</div>

			<div className="vx-support-tiers">
				{TIERS.map((tier) => {
					const rank = TIER_RANK[tier.key];
					const isCurrent = rank === currentRank;
					const isUnlocked = currentRank >= rank;
					return (
						<div
							key={tier.key}
							className={[
								'vx-support-tier',
								`vx-support-tier--${tier.key}`,
								tier.highlight ? 'vx-support-tier--best' : '',
								isCurrent ? 'vx-support-tier--current' : '',
								isUnlocked ? 'vx-support-tier--unlocked' : ''
							]
								.filter(Boolean)
								.join(' ')}
						>
							<div className="vx-support-tier-top">
								<span className="vx-support-tier-name">{tier.label}</span>
								<span className="vx-support-tier-amount">{tier.amount}</span>
							</div>
							{tier.highlight && !isUnlocked && (
								<div className="vx-support-tier-flag">BEST VALUE</div>
							)}
							{isCurrent && (
								<div className="vx-support-tier-flag vx-support-tier-flag--current">YOUR TIER</div>
							)}
							<ul className="vx-support-tier-perks">
								{tier.perks.map((perk) => (
									<li key={perk}>
										<Check size={12} aria-hidden="true" />
										<span>{perk}</span>
									</li>
								))}
							</ul>
							<a
								href={tier.url}
								target="_blank"
								rel="noopener noreferrer"
								className="vx-support-tier-cta"
							>
								{isUnlocked ? 'Donate again' : `Donate ${tier.amount}`}
							</a>
						</div>
					);
				})}
			</div>

			<p className="vx-support-card-footnote">
				Supporter perks and titles are permanent — your highest tier is locked in forever.
				Tokens stack across donations and can be spent in-game.
			</p>
		</div>
	);
}
