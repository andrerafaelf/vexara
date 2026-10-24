'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { VP_PACKS } from '../constants/support';
import {
	MAX_PASS_LEVEL as MAX_LEVEL,
	PASS_ACT_LABELS as ACT_LABELS,
	PASS_CACHE_REWARD,
	PASS_COST_VP,
	PASS_LEVELS as LEVELS,
	PASS_PACING_BASE_LEVELS,
	PASS_PACING_LEVELS_PER_DAY
} from '../constants/vexPass';
import { useAuth } from '../context/AuthContext';
import { useNow } from '../hooks/useNow';
import {
	claimBattlePassCache,
	claimBattlePassLevel,
	getMyNexuses,
	purchaseBattlePass
} from '../services/api';
import '../styles/VexPassModal.css';
import ResourceIcon from './ResourceIcon';

export interface PassState {
	passXp: number;
	passLevel: number;
	xpPerLevel: number;
	xpIntoLevel: number;
	hasPaidPass: boolean;
	passTitle: string | null;
	claimed: { free: number[]; paid: number[] };
	caches: {
		earned: number;
		claimed: number;
		claimable: number;
		bankCap: number;
		nextCacheAtXp: number | null;
		reward: string;
	};
	xp: { today: number; dailyCap: number };
	pacing: {
		anchor: string;
		claimableUpToLevel: number;
		cachesUnlockAt: string | null;
		speedMultiplier: number;
	} | null;
}

interface Nexus {
	id: number;
	name: string;
}

interface Resources {
	biomass: number;
	alloy: number;
	ore: number;
}

interface ClaimResponse {
	success: boolean;
	level: number;
	tracks: string[];
	delivered: Resources;
	wasted: Resources;
}

interface Props {
	pass: PassState;
	onClose: () => void;
}

type LevelRow = (typeof LEVELS)[number];

const HOURS_PER_PACED_LEVEL = 24 / PASS_PACING_LEVELS_PER_DAY;

// Time (ms since epoch) at which the per-galaxy pacing allowance reaches `level`.
// Mirrors pacingUnlocksAt() on the server, which stays the authority on a refused claim.
function pacingUnlockMs(anchor: string, speed: number, level: number): number {
	const ms =
		(Math.max(0, level - PASS_PACING_BASE_LEVELS) * HOURS_PER_PACED_LEVEL * 3_600_000) /
		(speed > 0 ? speed : 1);
	return new Date(anchor).getTime() + ms;
}

function fmtDaysHours(ms: number): string {
	const totalHours = Math.max(0, Math.ceil(ms / 3_600_000));
	return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}

// Ticks on the shared server-anchored clock; only mounted for locked rows.
function UnlockCountdown({ unlockMs, prefix }: { unlockMs: number; prefix: string }) {
	const now = useNow();
	const queryClient = useQueryClient();
	const elapsed = now !== 0 && unlockMs - now <= 0;
	// Refetch as soon as the lock lapses so the Collect button appears without
	// waiting for the 60s background refresh.
	React.useEffect(() => {
		if (elapsed) queryClient.invalidateQueries({ queryKey: ['battlePass'] });
	}, [elapsed, queryClient]);
	if (now === 0) return null;
	const left = unlockMs - now;
	return <>{left <= 0 ? 'Unlocking now' : `${prefix} ${fmtDaysHours(left)}`}</>;
}

function rewardHasResources(raw: string | null): boolean {
	return !!raw && raw.split(',').some((p) => p.trim().startsWith('resources:'));
}

function rewardHasBoost(raw: string | null): boolean {
	return !!raw && raw.split(',').some((p) => p.trim().startsWith('boost:'));
}

