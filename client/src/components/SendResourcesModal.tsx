'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import { getFactionNexuses, transferResources } from '../services/api';
import '../styles/SendResourcesModal.css';
import type { Nexus } from '../types/game';
import { fmtAmount, liveResources, type LiveResources } from './resourceUtils';

type ResKind = 'biomass' | 'alloy' | 'ore';
const RES_KINDS: ResKind[] = ['biomass', 'alloy', 'ore'];
const RES_LABEL: Record<ResKind, string> = { biomass: 'Biomass', alloy: 'Alloy', ore: 'Ore' };

// Must match server FACTION_TRANSFER_TAX in nexusController.ts. Resources sent to
// a faction-mate lose this fraction in transit; own-empire transfers are lossless.
const FACTION_TRANSFER_TAX = 0.1;

// When opened from a Supply [Send] button we pre-fill a sensible top-up: bring
// the destination toward this fraction of its cap, clamped to what the source can
// spare and what the destination can hold. The player can still edit every field.
const TOPUP_TARGET_RATIO = 0.8;

type Recipient = 'empire' | 'faction';

// Faction nexuses come back shaped like Nexus plus the owner's name for labeling.
type FactionNexus = Nexus & { ownerUsername?: string | null };

export interface SendResourcesPrefill {
	fromNexusId?: string;
	toNexusId?: string;
	// 'topup' => suggest amounts to fill the destination; undefined => blank inputs.
	suggest?: 'topup';
}

interface Props {
	nexuses: Nexus[];
	prefill?: SendResourcesPrefill;
	onClose: () => void;
	// Bubble up so the parent can refetch nexus state after a successful transfer.
	onTransferred?: () => void;
}

// Free storage headroom on a destination, per resource, from its live (projected)
// balance. This is what the server will actually accept — showing it here means
// the player never overflows and never has to "remember the storage limit".
function headroomOf(live: LiveResources): Record<ResKind, number> {
	return {
		biomass: Math.max(0, Math.floor(live.cap - live.biomass)),
		alloy: Math.max(0, Math.floor(live.cap - live.alloy)),
		ore: Math.max(0, Math.floor(live.cap - live.ore))
	};
}

