'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { MAX_PASS_LEVEL as MAX_LEVEL, PASS_LEVELS } from '../constants/vexPass';
import { useAuth } from '../context/AuthContext';
import { getBattlePass } from '../services/api';
import '../styles/RailBattlePass.css';
import { useStartProgress } from './NavigationProgress';
import VexPassModal, { type PassState } from './VexPassModal';

const MILESTONE_LEVELS = [10, 20, 30, 40, 50];

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

	const { passLevel, hasPaidPass, passTitle, xpPerLevel, xpIntoLevel, claimed, caches } = data;
	const xpPct = xpPerLevel > 0 ? Math.min((xpIntoLevel / xpPerLevel) * 100, 100) : 0;
	const isMaxed = passLevel >= MAX_LEVEL;

	// Rewards collectable right now: levels with a pending half (free, or paid once owned)
	// plus banked caches. Mirrors the server: claims need an active galaxy, and a claim
	// that carries resources above the pacing allowance is refused as a whole.
	const { pacing } = data;
	const claimableLevels = pacing
		? PASS_LEVELS.filter((row) => {
				if (row.level > passLevel) return false;
				const freePending = !!row.free && !claimed.free.includes(row.level);
				const paidPending = hasPaidPass && !!row.paid && !claimed.paid.includes(row.level);
				const carriesResources = freePending && row.free!.includes('resources:');
				if (carriesResources && row.level > pacing.claimableUpToLevel) return false;
				return freePending || paidPending;
			}).length
		: 0;
	const claimableCaches = pacing && !pacing.cachesUnlockAt ? caches.claimable : 0;
	const claimableCount = claimableLevels + claimableCaches;

	return (
		<>
			<button
				className="rail-card rail-bp rail-bp--btn"
				onClick={() => setModalOpen(true)}
				aria-label="Open Vex Pass"
			>
				<div className="rail-card-head">
					<span className="rail-card-title">Vex Pass</span>
					{hasPaidPass ? (
						<span className="rail-bp-paid-badge">Command Pass</span>
					) : (
						<span className="rail-bp-free-badge">Free Tier</span>
					)}
				</div>

				<div className="rail-bp-level-row">
					<span className="rail-bp-level">
						Level {passLevel} <span className="rail-bp-level-max">/ {MAX_LEVEL}</span>
					</span>
				</div>
				{!isMaxed && (
					<span className="rail-bp-xp-label">
						{xpIntoLevel} / {xpPerLevel} XP
					</span>
				)}
				{isMaxed && <span className="rail-bp-maxed">Level {MAX_LEVEL} reached</span>}
				{claimableCount > 0 && (
					<span className="rail-bp-ready">
						{claimableCount} reward{claimableCount !== 1 ? 's' : ''} ready to collect
					</span>
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
								title={`Level ${lvl}`}
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

			{modalOpen && <VexPassModal pass={data} onClose={() => setModalOpen(false)} />}

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
					<span className="rail-shop-sub">Titles, borders, Vex Pass</span>
				</span>
				{user?.vexPoints != null && (
					<span className="rail-shop-vp">{user.vexPoints.toLocaleString()} VP</span>
				)}
			</button>
		</>
	);
}
