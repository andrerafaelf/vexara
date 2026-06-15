'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Sparkles, Award, Lock, ChevronRight, Zap, Trophy, Medal, CheckCircle2, Gift } from 'lucide-react';
import { giftBattlePass, purchaseBattlePass, claimBattlePassLevel, getMyNexuses } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { VP_PACKS } from '../constants/support';
import ResourceIcon from './ResourceIcon';
import '../styles/VexPassModal.css';

interface PassState {
	seasonXp: number;
	passLevel: number;
	hasPaidPass: boolean;
	passTitle: string | null;
	claimedLevels: number[];
}

interface Nexus {
	id: number;
	name: string;
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

		if (type === 'resources') {
			// Format: resources:<biomass>:<alloy>:<ore>
			const biomass = Number(rest[0] ?? 0).toLocaleString();
			const alloy   = Number(rest[1] ?? 0).toLocaleString();
			const ore     = Number(rest[2] ?? 0).toLocaleString();
			return (
				<span key={i} className="vpm-r vpm-r--res">
					<ResourceIcon kind="biomass" size={10} labelled={false} />{biomass}
					<ResourceIcon kind="alloy"   size={10} labelled={false} />{alloy}
					<ResourceIcon kind="ore"     size={10} labelled={false} />{ore}
				</span>
			);
		}
		if (type === 'boost') {
			const pct = rest[1] ?? '?';
			const hrs = rest[2] ?? '?';
			return (
				<span key={i} className="vpm-r vpm-r--boost">
					<Zap size={10} aria-hidden="true" />
					+{pct}% Prod {hrs}h
				</span>
			);
		}
		if (type === 'title') {
			return (
				<span key={i} className="vpm-r vpm-r--title">
					<Trophy size={10} aria-hidden="true" />
					{rest.join(':')}
				</span>
			);
		}
		if (type === 'badge') {
			const tier = rest[0] ?? '';
			return (
				<span key={i} className="vpm-r vpm-r--badge">
					<Medal size={10} aria-hidden="true" />
					{tier.charAt(0).toUpperCase() + tier.slice(1)} Badge
				</span>
			);
		}
		if (type === 'vexpoints') {
			return (
				<span key={i} className="vpm-r vpm-r--vp">
					<Sparkles size={10} aria-hidden="true" />
					{rest[0]} VP
				</span>
			);
		}
		if (type === 'token') {
			const count = Number(rest[0] ?? 1);
			return (
				<span key={i} className="vpm-r vpm-r--token">
					<Gift size={10} aria-hidden="true" />
					{count} Supporter Token{count !== 1 ? 's' : ''}
				</span>
			);
		}
		return <span key={i} className="vpm-r">{seg}</span>;
	});
}

