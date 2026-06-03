'use client';
import {
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	Bell,
	Building2,
	Coins,
	Flag,
	FlagOff,
	Pencil,
	RotateCcw,
	Save,
	Search,
	Swords,
	Trash2
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminFetch, AllUser, BuildingKey, TroopKey, UserNexus } from '../../types/admin';
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
	hangarBay: 'Hangar Bay',
	plasmaForge: 'Plasma Forge',
	armorFoundry: 'Armor Foundry',
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

type SortKey = 'createdAt' | 'username' | 'galaxyCount';
type SortDir = 'asc' | 'desc';
type FilterVal = 'all' | 'unverified' | 'verified' | 'flagged';
type DraftMap = Partial<Record<string, number>>;

function orderNexuses(nx: UserNexus[]): UserNexus[] {
	return [...nx].sort((a, b) => {
		if (!a.conqueredAt && b.conqueredAt) return -1;
		if (a.conqueredAt && !b.conqueredAt) return 1;
		if (!a.conqueredAt && !b.conqueredAt) return 0;
		return new Date(a.conqueredAt!).getTime() - new Date(b.conqueredAt!).getTime();
	});
}

interface Props {
	adminFetch: AdminFetch;
	showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function PlayersPage({ adminFetch, showToast }: Props) {
	const [users, setUsers] = useState<AllUser[]>([]);
	const [loading, setLoading] = useState(true);

	const [search, setSearch] = useState('');
	const [filter, setFilter] = useState<FilterVal>('all');
	const [sortKey, setSortKey] = useState<SortKey>('createdAt');
	const [sortDir, setSortDir] = useState<SortDir>('desc');

	// Modals
	const [editModal, setEditModal] = useState<AllUser | null>(null);
	const [editForm, setEditForm] = useState({ username: '', email: '', password: '' });

	const [tokenModal, setTokenModal] = useState<AllUser | null>(null);
	const [tokenCount, setTokenCount] = useState('1');
	const [tokenReason, setTokenReason] = useState('manual');

	const [flagModal, setFlagModal] = useState<AllUser | null>(null);
	const [flagReason, setFlagReason] = useState('');

	const [deleteTarget, setDeleteTarget] = useState<AllUser | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await adminFetch(`${API}/users/all`);
			const data = await res.json().catch(() => null);
			setUsers(Array.isArray(data) ? data : []);
		} catch {
			/* silent */
		} finally {
			setLoading(false);
		}
	}, [adminFetch]);

	useEffect(() => {
		load();
	}, [load]);

	const term = search.trim().toLowerCase();

	const filtered = useMemo(() => {
		let list = users;
		if (filter === 'unverified') list = list.filter((u) => !u.emailVerified);
		if (filter === 'verified') list = list.filter((u) => u.emailVerified);
		if (filter === 'flagged') list = list.filter((u) => u.isFlagged);
		if (term)
			list = list.filter(
				(u) => u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
			);
		return [...list].sort((a, b) => {
			let cmp = 0;
			if (sortKey === 'createdAt')
				cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			if (sortKey === 'username') cmp = a.username.localeCompare(b.username);
			if (sortKey === 'galaxyCount') cmp = a.galaxyCount - b.galaxyCount;
			return sortDir === 'asc' ? cmp : -cmp;
		});
	}, [users, filter, term, sortKey, sortDir]);

	const toggleSort = (k: SortKey) => {
		if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
		else {
			setSortKey(k);
			setSortDir('desc');
		}
	};

	const SortIcon = ({ col }: { col: SortKey }) => {
		if (sortKey !== col) return null;
		return sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
	};

	// ── actions ────────────────────────────────────────────────────
	const handleSaveEdit = async () => {
		if (!editModal) return;
		const payload: Record<string, string> = {};
		if (editForm.username && editForm.username !== editModal.username)
			payload.username = editForm.username;
		if (editForm.email && editForm.email !== editModal.email) payload.email = editForm.email;
		if (editForm.password) payload.password = editForm.password;
		if (!Object.keys(payload).length) {
			showToast('No changes', 'info');
			return;
		}
		try {
			const res = await adminFetch(`${API}/users/${editModal._id}`, {
				method: 'PATCH',
				body: JSON.stringify(payload)
			});
			const d = await res.json();
			if (res.ok) {
				showToast(`Updated ${editModal.username}`, 'success');
				setEditModal(null);
				load();
			} else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleResendVerification = async (u: AllUser) => {
		try {
			const res = await adminFetch(`${API}/users/${u._id}/resend-verification`, {
				method: 'POST',
				body: JSON.stringify({ email: u.email })
			});
			const d = await res.json();
			if (res.ok) showToast(d.message || `Sent to ${u.email}`, 'success');
			else showToast(d.error || 'Failed', 'error');
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
				showToast(`Granted ${d.granted} token(s) to ${tokenModal.username}`, 'success');
				setTokenModal(null);
			} else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleFlag = async () => {
		if (!flagModal || !flagReason.trim()) return;
		try {
			const res = await adminFetch(`${API}/users/${flagModal._id}/flag`, {
				method: 'POST',
				body: JSON.stringify({ reason: flagReason.trim() })
			});
			const d = await res.json();
			if (res.ok) {
				showToast(`${flagModal.username} flagged`, 'success');
				setFlagModal(null);
				setFlagReason('');
				load();
			} else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleUnflag = async (u: AllUser) => {
		try {
			const res = await adminFetch(`${API}/users/${u._id}/flag`, { method: 'DELETE' });
			const d = await res.json();
			if (res.ok) {
				showToast(`${u.username} unflagged`, 'success');
				load();
			} else showToast(d.error || 'Failed', 'error');
		} catch {
			showToast('Error', 'error');
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		try {
			const res = await adminFetch(`${API}/users/${deleteTarget._id}`, { method: 'DELETE' });
			if (res.ok) {
				showToast(`Deleted ${deleteTarget.username}`, 'success');
				setDeleteTarget(null);
				load();
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed', 'error');
			}
		} catch {
			showToast('Error', 'error');
		}
	};

	const flaggedCount = users.filter((u) => u.isFlagged).length;

	if (loading)
		return (
			<div className="page-loading">
				<div className="spinner" /> Loading players…
			</div>
		);

	return (
		<div className="page-body">
			<div className="section">
				<div className="toolbar">
					<div className="search-wrap">
						<Search size={13} className="search-icon" />
						<input
							className="search-input"
							placeholder="Search username or email…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<div className="filter-pills">
						{(['all', 'unverified', 'verified', 'flagged'] as FilterVal[]).map((f) => (
							<button
								key={f}
								className={`filter-pill${filter === f ? ' active' : ''}${f === 'flagged' ? ' warn' : ''}`}
								onClick={() => setFilter(f)}
							>
								{f === 'flagged' && <Flag size={10} />}
								{f === 'all'
									? `All (${users.length})`
									: f === 'unverified'
										? `Unverified (${users.filter((u) => !u.emailVerified).length})`
										: f === 'verified'
											? `Verified (${users.filter((u) => u.emailVerified).length})`
											: `Flagged (${flaggedCount})`}
							</button>
						))}
					</div>
					<div style={{ marginLeft: 'auto' }}>
						<button className="btn btn-ghost btn-sm" onClick={load}>
							Refresh
						</button>
					</div>
				</div>

				<div className="table-wrap">
					<table className="data-table">
						<thead>
							<tr>
								<th
									className={`sortable${sortKey === 'username' ? ' sorted' : ''}`}
									onClick={() => toggleSort('username')}
								>
									User <SortIcon col="username" />
								</th>
								<th>Email</th>
								<th>Status</th>
								<th
									className={`sortable r${sortKey === 'galaxyCount' ? ' sorted' : ''}`}
									onClick={() => toggleSort('galaxyCount')}
								>
									Galaxies <SortIcon col="galaxyCount" />
								</th>
								<th
									className={`sortable${sortKey === 'createdAt' ? ' sorted' : ''}`}
									onClick={() => toggleSort('createdAt')}
								>
									Joined <SortIcon col="createdAt" />
								</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{filtered.length === 0 && (
								<tr>
									<td
										colSpan={6}
										style={{
											textAlign: 'center',
											color: 'var(--text-faint)',
											padding: '40px 0',
											fontSize: 13
										}}
									>
										No users match
									</td>
								</tr>
							)}
							{filtered.map((u) => (
								<tr key={u._id} className={u.isFlagged ? 'row-flagged' : ''}>
									<td data-label="User" className="col-strong">
										{u.username}
										{u.isFlagged && (
											<span
												className="flag-badge"
												style={{ marginLeft: 6 }}
												title={u.flagReason || 'Flagged'}
											>
												<AlertTriangle size={9} /> flagged
											</span>
										)}
									</td>
									<td data-label="Email" className="col-mono">
										{u.email}
										{u.registrationIp && (
											<span style={{ display: 'block', color: 'var(--text-faint)', marginTop: 2 }}>
												IP: {u.registrationIp}
											</span>
										)}
									</td>
									<td data-label="Status">
										<span
											className={`badge ${u.emailVerified ? 'badge-success' : 'badge-warning'}`}
										>
											{u.emailVerified ? 'Verified' : 'Unverified'}
										</span>
									</td>
									<td data-label="Galaxies" className="col-r">
										{u.galaxyCount}
									</td>
									<td data-label="Joined">{new Date(u.createdAt).toLocaleDateString()}</td>
									<td data-label="Actions" className="col-actions">
										<div className="row-actions">
											<button
												className="btn btn-ghost btn-xs"
												onClick={() => {
													setEditForm({ username: u.username, email: u.email, password: '' });
													setEditModal(u);
												}}
											>
												<Pencil size={10} /> Edit
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
											{!u.emailVerified && u.hasPendingToken && (
												<button
													className="btn btn-ghost btn-xs"
													onClick={() => handleResendVerification(u)}
												>
													<Bell size={10} /> Resend
												</button>
											)}
											{u.isFlagged ? (
												<button className="btn btn-success btn-xs" onClick={() => handleUnflag(u)}>
													<FlagOff size={10} /> Unflag
												</button>
											) : (
												<button
													className="btn btn-warning btn-xs"
													onClick={() => {
														setFlagReason(u.flagReason || '');
														setFlagModal(u);
													}}
												>
													<Flag size={10} /> Flag
												</button>
											)}
											<button className="btn btn-danger btn-xs" onClick={() => setDeleteTarget(u)}>
												<Trash2 size={10} />
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{/* Edit modal */}
			{editModal && (
				<div className="modal-overlay" onClick={() => setEditModal(null)}>
					<div className="modal-box" onClick={(e) => e.stopPropagation()}>
						<div className="modal-head">
							<h3>Edit: {editModal.username}</h3>
							<button className="modal-close" onClick={() => setEditModal(null)}>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="form-grid-1 form-grid">
								<div className="form-field">
									<label className="form-label">Username</label>
									<input
										value={editForm.username}
										onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
									/>
								</div>
								<div className="form-field">
									<label className="form-label">Email</label>
									<input
										value={editForm.email}
										onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
									/>
								</div>
								<div className="form-field">
									<label className="form-label">New Password</label>
									<input
										type="password"
										placeholder="Leave blank to keep current"
										value={editForm.password}
										onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
									/>
								</div>
							</div>
						</div>
						<div className="modal-foot">
							<button className="btn btn-ghost" onClick={() => setEditModal(null)}>
								Cancel
							</button>
							<button className="btn btn-primary" onClick={handleSaveEdit}>
								Save Changes
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

			{/* Flag modal */}
			{flagModal && (
				<div className="modal-overlay" onClick={() => setFlagModal(null)}>
					<div
						className="modal-box"
						onClick={(e) => e.stopPropagation()}
						style={{ borderColor: 'rgba(210,153,34,0.4)' }}
					>
						<div className="modal-head">
							<h3 style={{ color: 'var(--warning)' }}>
								<Flag size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
								Flag: {flagModal.username}
							</h3>
							<button className="modal-close" onClick={() => setFlagModal(null)}>
								×
							</button>
						</div>
						<div className="modal-body">
							{flagModal.flagReason && (
								<div
									style={{
										marginBottom: 14,
										padding: '8px 12px',
										background: 'var(--warning-soft)',
										border: '1px solid rgba(210,153,34,0.3)',
										borderRadius: 4,
										fontSize: 12,
										color: 'var(--text-muted)'
									}}
								>
									Current flag: <strong>{flagModal.flagReason}</strong>
								</div>
							)}
							<div className="form-field">
								<label className="form-label">Reason</label>
								<input
									value={flagReason}
									onChange={(e) => setFlagReason(e.target.value)}
									placeholder="e.g. Suspected bot, multiaccounting, abuse…"
									maxLength={200}
									autoFocus
								/>
								<span className="form-hint">{flagReason.length}/200</span>
							</div>
						</div>
						<div className="modal-foot">
							<button className="btn btn-ghost" onClick={() => setFlagModal(null)}>
								Cancel
							</button>
							<button
								className="btn btn-warning"
								onClick={handleFlag}
								disabled={!flagReason.trim()}
							>
								Flag Account
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete confirm */}
			{deleteTarget && (
				<ConfirmModal
					title="Delete Account"
					description={`Permanently delete "${deleteTarget.username}"? All their nexuses, attacks, and game data will be removed.`}
					confirmLabel="Delete Account"
					variant="danger"
					onConfirm={handleDelete}
					onCancel={() => setDeleteTarget(null)}
				/>
			)}
		</div>
	);
}
