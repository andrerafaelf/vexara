'use client';
import {
	AlertTriangle,
	Bell,
	Building2,
	Coins,
	Pencil,
	Plus,
	RotateCcw,
	Save,
	Search,
	ShoppingCart,
	Swords,
	Trash2,
	Trophy,
	Users
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
	AdminFetch,
	Attack,
	BuildingKey,
	Galaxy,
	GalaxyStats,
	GalaxyUser,
	TroopKey,
	UserNexus
} from '../../types/admin';
import { BUILDING_KEYS, TROOP_KEYS } from '../../types/admin';
import ConfirmModal from '../shared/ConfirmModal';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

const RESOURCE_KEYS = ['biomass', 'alloy', 'ore'] as const;
type ResourceKey = (typeof RESOURCE_KEYS)[number];
const RESOURCE_LABELS: Record<ResourceKey, string> = {
	biomass: 'Biomass',
	alloy: 'Alloy',
	ore: 'Ore'
};
const BUILDING_LABELS: Record<BuildingKey, string> = {
	commandCore: 'Command Core',
	recruitmentCore: 'Recruitment Core',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid',
	armory: 'Armory',
	stealthArray: 'Stealth Array'
};
const TROOP_LABELS: Record<TroopKey, string> = {
	lancerDrone: 'Lancer Drone',
	assaultTrooper: 'Assault Trooper',
	breakerUnit: 'Breaker Unit',
	reconOperative: 'Recon Operative',
	skimmerBike: 'Skimmer Bike',
	siegeMech: 'Siege Mech',
	bulwarkGuard: 'Bulwark Guard',
	suppressorTeam: 'Suppressor Team',
	disruptorUnit: 'Disruptor Unit',
	interceptorBike: 'Interceptor Bike',
	voidStalker: 'Void Stalker',
	plasmaTurret: 'Plasma Turret',
	annihilatorPlatform: 'Annihilator Platform',
	overseer: 'Overseer'
};

type DraftMap = Partial<Record<string, number>>;

function orderNexuses(nx: UserNexus[]): UserNexus[] {
	return [...nx].sort((a, b) => {
		if (!a.conqueredAt && b.conqueredAt) return -1;
		if (a.conqueredAt && !b.conqueredAt) return 1;
		return 0;
	});
}

