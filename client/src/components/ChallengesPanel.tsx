'use client';

import { useEffect, useState } from 'react';
import { getChallenges } from '@/services/api';
import PageSkeleton from './PageSkeleton';
import '../styles/ChallengesPanel.css';

type ChallengeCategory = 'combat' | 'empire' | 'galaxy' | 'economy' | 'loyalty';
type ChallengeRarity = 'common' | 'rare' | 'epic' | 'legendary';

interface ChallengeTier {
	threshold: number;
	title: string;
}

interface ChallengeProgress {
	id: string;
	name: string;
	description: string;
	category: ChallengeCategory;
	rarity: ChallengeRarity;
	unit?: string;
	currentValue: number;
	tiers: ChallengeTier[];
	completedTierIndex: number;
	nextTierThreshold: number | null;
	nextTierTitle: string | null;
	progress: number;
	unlockedTitle: string | null;
}

type FilterMode = 'all' | ChallengeCategory | ChallengeRarity;

const CATEGORY_META: Record<ChallengeCategory, { label: string; icon: string }> = {
	combat:  { label: 'Combat',  icon: '⚔️' },
	empire:  { label: 'Empire',  icon: '🏛️' },
	galaxy:  { label: 'Galaxy',  icon: '🌌' },
	economy: { label: 'Economy', icon: '📦' },
	loyalty: { label: 'Loyalty', icon: '🛡️' },
};

const RARITY_ORDER: ChallengeRarity[] = ['legendary', 'epic', 'rare', 'common'];
const CATEGORY_ORDER: ChallengeCategory[] = ['combat', 'empire', 'galaxy', 'economy', 'loyalty'];

function fmt(n: number, unit?: string): string {
	const s = n >= 1_000_000
		? (n / 1_000_000).toFixed(1) + 'M'
		: n >= 1_000
		? (n / 1_000).toFixed(1) + 'K'
		: String(Math.round(n));
	return unit ? `${s} ${unit}` : s;
}

function TierPips({
	tiers,
	completedTierIndex,
	rarity,
}: {
	tiers: ChallengeTier[];
	completedTierIndex: number;
	rarity: ChallengeRarity;
}) {
	return (
		<div className="cp-tiers">
			{tiers.map((tier, i) => {
				const done = i <= completedTierIndex;
				const isNext = i === completedTierIndex + 1;
				return (
					<span key={tier.title} className="cp-tier-pip">
						<span
							className={[
								'cp-tier-dot',
								done ? `cp-tier-dot--done cp-tier-dot--${rarity}` : '',
								isNext ? 'cp-tier-dot--next' : '',
							]
								.filter(Boolean)
								.join(' ')}
						/>
						<span className="cp-tier-tooltip">
							{tier.title} — {fmt(tier.threshold)}
						</span>
						{i < tiers.length - 1 && <span className="cp-tier-connector" />}
					</span>
				);
			})}
		</div>
	);
}

function ChallengeCard({ ch }: { ch: ChallengeProgress }) {
	const allDone = ch.completedTierIndex === ch.tiers.length - 1;
	const pct = Math.round(ch.progress * 100);

	return (
		<div
			className={[
				'cp-card',
				`cp-card--${ch.rarity}`,
				allDone ? 'cp-card--max-complete' : '',
			]
				.filter(Boolean)
				.join(' ')}
		>
			<div className={`cp-icon cp-icon--${ch.rarity}`}>
				{CATEGORY_META[ch.category].icon}
				<span className={`cp-icon-rarity-dot cp-icon-rarity-dot--${ch.rarity}`} />
			</div>

			<div className="cp-body">
				<div className="cp-body-top">
					<div className="cp-name-row">
						<span className="cp-name">{ch.name}</span>
						<span className="cp-description">{ch.description}</span>
					</div>
					<span className={`cp-rarity-badge cp-rarity-badge--${ch.rarity}`}>
						{ch.rarity}
					</span>
				</div>

				{ch.unlockedTitle && (
					<span className={`cp-unlocked-title cp-unlocked-title--${ch.rarity}`}>
						✦ {ch.unlockedTitle}
					</span>
				)}

				<div className="cp-progress-area">
					<div className="cp-progress-meta">
						<span className="cp-progress-label">
							<strong>{fmt(ch.currentValue, ch.unit)}</strong>
							{!allDone && ch.nextTierThreshold !== null && (
								<> / {fmt(ch.nextTierThreshold, ch.unit)}</>
							)}
						</span>
						{allDone ? (
							<span className="cp-complete-badge">
								<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
									<path d="M13.5 2.5l-7 9L3 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
								</svg>
								Max rank
							</span>
						) : ch.nextTierTitle ? (
							<span className="cp-next-title">→ {ch.nextTierTitle}</span>
						) : null}
					</div>

					<div className="cp-progress-track">
						<div
							className={`cp-progress-fill cp-progress-fill--${ch.rarity}`}
							style={{ width: `${allDone ? 100 : pct}%` }}
						/>
					</div>

					<TierPips
						tiers={ch.tiers}
						completedTierIndex={ch.completedTierIndex}
						rarity={ch.rarity}
					/>
				</div>
			</div>
		</div>
	);
}

