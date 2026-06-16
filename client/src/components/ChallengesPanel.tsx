'use client';

import { useEffect, useRef, useState } from 'react';
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

interface NewUnlock {
	challengeName: string;
	title: string;
	rarity: ChallengeRarity;
}

type FilterMode = 'all' | ChallengeCategory | ChallengeRarity;

const STORAGE_KEY = 'vx-challenge-snapshot';

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

// Returns the list of new tier unlocks since the last saved snapshot
function diffSnapshot(
	prev: Record<string, number>,
	current: ChallengeProgress[]
): NewUnlock[] {
	const unlocks: NewUnlock[] = [];
	for (const ch of current) {
		const prevTier = prev[ch.id] ?? -1;
		if (ch.completedTierIndex > prevTier) {
			// Report every newly completed tier
			for (let i = prevTier + 1; i <= ch.completedTierIndex; i++) {
				unlocks.push({
					challengeName: ch.name,
					title: ch.tiers[i].title,
					rarity: ch.rarity,
				});
			}
		}
	}
	return unlocks;
}

function buildSnapshot(challenges: ChallengeProgress[]): Record<string, number> {
	const snap: Record<string, number> = {};
	for (const ch of challenges) snap[ch.id] = ch.completedTierIndex;
	return snap;
}

// ── Title achieved modal ──────────────────────────────────────────────────────

function TitleModal({
	unlocks,
	onClose,
}: {
	unlocks: NewUnlock[];
	onClose: () => void;
}) {
	const [idx, setIdx] = useState(0);
	const unlock = unlocks[idx];
	const isLast = idx === unlocks.length - 1;

	// close on Escape
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div className="cp-modal-backdrop" onClick={onClose}>
			<div
				className={`cp-modal cp-modal--${unlock.rarity}`}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Title achieved"
			>
				<div className="cp-modal-kicker">Title achieved</div>
				<div className={`cp-modal-title cp-modal-title--${unlock.rarity}`}>
					{unlock.title}
				</div>
				<div className="cp-modal-from">
					from <strong>{unlock.challengeName}</strong>
				</div>
				<div className={`cp-modal-rarity cp-modal-rarity--${unlock.rarity}`}>
					{RARITY_LABEL[unlock.rarity]}
				</div>

				<div className="cp-modal-actions">
					{!isLast && (
						<button
							className="cp-modal-btn cp-modal-btn--secondary"
							onClick={() => setIdx(idx + 1)}
						>
							Next ({unlocks.length - idx - 1} more)
						</button>
					)}
					<button className="cp-modal-btn cp-modal-btn--primary" onClick={onClose}>
						{isLast ? 'Nice' : 'Skip all'}
					</button>
				</div>
			</div>
		</div>
	);
}

// ── Tier row with per-node tooltip ───────────────────────────────────────────

function TierRow({
	tiers,
	completedTierIndex,
	rarity,
	unit,
}: {
	tiers: ChallengeTier[];
	completedTierIndex: number;
	rarity: ChallengeRarity;
	unit?: string;
}) {
	const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);
	const rowRef = useRef<HTMLDivElement>(null);

	return (
		<div className="cp-tier-row" ref={rowRef}>
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
							onMouseEnter={(e) => {
								const rect = (e.target as HTMLElement).getBoundingClientRect();
								const rowRect = rowRef.current?.getBoundingClientRect();
								setTooltip({
									i,
									x: rect.left - (rowRect?.left ?? 0) + rect.width / 2,
									y: rect.top - (rowRect?.top ?? 0),
								});
							}}
							onMouseLeave={() => setTooltip(null)}
						/>
						{tooltip?.i === i && (
							<span
								className={`cp-node-tooltip cp-node-tooltip--${rarity}`}
								style={{ left: tooltip.x, top: tooltip.y - 4 }}
							>
								<span className="cp-node-tooltip-title">{tier.title}</span>
								<span className="cp-node-tooltip-thresh">{fmt(tier.threshold, unit)}</span>
								{done && <span className="cp-node-tooltip-done">✓ Unlocked</span>}
							</span>
						)}
						<span className="cp-tier-label">{tier.title}</span>
						{i < tiers.length - 1 && (
							<span
								className={`cp-tier-line${done && i < completedTierIndex ? ` cp-tier-line--${rarity}` : ''}`}
							/>
						)}
					</span>
				);
			})}
		</div>
	);
}

// ── Challenge card ────────────────────────────────────────────────────────────

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
				<span
					className={`cp-rarity-pip cp-rarity-pip--${ch.rarity}`}
					title={RARITY_LABEL[ch.rarity]}
				/>
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
					unit={ch.unit}
				/>
			</div>
		</div>
	);
}

// ── Filter buttons ────────────────────────────────────────────────────────────

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

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ChallengesPanel() {
	const [challenges, setChallenges] = useState<ChallengeProgress[] | null>(null);
	const [filter, setFilter] = useState<FilterMode>('all');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [newUnlocks, setNewUnlocks] = useState<NewUnlock[]>([]);
	const [modalOpen, setModalOpen] = useState(false);

	useEffect(() => {
		getChallenges()
			.then((res) => {
				const data: ChallengeProgress[] = res.data.challenges;
				const unlockedTitles: string[] = res.data.unlockedTitles ?? [];
				setChallenges(data);

				// Notify ProfileStats so it can merge challenge titles into earnedTitles
				if (unlockedTitles.length > 0) {
					window.dispatchEvent(
						new CustomEvent('challenges:titles-loaded', { detail: unlockedTitles })
					);
				}

				// Compare to last saved snapshot to detect new unlocks
				try {
					const raw = localStorage.getItem(STORAGE_KEY);
					const prev: Record<string, number> = raw ? JSON.parse(raw) : {};
					const unlocks = diffSnapshot(prev, data);
					if (unlocks.length > 0) {
						setNewUnlocks(unlocks);
						setModalOpen(true);
						// Dispatch event so ProfileStats tab can show a badge
						window.dispatchEvent(new CustomEvent('challenges:new-unlocks', { detail: unlocks.length }));
					}
				} catch {
					// Corrupt snapshot — just overwrite it silently
				}

				// Save fresh snapshot
				localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSnapshot(data)));
			})
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
	const completedTiers = challenges.reduce((s, ch) => s + (ch.completedTierIndex + 1), 0);
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
		<>
			{modalOpen && newUnlocks.length > 0 && (
				<TitleModal
					unlocks={newUnlocks}
					onClose={() => {
						setModalOpen(false);
						setNewUnlocks([]);
					}}
				/>
			)}

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
		</>
	);
}