export default function SendResourcesModal({ nexuses, prefill, onClose, onTransferred }: Props) {
	const toast = useToast();
	const [now] = useState(() => Date.now());

	const [mode, setMode] = useState<Recipient>('empire');
	const [factionNexuses, setFactionNexuses] = useState<FactionNexus[]>([]);
	const [factionLoaded, setFactionLoaded] = useState(false);

	const [fromId, setFromId] = useState<string>(prefill?.fromNexusId ?? nexuses[0]?._id ?? '');
	const [toId, setToId] = useState<string>(() => {
		if (prefill?.toNexusId) return prefill.toNexusId;
		const first = nexuses.find((n) => n._id !== (prefill?.fromNexusId ?? nexuses[0]?._id));
		return first?._id ?? '';
	});
	const [amounts, setAmounts] = useState<Record<ResKind, string>>({
		biomass: '',
		alloy: '',
		ore: ''
	});
	const [sending, setSending] = useState(false);

	const taxRate = mode === 'faction' ? FACTION_TRANSFER_TAX : 0;

	useEffect(() => {
		const lockClass = 'srm-scroll-locked';
		const hadLockClass = document.body.classList.contains(lockClass);
		const previousOverflow = document.body.style.overflow;
		document.body.classList.add(lockClass);
		document.body.style.overflow = 'hidden';
		return () => {
			if (!hadLockClass) document.body.classList.remove(lockClass);
			document.body.style.overflow = previousOverflow;
		};
	}, []);

	// Lazy-load faction nexuses the first time the player switches to Faction mode.
	useEffect(() => {
		if (mode !== 'faction' || factionLoaded) return;
		let cancelled = false;
		getFactionNexuses()
			.then((r) => {
				if (cancelled) return;
				setFactionNexuses(r.data ?? []);
				setFactionLoaded(true);
			})
			.catch(() => {
				if (cancelled) return;
				setFactionLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [mode, factionLoaded]);

	// Source is always one of your own nexuses. Destination depends on mode.
	const destPool: Array<Nexus | FactionNexus> = mode === 'faction' ? factionNexuses : nexuses;

	// Keep the destination valid when the pool changes (e.g. switching modes).
	useEffect(() => {
		const valid = destPool.some((n) => n._id === toId);
		if (!valid) {
			const first = mode === 'faction' ? destPool[0] : destPool.find((n) => n._id !== fromId);
			setToId(first?._id ?? '');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, factionNexuses.length]);

	const from = useMemo(() => nexuses.find((n) => n._id === fromId), [nexuses, fromId]);
	const to = useMemo(() => destPool.find((n) => n._id === toId), [destPool, toId]);

	const fromLive = useMemo(() => (from ? liveResources(from, now) : null), [from, now]);
	const toLive = useMemo(() => (to ? liveResources(to, now) : null), [to, now]);
	const headroom = useMemo(() => (toLive ? headroomOf(toLive) : null), [toLive]);

	// Amount DELIVERED for a given spend, after the faction tax.
	const deliver = (spent: number) => Math.floor(spent * (1 - taxRate));

	// Largest amount of `res` we could actually SPEND: bounded by what the source
	// has AND by the spend whose post-tax delivery still fits the destination's
	// headroom. Drives the Max buttons and the smart-suggest prefill identically.
	const maxSendable = useMemo(() => {
		return (res: ResKind): number => {
			if (!fromLive || !headroom) return 0;
			const have = Math.floor(fromLive[res]);
			const room = headroom[res];
			const maxSpendByRoom = taxRate > 0 ? Math.floor(room / (1 - taxRate)) : room;
			return Math.max(0, Math.min(have, maxSpendByRoom));
		};
	}, [fromLive, headroom, taxRate]);

	// Apply the smart top-up suggestion whenever the source/destination pair (or the
	// prefill intent / mode) changes. Only runs for suggest === 'topup'.
	useEffect(() => {
		if (prefill?.suggest !== 'topup' || !toLive || !fromLive || !headroom) return;
		const next: Record<ResKind, string> = { biomass: '', alloy: '', ore: '' };
		for (const res of RES_KINDS) {
			const target = Math.floor(toLive.cap * TOPUP_TARGET_RATIO);
			const deficit = Math.max(0, target - Math.floor(toLive[res]));
			// `deficit` is how much the destination should RECEIVE; gross it up by the
			// tax to get the spend, then clamp to what we can actually send.
			const grossed = taxRate > 0 ? Math.ceil(deficit / (1 - taxRate)) : deficit;
			const send = Math.min(grossed, maxSendable(res));
			next[res] = send > 0 ? String(send) : '';
		}
		setAmounts(next);
		// fromId/toId capture the pair; prefill.suggest the intent; mode the tax.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fromId, toId, prefill?.suggest, mode, toLive?.cap]);

	const setMax = (res: ResKind) => {
		setAmounts((a) => ({ ...a, [res]: String(maxSendable(res)) }));
	};

	const parsed: Record<ResKind, number> = {
		biomass: parseInt(amounts.biomass) || 0,
		alloy: parseInt(amounts.alloy) || 0,
		ore: parseInt(amounts.ore) || 0
	};
	const total = parsed.biomass + parsed.alloy + parsed.ore;
	const totalDelivered = RES_KINDS.reduce((s, res) => s + deliver(parsed[res]), 0);
	const totalTax = total - totalDelivered;

	// Will any field be clamped by the server? Mirror its logic so we can warn first.
	const willClamp =
		!!headroom && RES_KINDS.some((res) => parsed[res] > maxSendable(res) && maxSendable(res) >= 0);

	const sameNexus = mode === 'empire' && fromId === toId;
	const noFactionTargets = mode === 'faction' && factionLoaded && factionNexuses.length === 0;
	const canSend = !!from && !!to && !sameNexus && total > 0 && !sending;

	const handleSend = async () => {
		if (!from || !to || sameNexus) return;
		if (total <= 0) {
			toast('Enter at least one amount to send', 'error');
			return;
		}
		setSending(true);
		try {
			const res = await transferResources(fromId, toId, parsed.biomass, parsed.alloy, parsed.ore);
			const label =
				mode === 'faction'
					? `${(to as FactionNexus).ownerUsername ?? 'your ally'} · ${to.name}`
					: to.name;
			if (res?.data?.clamped) {
				toast(`Partly sent to ${label}, storage was nearly full.`, 'info');
			} else if (mode === 'faction') {
				toast(`Resources sent to ${label} (10% transit tax applied).`, 'success');
			} else {
				toast(`Resources sent to ${label}`, 'success');
			}
			setAmounts({ biomass: '', alloy: '', ore: '' });
			onTransferred?.();
			onClose();
		} catch (err) {
			const message =
				(err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
				'Transfer failed';
			toast(message, 'error');
		} finally {
			setSending(false);
		}
	};

	const ownLabel = (n: Nexus) => `${n.name} (${n.x}|${n.y})`;
	const destLabel = (n: Nexus | FactionNexus) =>
		mode === 'faction'
			? `${(n as FactionNexus).ownerUsername ?? '?'} · ${n.name} (${n.x}|${n.y})`
			: ownLabel(n);

	// Portal to <body>: the modal is rendered deep inside NexusView, where a
	// transformed/filtered ancestor (animations, mobile drawer, nav progress)
	// becomes the containing block for `position: fixed` — that's what pinned the
	// modal off-centre and clipped it on mobile. Mounting on body makes `fixed`
	// resolve against the viewport so the flex-centered backdrop centres correctly.
	if (typeof document === 'undefined') return null;

	return createPortal(
		<div className="srm-backdrop" onClick={onClose}>
			<div
				className="srm-modal"
				role="dialog"
				aria-label="Send resources"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="srm-header">
					<h2 className="srm-title">Send Resources</h2>
					<button className="srm-close" onClick={onClose} aria-label="Close">
						×
					</button>
				</div>

				{/* Recipient mode: your own empire (lossless) or a faction-mate (10% tax). */}
				<div className="srm-recipient-row">
					<span className="srm-recipient-label">Recipient</span>
					<div className="srm-recipient-tabs">
						<button
							className={`srm-recipient-tab${mode === 'empire' ? ' active' : ''}`}
							type="button"
							onClick={() => setMode('empire')}
						>
							My Empire
						</button>
						<button
							className={`srm-recipient-tab${mode === 'faction' ? ' active' : ''}`}
							type="button"
							onClick={() => setMode('faction')}
						>
							Faction
						</button>
					</div>
				</div>

				<div className="srm-route">
					<label className="srm-field">
						<span className="srm-field-label">From</span>
						<select value={fromId} onChange={(e) => setFromId(e.target.value)}>
							{nexuses.map((n) => (
								<option key={n._id} value={n._id}>
									{ownLabel(n)}
								</option>
							))}
						</select>
					</label>
					<span className="srm-arrow" aria-hidden="true">
						→
					</span>
					<label className="srm-field">
						<span className="srm-field-label">To</span>
						<select
							value={toId}
							onChange={(e) => setToId(e.target.value)}
							disabled={noFactionTargets}
						>
							{destPool
								.filter((n) => mode === 'faction' || n._id !== fromId)
								.map((n) => (
									<option key={n._id} value={n._id}>
										{destLabel(n)}
									</option>
								))}
						</select>
					</label>
				</div>

				{sameNexus && <p className="srm-warn">Pick two different nexuses to transfer between.</p>}
				{noFactionTargets && (
					<p className="srm-warn">
						No faction members to send to, join a faction, or your faction-mates have no eligible
						nexuses (new players under protection can&apos;t receive).
					</p>
				)}
				{mode === 'faction' && !noFactionTargets && (
					<p className="srm-warn srm-warn--tax">
						Faction sends pay a <strong>10% transit tax</strong>, the recipient gets 90% of what you
						send.
					</p>
				)}

				<div className="srm-rows">
					{RES_KINDS.map((res) => {
						const have = fromLive ? Math.floor(fromLive[res]) : 0;
						const room = headroom ? headroom[res] : 0;
						const max = maxSendable(res);
						const over = parsed[res] > max;
						return (
							<div key={res} className="srm-row">
								<span className="srm-row-label">{RES_LABEL[res]}</span>
								<input
									type="number"
									min={0}
									max={max}
									placeholder="0"
									className={over ? 'srm-input srm-input--over' : 'srm-input'}
									value={amounts[res]}
									onChange={(e) => setAmounts((a) => ({ ...a, [res]: e.target.value }))}
									disabled={noFactionTargets}
								/>
								<button
									type="button"
									className="srm-max-btn"
									onClick={() => setMax(res)}
									disabled={max <= 0}
									title={`Send the most that fits: ${fmtAmount(max)}`}
								>
									Max
								</button>
								<span className="srm-row-meta">
									have {fmtAmount(have)} · room {fmtAmount(room)}
								</span>
							</div>
						);
					})}
				</div>

				{willClamp && (
					<p className="srm-warn srm-warn--clamp">
						Some amounts exceed what {to?.name ?? 'the destination'} can hold, the extra will be
						held back automatically.
					</p>
				)}

				<div className="srm-footer">
					<span className="srm-total">
						{mode === 'faction' && total > 0 ? (
							<>
								Sending <strong>{fmtAmount(total)}</strong> · they get{' '}
								<strong>{fmtAmount(totalDelivered)}</strong> (−{fmtAmount(totalTax)} tax)
							</>
						) : (
							<>
								Sending <strong>{fmtAmount(total)}</strong> total
							</>
						)}
					</span>
					<button className="srm-send-btn" onClick={handleSend} disabled={!canSend}>
						{sending ? 'Sending…' : 'Send Resources'}
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
}
