'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getBattlePass } from '../services/api';
import '../styles/RailBattlePass.css';
import { useStartProgress } from './NavigationProgress';
import VexPassModal from './VexPassModal';

const MAX_LEVEL = 50;
const XP_PER_LEVEL = 300;
const MILESTONE_LEVELS = [10, 20, 30, 40, 50];

interface PassState {
	seasonXp: number;
	passLevel: number;
	hasPaidPass: boolean;
	passTitle: string | null;
	claimedLevels: number[];
	seasonEndsAt?: string | null;
}

export default function RailBattlePass() {
	const [modalOpen, setModalOpen] = useState(false);
	const { user } = useAuth();
	const router = useRouter();
	const startProgress = useStartProgress();

	const { data } = useQuery<PassState>({
		queryKey: ['battlePass'],
		queryFn: () => getBattlePass().then((r) => r.data),
		staleTime: 30_000,
		refetchInterval: 60_000
	});

	if (!data) return null;

	const { seasonXp, passLevel, hasPaidPass, passTitle, seasonEndsAt } = data;
	const xpIntoLevel = seasonXp - passLevel * XP_PER_LEVEL;
	const xpPct = Math.min((xpIntoLevel / XP_PER_LEVEL) * 100, 100);
	const isMaxed = passLevel >= MAX_LEVEL;

	const seasonEndLabel = (() => {
		if (!seasonEndsAt) return null;
		const ms = new Date(seasonEndsAt).getTime() - Date.now();
		if (ms <= 0) return 'Season ended';
		const days = Math.ceil(ms / 86400000);
		const date = new Date(seasonEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		return `Ends ${date} · ${days}d`;
	})();

	return (
		<>
			<button
				className="rail-card rail-bp rail-bp--btn"
				onClick={() => setModalOpen(true)}
				aria-label="Open campaign record"
			>
				<div className="rail-card-head">
					<span className="rail-card-title">Season One Campaign</span>
					{hasPaidPass ? (
						<span className="rail-bp-paid-badge">Command Pass</span>
					) : (
						<span className="rail-bp-free-badge">Free Tier</span>
					)}
				</div>

				<div className="rail-bp-level-row">
					<span className="rail-bp-level">
						Rank {passLevel} <span className="rail-bp-level-max">/ {MAX_LEVEL}</span>
					</span>
				</div>
				{!isMaxed && (
					<span className="rail-bp-xp-label">
						{xpIntoLevel} / {XP_PER_LEVEL} campaign XP
					</span>
				)}
				{isMaxed && <span className="rail-bp-maxed">Campaign complete</span>}
				{seasonEndLabel && (
					<span className="rail-bp-season-end">{seasonEndLabel}</span>
				)}

				<div
					className="rail-bp-bar"
					role="progressbar"
					aria-valuenow={xpPct}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div className="rail-bp-bar-fill" style={{ width: `${isMaxed ? 100 : xpPct}%` }} />
					{MILESTONE_LEVELS.map((lvl) => {
						const pipPct = (lvl / MAX_LEVEL) * 100;
						return (
							<div
								key={lvl}
								className={`rail-bp-pip${passLevel >= lvl ? ' rail-bp-pip--reached' : ''}`}
								style={{ left: `${pipPct}%` }}
								title={`Campaign rank ${lvl}`}
							/>
						);
					})}
				</div>

				{passTitle && (
					<div className="rail-bp-title-row">
						<span className="rail-bp-title-label">{passTitle}</span>
					</div>
				)}

				{!hasPaidPass && <div className="rail-bp-cta">Unlock Command Pass · 1,000 VP</div>}
			</button>

			{modalOpen && <VexPassModal pass={data} seasonEndsAt={data.seasonEndsAt} onClose={() => setModalOpen(false)} />}

			<button
				className="rail-shop-btn"
				onClick={() => {
					startProgress();
					startTransition(() => router.push('/shop'));
				}}
				aria-label="Open quartermaster"
			>
				<span className="rail-shop-text">
					<span className="rail-shop-label">Quartermaster <span className="rail-shop-tag">Shop</span></span>
					<span className="rail-shop-sub">Titles, borders, campaign pass</span>
				</span>
				{user?.vexPoints != null && (
					<span className="rail-shop-vp">{user.vexPoints.toLocaleString()} VP</span>
				)}
			</button>
		</>
	);
}
