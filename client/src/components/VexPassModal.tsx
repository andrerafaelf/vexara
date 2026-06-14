'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	X, Sparkles, Award, Shield, Zap, Star, Crown, Lock, ChevronRight
} from 'lucide-react';
import { purchaseBattlePass } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { KOFI_URL } from '../constants/support';
import '../styles/VexPassModal.css';

interface PassState {
	seasonXp: number;
	passLevel: number;
	hasPaidPass: boolean;
	passTitle: string | null;
}

interface Props {
	pass: PassState;
	onClose: () => void;
}

const MAX_LEVEL = 50;
const XP_PER_LEVEL = 300;
const PASS_COST_VP = 1000;

// Representative rewards shown per act in the modal.
// Free shows the resource/badge highlights. Paid shows boosts + VP + titles.
const ACTS = [
	{
		label: 'Act I — Enlistment',
		levels: '1–10',
		free: ['500–1,200 Resources', 'Bronze Badge at L10', '20 VP'],
		paid: ['Title: Recruit at L1', 'Title: Operative at L8', '+12% Prod 36h', '25 VP']
	},
	{
		label: 'Act II — Field Ops',
		levels: '11–20',
		free: ['1,500–3,000 Resources', '20 VP at L15/20'],
		paid: ['Title: Proven at L18', '+20% Prod 72h', '65 VP']
	},
	{
		label: 'Act III — Warfront',
		levels: '21–30',
		free: ['3,500–6,000 Resources', 'Silver Badge + VP at L25', '30 VP at L30'],
		paid: ['Title: Vex Commander at L30', '+25% Prod 96h', '90 VP']
	},
	{
		label: 'Act IV — High Command',
		levels: '31–40',
		free: ['7,000–12,000 Resources', 'Gold Badge + Veteran Title at L40', '35 VP'],
		paid: ['+30% Prod 120h', '95 VP']
	},
	{
		label: 'Act V — Vex Reckoning',
		levels: '41–50',
		free: ['13,000–22,000 Resources', 'Platinum Badge + 20 VP at L50'],
		paid: ['Title: High Commander at L45', '+35% Prod 120h at L46', '35 VP at L45']
	}
];

const ACT_ICONS = [Shield, Zap, Star, Crown, Sparkles];

