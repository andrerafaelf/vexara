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

const CATEGORY_ORDER: ChallengeCategory[] = ['combat', 'empire', 'galaxy', 'economy', 'loyalty'];

const CATEGORY_META: Record<ChallengeCategory, { label: string; abbrev: string }> = {
	combat:  { label: 'Combat',  abbrev: 'CMB' },
	empire:  { label: 'Empire',  abbrev: 'EMP' },
	galaxy:  { label: 'Galaxy',  abbrev: 'GAL' },
	economy: { label: 'Economy', abbrev: 'ECO' },
	loyalty: { label: 'Loyalty', abbrev: 'LOY' },
};

const RARITY_LABEL: Record<ChallengeRarity, string> = {
	common:    'Common',
	rare:      'Rare',
	epic:      'Epic',
	legendary: 'Legendary',
};

function fmt(n: number, unit?: string): string {
	const s =
		n >= 1_000_000
			? (n / 1_000_000).toFixed(1) + 'M'
			: n >= 1_000
			? (n / 1_000).toFixed(1) + 'K'
			: String(Math.round(n));
	return unit ? `${s} ${unit}` : s;
}

function TierRow({
	tiers,
	completedTierIndex,
	rarity,
}: {
	tiers: ChallengeTier[];
	completedTierIndex: number;
	rarity: ChallengeRarity;
}) {
	return (
		<div className="cp-tier-row">
			{tiers.map((tier, i) => {
				const done = i <= completedTierIndex;
				const isNext = i === completedTierIndex + 1;
				return (
					<span key={tier.title} className="cp-tier-pip">
						<span
							className={[
								'cp-tier-node',
								done ? `cp-tier-node--done cp-tier-node--${rarity}` : '',
								isNext ? 'cp-tier-node--next' : '',
							]
								.filter(Boolean)
								.join(' ')}
						/>
						<span className="cp-tier-label">{tier.title}</span>
						{i < tiers.length - 1 && (
							<span className={`cp-tier-line${done && i < completedTierIndex ? ` cp-tier-line--${rarity}` : ''}`} />
						)}
					</span>
				);
			})}
		</div>
	);
}

function ChallengeCard({ ch }: { ch: ChallengeProgress }) {
	const allDone = ch.completedTierIndex === ch.tiers.length - 1;
	const pct = allDone ? 100 : Math.round(ch.progress * 100);
	const remaining =
		!allDone && ch.nextTierThreshold != null
			? ch.nextTierThreshold - ch.currentValue
			: null;

	return (
		<div
			className={[
				'cp-card',
				`cp-card--${ch.rarity}`,
				allDone ? 'cp-card--complete' : '',
			]
				.filter(Boolean)
				.join(' ')}
		>
			<div className="cp-card-left">
				<span className={`cp-cat-tag cp-cat-tag--${ch.category}`}>
					{CATEGORY_META[ch.category].abbrev}
				</span>
				<span className={`cp-rarity-pip cp-rarity-pip--${ch.rarity}`} title={RARITY_LABEL[ch.rarity]} />
			</div>

			<div className="cp-card-body">
				<div className="cp-card-header">
					<span className="cp-card-name">{ch.name}</span>
					{ch.unlockedTitle && (
						<span className={`cp-current-title cp-current-title--${ch.rarity}`}>
							{ch.unlockedTitle}
						</span>
					)}
				</div>

				<p className="cp-card-desc">{ch.description}</p>

				<div className="cp-progress-row">
					<div className="cp-bar-wrap">
						<div className="cp-bar-track">
							<div
								className={`cp-bar-fill cp-bar-fill--${ch.rarity}`}
								style={{ width: `${pct}%` }}
							/>
						</div>
					</div>
					<span className="cp-progress-fig">
						{allDone ? (
							<span className="cp-maxed">Maxed</span>
						) : (
							<>
								<strong>{fmt(ch.currentValue)}</strong>
								{ch.nextTierThreshold != null && (
									<span className="cp-progress-of"> / {fmt(ch.nextTierThreshold)}</span>
								)}
							</>
						)}
					</span>
				</div>

				{!allDone && ch.nextTierTitle && remaining != null && (
					<p className="cp-next-hint">
						{fmt(remaining)} more to unlock <em>{ch.nextTierTitle}</em>
					</p>
				)}

				<TierRow
					tiers={ch.tiers}
					completedTierIndex={ch.completedTierIndex}
					rarity={ch.rarity}
				/>
			</div>
		</div>
	);
}

