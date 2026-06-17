'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { VP_PACKS } from '../constants/support';
import {
	MAX_PASS_LEVEL as MAX_LEVEL,
	PASS_ACT_LABELS as ACT_LABELS,
	PASS_COST_VP,
	PASS_LEVELS as LEVELS,
	XP_PER_LEVEL
} from '../constants/vexPass';
import { useAuth } from '../context/AuthContext';
import { claimBattlePassLevel, getMyNexuses, purchaseBattlePass } from '../services/api';
import '../styles/VexPassModal.css';
import ResourceIcon from './ResourceIcon';

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
	seasonEndsAt?: string | null;
}

// ── Reward string → human-readable label ─────────────────────────────────────
function fmtReward(raw: string | null): React.ReactNode[] {
	if (!raw) return [];
	return raw.split(',').map((part, i) => {
		const seg = part.trim();
		const [type, ...rest] = seg.split(':');

		if (type === 'resources') {
			// Format: resources:<biomass>:<alloy>:<ore>
			const biomass = Number(rest[0] ?? 0).toLocaleString();
			const alloy = Number(rest[1] ?? 0).toLocaleString();
			const ore = Number(rest[2] ?? 0).toLocaleString();
			return (
				<span key={i} className="vpm-r vpm-r--res">
					<ResourceIcon kind="biomass" size={10} labelled={false} />
					{biomass}
					<ResourceIcon kind="alloy" size={10} labelled={false} />
					{alloy}
					<ResourceIcon kind="ore" size={10} labelled={false} />
					{ore}
				</span>
			);
		}
		if (type === 'boost') {
			const pct = rest[1] ?? '?';
			const hrs = rest[2] ?? '?';
			return (
				<span key={i} className="vpm-r vpm-r--boost">
					Production +{pct}% / {hrs}h
				</span>
			);
		}
		if (type === 'title') {
			return (
				<span key={i} className="vpm-r vpm-r--title">
					Service title: {rest.join(':')}
				</span>
			);
		}
		if (type === 'badge') {
			const tier = rest[0] ?? '';
			return (
				<span key={i} className="vpm-r vpm-r--badge">
					{tier.charAt(0).toUpperCase() + tier.slice(1)} service ribbon
				</span>
			);
		}
		if (type === 'vexpoints') {
			return (
				<span key={i} className="vpm-r vpm-r--vp">
					{rest[0]} VP
				</span>
			);
		}
		if (type === 'token') {
			const count = Number(rest[0] ?? 1);
			return (
				<span key={i} className="vpm-r vpm-r--token">
					{count} Supporter Token{count !== 1 ? 's' : ''}
				</span>
			);
		}
		return (
			<span key={i} className="vpm-r">
				{seg}
			</span>
		);
	});
}