export default function ChallengesPanel() {
	const [challenges, setChallenges] = useState<ChallengeProgress[] | null>(null);
	const [filter, setFilter] = useState<FilterMode>('all');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		getChallenges()
			.then((res) => setChallenges(res.data.challenges))
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <PageSkeleton variant="rows" count={6} />;
	if (error) return <div className="cp-empty">Failed to load challenges: {error}</div>;
	if (!challenges) return null;

	const FILTER_BUTTONS: { key: FilterMode; label: string }[] = [
		{ key: 'all',       label: 'All' },
		{ key: 'legendary', label: '★ Legendary' },
		{ key: 'epic',      label: 'Epic' },
		{ key: 'rare',      label: 'Rare' },
		{ key: 'combat',    label: '⚔️ Combat' },
		{ key: 'empire',    label: '🏛️ Empire' },
		{ key: 'galaxy',    label: '🌌 Galaxy' },
		{ key: 'economy',   label: '📦 Economy' },
		{ key: 'loyalty',   label: '🛡️ Loyalty' },
	];

	const filtered = challenges.filter((ch) => {
		if (filter === 'all') return true;
		if (filter === ch.category) return true;
		if (filter === ch.rarity) return true;
		return false;
	});

	// Sort: incomplete before complete, then by rarity weight, then by progress desc
	const rarityWeight: Record<ChallengeRarity, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };
	const sorted = [...filtered].sort((a, b) => {
		const aDone = a.completedTierIndex === a.tiers.length - 1 ? 1 : 0;
		const bDone = b.completedTierIndex === b.tiers.length - 1 ? 1 : 0;
		if (aDone !== bDone) return aDone - bDone;
		const rw = rarityWeight[b.rarity] - rarityWeight[a.rarity];
		if (rw !== 0) return rw;
		return b.progress - a.progress;
	});

	// Summary counts
	const titlesUnlocked = challenges.filter((ch) => ch.unlockedTitle !== null).length;
	const maxedOut = challenges.filter((ch) => ch.completedTierIndex === ch.tiers.length - 1).length;

	// Group by category if showing all
	const showGrouped = filter === 'all';
	const grouped = CATEGORY_ORDER.map((cat) => ({
		cat,
		items: sorted.filter((ch) => ch.category === cat),
	})).filter((g) => g.items.length > 0);

	return (
		<div className="cp-root">
			{/* Summary */}
			<div className="cp-summary">
				<div className="cp-summary-stat">
					<span className="cp-summary-value">{challenges.length}</span>
					<span className="cp-summary-label">Total challenges</span>
				</div>
				<div className="cp-summary-stat">
					<span className="cp-summary-value">{titlesUnlocked}</span>
					<span className="cp-summary-label">Titles unlocked</span>
				</div>
				<div className="cp-summary-stat">
					<span className="cp-summary-value">{maxedOut}</span>
					<span className="cp-summary-label">Max ranked</span>
				</div>
				<div className="cp-summary-stat">
					<span className="cp-summary-value">
						{challenges.filter((ch) => ch.rarity === 'legendary' && ch.completedTierIndex >= 0).length}
						/{challenges.filter((ch) => ch.rarity === 'legendary').length}
					</span>
					<span className="cp-summary-label">Legendary progress</span>
				</div>
			</div>

			{/* Filter bar */}
			<div className="cp-filter-bar" role="group" aria-label="Filter challenges">
				{FILTER_BUTTONS.map(({ key, label }) => (
					<button
						key={key}
						className={[
							'cp-filter-btn',
							filter === key ? 'cp-filter-btn--active' : '',
							key === 'legendary' ? 'cp-filter-btn--legendary' : '',
							key === 'epic' ? 'cp-filter-btn--epic' : '',
						]
							.filter(Boolean)
							.join(' ')}
						onClick={() => setFilter(key)}
					>
						{label}
					</button>
				))}
			</div>

			{/* Cards */}
			{sorted.length === 0 ? (
				<div className="cp-empty">No challenges match this filter.</div>
			) : showGrouped ? (
				grouped.map(({ cat, items }) => (
					<div key={cat} className="cp-category-group">
						<div className="cp-category-heading">
							{CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
						</div>
						{items.map((ch) => (
							<ChallengeCard key={ch.id} ch={ch} />
						))}
					</div>
				))
			) : (
				sorted.map((ch) => <ChallengeCard key={ch.id} ch={ch} />)
			)}
		</div>
	);
}
