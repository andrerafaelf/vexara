'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import {
	createAutoRequeueRule,
	deleteAutoRequeueRule,
	getAutoRequeueRules,
	setAutoRequeueRuleActive
} from '../services/api';
import '../styles/StandingOrdersModal.css';
import type { Nexus } from '../types/game';

const TROOP_LABELS: Record<string, string> = {
	sentinelLancer: 'Sentinel Lancer',
	assaultTrooper: 'Assault Trooper',
	vanguardBreaker: 'Vanguard Breaker',
	reconOperative: 'Recon Operative',
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
const TRAINABLE_TROOPS = Object.keys(TROOP_LABELS);

const BUILDING_NAMES: Record<string, string> = {
	commandCore: 'Command Core',
	hangarBay: 'Hangar Bay',
	plasmaForge: 'Plasma Forge',
	armorFoundry: 'Armor Foundry',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid',
	targetingCore: 'Targeting Core',
	stealthArray: 'Stealth Array'
};
const UPGRADABLE_BUILDINGS = Object.keys(BUILDING_NAMES);

interface AutoRequeueRule {
	id: number;
	nexusId: number;
	kind: 'training' | 'building';
	troopType: string | null;
	amount: number | null;
	building: string | null;
	isActive: boolean;
	pausedReason: string | null;
	lastFiredAt: string | null;
	createdAt: string;
}

interface Props {
	nexus: Nexus;
	onClose: () => void;
}

export default function AutoRequeueModal({ nexus, onClose }: Props) {
	const toast = useToast();
	const [rules, setRules] = useState<AutoRequeueRule[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const [kind, setKind] = useState<'training' | 'building'>('training');
	const [troopType, setTroopType] = useState(TRAINABLE_TROOPS[0]);
	const [amount, setAmount] = useState('');
	const [building, setBuilding] = useState(UPGRADABLE_BUILDINGS[0]);

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
		getAutoRequeueRules()
			.then((r) => setRules(r.data.rules ?? []))
			.catch(() => toast('Failed to load auto-requeue rules', 'error'))
			.finally(() => setLoading(false));
	};

	useEffect(load, []);

	const rulesForThisNexus = rules.filter((r) => String(r.nexusId) === nexus._id);

	const handleCreate = async () => {
		if (kind === 'training') {
			const parsed = parseInt(amount || '0', 10);
			if (!parsed || parsed <= 0) {
				toast('Enter a training amount', 'error');
				return;
			}
			setSaving(true);
			try {
				await createAutoRequeueRule({ nexusId: nexus._id, kind, troopType, amount: parsed });
				toast('Auto-requeue rule saved', 'success');
				setAmount('');
				load();
			} catch (err: any) {
				toast(err?.response?.data?.error || err?.message || 'Failed to save rule', 'error');
			} finally {
				setSaving(false);
			}
			return;
		}
		setSaving(true);
		try {
			await createAutoRequeueRule({ nexusId: nexus._id, kind, building });
			toast('Auto-requeue rule saved', 'success');
			load();
		} catch (err: any) {
			toast(err?.response?.data?.error || err?.message || 'Failed to save rule', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleToggle = async (rule: AutoRequeueRule) => {
		try {
			await setAutoRequeueRuleActive(rule.id, !rule.isActive);
			load();
		} catch (err: any) {
			toast(err?.response?.data?.error || 'Failed to update rule', 'error');
		}
	};

	const handleDelete = async (rule: AutoRequeueRule) => {
		try {
			await deleteAutoRequeueRule(rule.id);
			toast('Auto-requeue rule removed', 'success');
			load();
		} catch (err: any) {
			toast(err?.response?.data?.error || 'Failed to remove rule', 'error');
		}
	};

	return createPortal(
		<div className="som-overlay" onClick={onClose}>
			<div className="som-modal" onClick={(e) => e.stopPropagation()}>
				<button className="som-close" onClick={onClose} aria-label="Close">
					×
				</button>
				<h2 className="som-title">Auto-Requeue — {nexus.name}</h2>
				<p className="som-subtitle">
					Automatically re-queue a training batch or building upgrade every time the previous one
					finishes. If a level ever fails validation (cost, requirements, milestones), the rule
					pauses itself and notifies you.
				</p>

				<div className="som-existing">
					{loading ? (
						<div className="som-empty">Loading…</div>
					) : rulesForThisNexus.length === 0 ? (
						<div className="som-empty">No auto-requeue rules for this nexus yet.</div>
					) : (
						rulesForThisNexus.map((rule) => (
							<div key={rule.id} className="som-order-row">
								<div className="som-order-info">
									<span className="som-order-source">
										{rule.kind === 'training'
											? `${rule.amount} ${TROOP_LABELS[rule.troopType ?? ''] || rule.troopType}`
											: `Upgrade ${BUILDING_NAMES[rule.building ?? ''] || rule.building}`}
									</span>
									{rule.pausedReason && (
										<span className="som-order-troops">Paused: {rule.pausedReason}</span>
									)}
									{rule.lastFiredAt && (
										<span className="som-order-triggered">
											Last fired {new Date(rule.lastFiredAt).toLocaleString()}
										</span>
									)}
								</div>
								<div className="som-order-actions">
									<button className="som-toggle" onClick={() => handleToggle(rule)}>
										{rule.isActive ? 'Active' : 'Paused'}
									</button>
									<button className="som-delete" onClick={() => handleDelete(rule)}>
										Remove
									</button>
								</div>
							</div>
						))
					)}
				</div>

				<div className="som-new">
					<h3 className="som-new-title">New Auto-Requeue Rule</h3>

					<label className="som-field-label">Type</label>
					<select
						className="som-select"
						value={kind}
						onChange={(e) => setKind(e.target.value as 'training' | 'building')}
					>
						<option value="training">Train troops</option>
						<option value="building">Upgrade building</option>
					</select>

					{kind === 'training' ? (
						<>
							<label className="som-field-label">Troop type</label>
							<select
								className="som-select"
								value={troopType}
								onChange={(e) => setTroopType(e.target.value)}
							>
								{TRAINABLE_TROOPS.map((key) => (
									<option key={key} value={key}>
										{TROOP_LABELS[key]}
									</option>
								))}
							</select>

							<label className="som-field-label">Amount per batch</label>
							<input
								className="som-select"
								type="number"
								min={1}
								placeholder="0"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
							/>
						</>
					) : (
						<>
							<label className="som-field-label">Building</label>
							<select
								className="som-select"
								value={building}
								onChange={(e) => setBuilding(e.target.value)}
							>
								{UPGRADABLE_BUILDINGS.map((key) => (
									<option key={key} value={key}>
										{BUILDING_NAMES[key]}
									</option>
								))}
							</select>
						</>
					)}

					<button className="som-save" disabled={saving} onClick={handleCreate}>
						{saving ? 'Saving…' : 'Save Auto-Requeue Rule'}
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
}
