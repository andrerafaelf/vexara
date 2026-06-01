import {
	AlertTriangle,
	Building2,
	Coins,
	Pencil,
	Save,
	ScrollText,
	Search,
	Shield,
	ShoppingCart,
	Sparkles,
	Swords,
	TrendingUp,
	Trophy,
	Users
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type {
	AdminFetch,
	Attack,
	BuildingKey,
	Galaxy,
	GalaxyStats,
	GalaxyUser,
	TroopKey,
	UserNexus
} from '../types/admin';
import { BUILDING_KEYS, TROOP_KEYS } from '../types/admin';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

const RESOURCE_KEYS = ['biomass', 'alloy', 'ore'] as const;
type ResourceKey = (typeof RESOURCE_KEYS)[number];

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

const RESOURCE_LABELS: Record<ResourceKey, string> = {
	biomass: 'Biomass',
	alloy: 'Alloy',
	ore: 'Ore'
};

type PlayerModal = 'editUser' | 'editPlayer' | null;

type DraftMap = Partial<Record<string, number>>;

// Initial nexus first (conqueredAt == null), the rest by conqueredAt ascending.
function orderNexuses(nexuses: UserNexus[]): UserNexus[] {
	return [...nexuses].sort((a, b) => {
		if (!a.conqueredAt && b.conqueredAt) return -1;
		if (a.conqueredAt && !b.conqueredAt) return 1;
		if (!a.conqueredAt && !b.conqueredAt) return 0;
		return (
			new Date(a.conqueredAt as string).getTime() - new Date(b.conqueredAt as string).getTime()
		);
	});
}

interface Props {
	galaxies: Galaxy[];
	selectedGalaxyId: number | null;
	onSelectGalaxy: (id: number) => void;
	users: GalaxyUser[];
	stats: GalaxyStats | null;
	attacks: Attack[];
	currentTime: Date;
	adminFetch: AdminFetch;
	showToast: (message: string, type: 'success' | 'error' | 'info') => void;
	onChanged: () => void;
	onAddUserClick: () => void;
}

export default function GalaxyTab({
	galaxies,
	selectedGalaxyId,
	onSelectGalaxy,
	users,
	stats,
	attacks,
	currentTime,
	adminFetch,
	showToast,
	onChanged,
	onAddUserClick
}: Props) {
	const [modal, setModal] = useState<PlayerModal>(null);
	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState({ email: '', password: '' });

	// Player editor state
	const [editNexusId, setEditNexusId] = useState<string>('');
	const [drafts, setDrafts] = useState<DraftMap>({});
	const [editFilter, setEditFilter] = useState('');
	const [saving, setSaving] = useState(false);

	// Keep selectedUser fresh against the latest `users` prop so values reflect
	// server state when onChanged() refetches. Looking up by id (not holding a
	// captured object) means dropdown switches always see the current snapshot.
	const selectedUser: GalaxyUser | null = useMemo(
		() => (selectedUserId == null ? null : (users.find((u) => u._id === selectedUserId) ?? null)),
		[users, selectedUserId]
	);

	// Quick token grant state (reused from UsersTab pattern)
	const [tokenModal, setTokenModal] = useState<{ userId: string; username: string } | null>(null);
	const [tokenCount, setTokenCount] = useState('1');
	const [tokenReason, setTokenReason] = useState('manual');

	const [deleteGalaxyTarget, setDeleteGalaxyTarget] = useState<Galaxy | null>(null);
	const [deleteGalaxyInput, setDeleteGalaxyInput] = useState('');
	const [deletingGalaxy, setDeletingGalaxy] = useState(false);
	const [newGalaxyName, setNewGalaxyName] = useState('');
	const [newGalaxyStartsAt, setNewGalaxyStartsAt] = useState('');
	const [creatingGalaxy, setCreatingGalaxy] = useState(false);

	const selectedGalaxy = galaxies.find((g) => g.id === selectedGalaxyId) ?? null;

	const withGalaxy = (path: string) =>
		`${path}${path.includes('?') ? '&' : '?'}galaxyId=${selectedGalaxyId}`;

	const requireGalaxy = (): boolean => {
		if (selectedGalaxyId == null) {
			showToast('Select a galaxy first', 'error');
			return false;
		}
		return true;
	};

	const openEditUser = (user: GalaxyUser) => {
		setSelectedUserId(user._id);
		setEditForm({ email: user.email, password: '' });
		setModal('editUser');
	};

	const openEditPlayer = (user: GalaxyUser) => {
		setSelectedUserId(user._id);
		setEditNexusId(String(orderNexuses(user.nexuses)[0]?._id ?? ''));
		setDrafts({});
		setEditFilter('');
		setModal('editPlayer');
	};

	const closeModal = () => {
		if (saving) return;
		setModal(null);
		setSelectedUserId(null);
		setDrafts({});
		setEditFilter('');
	};

	// ── Galaxy CRUD ──────────────────────────────────────────────────────────

	const handleCreateGalaxy = async () => {
		const name = newGalaxyName.trim();
		if (name.length < 3 || name.length > 40) {
			showToast('Galaxy name must be 3–40 characters', 'error');
			return;
		}
		setCreatingGalaxy(true);
		try {
			const body: Record<string, unknown> = { name };
			if (newGalaxyStartsAt) body.startsAt = new Date(newGalaxyStartsAt).toISOString();
			const res = await adminFetch(`${ADMIN_API_URL}/galaxies`, {
				method: 'POST',
				body: JSON.stringify(body)
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				showToast(data.error || 'Failed to create galaxy', 'error');
				return;
			}
			showToast(`Galaxy "${name}" created`, 'success');
			setNewGalaxyName('');
			setNewGalaxyStartsAt('');
			onChanged();
		} catch {
			showToast('Error creating galaxy', 'error');
		} finally {
			setCreatingGalaxy(false);
		}
	};

	const handleDeleteGalaxy = async () => {
		if (!deleteGalaxyTarget || deleteGalaxyInput !== 'delete') return;
		setDeletingGalaxy(true);
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/galaxies/${deleteGalaxyTarget.id}`, {
				method: 'DELETE'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				showToast(data.error || 'Failed to delete galaxy', 'error');
				return;
			}
			showToast(`Galaxy "${deleteGalaxyTarget.name}" deleted`, 'success');
			setDeleteGalaxyTarget(null);
			setDeleteGalaxyInput('');
			onChanged();
		} catch {
			showToast('Error deleting galaxy', 'error');
		} finally {
			setDeletingGalaxy(false);
		}
	};

	// ── Player actions ───────────────────────────────────────────────────────

	const handleUpdateUser = async () => {
		if (!selectedUser) return;
		const payload: { email?: string; password?: string } = {};
		if (editForm.email) payload.email = editForm.email;
		if (editForm.password) payload.password = editForm.password;
		if (!Object.keys(payload).length) {
			showToast('Provide a new email or password', 'error');
			return;
		}
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/users/${selectedUser._id}`, {
				method: 'PATCH',
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (!res.ok) {
				showToast(data.error || 'Failed to update user', 'error');
				return;
			}
			showToast(`Updated credentials for ${selectedUser.username}`, 'success');
			closeModal();
			onChanged();
		} catch {
			showToast('Error updating user', 'error');
		}
	};

	const handleSavePlayerEdits = async () => {
		if (!selectedUser || !requireGalaxy()) return;
		const nexus = selectedUser.nexuses.find((n) => String(n._id) === editNexusId);
		if (!nexus) {
			showToast('No nexus selected', 'error');
			return;
		}

		const dirtyResources: ResourceKey[] = RESOURCE_KEYS.filter(
			(k) => drafts[k] !== undefined && drafts[k] !== nexus[k]
		);
		const dirtyBuildings: BuildingKey[] = BUILDING_KEYS.filter(
			(k) => drafts[k] !== undefined && drafts[k] !== nexus[k]
		);
		const dirtyTroops: TroopKey[] = TROOP_KEYS.filter(
			(k) => drafts[k] !== undefined && drafts[k] !== nexus[k]
		);

		const totalChanges = dirtyResources.length + dirtyBuildings.length + dirtyTroops.length;
		if (totalChanges === 0) {
			showToast('No changes to save', 'info');
			return;
		}

		setSaving(true);
		const failures: string[] = [];

		try {
			// 1. Resources — single bulk delta call to /users/:id/resources
			if (dirtyResources.length > 0) {
				const body: Record<string, unknown> = { nexusId: editNexusId };
				for (const k of dirtyResources) body[k] = (drafts[k] as number) - nexus[k];
				const res = await adminFetch(
					withGalaxy(`${ADMIN_API_URL}/users/${selectedUser._id}/resources`),
					{
						method: 'POST',
						body: JSON.stringify(body)
					}
				);
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					failures.push(`resources: ${data.error || res.statusText}`);
				}
			}

			// 2. Buildings — one request per dirty building (endpoint sets a single building)
			await Promise.all(
				dirtyBuildings.map(async (k) => {
					const res = await adminFetch(
						withGalaxy(`${ADMIN_API_URL}/users/${selectedUser._id}/buildings`),
						{
							method: 'POST',
							body: JSON.stringify({ nexusId: editNexusId, building: k, level: drafts[k] })
						}
					);
					if (!res.ok) {
						const data = await res.json().catch(() => ({}));
						failures.push(`${BUILDING_LABELS[k]}: ${data.error || res.statusText}`);
					}
				})
			);

			// 3. Troops — one signed-delta request per dirty troop
			await Promise.all(
				dirtyTroops.map(async (k) => {
					const next = drafts[k] as number;
					const delta = next - nexus[k];
					if (delta === 0) return;
					const res = await adminFetch(
						withGalaxy(`${ADMIN_API_URL}/users/${selectedUser._id}/troops`),
						{
							method: 'POST',
							body: JSON.stringify({ nexusId: editNexusId, troopType: k, amount: delta })
						}
					);
					if (!res.ok) {
						const data = await res.json().catch(() => ({}));
						failures.push(`${TROOP_LABELS[k]}: ${data.error || res.statusText}`);
					}
				})
			);

			if (failures.length === 0) {
				showToast(
					`Saved ${totalChanges} change${totalChanges === 1 ? '' : 's'} for ${selectedUser.username}`,
					'success'
				);
				closeModal();
			} else if (failures.length < totalChanges) {
				showToast(`Saved with ${failures.length} failure(s): ${failures[0]}`, 'info');
			} else {
				showToast(`Failed: ${failures[0]}`, 'error');
			}
			onChanged();
		} catch {
			showToast('Error saving changes', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleResendVerification = async (user: GalaxyUser) => {
		const correctedEmail = window.prompt(
			`Resend verification email for ${user.username}.\nCorrect email if needed:`,
			user.email
		);
		if (correctedEmail === null) return;
		const target = correctedEmail.trim() || user.email;
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/resend-verification`, {
				method: 'POST',
				body: JSON.stringify({ email: target })
			});
			const data = await res.json();
			if (res.ok) showToast(data.message || `Verification email sent to ${target}`, 'success');
			else showToast(data.error || 'Failed to send verification email', 'error');
		} catch {
			showToast('Error sending verification email', 'error');
		}
	};

	const handleTestNotification = async (user: GalaxyUser) => {
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/test-notification`, {
				method: 'POST'
			});
			const data = await res.json();
			if (res.ok) showToast(`Test notification sent to ${user.username}`, 'success');
			else showToast(data.error || 'Failed to send notification', 'error');
		} catch {
			showToast('Error sending test notification', 'error');
		}
	};

	const handleDeleteUser = async (user: GalaxyUser) => {
		if (!window.confirm(`Delete user "${user.username}"?`)) return;
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}`, { method: 'DELETE' });
			if (res.ok) {
				showToast(`User "${user.username}" deleted`, 'success');
				onChanged();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed to delete user', 'error');
			}
		} catch {
			showToast('Error deleting user', 'error');
		}
	};

	const handleResetUser = async (user: GalaxyUser) => {
		if (!requireGalaxy()) return;
		const galaxyName = selectedGalaxy?.name ?? 'this galaxy';
		if (
			!window.confirm(
				`Reset "${user.username}" in "${galaxyName}"? Removes their nexuses, attacks, queues, troops, and resources.`
			)
		)
			return;
		try {
			const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${user._id}/reset-account`), {
				method: 'POST'
			});
			if (res.ok) {
				showToast(`Account reset for ${user.username}`, 'success');
				onChanged();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed to reset account', 'error');
			}
		} catch {
			showToast('Error resetting account', 'error');
		}
	};

	const handleCompleteStrike = async (user: GalaxyUser) => {
		if (!requireGalaxy()) return;
		try {
			const res = await adminFetch(
				withGalaxy(`${ADMIN_API_URL}/users/${user._id}/complete-strike`),
				{ method: 'POST' }
			);
			if (res.ok) {
				showToast(`Strike completed for ${user.username}`, 'success');
				onChanged();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleCompleteBuild = async (user: GalaxyUser) => {
		if (!requireGalaxy()) return;
		try {
			const res = await adminFetch(
				withGalaxy(`${ADMIN_API_URL}/users/${user._id}/complete-build`),
				{ method: 'POST', body: JSON.stringify({}) }
			);
			if (res.ok) {
				showToast(`Build completed for ${user.username}`, 'success');
				onChanged();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleCompleteTraining = async (user: GalaxyUser) => {
		if (!requireGalaxy()) return;
		try {
			const res = await adminFetch(
				withGalaxy(`${ADMIN_API_URL}/users/${user._id}/complete-training`),
				{ method: 'POST', body: JSON.stringify({}) }
			);
			if (res.ok) {
				showToast(`Training completed for ${user.username}`, 'success');
				onChanged();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed', 'error');
			}
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
			const res = await adminFetch(`${ADMIN_API_URL}/users/${tokenModal.userId}/tokens`, {
				method: 'POST',
				body: JSON.stringify({ count, reason: tokenReason || 'admin_grant' })
			});
			const data = await res.json();
			if (res.ok) {
				showToast(
					`Granted ${data.granted} token${data.granted !== 1 ? 's' : ''} to ${tokenModal.username}`,
					'success'
				);
				setTokenModal(null);
				setTokenCount('1');
				setTokenReason('manual');
			} else {
				showToast(data.error || 'Failed to grant tokens', 'error');
			}
		} catch {
			showToast('Error granting tokens', 'error');
		}
	};

	const handleCompleteAttack = async (attackId: string) => {
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/attacks/${attackId}/complete`, {
				method: 'POST'
			});
			if (res.ok) {
				showToast('Strike completed instantly', 'success');
				onChanged();
			} else {
				const data = await res.json();
				showToast(data.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error completing strike', 'error');
		}
	};

	// ── Editor helpers ───────────────────────────────────────────────────────

	const orderedNexuses: UserNexus[] = useMemo(
		() => (selectedUser ? orderNexuses(selectedUser.nexuses) : []),
		[selectedUser]
	);

	const activeNexus: UserNexus | null = useMemo(() => {
		if (!selectedUser) return null;
		return (
			selectedUser.nexuses.find((n) => String(n._id) === editNexusId) ?? orderedNexuses[0] ?? null
		);
	}, [selectedUser, editNexusId, orderedNexuses]);

	const draftValueFor = (key: string, current: number): number => {
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
		const q = editFilter.trim().toLowerCase();
		return label.toLowerCase().includes(q) || key.toLowerCase().includes(q);
	};

	// ── Render ───────────────────────────────────────────────────────────────

	const galaxyStatus = (g: Galaxy) =>
		g.status === 'ended'
			? 'ended'
			: g.startsAt && new Date(g.startsAt) > new Date()
				? 'pending'
				: 'active';

	const statusColor = (s: string) =>
		s === 'ended' ? 'var(--warning)' : s === 'pending' ? 'var(--text-muted)' : '#7df58c';

	return (
		<div>
			{/* Galaxy selector + create */}
			<div className="admin-section" style={{ marginBottom: 24 }}>
				<div className="admin-section-header">
					<h3>Galaxies ({galaxies.length})</h3>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<input
							type="text"
							value={newGalaxyName}
							onChange={(e) => setNewGalaxyName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleCreateGalaxy();
							}}
							placeholder="Galaxy name"
							maxLength={40}
							className="galaxy-name-input"
						/>
						<input
							type="datetime-local"
							value={newGalaxyStartsAt}
							onChange={(e) => setNewGalaxyStartsAt(e.target.value)}
							className="galaxy-name-input"
							style={{ maxWidth: 200 }}
						/>
						<button className="btn-primary" disabled={creatingGalaxy} onClick={handleCreateGalaxy}>
							{creatingGalaxy ? 'Creating…' : '+ Create'}
						</button>
					</div>
				</div>
				<div className="galaxy-list">
					{galaxies.map((g) => {
						const s = galaxyStatus(g);
						const selected = g.id === selectedGalaxyId;
						return (
							<div
								key={g._id}
								role="button"
								tabIndex={0}
								onClick={() => onSelectGalaxy(g.id)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') onSelectGalaxy(g.id);
								}}
								className={`galaxy-row${selected ? ' galaxy-row-selected' : ''}`}
							>
								<div style={{ flex: 1 }}>
									<span className="galaxy-row-name">{g.name}</span>
									<span className="galaxy-row-status" style={{ color: statusColor(s) }}>
										{s}
									</span>
									<span className="galaxy-row-meta">
										{g.playerCount} players · {g.nexusCount} nexuses
										{g.winnerUserId ? ` · Winner #${g.winnerUserId}` : ''}
										{' · '}
										{new Date(g.createdAt).toLocaleDateString()}
										{g.startsAt ? ` · Starts ${new Date(g.startsAt).toLocaleString()}` : ''}
									</span>
								</div>
								<button
									className="btn-action btn-delete"
									onClick={(e) => {
										e.stopPropagation();
										setDeleteGalaxyTarget(g);
										setDeleteGalaxyInput('');
									}}
								>
									Delete
								</button>
							</div>
						);
					})}
				</div>
			</div>

			{/* Stats */}
			{stats && (
				<>
					<div className="admin-stats">
						{[
							{ icon: <Users size={18} />, value: stats.userCount, label: 'Players' },
							{ icon: <Building2 size={18} />, value: stats.villageCount, label: 'Nexuses' },
							{ icon: <Shield size={18} />, value: stats.factionCount ?? 0, label: 'Factions' },
							{
								icon: <Swords size={18} />,
								value: stats.travelingAttackCount,
								label: 'Active Strikes'
							},
							{
								icon: <Swords size={18} />,
								value: stats.totalTroops.toLocaleString(),
								label: 'World Troops'
							},
							{
								icon: <TrendingUp size={18} />,
								value: stats.avgPoints.toLocaleString(),
								label: 'Avg Influence'
							},
							{
								icon: <Sparkles size={18} />,
								value: stats.newUsersThisWeek,
								label: 'New This Week'
							},
							{
								icon: <AlertTriangle size={18} />,
								value: stats.zeroNexusCount,
								label: 'No Nexus',
								warn: true
							},
							{
								icon: <ShoppingCart size={18} />,
								value: stats.marketCount,
								label: 'Market Listings'
							},
							{
								icon: <ScrollText size={18} />,
								value: stats.totalAttackCount.toLocaleString(),
								label: 'All-time Strikes'
							}
						].map(({ icon, value, label, warn }) => (
							<div key={label} className={`stat-card${warn ? ' stat-card-warn' : ''}`}>
								<div className="stat-card-icon" aria-hidden="true">
									{icon}
								</div>
								<div className="stat-card-body">
									<h3>{value}</h3>
									<p>{label}</p>
								</div>
							</div>
						))}
					</div>

					{stats.topUsers.length > 0 && (
						<div className="admin-section" style={{ marginBottom: 24 }}>
							<div className="admin-section-header">
								<h3>
									<Trophy size={16} aria-hidden="true" /> Top Players
								</h3>
							</div>
							<div className="leaderboard">
								{stats.topUsers.map((u, i) => (
									<div key={u._id} className="leaderboard-row">
										<span className={`leaderboard-rank rank-${i + 1}`}>#{i + 1}</span>
										<span className="leaderboard-name">{u.username}</span>
										<span className="leaderboard-pts">{(u.points ?? 0).toLocaleString()} pts</span>
									</div>
								))}
							</div>
						</div>
					)}
				</>
			)}

			{/* Players */}
			<div className="admin-section" style={{ marginBottom: 24 }}>
				<div className="admin-section-header">
					<h3>
						Players in {selectedGalaxy?.name ?? '—'} ({users.length})
					</h3>
					<button
						className="btn-primary"
						style={{ fontSize: '0.8em', padding: '6px 14px' }}
						onClick={onAddUserClick}
					>
						+ Add User
					</button>
				</div>
				<div className="user-cards">
					{users.length === 0 && (
						<div style={{ padding: '24px 18px', color: 'var(--text-muted)', fontSize: '0.9em' }}>
							No players in this galaxy.
						</div>
					)}
					{users.map((user) => (
						<div key={user._id} className="user-card">
							<div className="user-card-info">
								<span className="user-card-name">{user.username}</span>
								<div className="user-card-meta">
									<span>{user.email}</span>
									<span className="meta-pts">{user.points} pts</span>
									<span>
										{user.nexuses.length} nexus{user.nexuses.length === 1 ? '' : 'es'}
									</span>
									<span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
								</div>
							</div>
							<div className="user-actions">
								<button className="btn-action btn-edit" onClick={() => openEditUser(user)}>
									<Pencil
										size={11}
										aria-hidden="true"
										style={{ marginRight: 4, verticalAlign: '-1px' }}
									/>
									Login
								</button>
								<button
									className="btn-action btn-edit-player"
									onClick={() => openEditPlayer(user)}
									disabled={user.nexuses.length === 0}
									title={
										user.nexuses.length === 0
											? 'No nexus to edit'
											: 'Edit resources, buildings, and troops'
									}
								>
									<Pencil
										size={11}
										aria-hidden="true"
										style={{ marginRight: 4, verticalAlign: '-1px' }}
									/>
									Edit player
								</button>
								<div className="action-divider" />
								<button className="btn-action btn-cmpl" onClick={() => handleCompleteStrike(user)}>
									Finish strike
								</button>
								<button className="btn-action btn-cmpl" onClick={() => handleCompleteBuild(user)}>
									Finish build
								</button>
								<button
									className="btn-action btn-cmpl"
									onClick={() => handleCompleteTraining(user)}
								>
									Finish training
								</button>
								<div className="action-divider" />
								<button className="btn-action btn-reset" onClick={() => handleResetUser(user)}>
									Reset
								</button>
								<button
									className="btn-action btn-notif"
									onClick={() => handleResendVerification(user)}
								>
									Resend verify
								</button>
								<button
									className="btn-action btn-notif"
									onClick={() => handleTestNotification(user)}
								>
									Test notif
								</button>
								<button
									className="btn-action btn-notif"
									onClick={() => {
										setTokenModal({ userId: user._id, username: user.username });
										setTokenCount('1');
										setTokenReason('manual');
									}}
								>
									Tokens
								</button>
								<button className="btn-action btn-delete" onClick={() => handleDeleteUser(user)}>
									Delete
								</button>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Attacks */}
			{attacks.length > 0 && (
				<div className="admin-section">
					<div className="admin-section-header">
						<h3>
							<Swords size={16} aria-hidden="true" /> Traveling Strikes ({attacks.length})
						</h3>
					</div>
					<div className="attacks-table">
						<table>
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
								{attacks.map((attack) => {
									const diff = new Date(attack.arrivesAt).getTime() - currentTime.getTime();
									const s = Math.max(0, Math.floor(diff / 1000));
									const m = Math.floor(s / 60);
									const h = Math.floor(m / 60);
									const timeStr =
										h > 0 ? `${h}h ${m % 60}m ${s % 60}s` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
									const totalTroops = Object.values(attack.troops || {}).reduce(
										(a, b) => a + Number(b || 0),
										0
									);
									const typeColors: Record<string, string> = {
										attack: 'var(--danger)',
										scout: '#7aa2ff',
										support: '#7df58c'
									};
									const attackType = attack.type || 'attack';
									return (
										<tr key={attack._id}>
											<td data-label="Attacker">{attack.attacker?.user?.username || 'Unknown'}</td>
											<td data-label="Defender">{attack.defender?.user?.username || 'Unknown'}</td>
											<td data-label="Type">
												<span
													style={{
														color: typeColors[attackType] ?? 'var(--text-muted)',
														fontWeight: 600,
														fontSize: '0.8em',
														textTransform: 'uppercase',
														letterSpacing: '0.05em'
													}}
												>
													{attackType}
												</span>
											</td>
											<td data-label="Troops">{totalTroops}</td>
											<td data-label="Arrives in">
												<span className={diff <= 10000 ? 'time-urgent' : ''}>{timeStr}</span>
											</td>
											<td>
												<button
													className="btn-action btn-cmpl"
													onClick={() => handleCompleteAttack(attack._id)}
												>
													Complete
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Edit login modal */}
			{modal === 'editUser' && selectedUser && (
				<div className="modal-overlay" onClick={closeModal}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Edit login: {selectedUser.username}</h3>
							<button className="modal-close" onClick={closeModal}>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="form-grid">
								<div className="form-group">
									<label>Email</label>
									<input
										value={editForm.email}
										onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
									/>
								</div>
								<div className="form-group">
									<label>New Password</label>
									<input
										type="password"
										placeholder="Leave blank to keep current"
										value={editForm.password}
										onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
									/>
								</div>
							</div>
						</div>
						<div className="modal-footer">
							<button className="btn-secondary" onClick={closeModal}>
								Cancel
							</button>
							<button className="btn-primary" onClick={handleUpdateUser}>
								Save Changes
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Edit player modal (resources / buildings / troops) */}
			{modal === 'editPlayer' && selectedUser && activeNexus && (
				<div className="modal-overlay" onClick={closeModal}>
					<div
						className="modal-content player-editor"
						onClick={(e) => e.stopPropagation()}
						style={{ maxWidth: 720 }}
					>
						<div className="modal-header">
							<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
								<h3 style={{ margin: 0 }}>
									<Pencil size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
									{selectedUser.username}
								</h3>
								<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
									{selectedUser.email} · {selectedUser.points} pts
								</span>
							</div>
							<button className="modal-close" onClick={closeModal} disabled={saving}>
								×
							</button>
						</div>

						<div className="player-editor-toolbar">
							{orderedNexuses.length > 1 ? (
								<div className="form-group" style={{ flex: '1 1 280px' }}>
									<label>Nexus</label>
									<select
										value={editNexusId}
										onChange={(e) => {
											setEditNexusId(e.target.value);
											setDrafts({});
										}}
										disabled={saving}
									>
										{orderedNexuses.map((n) => {
											const coords = n.x != null && n.y != null ? ` (${n.x}|${n.y})` : '';
											return (
												<option key={n._id} value={String(n._id)}>
													{n.name}
													{coords} · CC{n.commandCore}
												</option>
											);
										})}
									</select>
								</div>
							) : (
								<div className="player-editor-nexus-chip">
									<Building2 size={13} /> {activeNexus.name}
								</div>
							)}
							<div className="player-editor-search">
								<Search size={14} aria-hidden="true" />
								<input
									type="text"
									value={editFilter}
									onChange={(e) => setEditFilter(e.target.value)}
									placeholder="Filter buildings, troops, resources…"
									disabled={saving}
								/>
							</div>
							<div className="player-editor-pop">
								Population <strong>{(activeNexus.populationCurrent ?? 0).toLocaleString()}</strong>{' '}
								/ {(activeNexus.populationMax ?? 0).toLocaleString()}
							</div>
						</div>

						<div className="modal-body player-editor-body">
							{/* Resources */}
							<EditorSection
								title="Resources"
								icon={<Coins size={14} />}
								accent="rgba(245, 158, 11, 0.6)"
							>
								{RESOURCE_KEYS.filter((k) => filterMatches(RESOURCE_LABELS[k], k)).map((k) => {
									const current = activeNexus[k] ?? 0;
									const draft = draftValueFor(k, current);
									const dirty = draft !== current;
									return (
										<EditorRow
											key={k}
											label={RESOURCE_LABELS[k]}
											current={current}
											draft={draft}
											dirty={dirty}
											onChange={(v) => setDraft(k, v, current)}
											onReset={() => setDraft(k, current, current)}
											disabled={saving}
										/>
									);
								})}
							</EditorSection>

							{/* Buildings */}
							<EditorSection
								title="Buildings"
								icon={<Building2 size={14} />}
								accent="rgba(122, 162, 255, 0.6)"
							>
								{BUILDING_KEYS.filter((k) => filterMatches(BUILDING_LABELS[k], k)).map((k) => {
									const current = activeNexus[k] ?? 0;
									const draft = draftValueFor(k, current);
									const dirty = draft !== current;
									return (
										<EditorRow
											key={k}
											label={BUILDING_LABELS[k]}
											current={current}
											draft={draft}
											dirty={dirty}
											hint="level"
											onChange={(v) => setDraft(k, v, current)}
											onReset={() => setDraft(k, current, current)}
											disabled={saving}
										/>
									);
								})}
							</EditorSection>

							{/* Troops */}
							<EditorSection
								title="Troops"
								icon={<Swords size={14} />}
								accent="rgba(239, 68, 68, 0.55)"
							>
								{TROOP_KEYS.filter((k) => filterMatches(TROOP_LABELS[k], k)).map((k) => {
									const current = activeNexus[k] ?? 0;
									const draft = draftValueFor(k, current);
									const dirty = draft !== current;
									return (
										<EditorRow
											key={k}
											label={TROOP_LABELS[k]}
											current={current}
											draft={draft}
											dirty={dirty}
											onChange={(v) => setDraft(k, v, current)}
											onReset={() => setDraft(k, current, current)}
											disabled={saving}
										/>
									);
								})}
							</EditorSection>
						</div>

						<div className="modal-footer" style={{ justifyContent: 'space-between' }}>
							<span
								style={{
									fontSize: 12,
									color: totalDirty > 0 ? 'var(--accent)' : 'var(--text-muted)'
								}}
							>
								{totalDirty === 0
									? 'No pending changes'
									: `${totalDirty} pending change${totalDirty === 1 ? '' : 's'}`}
							</span>
							<div style={{ display: 'flex', gap: 10 }}>
								<button
									className="btn-secondary"
									onClick={() => setDrafts({})}
									disabled={saving || totalDirty === 0}
								>
									Reset
								</button>
								<button className="btn-secondary" onClick={closeModal} disabled={saving}>
									Cancel
								</button>
								<button
									className="btn-primary"
									onClick={handleSavePlayerEdits}
									disabled={saving || totalDirty === 0}
								>
									<Save size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />
									{saving
										? 'Saving…'
										: totalDirty === 0
											? 'Save'
											: `Save ${totalDirty} change${totalDirty === 1 ? '' : 's'}`}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Token grant modal */}
			{tokenModal && (
				<div className="modal-overlay" onClick={() => setTokenModal(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Grant tokens: {tokenModal.username}</h3>
							<button className="modal-close" onClick={() => setTokenModal(null)}>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="form-grid">
								<div className="form-group">
									<label>Count (1–50)</label>
									<input
										type="number"
										min={1}
										max={50}
										value={tokenCount}
										onChange={(e) => setTokenCount(e.target.value)}
									/>
								</div>
								<div className="form-group">
									<label>Reason</label>
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
											placeholder="Enter custom reason"
											autoFocus
										/>
									)}
								</div>
							</div>
						</div>
						<div className="modal-footer">
							<button className="btn-secondary" onClick={() => setTokenModal(null)}>
								Cancel
							</button>
							<button className="btn-primary" onClick={handleGrantTokens}>
								Grant
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete galaxy confirm */}
			{deleteGalaxyTarget && (
				<div
					className="modal-overlay"
					onClick={() => {
						setDeleteGalaxyTarget(null);
						setDeleteGalaxyInput('');
					}}
				>
					<div
						className="modal-content"
						onClick={(e) => e.stopPropagation()}
						style={{ borderColor: 'rgba(248,81,73,0.4)' }}
					>
						<div className="modal-header">
							<h3 style={{ color: 'var(--danger)' }}>Delete Galaxy</h3>
							<button
								className="modal-close"
								onClick={() => {
									setDeleteGalaxyTarget(null);
									setDeleteGalaxyInput('');
								}}
							>
								×
							</button>
						</div>
						<div className="modal-body">
							<p style={{ color: 'var(--text-default)', marginBottom: 12 }}>
								Permanently delete <strong>{deleteGalaxyTarget.name}</strong>? All players, nexuses,
								and attacks inside will be removed.
							</p>
							<p style={{ fontSize: '0.875em', color: 'var(--text-muted)', marginBottom: 12 }}>
								Type <strong>delete</strong> to confirm.
							</p>
							<input
								type="text"
								value={deleteGalaxyInput}
								onChange={(e) => setDeleteGalaxyInput(e.target.value)}
								placeholder='Type "delete" to confirm'
								className="form-group input"
								style={{
									width: '100%',
									padding: '9px 10px',
									background: 'var(--color-navy-900)',
									border: '1px solid var(--color-navy-400)',
									color: 'var(--text-strong)',
									borderRadius: 4,
									boxSizing: 'border-box'
								}}
							/>
						</div>
						<div className="modal-footer">
							<button
								className="btn-secondary"
								onClick={() => {
									setDeleteGalaxyTarget(null);
									setDeleteGalaxyInput('');
								}}
							>
								Cancel
							</button>
							<button
								disabled={deleteGalaxyInput !== 'delete' || deletingGalaxy}
								onClick={handleDeleteGalaxy}
								style={{
									background: 'var(--danger-soft)',
									color: 'var(--danger)',
									border: '1px solid rgba(248,81,73,0.4)',
									padding: '9px 20px',
									borderRadius: 4,
									fontWeight: 700,
									fontSize: 13,
									cursor: deleteGalaxyInput === 'delete' ? 'pointer' : 'not-allowed',
									opacity: deleteGalaxyInput === 'delete' ? 1 : 0.5
								}}
							>
								{deletingGalaxy ? 'Deleting…' : 'Delete Galaxy'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────
// Player editor sub-components
// ──────────────────────────────────────────────────────────────────────────

function EditorSection({
	title,
	icon,
	accent,
	children
}: {
	title: string;
	icon: React.ReactNode;
	accent: string;
	children: React.ReactNode;
}) {
	const childArray = React.Children.toArray(children);
	if (childArray.length === 0) return null;
	return (
		<section className="editor-section">
			<header className="editor-section-header" style={{ borderLeft: `3px solid ${accent}` }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
					{icon}
					{title}
				</span>
				<span className="editor-section-count">{childArray.length}</span>
			</header>
			<div className="editor-rows">{children}</div>
		</section>
	);
}

function EditorRow({
	label,
	current,
	draft,
	dirty,
	hint,
	onChange,
	onReset,
	disabled
}: {
	label: string;
	current: number;
	draft: number;
	dirty: boolean;
	hint?: string;
	onChange: (v: number) => void;
	onReset: () => void;
	disabled?: boolean;
}) {
	const safeCurrent = Number.isFinite(current) ? current : 0;
	const diff = draft - safeCurrent;
	return (
		<div className={`editor-row${dirty ? ' editor-row-dirty' : ''}`}>
			<div className="editor-row-label">{label}</div>
			<div className="editor-row-current">
				<span className="editor-row-current-num">{safeCurrent.toLocaleString()}</span>
				{hint && <span className="editor-row-hint">{hint}</span>}
			</div>
			<div className="editor-row-arrow">→</div>
			<input
				className="editor-row-input"
				type="number"
				min={0}
				value={Number.isFinite(draft) ? draft : 0}
				onChange={(e) => {
					const n = Math.max(0, Math.floor(Number(e.target.value)));
					onChange(Number.isFinite(n) ? n : 0);
				}}
				onFocus={(e) => e.target.select()}
				disabled={disabled}
			/>
			<div className="editor-row-delta">
				{dirty && (
					<>
						<span className={diff > 0 ? 'delta-pos' : 'delta-neg'}>
							{diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
						</span>
						<button
							type="button"
							className="editor-row-undo"
							onClick={onReset}
							disabled={disabled}
							title="Discard this change"
							aria-label="Discard this change"
						>
							↺
						</button>
					</>
				)}
			</div>
		</div>
	);
}
