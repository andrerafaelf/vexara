'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Sparkles, Award, Lock, ChevronRight } from 'lucide-react';
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

// ── Reward string → human-readable label ─────────────────────────────────────
function fmtReward(raw: string | null): React.ReactNode[] {
	if (!raw) return [];
	return raw.split(',').map((part, i) => {
		const seg = part.trim();
		const [type, ...rest] = seg.split(':');
		let label = '';
		let className = '';

		if (type === 'resources') {
			const res = rest[0] ?? '';
			const amt = Number(rest[1] ?? 0).toLocaleString();
			const icon = res === 'biomass' ? '🌿' : res === 'alloy' ? '⚙️' : '🪨';
			label = `${icon} ${amt} ${res.charAt(0).toUpperCase() + res.slice(1)}`;
			className = 'vpm-r vpm-r--res';
		} else if (type === 'boost') {
			const pct = rest[1] ?? '?';
			const hrs = rest[2] ?? '?';
			label = `⚡ +${pct}% Prod ${hrs}h`;
			className = 'vpm-r vpm-r--boost';
		} else if (type === 'title') {
			label = `🏆 ${rest.join(':')}`;
			className = 'vpm-r vpm-r--title';
		} else if (type === 'badge') {
			const tier = rest[0] ?? '';
			label = `🎖️ ${tier.charAt(0).toUpperCase() + tier.slice(1)} Badge`;
			className = 'vpm-r vpm-r--badge';
		} else if (type === 'vexpoints') {
			label = `💎 ${rest[0]} VP`;
			className = 'vpm-r vpm-r--vp';
		} else {
			label = seg;
			className = 'vpm-r';
		}

		return <span key={i} className={className}>{label}</span>;
	});
}

// All 50 levels of the reward table — mirrors server/utils/battlePass.ts exactly.
// Keep in sync if the server table changes.
const LEVELS: Array<{ level: number; free: string | null; paid: string | null }> = [
	// Act I: Enlistment (1–10)
	{ level:  1, free: 'resources:biomass:500',                                             paid: 'title:Recruit' },
	{ level:  2, free: 'resources:alloy:500',                                               paid: 'boost:production:5:12' },
	{ level:  3, free: 'resources:ore:500',                                                 paid: 'vexpoints:10' },
	{ level:  4, free: 'resources:biomass:750,resources:alloy:500',                         paid: 'boost:production:8:18' },
	{ level:  5, free: 'resources:ore:750,vexpoints:10',                                    paid: 'vexpoints:10' },
	{ level:  6, free: 'resources:biomass:1000',                                            paid: 'boost:production:10:24' },
	{ level:  7, free: 'resources:alloy:1000',                                              paid: 'boost:production:10:24' },
	{ level:  8, free: 'resources:ore:1000',                                                paid: 'title:Operative,vexpoints:10' },
	{ level:  9, free: 'resources:biomass:1200,resources:alloy:800',                        paid: 'boost:production:12:24' },
	{ level: 10, free: 'badge:bronze,vexpoints:20',                                         paid: 'vexpoints:15,boost:production:12:36' },
	// Act II: Field Ops (11–20)
	{ level: 11, free: 'resources:biomass:1500',                                            paid: 'boost:production:15:36' },
	{ level: 12, free: 'resources:alloy:1500',                                              paid: 'boost:production:15:36' },
	{ level: 13, free: 'resources:ore:1500',                                                paid: 'vexpoints:10' },
	{ level: 14, free: 'resources:biomass:2000,resources:ore:1000',                         paid: 'boost:production:15:48' },
	{ level: 15, free: 'resources:alloy:2000,vexpoints:20',                                 paid: 'vexpoints:15' },
	{ level: 16, free: 'resources:ore:2000',                                                paid: 'boost:production:18:48' },
	{ level: 17, free: 'resources:biomass:2500,resources:alloy:1500',                       paid: 'boost:production:18:48' },
	{ level: 18, free: 'resources:ore:2500',                                                paid: 'title:Proven,vexpoints:15' },
	{ level: 19, free: 'resources:biomass:3000,resources:alloy:2000',                       paid: 'boost:production:20:48' },
	{ level: 20, free: 'resources:ore:3000,vexpoints:25',                                   paid: 'vexpoints:20,boost:production:20:72' },
	// Act III: Warfront (21–30)
	{ level: 21, free: 'resources:biomass:3500,resources:alloy:2500',                       paid: 'boost:production:22:72' },
	{ level: 22, free: 'resources:ore:3500',                                                paid: 'boost:production:22:72' },
	{ level: 23, free: 'resources:biomass:4000,resources:alloy:3000',                       paid: 'vexpoints:15' },
	{ level: 24, free: 'resources:ore:4000',                                                paid: 'boost:production:22:72' },
	{ level: 25, free: 'badge:silver,resources:biomass:4000,vexpoints:25',                  paid: 'vexpoints:20' },
	{ level: 26, free: 'resources:alloy:4500,resources:ore:3000',                           paid: 'boost:production:25:72' },
	{ level: 27, free: 'resources:biomass:5000',                                            paid: 'boost:production:25:72' },
	{ level: 28, free: 'resources:alloy:5000,resources:ore:3500',                           paid: 'vexpoints:15' },
	{ level: 29, free: 'resources:biomass:6000,resources:alloy:4000',                       paid: 'boost:production:25:96' },
	{ level: 30, free: 'resources:ore:6000,vexpoints:30',                                   paid: 'title:Vex Commander,vexpoints:25,boost:production:25:96' },
	// Act IV: High Command (31–40)
	{ level: 31, free: 'resources:biomass:7000,resources:alloy:5000',                       paid: 'boost:production:28:96' },
	{ level: 32, free: 'resources:ore:7000',                                                paid: 'boost:production:28:96' },
	{ level: 33, free: 'resources:biomass:8000,resources:alloy:5000,resources:ore:4000',    paid: 'vexpoints:15' },
	{ level: 34, free: 'resources:biomass:8000,resources:ore:6000',                         paid: 'boost:production:28:96' },
	{ level: 35, free: 'resources:alloy:9000,resources:biomass:6000,vexpoints:30',          paid: 'vexpoints:25' },
	{ level: 36, free: 'resources:ore:9000,resources:alloy:6000',                           paid: 'boost:production:30:96' },
	{ level: 37, free: 'resources:biomass:10000,resources:alloy:7000',                      paid: 'boost:production:30:96' },
	{ level: 38, free: 'resources:ore:10000,resources:biomass:7000',                        paid: 'vexpoints:20' },
	{ level: 39, free: 'resources:biomass:12000,resources:alloy:8000,resources:ore:6000',   paid: 'boost:production:30:120' },
	{ level: 40, free: 'badge:gold,title:Veteran,vexpoints:35',                             paid: 'vexpoints:30,boost:production:30:120' },
	// Act V: Vex Reckoning (41–50)
	{ level: 41, free: 'resources:biomass:13000,resources:alloy:9000',                      paid: 'boost:production:32:120' },
	{ level: 42, free: 'resources:ore:13000,resources:biomass:9000',                        paid: 'boost:production:32:120' },
	{ level: 43, free: 'resources:biomass:15000,resources:alloy:10000,resources:ore:8000',  paid: 'vexpoints:20' },
	{ level: 44, free: 'resources:biomass:15000,resources:alloy:12000',                     paid: 'boost:production:33:120' },
	{ level: 45, free: 'resources:ore:15000,resources:biomass:10000,vexpoints:35',          paid: 'title:High Commander,vexpoints:35,boost:production:33:120' },
	{ level: 46, free: 'resources:biomass:18000,resources:alloy:13000',                     paid: 'boost:production:35:120' },
	{ level: 47, free: 'resources:ore:18000,resources:alloy:14000',                         paid: 'boost:production:35:120' },
	{ level: 48, free: 'resources:biomass:20000,resources:alloy:15000,resources:ore:12000', paid: 'vexpoints:25' },
	{ level: 49, free: 'resources:biomass:22000,resources:alloy:18000,resources:ore:15000', paid: 'boost:production:35:120' },
	{ level: 50, free: 'badge:platinum,vexpoints:20',                                       paid: 'title:Season Conqueror,vexpoints:170,boost:production:35:120' },
];

