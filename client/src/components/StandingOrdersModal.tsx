'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import {
	createStandingOrder,
	deleteStandingOrder,
	getStandingOrders,
	setStandingOrderActive
} from '../services/api';
import '../styles/StandingOrdersModal.css';
import type { Nexus } from '../types/game';

// Mirrors the server's canStationTroop (utils/gameConstants.ts) and the same
// list Map.tsx's support/transfer pickers already use: any combat troop may be
// stationed except the non-deployables.
const TROOP_LABELS: Record<string, string> = {
	sentinelLancer: 'Sentinel Lancer',
	assaultTrooper: 'Assault Trooper',
	vanguardBreaker: 'Vanguard Breaker',
	wraithSkimmer: 'Wraith Skimmer',
	siegeMech: 'Siege Mech',
	bulwarkGuard: 'Bulwark Guard',
	aegisSkirmisher: 'Aegis Skirmisher',
	pyreSuppressor: 'Pyre Suppressor',
	arcDisruptor: 'Arc Disruptor',
	phantomLance: 'Phantom Lance',
	annihilatorPlatform: 'Annihilator Platform',
	voidStalker: 'Void Stalker',
	siegeColossus: 'Siege Colossus'
};
const STATIONABLE_TROOPS = Object.keys(TROOP_LABELS);

interface StandingOrder {
	id: number;
	protectedNexusId: number;
	sourceNexusId: number;
	troops: Record<string, number>;
	isActive: boolean;
	lastTriggeredAt: string | null;
	createdAt: string;
}

interface Props {
	nexus: Nexus;
	ownNexuses: Nexus[];
	onClose: () => void;
}

export default function StandingOrdersModal({ nexus, ownNexuses, onClose }: Props) {
	const toast = useToast();
	const [orders, setOrders] = useState<StandingOrder[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const otherNexuses = ownNexuses.filter((n) => n._id !== nexus._id);
	const [sourceId, setSourceId] = useState<string>(otherNexuses[0]?._id ?? '');
	const [amounts, setAmounts] = useState<Record<string, string>>({});

	useEffect(() => {
		const lockClass = 'som-scroll-locked';
		document.body.classList.add(lockClass);
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.classList.remove(lockClass);
			document.body.style.overflow = '';
		};
	}, []);

	const load = () => {
		setLoading(true);
		getStandingOrders()
			.then((r) => setOrders(r.data.orders ?? []))
			.catch(() => toast('Failed to load standing orders', 'error'))
			.finally(() => setLoading(false));
	};

	useEffect(load, []);

	const ordersForThisNexus = orders.filter((o) => String(o.protectedNexusId) === nexus._id);

	const nexusNameById = (id: number) =>
		ownNexuses.find((n) => n._id === String(id))?.name ?? `Nexus #${id}`;

	const handleCreate = async () => {
		if (!sourceId) {
			toast('Choose a reserve nexus', 'error');
			return;
		}
		const troops: Record<string, number> = {};
		for (const key of STATIONABLE_TROOPS) {
			const n = parseInt(amounts[key] || '0', 10);
			if (n > 0) troops[key] = n;
		}
		if (Object.values(troops).reduce((s, n) => s + n, 0) === 0) {
			toast('Select at least one troop', 'error');
			return;
		}
		setSaving(true);
		try {
			await createStandingOrder(nexus._id, sourceId, troops);
			toast('Standing order saved', 'success');
			setAmounts({});
			load();
		} catch (err: any) {
			toast(err?.response?.data?.error || err?.message || 'Failed to save standing order', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleToggle = async (order: StandingOrder) => {
		try {
			await setStandingOrderActive(order.id, !order.isActive);
			load();
		} catch (err: any) {
			toast(err?.response?.data?.error || 'Failed to update standing order', 'error');
		}
	};

	const handleDelete = async (order: StandingOrder) => {
		try {
			await deleteStandingOrder(order.id);
			toast('Standing order removed', 'success');
			load();
		} catch (err: any) {
			toast(err?.response?.data?.error || 'Failed to remove standing order', 'error');
		}
	};

	return createPortal(
		<div className="som-overlay" onClick={onClose}>
			<div className="som-modal" onClick={(e) => e.stopPropagation()}>
				<button className="som-close" onClick={onClose} aria-label="Close">
					×
				</button>
				<h2 className="som-title">Standing Orders — {nexus.name}</h2>
				<p className="som-subtitle">
					Auto-deploy reserve troops from another nexus the moment {nexus.name} is attacked by a
					real force. Each order has a 30-minute cooldown so one raid can't drain your reserve in
					one go, tiny probing attacks won't trigger it, and a defensive reserve is always left
					behind on the source nexus.
				</p>

				<div className="som-existing">
					{loading ? (
						<div className="som-empty">Loading…</div>
					) : ordersForThisNexus.length === 0 ? (
						<div className="som-empty">No standing orders for this nexus yet.</div>
					) : (
						ordersForThisNexus.map((order) => (
							<div key={order.id} className="som-order-row">
								<div className="som-order-info">
									<span className="som-order-source">
										From {nexusNameById(order.sourceNexusId)}
									</span>
									<span className="som-order-troops">
										{Object.entries(order.troops)
											.filter(([, n]) => n > 0)
											.map(([type, n]) => `${n} ${TROOP_LABELS[type] || type}`)
											.join(', ')}
									</span>
									{order.lastTriggeredAt && (
										<span className="som-order-triggered">
											Last triggered {new Date(order.lastTriggeredAt).toLocaleString()}
										</span>
									)}
								</div>
								<div className="som-order-actions">
									<button className="som-toggle" onClick={() => handleToggle(order)}>
										{order.isActive ? 'Active' : 'Paused'}
									</button>
									<button className="som-delete" onClick={() => handleDelete(order)}>
										Remove
									</button>
								</div>
							</div>
						))
					)}
				</div>

				<div className="som-new">
					<h3 className="som-new-title">New Standing Order</h3>
					{otherNexuses.length === 0 ? (
						<div className="som-empty">You need at least one other nexus to use as a reserve.</div>
					) : (
						<>
							<label className="som-field-label">Reserve nexus</label>
							<select
								className="som-select"
								value={sourceId}
								onChange={(e) => setSourceId(e.target.value)}
							>
								{otherNexuses.map((n) => (
									<option key={n._id} value={n._id}>
										{n.name}
									</option>
								))}
							</select>

							<label className="som-field-label">Troops to auto-deploy</label>
							<div className="som-troop-grid">
								{STATIONABLE_TROOPS.map((key) => {
									const source = ownNexuses.find((n) => n._id === sourceId);
									const available = (source?.troops as Record<string, number>)?.[key] ?? 0;
									if (available <= 0) return null;
									return (
										<div key={key} className="som-troop-input">
											<label>{TROOP_LABELS[key]}</label>
											<input
												type="number"
												min={0}
												max={available}
												placeholder="0"
												value={amounts[key] ?? ''}
												onChange={(e) =>
													setAmounts((prev) => ({ ...prev, [key]: e.target.value }))
												}
											/>
											<span className="som-troop-available">/ {available}</span>
										</div>
									);
								})}
							</div>

							<button className="som-save" disabled={saving} onClick={handleCreate}>
								{saving ? 'Saving…' : 'Save Standing Order'}
							</button>
						</>
					)}
				</div>
			</div>
		</div>,
		document.body
	);
}