export default function VexPassModal({ pass, onClose }: Props) {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [error, setError] = React.useState<string | null>(null);

	const vexPoints = user?.vexPoints ?? 0;
	const canAfford = vexPoints >= PASS_COST_VP;

	const xpIntoLevel = pass.seasonXp - pass.passLevel * XP_PER_LEVEL;
	const xpPct = Math.min((xpIntoLevel / XP_PER_LEVEL) * 100, 100);
	const isMaxed = pass.passLevel >= MAX_LEVEL;

	const mutation = useMutation({
		mutationFn: () => purchaseBattlePass().then((r) => r.data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['battlePass'] });
			onClose();
		},
		onError: (err: any) => {
			setError(err?.response?.data?.error ?? 'Purchase failed');
		}
	});

	// Lock scroll
	React.useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	}, []);

	if (typeof document === 'undefined') return null;

	return createPortal(
		<div className="vpm-backdrop" onClick={onClose}>
			<div className="vpm-modal" role="dialog" aria-label="Vex Protocol Pass" onClick={(e) => e.stopPropagation()}>

				{/* ── Header ── */}
				<div className="vpm-header">
					<div className="vpm-header-left">
						<Sparkles size={16} className="vpm-header-icon" aria-hidden="true" />
						<div>
							<div className="vpm-title">Vex Protocol</div>
							<div className="vpm-subtitle">Season Pass · 50 Levels</div>
						</div>
					</div>
					<button className="vpm-close" onClick={onClose} aria-label="Close">
						<X size={18} />
					</button>
				</div>

				{/* ── Progress strip ── */}
				<div className="vpm-progress-section">
					<div className="vpm-progress-meta">
						<span className="vpm-level-label">
							Level <strong>{pass.passLevel}</strong>
							{pass.passTitle && (
								<span className="vpm-active-title">
									<Award size={11} aria-hidden="true" />
									{pass.passTitle}
								</span>
							)}
						</span>
						<span className="vpm-xp-label">
							{isMaxed ? 'MAX' : `${xpIntoLevel} / ${XP_PER_LEVEL} XP`}
						</span>
					</div>
					<div className="vpm-bar" role="progressbar" aria-valuenow={xpPct} aria-valuemin={0} aria-valuemax={100}>
						<div className="vpm-bar-fill" style={{ width: `${isMaxed ? 100 : xpPct}%` }} />
						{[10, 20, 30, 40, 50].map((lvl) => (
							<div
								key={lvl}
								className={`vpm-bar-pip${pass.passLevel >= lvl ? ' vpm-bar-pip--done' : ''}`}
								style={{ left: `${(lvl / MAX_LEVEL) * 100}%` }}
							/>
						))}
					</div>
					<div className="vpm-bar-labels">
						{[10, 20, 30, 40, 50].map((lvl) => (
							<span key={lvl} style={{ left: `${(lvl / MAX_LEVEL) * 100}%` }}>{lvl}</span>
						))}
					</div>
				</div>

				{/* ── Track columns header ── */}
				<div className="vpm-track-header">
					<div className="vpm-track-col vpm-track-col--free">
						<span className="vpm-track-badge vpm-track-badge--free">Free</span>
						<span className="vpm-track-name">Protocol: Field</span>
						<span className="vpm-track-vp">250 VP included</span>
					</div>
					<div className="vpm-track-col vpm-track-col--paid">
						<span className="vpm-track-badge vpm-track-badge--paid">Premium</span>
						<span className="vpm-track-name">Protocol: Command</span>
						<span className="vpm-track-vp">500 VP + boosts + titles</span>
					</div>
				</div>

				{/* ── Act rows ── */}
				<div className="vpm-acts">
					{ACTS.map((act, i) => {
						const Icon = ACT_ICONS[i];
						return (
							<div key={act.label} className="vpm-act">
								<div className="vpm-act-label">
									<Icon size={11} aria-hidden="true" />
									<span>{act.label}</span>
									<span className="vpm-act-levels">L{act.levels}</span>
								</div>
								<div className="vpm-act-cols">
									<ul className="vpm-reward-list vpm-reward-list--free">
										{act.free.map((r) => <li key={r}>{r}</li>)}
									</ul>
									<ul className={`vpm-reward-list vpm-reward-list--paid${pass.hasPaidPass ? '' : ' vpm-reward-list--locked'}`}>
										{!pass.hasPaidPass && <Lock size={10} className="vpm-lock-icon" aria-hidden="true" />}
										{act.paid.map((r) => <li key={r}>{r}</li>)}
									</ul>
								</div>
							</div>
						);
					})}

					{/* L50 capstone row */}
					<div className="vpm-act vpm-act--capstone">
						<div className="vpm-act-label">
							<Crown size={11} aria-hidden="true" />
							<span>L50 Capstone</span>
						</div>
						<div className="vpm-act-cols">
							<div className="vpm-capstone-reward vpm-capstone-reward--free">
								Platinum Badge + 20 VP
							</div>
							<div className={`vpm-capstone-reward vpm-capstone-reward--paid${pass.hasPaidPass ? '' : ' vpm-capstone-reward--locked'}`}>
								Season Conqueror + 170 VP + +35% Prod 120h
							</div>
						</div>
					</div>
				</div>

				{/* ── Footer CTA ── */}
				{!pass.hasPaidPass && (
					<div className="vpm-footer">
						<div className="vpm-footer-vp">
							<span className="vpm-footer-vp-label">Your Vex Points</span>
							<span className={`vpm-footer-vp-balance${canAfford ? ' vpm-footer-vp-balance--ok' : ' vpm-footer-vp-balance--low'}`}>
								{vexPoints.toLocaleString()} VP
							</span>
						</div>

						<div className="vpm-footer-actions">
							{error && <p className="vpm-error">{error}</p>}
							{canAfford ? (
								<button
									className="vpm-unlock-btn"
									onClick={() => mutation.mutate()}
									disabled={mutation.isPending}
								>
									{mutation.isPending ? 'Unlocking…' : (
										<>Unlock Protocol: Command — 1,000 VP <ChevronRight size={14} /></>
									)}
								</button>
							) : (
								<div className="vpm-need-vp">
									<p className="vpm-need-vp-text">
										You need <strong>{(PASS_COST_VP - vexPoints).toLocaleString()} more VP</strong>.
										Get 1,000 VP for <strong>€4.99</strong> on Ko-fi.
									</p>
									<a
										className="vpm-kofi-btn"
										href={KOFI_URL}
										target="_blank"
										rel="noopener noreferrer"
									>
										Get Vex Points on Ko-fi
										<ChevronRight size={14} />
									</a>
								</div>
							)}
						</div>
					</div>
				)}

				{pass.hasPaidPass && (
					<div className="vpm-footer vpm-footer--owned">
						<Sparkles size={14} aria-hidden="true" />
						<span>Protocol: Command active — earn XP to unlock all rewards</span>
					</div>
				)}
			</div>
		</div>,
		document.body
	);
}