const ACT_LABELS: Record<number, string> = {
	1:  'Act I — Enlistment',
	11: 'Act II — Field Ops',
	21: 'Act III — Warfront',
	31: 'Act IV — High Command',
	41: 'Act V — Vex Reckoning',
};

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

				{/* ── Column headers (sticky) ── */}
				<div className="vpm-col-headers">
					<div className="vpm-col-lv">LV</div>
					<div className="vpm-col-free">
						<span className="vpm-track-badge vpm-track-badge--free">Free</span>
						Protocol: Field
					</div>
					<div className="vpm-col-paid">
						<span className="vpm-track-badge vpm-track-badge--paid">Premium</span>
						Protocol: Command
					</div>
				</div>

				{/* ── Per-level rows ── */}
				<div className="vpm-rows-scroll">
					{LEVELS.map((row) => {
						const isActHeader = ACT_LABELS[row.level];
						const isCurrentLevel = row.level === pass.passLevel + 1;
						const isEarned = row.level <= pass.passLevel;
						const isCapstone = row.level === 50;

						return (
							<React.Fragment key={row.level}>
								{isActHeader && (
									<div className="vpm-act-divider">{isActHeader}</div>
								)}
								<div className={[
									'vpm-row',
									isEarned ? 'vpm-row--earned' : '',
									isCurrentLevel ? 'vpm-row--current' : '',
									isCapstone ? 'vpm-row--capstone' : '',
								].filter(Boolean).join(' ')}>
									<div className="vpm-row-lv">
										{isEarned ? (
											<span className="vpm-row-lv-check">✓</span>
										) : (
											<span className={isCurrentLevel ? 'vpm-row-lv-num vpm-row-lv-num--next' : 'vpm-row-lv-num'}>{row.level}</span>
										)}
									</div>
									<div className="vpm-row-free">
										{fmtReward(row.free)}
									</div>
									<div className={`vpm-row-paid${pass.hasPaidPass ? '' : ' vpm-row-paid--locked'}`}>
										{!pass.hasPaidPass && <Lock size={9} className="vpm-row-lock" aria-hidden="true" />}
										{fmtReward(row.paid)}
									</div>
								</div>
							</React.Fragment>
						);
					})}
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
