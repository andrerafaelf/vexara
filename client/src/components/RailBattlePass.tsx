'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Lock, ChevronRight } from 'lucide-react';
import { getBattlePass, purchaseBattlePass } from '../services/api';
import '../styles/RailBattlePass.css';

const MAX_LEVEL = 30;
const XP_PER_LEVEL = 300;

// Reward labels shown on the track at their level
const MILESTONE_LEVELS = [5, 10, 15, 20, 25, 30];

interface PassState {
	seasonXp: number;
	passLevel: number;
	hasPaidPass: boolean;
}

export default function RailBattlePass() {
	const queryClient = useQueryClient();
	const [purchasing, setPurchasing] = useState(false);
	const [purchaseError, setPurchaseError] = useState<string | null>(null);

	const { data } = useQuery<PassState>({
		queryKey: ['battlePass'],
		queryFn: () => getBattlePass().then((r) => r.data),
		staleTime: 30_000,
		refetchInterval: 60_000
	});

	const mutation = useMutation({
		mutationFn: () => purchaseBattlePass().then((r) => r.data),
		onMutate: () => { setPurchasing(true); setPurchaseError(null); },
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['battlePass'] });
			setPurchasing(false);
		},
		onError: (err: any) => {
			setPurchaseError(err?.response?.data?.error ?? 'Purchase failed');
			setPurchasing(false);
		}
	});

	if (!data) return null;

	const { seasonXp, passLevel, hasPaidPass } = data;
	const xpIntoLevel = seasonXp - passLevel * XP_PER_LEVEL;
	const xpPct = Math.min((xpIntoLevel / XP_PER_LEVEL) * 100, 100);
	const isMaxed = passLevel >= MAX_LEVEL;

	return (
		<div className="rail-card rail-bp">
			<div className="rail-card-head">
				<Sparkles size={12} aria-hidden="true" />
				<span className="rail-card-title">Season Pass</span>
				{hasPaidPass && <span className="rail-bp-paid-badge">Premium</span>}
			</div>

			<div className="rail-bp-level-row">
				<span className="rail-bp-level">Level {passLevel}</span>
				{!isMaxed && (
					<span className="rail-bp-xp-label">
						{xpIntoLevel} / {XP_PER_LEVEL} XP
					</span>
				)}
				{isMaxed && <span className="rail-bp-maxed">Max</span>}
			</div>

			{!isMaxed && (
				<div className="rail-bp-bar" role="progressbar" aria-valuenow={xpPct} aria-valuemin={0} aria-valuemax={100}>
					<div className="rail-bp-bar-fill" style={{ width: `${xpPct}%` }} />

					{/* milestone pips */}
					{MILESTONE_LEVELS.map((lvl) => {
						const pct = ((lvl - passLevel - 1) / (MAX_LEVEL - passLevel)) * 100;
						if (pct < 0 || pct > 100) return null;
						return (
							<div
								key={lvl}
								className={`rail-bp-pip ${passLevel >= lvl ? 'rail-bp-pip--reached' : ''}`}
								style={{ left: `${pct}%` }}
								title={`Level ${lvl}`}
							/>
						);
					})}
				</div>
			)}

			{!hasPaidPass && (
				<div className="rail-bp-upgrade">
					<div className="rail-bp-upgrade-copy">
						<Lock size={11} aria-hidden="true" />
						<span>Unlock Premium — <strong>€4.99</strong></span>
					</div>
					{purchaseError && (
						<p className="rail-bp-error">{purchaseError}</p>
					)}
					<button
						className="rail-bp-upgrade-btn"
						onClick={() => mutation.mutate()}
						disabled={purchasing}
					>
						{purchasing ? 'Processing…' : 'Unlock'}
						{!purchasing && <ChevronRight size={13} aria-hidden="true" />}
					</button>
				</div>
			)}
		</div>
	);
}