function fmtRes(r: Resources): string {
	return `${r.biomass.toLocaleString()} Biomass, ${r.alloy.toLocaleString()} Alloy, ${r.ore.toLocaleString()} Ore`;
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

export default function VexPassModal({ pass, onClose }: Props) {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [error, setError] = React.useState<string | null>(null);
	const [nexuses, setNexuses] = React.useState<Nexus[]>([]);
	const [selectedNexusId, setSelectedNexusId] = React.useState<number | null>(null);
	const [claimingKey, setClaimingKey] = React.useState<string | null>(null);
	const [claimError, setClaimError] = React.useState<string | null>(null);
	const [claimErrorReason, setClaimErrorReason] = React.useState<string | null>(null);
	const [claimNotes, setClaimNotes] = React.useState<string[]>([]);
	const [boostNote, setBoostNote] = React.useState(false);
	const [confirmingPurchase, setConfirmingPurchase] = React.useState(false);
	// Local shadow of claimed tracks so the UI updates instantly, before the refetch lands.
	const [localFree, setLocalFree] = React.useState<number[]>([]);
	const [localPaid, setLocalPaid] = React.useState<number[]>([]);

	const vexPoints = user?.vexPoints ?? 0;
	const canAfford = vexPoints >= PASS_COST_VP;

	const { passLevel, xpPerLevel, xpIntoLevel, hasPaidPass, pacing, caches, xp } = pass;
	const xpPct = xpPerLevel > 0 ? Math.min((xpIntoLevel / xpPerLevel) * 100, 100) : 0;
	const isMaxed = passLevel >= MAX_LEVEL;
	const hasGalaxy = pacing !== null;

	const freeClaimed = React.useMemo(
		() => new Set([...pass.claimed.free, ...localFree]),
		[pass.claimed.free, localFree]
	);
	const paidClaimed = React.useMemo(
		() => new Set([...pass.claimed.paid, ...localPaid]),
		[pass.claimed.paid, localPaid]
	);

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

	function refreshAfterClaim() {
		queryClient.invalidateQueries({ queryKey: ['battlePass'] });
		queryClient.invalidateQueries({ queryKey: ['user'] });
		queryClient.invalidateQueries({ queryKey: ['myNexuses'] });
		queryClient.invalidateQueries({ queryKey: ['nexuses'] });
	}

	const mutation = useMutation({
		mutationFn: () => purchaseBattlePass().then((r) => r.data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['battlePass'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			onClose();
		},
		onError: (err: any) => {
			setError(err?.response?.data?.error ?? 'Purchase failed');
		}
	});

	// Shared success/failure handling for level and cache claims.
	async function runClaim(
		key: string,
		call: (nexusId: number) => Promise<{ data: ClaimResponse }>,
		onOk?: (r: ClaimResponse) => void
	) {
		if (!selectedNexusId) {
			setClaimError('Select a nexus first');
			setClaimErrorReason(null);
			return;
		}
		setClaimingKey(key);
		setClaimError(null);
		setClaimErrorReason(null);
		setClaimNotes([]);
		setBoostNote(false);
		try {
			const result = (await call(selectedNexusId)).data;
			const notes: string[] = [];
			const w = result.wasted;
			if (w && (w.biomass > 0 || w.alloy > 0 || w.ore > 0)) {
				notes.push(`Storage was nearly full, so part of the reward was lost: ${fmtRes(w)}.`);
			}
			onOk?.(result);
			setClaimNotes(notes);
			refreshAfterClaim();
		} catch (err: any) {
			setClaimError(err?.response?.data?.error ?? 'Claim failed');
			setClaimErrorReason(err?.response?.data?.reason ?? null);
			// A stale view (another tab claimed, pacing moved) is fixed by a refetch.
			queryClient.invalidateQueries({ queryKey: ['battlePass'] });
		} finally {
			setClaimingKey(null);
		}
	}

	function handleClaim(row: LevelRow) {
		void runClaim(
			`level:${row.level}`,
			(nexusId) => claimBattlePassLevel(row.level, nexusId) as Promise<{ data: ClaimResponse }>,
			(result) => {
				const tracks = result.tracks ?? [];
				const gotFree = tracks.includes('free');
				const gotPaid = tracks.includes('paid');
				if (gotFree) setLocalFree((prev) => [...prev, row.level]);
				if (gotPaid) setLocalPaid((prev) => [...prev, row.level]);
				// Boosts never stack: the server applies the strongest active one.
				if ((gotFree && rewardHasBoost(row.free)) || (gotPaid && rewardHasBoost(row.paid))) {
					setBoostNote(true);
				}
			}
		);
	}

	function handleClaimCache() {
		void runClaim('cache', (nexusId) => claimBattlePassCache(nexusId) as Promise<{ data: ClaimResponse }>);
	}

	if (typeof document === 'undefined') return null;

	const noGalaxyHint = 'Join a galaxy to claim rewards';

	// What a claim of this level would hand out right now.
	function pendingTracks(row: LevelRow) {
		const reached = row.level <= passLevel;
		const freePending = reached && !!row.free && !freeClaimed.has(row.level);
		const paidPending = reached && hasPaidPass && !!row.paid && !paidClaimed.has(row.level);
		return { freePending, paidPending };
	}

	// Pacing only gates claims that carry resources (matches the server rule).
	function pacedUnlockMs(row: LevelRow, freePending: boolean, paidPending: boolean): number | null {
		if (!pacing || row.level <= pacing.claimableUpToLevel) return null;
		const carries =
			(freePending && rewardHasResources(row.free)) || (paidPending && rewardHasResources(row.paid));
		if (!carries) return null;
		return pacingUnlockMs(pacing.anchor, pacing.speedMultiplier, row.level);
	}

	const hasClaimableLevel = LEVELS.some((row) => {
		const t = pendingTracks(row);
		return t.freePending || t.paidPending;
	});
	const showNexusBar = hasGalaxy && (hasClaimableLevel || caches.claimable > 0) && nexuses.length > 0;
	const showStatusBar = showNexusBar || !!claimError || claimNotes.length > 0 || boostNote;

	// Resource Cache progress toward the next cache.
	const cacheBankFull = caches.nextCacheAtXp === null;
	const cacheXpLeft = caches.nextCacheAtXp !== null ? Math.max(0, caches.nextCacheAtXp - pass.passXp) : 0;
	const cachePct =
		caches.nextCacheAtXp !== null && xpPerLevel > 0
			? Math.min(100, Math.max(0, ((xpPerLevel - cacheXpLeft) / xpPerLevel) * 100))
			: 100;
	const cachesUnlockMs = pacing?.cachesUnlockAt ? new Date(pacing.cachesUnlockAt).getTime() : null;
	const cacheClaimLocked = !hasGalaxy || cachesUnlockMs !== null;

	return createPortal(
		<div className="vpm-backdrop" onClick={onClose}>
			<div
				className="vpm-modal"
				role="dialog"
				aria-label="Vex Pass"
				onClick={(e) => e.stopPropagation()}
			>
				{/* ── Header ── */}
				<div className="vpm-header">
					<div className="vpm-header-left">
						<div>
							<div className="vpm-kicker">Commander service ledger</div>
							<div className="vpm-title">Vex Pass</div>
							<div className="vpm-subtitle">Permanent account pass / 50 levels</div>
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
							Level <strong>{passLevel}</strong>
							{pass.passTitle && <span className="vpm-active-title">{pass.passTitle}</span>}
						</span>
						<span className="vpm-xp-label">
							{isMaxed ? `Level ${MAX_LEVEL} reached` : `${xpIntoLevel} / ${xpPerLevel} XP`}
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
								className={`vpm-bar-pip${passLevel >= lvl ? ' vpm-bar-pip--done' : ''}`}
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
					<div className="vpm-daily-xp">
						Today: {xp.today.toLocaleString()} / {xp.dailyCap.toLocaleString()} XP (resets at 00:00 UTC)
					</div>
				</div>

				{/* ── Status strip: no galaxy / pacing explainer ── */}
				{!hasGalaxy ? (
					<div className="vpm-note vpm-note--warn">
						{noGalaxyHint}. Your pass progress is saved on your account.
					</div>
				) : (
					<div className="vpm-note">
						In a galaxy you joined recently, pass rewards open up to level {PASS_PACING_BASE_LEVELS} right
						away, then {PASS_PACING_LEVELS_PER_DAY} more levels per day.
					</div>
				)}

				{/* ── Nexus selector and claim feedback ── */}
				{showStatusBar && (
					<div className="vpm-nexus-bar">
						{showNexusBar && (
							<>
								<span className="vpm-nexus-bar-label">Deposit resources to</span>
								<select
									className="vpm-nexus-select"
									value={selectedNexusId ?? ''}
									onChange={(e) => {
										setSelectedNexusId(Number(e.target.value));
										setClaimError(null);
										setClaimErrorReason(null);
									}}
								>
									{nexuses.map((n) => (
										<option key={n.id} value={n.id}>
											{n.name}
										</option>
									))}
								</select>
							</>
						)}
						{claimError && (
							<span
								className={`vpm-claim-error${claimErrorReason === 'storage' ? ' vpm-claim-error--storage' : ''}`}
								role="alert"
							>
								{claimError}
							</span>
						)}
						{claimNotes.map((n) => (
							<span key={n} className="vpm-claim-note">
								{n}
							</span>
						))}
						{boostNote && (
							<span className="vpm-claim-note">
								Production boosts do not stack: only the strongest active boost applies.
							</span>
						)}
					</div>
				)}

				{/* ── Column headers (sticky) ── */}
				<div className="vpm-col-headers">
					<div className="vpm-col-lv">Level</div>
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
						const isEarned = row.level <= passLevel;
						const { freePending, paidPending } = pendingTracks(row);
						const isClaimable = freePending || paidPending;
						// Greyed out once the free half is collected and the paid half is
						// either collected or not claimable (no paid pass).
						const isFullyClaimed = isEarned && !isClaimable;
						const lockedUntil = pacedUnlockMs(row, freePending, paidPending);
						const isCurrentLevel = row.level === passLevel + 1;
						const isCapstone = row.level === 50;
						const isThisLoading = claimingKey === `level:${row.level}`;
						const paidOnlyPending = !freePending && paidPending;

						return (
							<React.Fragment key={row.level}>
								{isActHeader && <div className="vpm-act-divider">{isActHeader}</div>}
								<div
									className={[
										'vpm-row',
										isFullyClaimed ? 'vpm-row--claimed' : '',
										isClaimable ? 'vpm-row--claimable' : '',
										isCurrentLevel ? 'vpm-row--current' : '',
										isCapstone ? 'vpm-row--capstone' : ''
									]
										.filter(Boolean)
										.join(' ')}
								>
									<div className="vpm-row-lv">
										{isFullyClaimed ? (
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
									<div className={`vpm-row-paid${hasPaidPass ? '' : ' vpm-row-paid--locked'}`}>
										{fmtReward(row.paid)}
									</div>
									{/* Claim button: only on earned rows with something still to collect */}
									{isClaimable && (
										<div className="vpm-row-claim">
											{lockedUntil !== null ? (
												<span className="vpm-row-unlock">
													<UnlockCountdown unlockMs={lockedUntil} prefix="Unlocks in" />
												</span>
											) : (
												<button
													className="vpm-claim-btn"
													onClick={() => handleClaim(row)}
													disabled={isThisLoading || !selectedNexusId || !hasGalaxy}
													title={!hasGalaxy ? noGalaxyHint : undefined}
													aria-label={`${paidOnlyPending ? 'Claim paid reward for' : 'Collect'} level ${row.level}`}
												>
													{isThisLoading
														? 'Collecting...'
														: !hasGalaxy
															? noGalaxyHint
															: paidOnlyPending
																? 'Claim paid reward'
																: 'Collect issue'}
												</button>
											)}
										</div>
									)}
								</div>
							</React.Fragment>
						);
					})}
				</div>

				{/* ── Resource Caches (repeatable after level 50) ── */}
				<div className="vpm-caches">
					<div className="vpm-caches-head">
						<span className="vpm-caches-title">Resource Caches</span>
						{caches.claimable > 0 && <span className="vpm-caches-badge">{caches.claimable} ready</span>}
						<span className="vpm-caches-bank">
							Bank {caches.claimable} / {caches.bankCap}
						</span>
					</div>
					<div className="vpm-caches-body">
						<div className="vpm-caches-info">
							<span className="vpm-caches-reward">
								{passLevel < MAX_LEVEL ? 'After level 50, every 200 XP earns a cache: ' : 'Each cache: '}
								{fmtReward(caches.reward || PASS_CACHE_REWARD)}
							</span>
							<div
								className="vpm-bar vpm-bar--cache"
								role="progressbar"
								aria-valuenow={cachePct}
								aria-valuemin={0}
								aria-valuemax={100}
							>
								<div className="vpm-bar-fill" style={{ width: `${cachePct}%` }} />
							</div>
							<span className="vpm-caches-progress">
								{cacheBankFull
									? 'Bank full: cache progress is paused until you claim one.'
									: `${cacheXpLeft.toLocaleString()} XP to the next cache`}
							</span>
							{cachesUnlockMs !== null && (
								<span className="vpm-row-unlock">
									<UnlockCountdown unlockMs={cachesUnlockMs} prefix="Caches unlock in this galaxy in" />
								</span>
							)}
						</div>
						{caches.claimable > 0 && (
							<button
								className="vpm-claim-btn"
								onClick={handleClaimCache}
								disabled={claimingKey === 'cache' || !selectedNexusId || cacheClaimLocked}
								title={!hasGalaxy ? noGalaxyHint : undefined}
							>
								{claimingKey === 'cache'
									? 'Collecting...'
									: !hasGalaxy
										? noGalaxyHint
										: 'Claim cache'}
							</button>
						)}
					</div>
				</div>

				{/* ── Footer CTA ── */}
				{!hasPaidPass && (
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
											{mutation.isPending ? 'Authorizing...' : 'Confirm: spend 1,000 VP'}
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

				{hasPaidPass && (
					<div className="vpm-footer vpm-footer--owned">
						<span>Command Pass authorized. Collect earned supplies from the ledger above.</span>
					</div>
				)}

				{/* Gift pass lives in Vex Shop, Gift Pass tab */}
			</div>
		</div>,
		document.body
	);
}