interface Props {
	adminFetch: AdminFetch;
	showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function GalaxiesPage({ adminFetch, showToast }: Props) {
	const [galaxies, setGalaxies] = useState<Galaxy[]>([]);
	const [selectedGalaxyId, setSelectedGalaxyId] = useState<number | null>(null);
	const [galaxyUsers, setGalaxyUsers] = useState<GalaxyUser[]>([]);
	const [stats, setStats] = useState<GalaxyStats | null>(null);
	const [attacks, setAttacks] = useState<Attack[]>([]);
	const [loading, setLoading] = useState(true);
	const [currentTime, setCurrentTime] = useState(new Date());

	// Create galaxy form
	const [newGalaxyName, setNewGalaxyName] = useState('');
	const [newGalaxyStartsAt, setNewGalaxyStartsAt] = useState('');
	const [creating, setCreating] = useState(false);

	// Delete galaxy
	const [deleteGalaxyTarget, setDeleteGalaxyTarget] = useState<Galaxy | null>(null);

	// Player editor
	const [editingUser, setEditingUser] = useState<GalaxyUser | null>(null);
	const [editNexusId, setEditNexusId] = useState('');
	const [drafts, setDrafts] = useState<DraftMap>({});
	const [editFilter, setEditFilter] = useState('');
	const [saving, setSaving] = useState(false);

	// Login modal
	const [loginModal, setLoginModal] = useState<GalaxyUser | null>(null);
	const [loginForm, setLoginForm] = useState({ email: '', password: '' });

	// Token modal
	const [tokenModal, setTokenModal] = useState<GalaxyUser | null>(null);
	const [tokenCount, setTokenCount] = useState('1');
	const [tokenReason, setTokenReason] = useState('manual');

	const [recounting, setRecounting] = useState(false);

	// Confirm modals
	const [confirmReset, setConfirmReset] = useState<GalaxyUser | null>(null);
	const [confirmDeleteUser, setConfirmDeleteUser] = useState<GalaxyUser | null>(null);
	const [confirmAttack, setConfirmAttack] = useState<Attack | null>(null);

	useEffect(() => {
		const id = setInterval(() => setCurrentTime(new Date()), 1000);
		return () => clearInterval(id);
	}, []);

	const loadGalaxies = useCallback(async () => {
		try {
			const res = await adminFetch(`${API}/galaxies`);
			const data = await res.json().catch(() => null);
			const list: Galaxy[] = Array.isArray(data) ? data : [];
			setGalaxies(list);
			if (list.length > 0) {
				const sorted = [...list].sort(
					(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
				const preferred = sorted.find((g) => g.status === 'active') ?? sorted[0];
				setSelectedGalaxyId((prev) => prev ?? preferred.id);
			}
		} catch {
			/* silent */
		}
	}, [adminFetch]);

	const loadGalaxyData = useCallback(
		async (galaxyId: number) => {
			try {
				const [uRes, sRes, aRes] = await Promise.all([
					adminFetch(`${API}/users?galaxyId=${galaxyId}`),
					adminFetch(`${API}/stats?galaxyId=${galaxyId}`),
					adminFetch(`${API}/attacks?galaxyId=${galaxyId}`)
				]);
				const [uData, sData, aData] = await Promise.all([
					uRes.json().catch(() => null),
					sRes.json().catch(() => null),
					aRes.json().catch(() => null)
				]);
				setGalaxyUsers(
					Array.isArray(uData)
						? uData.map((u: GalaxyUser) => ({
								...u,
								nexuses: Array.isArray(u.nexuses) ? u.nexuses : []
							}))
						: []
				);
				setStats(
					sData && typeof sData === 'object'
						? {
								userCount: Number(sData.userCount ?? 0),
								villageCount: Number(sData.villageCount ?? 0),
								travelingAttackCount: Number(sData.travelingAttackCount ?? 0),
								totalAttackCount: Number(sData.totalAttackCount ?? 0),
								newUsersThisWeek: Number(sData.newUsersThisWeek ?? 0),
								zeroNexusCount: Number(sData.zeroNexusCount ?? 0),
								totalTroops: Number(sData.totalTroops ?? 0),
								avgPoints: Number(sData.avgPoints ?? 0),
								marketCount: Number(sData.marketCount ?? 0),
								factionCount: Number(sData.factionCount ?? 0),
								topUsers: Array.isArray(sData.topUsers) ? sData.topUsers : []
							}
						: null
				);
				setAttacks(Array.isArray(aData) ? aData : []);
			} catch {
				/* silent */
			} finally {
				setLoading(false);
			}
		},
		[adminFetch]
	);

	useEffect(() => {
		loadGalaxies();
	}, [loadGalaxies]);
	useEffect(() => {
		if (selectedGalaxyId != null) loadGalaxyData(selectedGalaxyId);
	}, [selectedGalaxyId, loadGalaxyData]);

	const reloadAll = useCallback(() => {
		loadGalaxies();
		if (selectedGalaxyId != null) loadGalaxyData(selectedGalaxyId);
	}, [loadGalaxies, loadGalaxyData, selectedGalaxyId]);

	const galaxyStatus = (g: Galaxy) =>
		g.status === 'ended'
			? 'ended'
			: g.startsAt && new Date(g.startsAt) > new Date()
				? 'pending'
				: 'active';

	const handleCreateGalaxy = async () => {
		const name = newGalaxyName.trim();
		if (name.length < 3 || name.length > 40) {
			showToast('Name must be 3–40 characters', 'error');
			return;
		}
		setCreating(true);
		try {
			const body: Record<string, unknown> = { name };
			if (newGalaxyStartsAt) body.startsAt = new Date(newGalaxyStartsAt).toISOString();
			const res = await adminFetch(`${API}/galaxies`, {
				method: 'POST',
				body: JSON.stringify(body)
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) {
				showToast(d.error || 'Failed', 'error');
				return;
			}
			showToast(`Galaxy "${name}" created`, 'success');
			setNewGalaxyName('');
			setNewGalaxyStartsAt('');
			loadGalaxies();
		} catch {
			showToast('Error', 'error');
		} finally {
			setCreating(false);
		}
	};

	const handleDeleteGalaxy = async () => {
		if (!deleteGalaxyTarget) return;
		try {
			const res = await adminFetch(`${API}/galaxies/${deleteGalaxyTarget.id}`, {
				method: 'DELETE'
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) {
				showToast(d.error || 'Failed', 'error');
				return;
			}
			showToast(`Galaxy "${deleteGalaxyTarget.name}" deleted`, 'success');
			setDeleteGalaxyTarget(null);
			if (selectedGalaxyId === deleteGalaxyTarget.id) setSelectedGalaxyId(null);
			loadGalaxies();
		} catch {
			showToast('Error', 'error');
		}
	};

	// player actions
	const withGalaxy = (path: string) =>
		`${path}${path.includes('?') ? '&' : '?'}galaxyId=${selectedGalaxyId}`;

	const handleUpdateLogin = async () => {
		if (!loginModal) return;
		const payload: Record<string, string> = {};
		if (loginForm.email) payload.email = loginForm.email;
		if (loginForm.password) payload.password = loginForm.password;
		if (!Object.keys(payload).length) {
			showToast('No changes', 'info');
			return;
		}
		try {
			const res = await adminFetch(`${API}/users/${loginModal._id}`, {
				method: 'PATCH',
				body: JSON.stringify(payload)
			});
			const d = await res.json();
			if (res.ok) {
				showToast(`Updated ${loginModal.username}`, 'success');
				setLoginModal(null);
			} else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleGrantTokens = async () => {
		if (!tokenModal) return;
		const count = parseInt(tokenCount);
		if (!Number.isFinite(count) || count < 1 || count > 50) {
			showToast('Count must be 1–50', 'error');
			return;
		}
		try {
			const res = await adminFetch(`${API}/users/${tokenModal._id}/tokens`, {
				method: 'POST',
				body: JSON.stringify({ count, reason: tokenReason || 'admin_grant' })
			});
			const d = await res.json();
			if (res.ok) {
				showToast(`Granted ${d.granted} token(s)`, 'success');
				setTokenModal(null);
			} else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleCompleteStrike = async (u: GalaxyUser) => {
		try {
			const res = await adminFetch(withGalaxy(`${API}/users/${u._id}/complete-strike`), {
				method: 'POST'
			});
			if (res.ok) {
				showToast(`Strike completed for ${u.username}`, 'success');
				reloadAll();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleCompleteBuild = async (u: GalaxyUser) => {
		try {
			const res = await adminFetch(withGalaxy(`${API}/users/${u._id}/complete-build`), {
				method: 'POST',
				body: JSON.stringify({})
			});
			if (res.ok) {
				showToast(`Build completed`, 'success');
				reloadAll();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleCompleteTraining = async (u: GalaxyUser) => {
		try {
			const res = await adminFetch(withGalaxy(`${API}/users/${u._id}/complete-training`), {
				method: 'POST',
				body: JSON.stringify({})
			});
			if (res.ok) {
				showToast(`Training completed`, 'success');
				reloadAll();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleResetUser = async () => {
		if (!confirmReset || selectedGalaxyId == null) return;
		try {
			const res = await adminFetch(withGalaxy(`${API}/users/${confirmReset._id}/reset-account`), {
				method: 'POST'
			});
			if (res.ok) {
				showToast(`Reset ${confirmReset.username}`, 'success');
				setConfirmReset(null);
				reloadAll();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleDeleteUser = async () => {
		if (!confirmDeleteUser) return;
		try {
			const res = await adminFetch(`${API}/users/${confirmDeleteUser._id}`, { method: 'DELETE' });
			if (res.ok) {
				showToast(`Deleted ${confirmDeleteUser.username}`, 'success');
				setConfirmDeleteUser(null);
				reloadAll();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleRecountPopulation = async () => {
		if (recounting) return;
		if (!window.confirm('Force a population recount across ALL nexuses in every galaxy? This recomputes populationCurrent from troops, training queues, in-flight attacks and transfers.')) return;
		setRecounting(true);
		try {
			const res = await adminFetch(`${API}/maintenance/recount-population`, { method: 'POST' });
			const data = await res.json().catch(() => null);
			if (!res.ok) { showToast(data?.error || 'Recount failed', 'error'); return; }
			showToast(data?.message || 'Population recounted', 'success');
		} catch {
			showToast('Error running recount', 'error');
		} finally {
			setRecounting(false);
		}
	};

	const handleCompleteAttack = async () => {
		if (!confirmAttack) return;
		try {
			const res = await adminFetch(`${API}/attacks/${confirmAttack._id}/complete`, {
				method: 'POST'
			});
			if (res.ok) {
				showToast('Strike completed instantly', 'success');
				setConfirmAttack(null);
				reloadAll();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleResendVerification = async (u: GalaxyUser) => {
		try {
			const res = await adminFetch(`${API}/users/${u._id}/resend-verification`, {
				method: 'POST',
				body: JSON.stringify({ email: u.email })
			});
			const d = await res.json();
			if (res.ok) showToast(d.message || 'Sent', 'success');
			else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	// Editor
	const openEditor = (u: GalaxyUser) => {
		const ordered = orderNexuses(u.nexuses);
		setEditNexusId(String(ordered[0]?._id ?? ''));
		setDrafts({});
		setEditFilter('');
		setEditingUser(u);
	};

	const activeNexus: UserNexus | null = useMemo(() => {
		if (!editingUser) return null;
		return (
			editingUser.nexuses.find((n) => String(n._id) === editNexusId) ??
			orderNexuses(editingUser.nexuses)[0] ??
			null
		);
	}, [editingUser, editNexusId]);

	const draftVal = (key: string, current: number) => {
		const d = drafts[key];
		return d === undefined ? current : d;
	};

	const setDraft = (key: string, value: number, current: number) => {
		setDrafts((prev) => {
			const next = { ...prev };
			if (value === current) delete next[key];
			else next[key] = value;
			return next;
		});
	};

	const totalDirty = useMemo(() => {
		if (!activeNexus) return 0;
		return Object.keys(drafts).filter(
			(k) =>
				drafts[k] !== undefined &&
				drafts[k] !== (activeNexus as unknown as Record<string, number>)[k]
		).length;
	}, [drafts, activeNexus]);

	const filterMatches = (label: string, key: string) => {
		if (!editFilter.trim()) return true;
		const q = editFilter.toLowerCase();
		return label.toLowerCase().includes(q) || key.toLowerCase().includes(q);
	};

	const handleSavePlayerEdits = async () => {
		if (!editingUser || !activeNexus || selectedGalaxyId == null) return;
		const dirtyResources = RESOURCE_KEYS.filter(
			(k) => drafts[k] !== undefined && drafts[k] !== activeNexus[k]
		);
		const dirtyBuildings = BUILDING_KEYS.filter(
			(k) => drafts[k] !== undefined && drafts[k] !== activeNexus[k]
		);
		const dirtyTroops = TROOP_KEYS.filter(
			(k) => drafts[k] !== undefined && drafts[k] !== activeNexus[k]
		);
		const totalChanges = dirtyResources.length + dirtyBuildings.length + dirtyTroops.length;
		if (totalChanges === 0) {
			showToast('No changes to save', 'info');
			return;
		}
		setSaving(true);
		const failures: string[] = [];
		try {
			if (dirtyResources.length > 0) {
				const body: Record<string, unknown> = { nexusId: editNexusId };
				for (const k of dirtyResources) body[k] = (drafts[k] as number) - activeNexus[k];
				const res = await adminFetch(withGalaxy(`${API}/users/${editingUser._id}/resources`), {
					method: 'POST',
					body: JSON.stringify(body)
				});
				if (!res.ok) {
					const d = await res.json().catch(() => ({}));
					failures.push(`resources: ${d.error || res.statusText}`);
				}
			}
			await Promise.all(
				dirtyBuildings.map(async (k) => {
					const res = await adminFetch(withGalaxy(`${API}/users/${editingUser._id}/buildings`), {
						method: 'POST',
						body: JSON.stringify({ nexusId: editNexusId, building: k, level: drafts[k] })
					});
					if (!res.ok) {
						const d = await res.json().catch(() => ({}));
						failures.push(`${BUILDING_LABELS[k]}: ${d.error || res.statusText}`);
					}
				})
			);
			await Promise.all(
				dirtyTroops.map(async (k) => {
					const delta = (drafts[k] as number) - activeNexus[k];
					if (delta === 0) return;
					const res = await adminFetch(withGalaxy(`${API}/users/${editingUser._id}/troops`), {
						method: 'POST',
						body: JSON.stringify({ nexusId: editNexusId, troopType: k, amount: delta })
					});
					if (!res.ok) {
						const d = await res.json().catch(() => ({}));
						failures.push(`${TROOP_LABELS[k]}: ${d.error || res.statusText}`);
					}
				})
			);
			if (failures.length === 0) {
				showToast(`Saved ${totalChanges} change(s) for ${editingUser.username}`, 'success');
				setEditingUser(null);
				setDrafts({});
			} else if (failures.length < totalChanges) {
				showToast(`Saved with ${failures.length} failure(s): ${failures[0]}`, 'info');
			} else {
				showToast(`Failed: ${failures[0]}`, 'error');
			}
			reloadAll();
		} catch {
			showToast('Error saving', 'error');
		} finally {
			setSaving(false);
		}
	};

	if (loading)
		return (
			<div className="page-loading">
				<div className="spinner" /> Loading galaxies…
			</div>
		);

	const selectedGalaxy = galaxies.find((g) => g.id === selectedGalaxyId) ?? null;
	const orderedNexuses = editingUser ? orderNexuses(editingUser.nexuses) : [];

	return (
		<div className="page-body">
			{/* Galaxies list */}
			<div className="section" style={{ marginBottom: 20 }}>
				<div className="section-header">
					<span className="section-title">
						Galaxies <span className="section-title-count">{galaxies.length}</span>
					</span>
					<div className="section-actions">
						<input
							placeholder="Galaxy name"
							value={newGalaxyName}
							onChange={(e) => setNewGalaxyName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleCreateGalaxy();
							}}
							style={{
								padding: '6px 10px',
								fontSize: 13,
								background: 'var(--color-navy-800)',
								border: '1px solid var(--border-default)',
								borderRadius: 3,
								color: 'var(--text-strong)',
								width: 160
							}}
							maxLength={40}
						/>
						<input
							type="datetime-local"
							value={newGalaxyStartsAt}
							onChange={(e) => setNewGalaxyStartsAt(e.target.value)}
							style={{
								padding: '6px 10px',
								fontSize: 12,
								background: 'var(--color-navy-800)',
								border: '1px solid var(--border-default)',
								borderRadius: 3,
								color: 'var(--text-strong)',
								width: 180
							}}
						/>
						<button
							className="btn btn-primary btn-sm"
							disabled={creating}
							onClick={handleCreateGalaxy}
						>
							<Plus size={12} /> {creating ? 'Creating…' : 'Create'}
						</button>
					</div>
				</div>

				<div className="galaxy-list">
					{galaxies.map((g) => {
						const s = galaxyStatus(g);
						return (
							<button
								key={g.id}
								className={`galaxy-item${g.id === selectedGalaxyId ? ' selected' : ''}`}
								onClick={() => setSelectedGalaxyId(g.id)}
							>
								<div className="galaxy-item-info">
									<div className="galaxy-item-name">
										<span className={`status-dot ${s}`} />
										{g.name}
										<span className="badge badge-muted">{s}</span>
									</div>
									<div className="galaxy-item-meta">
										{g.playerCount} players · {g.nexusCount} nexuses
										{g.winnerUserId ? ` · Winner #${g.winnerUserId}` : ''}
										{' · '}
										{new Date(g.createdAt).toLocaleDateString()}
										{g.startsAt ? ` · Starts ${new Date(g.startsAt).toLocaleString()}` : ''}
									</div>
								</div>
								<button
									className="btn btn-danger btn-xs"
									onClick={(e) => {
										e.stopPropagation();
										setDeleteGalaxyTarget(g);
									}}
								>
									<Trash2 size={10} /> Delete
								</button>
							</button>
						);
					})}
				</div>
			</div>

			{/* Stats for selected galaxy */}
			{stats && selectedGalaxy && (
				<>
					<div className="stat-grid">
						{[
							{ label: 'Players', value: stats.userCount, icon: <Users size={16} /> },
							{ label: 'Nexuses', value: stats.villageCount, icon: <Building2 size={16} /> },
							{ label: 'Factions', value: stats.factionCount ?? 0, icon: <Swords size={16} /> },
							{
								label: 'Active Strikes',
								value: stats.travelingAttackCount,
								icon: <Swords size={16} />,
								v: 'danger'
							},
							{
								label: 'World Troops',
								value: stats.totalTroops.toLocaleString(),
								icon: <Swords size={16} />
							},
							{
								label: 'Avg Influence',
								value: stats.avgPoints.toLocaleString(),
								icon: <Trophy size={16} />
							},
							{
								label: 'New This Week',
								value: stats.newUsersThisWeek,
								icon: <Users size={16} />,
								v: 'success'
							},
							{
								label: 'No Nexus',
								value: stats.zeroNexusCount,
								icon: <AlertTriangle size={16} />,
								v: 'warn'
							},
							{
								label: 'Market Listings',
								value: stats.marketCount,
								icon: <ShoppingCart size={16} />
							},
							{
								label: 'All-time Strikes',
								value: stats.totalAttackCount.toLocaleString(),
								icon: <Swords size={16} />
							}
						].map(({ label, value, icon, v }) => (
							<div key={label} className="stat-card">
								<div className={`stat-card-icon ${v ?? ''}`}>{icon}</div>
								<div className="stat-card-body">
									<div className="stat-card-value">{value}</div>
									<div className="stat-card-label">{label}</div>
								</div>
							</div>
						))}
					</div>

					{stats.topUsers.length > 0 && (
						<div className="section" style={{ marginBottom: 20 }}>
							<div className="section-header">
								<span className="section-title">
									<Trophy size={14} /> Top Players
								</span>
							</div>
							<div className="leaderboard">
								{stats.topUsers.map((u, i) => (
									<div key={u._id} className="lb-row">
										<span className={`lb-rank${i < 3 ? ` r${i + 1}` : ''}`}>#{i + 1}</span>
										<span className="lb-name">{u.username}</span>
										<span className="lb-pts">{(u.points ?? 0).toLocaleString()} pts</span>
									</div>
								))}
							</div>
						</div>
					)}
				</>
			)}

			{/* Players in selected galaxy */}
			{selectedGalaxy && (
				<div className="section" style={{ marginBottom: 20 }}>
					<div className="section-header">
						<span className="section-title">
							Players in {selectedGalaxy.name}
							<span className="section-title-count">{galaxyUsers.length}</span>
						</span>
						<div className="section-actions">
							<button
								className="btn btn-ghost btn-sm"
								onClick={handleRecountPopulation}
								disabled={recounting}
								title="Recompute populationCurrent for every nexus across all galaxies"
							>
								<RotateCcw size={11} /> {recounting ? 'Recounting…' : 'Recount Population'}
							</button>
						</div>
					</div>
					<div className="player-list">
						{galaxyUsers.length === 0 && (
							<div className="empty-state">
								<div className="empty-icon">
									<Users size={18} />
								</div>
								<div className="empty-title">No players in this galaxy</div>
							</div>
						)}
						{galaxyUsers.map((u) => (
							<div key={u._id} className="player-item">
								<div className="player-item-info">
									<div className="player-item-name">{u.username}</div>
									<div className="player-item-meta">
										<span>{u.email}</span>
										<span className="dot">·</span>
										<span>{u.points} pts</span>
										<span className="dot">·</span>
										<span>
											{u.nexuses.length} nexus{u.nexuses.length !== 1 ? 'es' : ''}
										</span>
										<span className="dot">·</span>
										<span>joined {new Date(u.createdAt).toLocaleDateString()}</span>
									</div>
								</div>
								<div className="player-actions">
									<button
										className="btn btn-ghost btn-xs"
										onClick={() => {
											setLoginForm({ email: u.email, password: '' });
											setLoginModal(u);
										}}
									>
										<Pencil size={10} /> Login
									</button>
									<button
										className="btn btn-ghost btn-xs"
										onClick={() => openEditor(u)}
										disabled={u.nexuses.length === 0}
									>
										<Coins size={10} /> Edit
									</button>
									<button className="btn btn-ghost btn-xs" onClick={() => handleCompleteStrike(u)}>
										Finish Strike
									</button>
									<button className="btn btn-ghost btn-xs" onClick={() => handleCompleteBuild(u)}>
										Finish Build
									</button>
									<button
										className="btn btn-ghost btn-xs"
										onClick={() => handleCompleteTraining(u)}
									>
										Finish Train
									</button>
									<button
										className="btn btn-ghost btn-xs"
										onClick={() => {
											setTokenModal(u);
											setTokenCount('1');
											setTokenReason('manual');
										}}
									>
										Tokens
									</button>
									<button
										className="btn btn-ghost btn-xs"
										onClick={() => handleResendVerification(u)}
									>
										<Bell size={10} />
									</button>
									<button className="btn btn-warning btn-xs" onClick={() => setConfirmReset(u)}>
										<RotateCcw size={10} /> Reset
									</button>
									<button className="btn btn-danger btn-xs" onClick={() => setConfirmDeleteUser(u)}>
										<Trash2 size={10} />
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Attacks */}
			{attacks.length > 0 && (
				<div className="section">
					<div className="section-header">
						<span className="section-title">
							<Swords size={14} /> Traveling Strikes &amp; Transfers{' '}
							<span className="section-title-count">{attacks.length}</span>
						</span>
					</div>
					<div className="table-wrap">
						<table className="data-table">
							<thead>
								<tr>
									<th>Attacker</th>
									<th>Defender</th>
									<th>Type</th>
									<th>Troops</th>
									<th>Arrives In</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{attacks.map((a) => {
									const diff = new Date(a.arrivesAt).getTime() - currentTime.getTime();
									const sec = Math.max(0, Math.floor(diff / 1000));
									const min = Math.floor(sec / 60);
									const hrs = Math.floor(min / 60);
									const timeStr =
										hrs > 0 ? `${hrs}h ${min % 60}m` : min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
									const totalTroops = Object.values(a.troops || {}).reduce(
										(s, v) => s + Number(v || 0),
										0
									);
									const aType = (a.type || 'attack') as string;
									return (
										<tr key={a._id}>
											<td data-label="Attacker" className="col-strong">
												{a.attacker?.user?.username || 'Unknown'}
											</td>
											<td data-label="Defender">{a.defender?.user?.username || 'Unknown'}</td>
											<td data-label="Type">
												<span className={`attack-pill ${aType}`}>{aType}</span>
											</td>
											<td data-label="Troops" className="col-r">
												{totalTroops.toLocaleString()}
											</td>
											<td data-label="Arrives In">
												<span
													className={diff <= 10000 ? 'time-urgent' : ''}
													style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}
												>
													{timeStr}
												</span>
											</td>
											<td className="col-actions">
												{aType !== 'transfer' && (
													<button
														className="btn btn-success btn-xs"
														onClick={() => setConfirmAttack(a)}
													>
														Complete
													</button>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Login modal */}
			{loginModal && (
				<div className="modal-overlay" onClick={() => setLoginModal(null)}>
					<div className="modal-box" onClick={(e) => e.stopPropagation()}>
						<div className="modal-head">
							<h3>Edit Login: {loginModal.username}</h3>
							<button className="modal-close" onClick={() => setLoginModal(null)}>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="form-grid-1 form-grid">
								<div className="form-field">
									<label className="form-label">Email</label>
									<input
										value={loginForm.email}
										onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
									/>
								</div>
								<div className="form-field">
									<label className="form-label">New Password</label>
									<input
										type="password"
										placeholder="Leave blank to keep current"
										value={loginForm.password}
										onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
									/>
								</div>
							</div>
						</div>
						<div className="modal-foot">
							<button className="btn btn-ghost" onClick={() => setLoginModal(null)}>
								Cancel
							</button>
							<button className="btn btn-primary" onClick={handleUpdateLogin}>
								Save
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Token modal */}
			{tokenModal && (
				<div className="modal-overlay" onClick={() => setTokenModal(null)}>
					<div className="modal-box" onClick={(e) => e.stopPropagation()}>
						<div className="modal-head">
							<h3>Grant Tokens: {tokenModal.username}</h3>
							<button className="modal-close" onClick={() => setTokenModal(null)}>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="form-grid">
								<div className="form-field">
									<label className="form-label">Count (1–50)</label>
									<input
										type="number"
										min={1}
										max={50}
										value={tokenCount}
										onChange={(e) => setTokenCount(e.target.value)}
									/>
								</div>
								<div className="form-field">
									<label className="form-label">Reason</label>
									<select
										value={
											['manual', 'compensation', 'contest', 'supporter', 'bug_fix'].includes(
												tokenReason
											)
												? tokenReason
												: '__custom'
										}
										onChange={(e) =>
											setTokenReason(e.target.value === '__custom' ? '' : e.target.value)
										}
									>
										<option value="manual">Manual grant</option>
										<option value="compensation">Compensation</option>
										<option value="contest">Contest reward</option>
										<option value="supporter">Supporter bonus</option>
										<option value="bug_fix">Bug fix / make-good</option>
										<option value="__custom">Custom reason…</option>
									</select>
									{!['manual', 'compensation', 'contest', 'supporter', 'bug_fix'].includes(
										tokenReason
									) && (
										<input
											style={{ marginTop: 6 }}
											value={tokenReason}
											onChange={(e) => setTokenReason(e.target.value)}
											placeholder="Custom reason"
											autoFocus
										/>
									)}
								</div>
							</div>
						</div>
						<div className="modal-foot">
							<button className="btn btn-ghost" onClick={() => setTokenModal(null)}>
								Cancel
							</button>
							<button className="btn btn-primary" onClick={handleGrantTokens}>
								Grant
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Player editor modal */}
			{editingUser && activeNexus && (
				<div className="modal-overlay" onClick={() => !saving && setEditingUser(null)}>
					<div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
						<div className="modal-head">
							<h3>
								<Pencil size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />
								{editingUser.username}
							</h3>
							<button className="modal-close" onClick={() => !saving && setEditingUser(null)}>
								×
							</button>
						</div>

						<div className="editor-toolbar">
							{orderedNexuses.length > 1 ? (
								<div className="form-field" style={{ flex: '1 1 240px' }}>
									<label className="form-label">Nexus</label>
									<select
										value={editNexusId}
										onChange={(e) => {
											setEditNexusId(e.target.value);
											setDrafts({});
										}}
										disabled={saving}
									>
										{orderedNexuses.map((n) => (
											<option key={n._id} value={String(n._id)}>
												{n.name}
												{n.x != null && n.y != null ? ` (${n.x}|${n.y})` : ''} · CC{n.commandCore}
											</option>
										))}
									</select>
								</div>
							) : (
								<span className="editor-pop-chip">
									<Building2 size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
									{activeNexus.name}
								</span>
							)}
							<div className="search-wrap" style={{ maxWidth: 220 }}>
								<Search size={12} className="search-icon" />
								<input
									className="search-input"
									placeholder="Filter…"
									value={editFilter}
									onChange={(e) => setEditFilter(e.target.value)}
									disabled={saving}
								/>
							</div>
							<span className="editor-pop-chip">
								Pop {(activeNexus.populationCurrent ?? 0).toLocaleString()} /{' '}
								{(activeNexus.populationMax ?? 0).toLocaleString()}
							</span>
						</div>

						<div className="modal-body">
							{/* Resources */}
							<div className="editor-section">
								<div
									className="editor-section-head"
									style={{ borderLeftColor: 'rgba(245,158,11,0.6)' }}
								>
									<span>Resources</span>
									<span>
										{RESOURCE_KEYS.filter((k) => filterMatches(RESOURCE_LABELS[k], k)).length}
									</span>
								</div>
								<div className="editor-rows">
									{RESOURCE_KEYS.filter((k) => filterMatches(RESOURCE_LABELS[k], k)).map((k) => {
										const cur = activeNexus[k] ?? 0;
										const draft = draftVal(k, cur);
										const dirty = draft !== cur;
										const diff = draft - cur;
										return (
											<div key={k} className={`editor-row${dirty ? ' dirty' : ''}`}>
												<div className="editor-row-label">{RESOURCE_LABELS[k]}</div>
												<div className="editor-row-current">{cur.toLocaleString()}</div>
												<div className="editor-row-arrow">→</div>
												<input
													className="editor-row-input"
													type="number"
													min={0}
													value={Number.isFinite(draft) ? draft : 0}
													onChange={(e) =>
														setDraft(k, Math.max(0, Math.floor(Number(e.target.value))), cur)
													}
													onFocus={(e) => e.target.select()}
													disabled={saving}
												/>
												<div className="editor-row-delta">
													{dirty && (
														<>
															<span className={diff > 0 ? 'delta-pos' : 'delta-neg'}>
																{diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
															</span>
															<button
																className="editor-undo"
																onClick={() => setDraft(k, cur, cur)}
																disabled={saving}
																title="Discard"
															>
																↺
															</button>
														</>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</div>

							{/* Buildings */}
							<div className="editor-section">
								<div
									className="editor-section-head"
									style={{ borderLeftColor: 'rgba(74,158,176,0.6)' }}
								>
									<span>Buildings</span>
									<span>
										{BUILDING_KEYS.filter((k) => filterMatches(BUILDING_LABELS[k], k)).length}
									</span>
								</div>
								<div className="editor-rows">
									{BUILDING_KEYS.filter((k) => filterMatches(BUILDING_LABELS[k], k)).map((k) => {
										const cur = activeNexus[k] ?? 0;
										const draft = draftVal(k, cur);
										const dirty = draft !== cur;
										const diff = draft - cur;
										return (
											<div key={k} className={`editor-row${dirty ? ' dirty' : ''}`}>
												<div className="editor-row-label">{BUILDING_LABELS[k]}</div>
												<div className="editor-row-current">
													{cur}{' '}
													<span style={{ fontSize: 10, color: 'var(--text-faint)' }}>lvl</span>
												</div>
												<div className="editor-row-arrow">→</div>
												<input
													className="editor-row-input"
													type="number"
													min={0}
													value={Number.isFinite(draft) ? draft : 0}
													onChange={(e) =>
														setDraft(k, Math.max(0, Math.floor(Number(e.target.value))), cur)
													}
													onFocus={(e) => e.target.select()}
													disabled={saving}
												/>
												<div className="editor-row-delta">
													{dirty && (
														<>
															<span className={diff > 0 ? 'delta-pos' : 'delta-neg'}>
																{diff > 0 ? `+${diff}` : diff}
															</span>
															<button
																className="editor-undo"
																onClick={() => setDraft(k, cur, cur)}
																disabled={saving}
																title="Discard"
															>
																↺
															</button>
														</>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</div>

							{/* Troops */}
							<div className="editor-section">
								<div
									className="editor-section-head"
									style={{ borderLeftColor: 'rgba(248,81,73,0.5)' }}
								>
									<span>Troops</span>
									<span>{TROOP_KEYS.filter((k) => filterMatches(TROOP_LABELS[k], k)).length}</span>
								</div>
								<div className="editor-rows">
									{TROOP_KEYS.filter((k) => filterMatches(TROOP_LABELS[k], k)).map((k) => {
										const cur = activeNexus[k] ?? 0;
										const draft = draftVal(k, cur);
										const dirty = draft !== cur;
										const diff = draft - cur;
										return (
											<div key={k} className={`editor-row${dirty ? ' dirty' : ''}`}>
												<div className="editor-row-label">{TROOP_LABELS[k]}</div>
												<div className="editor-row-current">{cur.toLocaleString()}</div>
												<div className="editor-row-arrow">→</div>
												<input
													className="editor-row-input"
													type="number"
													min={0}
													value={Number.isFinite(draft) ? draft : 0}
													onChange={(e) =>
														setDraft(k, Math.max(0, Math.floor(Number(e.target.value))), cur)
													}
													onFocus={(e) => e.target.select()}
													disabled={saving}
												/>
												<div className="editor-row-delta">
													{dirty && (
														<>
															<span className={diff > 0 ? 'delta-pos' : 'delta-neg'}>
																{diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
															</span>
															<button
																className="editor-undo"
																onClick={() => setDraft(k, cur, cur)}
																disabled={saving}
																title="Discard"
															>
																↺
															</button>
														</>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</div>
						</div>

						<div className="modal-foot">
							<span className="modal-foot-info">
								{totalDirty === 0
									? 'No pending changes'
									: `${totalDirty} pending change${totalDirty === 1 ? '' : 's'}`}
							</span>
							<button
								className="btn btn-ghost"
								onClick={() => setDrafts({})}
								disabled={saving || totalDirty === 0}
							>
								Reset
							</button>
							<button
								className="btn btn-ghost"
								onClick={() => setEditingUser(null)}
								disabled={saving}
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								onClick={handleSavePlayerEdits}
								disabled={saving || totalDirty === 0}
							>
								<Save size={12} />
								{saving
									? 'Saving…'
									: totalDirty === 0
										? 'Save'
										: `Save ${totalDirty} change${totalDirty === 1 ? '' : 's'}`}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Confirm delete galaxy */}
			{deleteGalaxyTarget && (
				<ConfirmModal
					title={`Delete Galaxy "${deleteGalaxyTarget.name}"`}
					description="All players, nexuses, attacks, and data inside will be permanently removed."
					typeToConfirm="delete"
					confirmLabel="Delete Galaxy"
					variant="danger"
					onConfirm={handleDeleteGalaxy}
					onCancel={() => setDeleteGalaxyTarget(null)}
				/>
			)}

			{/* Confirm reset player */}
			{confirmReset && (
				<ConfirmModal
					title={`Reset "${confirmReset.username}"`}
					description={`Remove all nexuses, attacks, troops, and resources for ${confirmReset.username} in ${selectedGalaxy?.name ?? 'this galaxy'}. They will restart fresh.`}
					confirmLabel="Reset Account"
					variant="warning"
					onConfirm={handleResetUser}
					onCancel={() => setConfirmReset(null)}
				/>
			)}

			{/* Confirm delete player */}
			{confirmDeleteUser && (
				<ConfirmModal
					title={`Delete "${confirmDeleteUser.username}"`}
					description="Permanently delete this user account across all galaxies. This cannot be undone."
					confirmLabel="Delete Account"
					variant="danger"
					onConfirm={handleDeleteUser}
					onCancel={() => setConfirmDeleteUser(null)}
				/>
			)}

			{/* Confirm complete attack */}
			{confirmAttack && (
				<ConfirmModal
					title="Instantly Complete Strike"
					description={`Force-resolve the attack from ${confirmAttack.attacker?.user?.username ?? 'Unknown'} → ${confirmAttack.defender?.user?.username ?? 'Unknown'} right now.`}
					confirmLabel="Complete Strike"
					variant="warning"
					onConfirm={handleCompleteAttack}
					onCancel={() => setConfirmAttack(null)}
				/>
			)}
		</div>
	);
}