export default function VexPassModal({ pass, onClose, seasonEndsAt }: Props) {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [error, setError] = React.useState<string | null>(null);
	const [nexuses, setNexuses] = React.useState<Nexus[]>([]);
	const [selectedNexusId, setSelectedNexusId] = React.useState<number | null>(null);
	const [claimingLevel, setClaimingLevel] = React.useState<number | null>(null);
	const [claimError, setClaimError] = React.useState<string | null>(null);
	const [confirmingPurchase, setConfirmingPurchase] = React.useState(false);
	// Local shadow of claimed levels so UI updates instantly without a refetch
	const [localClaimed, setLocalClaimed] = React.useState<number[]>(pass.claimedLevels ?? []);

	const vexPoints = user?.vexPoints ?? 0;
	const canAfford = vexPoints >= PASS_COST_VP;

	const xpIntoLevel = pass.seasonXp - pass.passLevel * XP_PER_LEVEL;
	const xpPct = Math.min((xpIntoLevel / XP_PER_LEVEL) * 100, 100);
	const isMaxed = pass.passLevel >= MAX_LEVEL;

	const seasonEndLabel = React.useMemo(() => {
		if (!seasonEndsAt) return null;
		const ms = new Date(seasonEndsAt).getTime() - Date.now();
		if (ms <= 0) return 'Season ended';
		const days = Math.ceil(ms / 86400000);
		const date = new Date(seasonEndsAt).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
		return `Season ends ${date} · ${days}d left`;
	}, [seasonEndsAt]);

	// Load nexuses once for the claim selector
	React.useEffect(() => {
		getMyNexuses()
			.then((r) => {
				const list: Nexus[] = (r.data as any[]).map((n: any) => ({
					id: n.id ?? n._id,
					name: n.name
				}));
				setNexuses(list);
				if (list.length > 0) setSelectedNexusId(list[0].id);
			})
			.catch(() => {});
	}, []);

	React.useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
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

	async function handleClaim(level: number) {
		if (!selectedNexusId) {
			setClaimError('Select a nexus first');
			return;
		}
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
			<div
				className="vpm-modal"
				role="dialog"
				aria-label="Season One campaign record"
				onClick={(e) => e.stopPropagation()}
			>
				{/* ── Header ── */}
				<div className="vpm-header">
					<div className="vpm-header-left">
						<div>
							<div className="vpm-kicker">Commander service ledger</div>
							<div className="vpm-title">Season One Campaign</div>
							<div className="vpm-subtitle">Campaign record / 50 ranks</div>
							{seasonEndLabel && <div className="vpm-season-timer">{seasonEndLabel}</div>}
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
							Campaign rank <strong>{pass.passLevel}</strong>
							{pass.passTitle && <span className="vpm-active-title">{pass.passTitle}</span>}
						</span>
						<span className="vpm-xp-label">
							{isMaxed ? 'Campaign complete' : `${xpIntoLevel} / ${XP_PER_LEVEL} campaign XP`}
						</span>
					</div>
					<div
						className="vpm-bar"
						role="progressbar"
						aria-valuenow={xpPct}
						aria-valuemin={0}
						aria-valuemax={100}
					>
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
							<span key={lvl} style={{ left: `${(lvl / MAX_LEVEL) * 100}%` }}>
								{lvl}
							</span>
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
								<option key={n.id} value={n.id}>
									{n.name}
								</option>
							))}
						</select>
						{claimError && <span className="vpm-claim-error">{claimError}</span>}
					</div>
				)}

				{/* ── Column headers (sticky) ── */}
				<div className="vpm-col-headers">
					<div className="vpm-col-lv">Rank</div>
					<div className="vpm-col-free">
						<span className="vpm-track-badge vpm-track-badge--free">Standard</span>
						Field issue
					</div>
					<div className="vpm-col-paid">
						<span className="vpm-track-badge vpm-track-badge--paid">Authorized</span>
						Command pass
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
								{isActHeader && <div className="vpm-act-divider">{isActHeader}</div>}
								<div
									className={[
										'vpm-row',
										isClaimed ? 'vpm-row--claimed' : '',
										isClaimable ? 'vpm-row--claimable' : '',
										isCurrentLevel ? 'vpm-row--current' : '',
										isCapstone ? 'vpm-row--capstone' : ''
									]
										.filter(Boolean)
										.join(' ')}
								>
									<div className="vpm-row-lv">
										{isClaimed ? (
											<span className="vpm-row-lv-done" aria-label="Collected">
												Issued
											</span>
										) : isEarned ? (
											<span className="vpm-row-lv-num vpm-row-lv-num--ready">{row.level}</span>
										) : (
											<span
												className={
													isCurrentLevel ? 'vpm-row-lv-num vpm-row-lv-num--next' : 'vpm-row-lv-num'
												}
											>
												{row.level}
											</span>
										)}
									</div>
									<div className="vpm-row-free">{fmtReward(row.free)}</div>
									<div className={`vpm-row-paid${pass.hasPaidPass ? '' : ' vpm-row-paid--locked'}`}>
										{fmtReward(row.paid)}
									</div>
									{/* Claim button — only on earned, unclaimed rows */}
									{isClaimable && (
										<div className="vpm-row-claim">
											<button
												className="vpm-claim-btn"
												onClick={() => handleClaim(row.level)}
												disabled={isThisLoading || !selectedNexusId}
												aria-label={`Collect rank ${row.level} issue`}
											>
												{isThisLoading ? 'Collecting...' : 'Collect issue'}
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
							<span className="vpm-footer-vp-label">Available credit</span>
							<span
								className={`vpm-footer-vp-balance${canAfford ? ' vpm-footer-vp-balance--ok' : ' vpm-footer-vp-balance--low'}`}
							>
								{vexPoints.toLocaleString()} VP
							</span>
						</div>
						<div className="vpm-footer-actions">
							{error && <p className="vpm-error">{error}</p>}
							{canAfford ? (
								confirmingPurchase ? (
									<div className="vpm-confirm-row">
										<button
											className="vpm-unlock-btn"
											onClick={() => {
												setConfirmingPurchase(false);
												mutation.mutate();
											}}
											disabled={mutation.isPending}
										>
											{mutation.isPending ? 'Authorizing...' : 'Confirm — spend 1,000 VP'}
										</button>
										<button className="vpm-cancel-btn" onClick={() => setConfirmingPurchase(false)}>
											Cancel
										</button>
									</div>
								) : (
									<button
										className="vpm-unlock-btn"
										onClick={() => setConfirmingPurchase(true)}
										disabled={mutation.isPending}
									>
										Add Command Pass (1,000 VP)
									</button>
								)
							) : (
								<div className="vpm-need-vp">
									<p className="vpm-need-vp-text">
										You need <strong>{(PASS_COST_VP - vexPoints).toLocaleString()} more VP</strong>.
										Add credit below to authorize Command Pass rewards.
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
						<span>Command Pass authorized. Collect earned supplies from the ledger above.</span>
					</div>
				)}

				{/* Gift pass moved to Vex Shop → Gift Pass tab */}
			</div>
		</div>,
		document.body
	);
}
