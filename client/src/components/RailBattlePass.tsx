'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Award, ChevronRight } from 'lucide-react';
import { getBattlePass } from '../services/api';
import VexPassModal from './VexPassModal';
import '../styles/RailBattlePass.css';

const MAX_LEVEL = 50;
const XP_PER_LEVEL = 300;
const MILESTONE_LEVELS = [10, 20, 30, 40, 50];

interface PassState {
	seasonXp: number;
	passLevel: number;
	hasPaidPass: boolean;
	passTitle: string | null;
}

export default function RailBattlePass() {
	const [modalOpen, setModalOpen] = useState(false);

	const { data } = useQuery<PassState>({
		queryKey: ['battlePass'],
		queryFn: () => getBattlePass().then((r) => r.data),
		staleTime: 30_000,
		refetchInterval: 60_000
	});

	if (!data) return null;

	const { seasonXp, passLevel, hasPaidPass, passTitle } = data;
	const xpIntoLevel = seasonXp - passLevel * XP_PER_LEVEL;
	const xpPct = Math.min((xpIntoLevel / XP_PER_LEVEL) * 100, 100);
	const isMaxed = passLevel >= MAX_LEVEL;

	return (
		<>
			<button className="rail-card rail-bp rail-bp--btn" onClick={() => setModalOpen(true)} aria-label="Open season pass">

				<div className="rail-card-head">
					<Sparkles size={12} aria-hidden="true" />
					<span className="rail-card-title">Vex Protocol</span>
					{hasPaidPass
						? <span className="rail-bp-paid-badge">Premium</span>
						: <span className="rail-bp-free-badge">Free</span>
					}
					<ChevronRight size={12} className="rail-bp-chevron" aria-hidden="true" />
				</div>

				<div className="rail-bp-level-row">
					<span className="rail-bp-level">Level {passLevel} <span className="rail-bp-level-max">/ {MAX_LEVEL}</span></span>
					{!isMaxed && (
						<span className="rail-bp-xp-label">{xpIntoLevel} / {XP_PER_LEVEL} XP</span>
					)}
					{isMaxed && <span className="rail-bp-maxed">MAX</span>}
				</div>

				<div className="rail-bp-bar" role="progressbar" aria-valuenow={xpPct} aria-valuemin={0} aria-valuemax={100}>
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
						<Award size={11} aria-hidden="true" />
						<span className="rail-bp-title-label">{passTitle}</span>
					</div>
				)}

				{!hasPaidPass && (
					<div className="rail-bp-cta">
						Unlock Premium Track
					</div>
				)}
			</button>

			{modalOpen && (
				<VexPassModal pass={data} onClose={() => setModalOpen(false)} />
			)}
		</>
	);
}