// All 50 levels of the reward table — mirrors server/utils/battlePass.ts exactly.
const LEVELS: Array<{ level: number; free: string | null; paid: string | null }> = [
	// Act I: Enlistment (1–10)
	{ level:  1, free: 'resources:500:500:500',                                         paid: 'title:Recruit' },
	{ level:  2, free: 'resources:800:800:800',                                         paid: 'boost:production:5:12' },
	{ level:  3, free: 'resources:1000:1000:1000',                                      paid: 'vexpoints:10' },
	{ level:  4, free: 'resources:1200:1200:1200',                                      paid: 'boost:production:8:18' },
	{ level:  5, free: 'resources:1500:1500:1500,vexpoints:10',                         paid: 'vexpoints:10' },
	{ level:  6, free: 'resources:2000:2000:2000',                                      paid: 'boost:production:10:24' },
	{ level:  7, free: 'resources:2500:2500:2500',                                      paid: 'boost:production:10:24' },
	{ level:  8, free: 'resources:3000:3000:3000',                                      paid: 'title:Operative,vexpoints:10' },
	{ level:  9, free: 'resources:3500:3500:3500',                                      paid: 'boost:production:12:24' },
	{ level: 10, free: 'badge:bronze,resources:4000:4000:4000,vexpoints:20',            paid: 'vexpoints:15,boost:production:12:36' },
	// Act II: Field Ops (11–20)
	{ level: 11, free: 'resources:5000:5000:5000',                                      paid: 'boost:production:15:36' },
	{ level: 12, free: 'resources:6000:6000:6000',                                      paid: 'boost:production:15:36' },
	{ level: 13, free: 'resources:7000:7000:7000',                                      paid: 'vexpoints:10' },
	{ level: 14, free: 'resources:8000:8000:8000',                                      paid: 'boost:production:15:48' },
	{ level: 15, free: 'resources:9000:9000:9000,vexpoints:20',                         paid: 'vexpoints:15' },
	{ level: 16, free: 'resources:10000:10000:10000',                                   paid: 'boost:production:18:48' },
	{ level: 17, free: 'resources:11000:11000:11000',                                   paid: 'boost:production:18:48' },
	{ level: 18, free: 'resources:12000:12000:12000',                                   paid: 'title:Proven,vexpoints:15' },
	{ level: 19, free: 'resources:13000:13000:13000',                                   paid: 'boost:production:20:48' },
	{ level: 20, free: 'resources:15000:15000:15000,vexpoints:25',                      paid: 'vexpoints:20,boost:production:20:72,token:1' },
	// Act III: Warfront (21–30)
	{ level: 21, free: 'resources:17000:17000:17000',                                   paid: 'boost:production:22:72' },
	{ level: 22, free: 'resources:19000:19000:19000',                                   paid: 'boost:production:22:72' },
	{ level: 23, free: 'resources:21000:21000:21000',                                   paid: 'vexpoints:15' },
	{ level: 24, free: 'resources:23000:23000:23000',                                   paid: 'boost:production:22:72' },
	{ level: 25, free: 'badge:silver,resources:25000:25000:25000,vexpoints:25',         paid: 'vexpoints:20' },
	{ level: 26, free: 'resources:27000:27000:27000',                                   paid: 'boost:production:25:72' },
	{ level: 27, free: 'resources:29000:29000:29000',                                   paid: 'boost:production:25:72' },
	{ level: 28, free: 'resources:31000:31000:31000',                                   paid: 'vexpoints:15' },
	{ level: 29, free: 'resources:34000:34000:34000',                                   paid: 'boost:production:25:96' },
	{ level: 30, free: 'resources:37000:37000:37000,vexpoints:30',                      paid: 'title:Vex Commander,vexpoints:25,boost:production:25:96' },
	// Act IV: High Command (31–40)
	{ level: 31, free: 'resources:40000:40000:40000',                                   paid: 'boost:production:28:96' },
	{ level: 32, free: 'resources:43000:43000:43000',                                   paid: 'boost:production:28:96' },
	{ level: 33, free: 'resources:46000:46000:46000',                                   paid: 'vexpoints:15' },
	{ level: 34, free: 'resources:50000:50000:50000',                                   paid: 'boost:production:28:96' },
	{ level: 35, free: 'resources:54000:54000:54000,vexpoints:30',                      paid: 'vexpoints:25,token:1' },
	{ level: 36, free: 'resources:58000:58000:58000',                                   paid: 'boost:production:30:96' },
	{ level: 37, free: 'resources:62000:62000:62000',                                   paid: 'boost:production:30:96' },
	{ level: 38, free: 'resources:66000:66000:66000',                                   paid: 'vexpoints:20' },
	{ level: 39, free: 'resources:70000:70000:70000',                                   paid: 'boost:production:30:120' },
	{ level: 40, free: 'badge:gold,title:Veteran,resources:75000:75000:75000,vexpoints:35', paid: 'vexpoints:30,boost:production:30:120' },
	// Act V: Vex Reckoning (41–50)
	{ level: 41, free: 'resources:80000:80000:80000',                                   paid: 'boost:production:32:120' },
	{ level: 42, free: 'resources:85000:85000:85000',                                   paid: 'boost:production:32:120' },
	{ level: 43, free: 'resources:90000:90000:90000',                                   paid: 'vexpoints:20' },
	{ level: 44, free: 'resources:95000:95000:95000',                                   paid: 'boost:production:33:120' },
	{ level: 45, free: 'resources:100000:100000:100000,vexpoints:35',                   paid: 'title:High Commander,vexpoints:35,boost:production:33:120' },
	{ level: 46, free: 'resources:110000:110000:110000',                                paid: 'boost:production:35:120' },
	{ level: 47, free: 'resources:120000:120000:120000',                                paid: 'boost:production:35:120' },
	{ level: 48, free: 'resources:130000:130000:130000',                                paid: 'vexpoints:25' },
	{ level: 49, free: 'resources:140000:140000:140000',                                paid: 'boost:production:35:120' },
	{ level: 50, free: 'badge:platinum,vexpoints:20',                                   paid: 'title:Season Conqueror,vexpoints:170,token:4,boost:production:35:120' },
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
	const [giftUsername, setGiftUsername] = React.useState('');
	const [giftError, setGiftError] = React.useState<string | null>(null);
	const [giftDone, setGiftDone] = React.useState<string | null>(null);
	const [showGift, setShowGift] = React.useState(false);
	const [nexuses, setNexuses] = React.useState<Nexus[]>([]);
	const [selectedNexusId, setSelectedNexusId] = React.useState<number | null>(null);
	const [claimingLevel, setClaimingLevel] = React.useState<number | null>(null);
	const [claimError, setClaimError] = React.useState<string | null>(null);
	// Local shadow of claimed levels so UI updates instantly without a refetch
	const [localClaimed, setLocalClaimed] = React.useState<number[]>(pass.claimedLevels ?? []);

	const vexPoints = user?.vexPoints ?? 0;
	const canAfford = vexPoints >= PASS_COST_VP;

	const xpIntoLevel = pass.seasonXp - pass.passLevel * XP_PER_LEVEL;
	const xpPct = Math.min((xpIntoLevel / XP_PER_LEVEL) * 100, 100);
	const isMaxed = pass.passLevel >= MAX_LEVEL;

	// Load nexuses once for the claim selector
	React.useEffect(() => {
		getMyNexuses()
			.then((r) => {
				const list: Nexus[] = (r.data as any[]).map((n: any) => ({ id: n.id ?? n._id, name: n.name }));
				setNexuses(list);
				if (list.length > 0) setSelectedNexusId(list[0].id);
			})
			.catch(() => {});
	}, []);

	React.useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	}, []);

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

	const giftMutation = useMutation({
		mutationFn: () => giftBattlePass(giftUsername.trim()).then((r) => r.data),
		onSuccess: (data: any) => {
			setGiftDone(data?.recipientUsername ?? giftUsername.trim());
			setGiftUsername('');
			setGiftError(null);
			queryClient.invalidateQueries({ queryKey: ['user'] });
		},
		onError: (err: any) => {
			setGiftError(err?.message ?? 'Gift failed');
		}
	});

	async function handleClaim(level: number) {
		if (!selectedNexusId) { setClaimError('Select a nexus first'); return; }
		setClaimingLevel(level);
		setClaimError(null);
		try {
			await claimBattlePassLevel(level, selectedNexusId);
			setLocalClaimed((prev) => [...prev, level]);
			queryClient.invalidateQueries({ queryKey: ['battlePass'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
		} catch (err: any) {
			setClaimError(err?.response?.data?.error ?? 'Claim failed');
		} finally {
			setClaimingLevel(null);
		}
	}

	if (typeof document === 'undefined') return null;

	const hasClaimableLevel = LEVELS.some(
		(row) => row.level <= pass.passLevel && !localClaimed.includes(row.level)
	);

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

				{/* ── Nexus selector (shown when there are claimable rewards) ── */}
				{hasClaimableLevel && nexuses.length > 0 && (
					<div className="vpm-nexus-bar">
						<span className="vpm-nexus-bar-label">Deposit resources to</span>
						<select
							className="vpm-nexus-select"
							value={selectedNexusId ?? ''}
							onChange={(e) => setSelectedNexusId(Number(e.target.value))}
						>
							{nexuses.map((n) => (
								<option key={n.id} value={n.id}>{n.name}</option>
							))}
						</select>
						{claimError && <span className="vpm-claim-error">{claimError}</span>}
					</div>
				)}

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
						const isEarned = row.level <= pass.passLevel;
						const isClaimed = localClaimed.includes(row.level);
						const isClaimable = isEarned && !isClaimed;
						const isCurrentLevel = row.level === pass.passLevel + 1;
						const isCapstone = row.level === 50;
						const isThisLoading = claimingLevel === row.level;

						return (
							<React.Fragment key={row.level}>
								{isActHeader && (
									<div className="vpm-act-divider">{isActHeader}</div>
								)}
								<div className={[
									'vpm-row',
									isClaimed ? 'vpm-row--claimed' : '',
									isClaimable ? 'vpm-row--claimable' : '',
									isCurrentLevel ? 'vpm-row--current' : '',
									isCapstone ? 'vpm-row--capstone' : '',
								].filter(Boolean).join(' ')}>
									<div className="vpm-row-lv">
										{isClaimed ? (
											<CheckCircle2 size={13} className="vpm-row-lv-done" aria-label="Claimed" />
										) : isEarned ? (
											<span className="vpm-row-lv-num vpm-row-lv-num--ready">{row.level}</span>
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
									{/* Claim button — only on earned, unclaimed rows */}
									{isClaimable && (
										<div className="vpm-row-claim">
											<button
												className="vpm-claim-btn"
												onClick={() => handleClaim(row.level)}
												disabled={isThisLoading || !selectedNexusId}
												aria-label={`Claim level ${row.level} rewards`}
											>
												{isThisLoading ? '…' : 'Claim'}
											</button>
										</div>
									)}
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
										Buy a pack below to top up and unlock the premium track.
									</p>
									<div className="vpm-vp-packs">
										{VP_PACKS.map((pack) => (
											<a
												key={pack.label}
												className="vpm-vp-pack-btn"
												href={pack.url}
												target="_blank"
												rel="noopener noreferrer"
											>
												<span className="vpm-vp-pack-vp">{pack.vp.toLocaleString()} VP</span>
												<span className="vpm-vp-pack-price">{pack.price}</span>
											</a>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{pass.hasPaidPass && (
					<div className="vpm-footer vpm-footer--owned">
						<Sparkles size={14} aria-hidden="true" />
						<span>Protocol: Command active — claim your rewards above</span>
					</div>
				)}

				{/* ── Gift a pass ── */}
				{vexPoints >= PASS_COST_VP && (
					<div className="vpm-gift-section">
						{!showGift && !giftDone && (
							<button className="vpm-gift-toggle" onClick={() => setShowGift(true)}>
								Gift a pass to a galaxy mate — 1,000 VP
							</button>
						)}
						{showGift && !giftDone && (
							<form
								className="vpm-gift-form"
								onSubmit={(e) => { e.preventDefault(); giftMutation.mutate(); }}
							>
								<span className="vpm-gift-label">Gift Protocol: Command to</span>
								<input
									className="vpm-gift-input"
									type="text"
									placeholder="commander username"
									value={giftUsername}
									onChange={(e) => setGiftUsername(e.target.value)}
									required
									autoFocus
									disabled={giftMutation.isPending}
								/>
								<div className="vpm-gift-actions">
									{giftError && <p className="vpm-error">{giftError}</p>}
									<button
										type="button"
										className="vpm-gift-cancel"
										onClick={() => { setShowGift(false); setGiftError(null); }}
										disabled={giftMutation.isPending}
									>
										Cancel
									</button>
									<button
										type="submit"
										className="vpm-unlock-btn vpm-unlock-btn--gift"
										disabled={giftMutation.isPending || !giftUsername.trim()}
									>
										{giftMutation.isPending ? 'Sending…' : 'Send gift — 1,000 VP'}
									</button>
								</div>
							</form>
						)}
						{giftDone && (
							<div className="vpm-gift-done">
								<Sparkles size={13} aria-hidden="true" />
								Pass gifted to <strong>{giftDone}</strong> — they're ready for Protocol: Command.
							</div>
						)}
					</div>
				)}
			</div>
		</div>,
		document.body
	);
}