const FILTER_BUTTONS: { key: FilterMode; label: string }[] = [
	{ key: 'all',       label: 'All' },
	{ key: 'combat',    label: 'Combat' },
	{ key: 'empire',    label: 'Empire' },
	{ key: 'galaxy',    label: 'Galaxy' },
	{ key: 'economy',   label: 'Economy' },
	{ key: 'loyalty',   label: 'Loyalty' },
	{ key: 'legendary', label: 'Legendary' },
	{ key: 'epic',      label: 'Epic' },
];

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
	if (error) return <div className="cp-error">Failed to load: {error}</div>;
	if (!challenges) return null;

	const rarityWeight: Record<ChallengeRarity, number> = {
		legendary: 4, epic: 3, rare: 2, common: 1,
	};

	const filtered = challenges.filter((ch) => {
		if (filter === 'all') return true;
		return filter === ch.category || filter === ch.rarity;
	});

	const sorted = [...filtered].sort((a, b) => {
		const aDone = a.completedTierIndex === a.tiers.length - 1 ? 1 : 0;
		const bDone = b.completedTierIndex === b.tiers.length - 1 ? 1 : 0;
		if (aDone !== bDone) return aDone - bDone;
		const rw = rarityWeight[b.rarity] - rarityWeight[a.rarity];
		if (rw !== 0) return rw;
		return b.progress - a.progress;
	});

	const totalTiers = challenges.reduce((s, ch) => s + ch.tiers.length, 0);
	const completedTiers = challenges.reduce(
		(s, ch) => s + (ch.completedTierIndex + 1),
		0
	);
	const titlesHeld = challenges.filter((ch) => ch.unlockedTitle !== null).length;
	const legendaryUnlocked = challenges.filter(
		(ch) => ch.rarity === 'legendary' && ch.completedTierIndex >= 0
	).length;
	const legendaryTotal = challenges.filter((ch) => ch.rarity === 'legendary').length;

	const showGrouped = filter === 'all';
	const grouped = CATEGORY_ORDER.map((cat) => ({
		cat,
		items: sorted.filter((ch) => ch.category === cat),
	})).filter((g) => g.items.length > 0);

	return (
		<div className="cp-root">
			<div className="cp-header">
				<div className="cp-header-text">
					<h3 className="cp-heading">Service Commendations</h3>
					<p className="cp-subheading">
						Commendations are awarded for lifetime achievement across combat, empire,
						and loyalty. Each carries a title you can equip on your public record.
					</p>
				</div>
				<div className="cp-stats-row">
					<div className="cp-stat">
						<span className="cp-stat-val">{completedTiers}</span>
						<span className="cp-stat-key">of {totalTiers} tiers</span>
					</div>
					<div className="cp-stat-divider" />
					<div className="cp-stat">
						<span className="cp-stat-val">{titlesHeld}</span>
						<span className="cp-stat-key">titles held</span>
					</div>
					<div className="cp-stat-divider" />
					<div className="cp-stat">
						<span className="cp-stat-val">{legendaryUnlocked}/{legendaryTotal}</span>
						<span className="cp-stat-key">legendary</span>
					</div>
				</div>
			</div>

			<div className="cp-filter-bar" role="group" aria-label="Filter commendations">
				{FILTER_BUTTONS.map(({ key, label }) => (
					<button
						key={key}
						className={[
							'cp-filter-btn',
							filter === key ? 'cp-filter-btn--active' : '',
							key === 'legendary' ? 'cp-filter-btn--legendary' : '',
						]
							.filter(Boolean)
							.join(' ')}
						onClick={() => setFilter(key)}
					>
						{label}
					</button>
				))}
			</div>

			{sorted.length === 0 ? (
				<p className="cp-empty">Nothing here yet.</p>
			) : showGrouped ? (
				grouped.map(({ cat, items }) => (
					<div key={cat} className="cp-group">
						<div className="cp-group-heading">
							<span className="cp-group-label">{CATEGORY_META[cat].label}</span>
							<span className="cp-group-count">{items.length}</span>
						</div>
						<div className="cp-card-list">
							{items.map((ch) => (
								<ChallengeCard key={ch.id} ch={ch} />
							))}
						</div>
					</div>
				))
			) : (
				<div className="cp-card-list">
					{sorted.map((ch) => <ChallengeCard key={ch.id} ch={ch} />)}
				</div>
			)}
		</div>
	);
}
