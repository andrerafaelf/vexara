import React, { useEffect, useState } from 'react';
import '../styles/Admin.css';
import type {
	AdminFaction,
	AllUser,
	Attack,
	Galaxy,
	GalaxyStats,
	GalaxyUser
} from '../types/admin';
import BroadcastTab from './BroadcastTab';
import FactionsTab from './FactionsTab';
import GalaxyTab from './GalaxyTab';
import Toast from './Toast';
import UsersTab from './UsersTab';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

type Tab = 'galaxy' | 'users' | 'factions' | 'broadcast';
type AddUserModal = { open: true } | null;

interface ToastMessage {
	message: string;
	type: 'success' | 'error' | 'info';
}

const Admin: React.FC = () => {
	const [tab, setTab] = useState<Tab>('galaxy');
	const [loading, setLoading] = useState(true);
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const [currentTime, setCurrentTime] = useState(new Date());

	// Galaxy data
	const [galaxies, setGalaxies] = useState<Galaxy[]>([]);
	const [selectedGalaxyId, setSelectedGalaxyId] = useState<number | null>(null);
	const [galaxyUsers, setGalaxyUsers] = useState<GalaxyUser[]>([]);
	const [stats, setStats] = useState<GalaxyStats | null>(null);
	const [attacks, setAttacks] = useState<Attack[]>([]);
	const [factions, setFactions] = useState<AdminFaction[]>([]);

	// All-users data
	const [allUsers, setAllUsers] = useState<AllUser[]>([]);

	// Add user modal (triggered from either tab)
	const [addUserModal, setAddUserModal] = useState<AddUserModal>(null);
	const [addUserForm, setAddUserForm] = useState({ username: '', email: '', password: '' });

	useEffect(() => {
		const id = setInterval(() => setCurrentTime(new Date()), 1000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		initialLoad();
	}, []);

	useEffect(() => {
		if (selectedGalaxyId != null) loadGalaxyData(selectedGalaxyId);
	}, [selectedGalaxyId]);

	const showToast = (message: string, type: 'success' | 'error' | 'info') => {
		setToast({ message, type });
	};

	const adminFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
		const headers = new Headers(options.headers || {});
		if (options.body && !headers.has('Content-Type'))
			headers.set('Content-Type', 'application/json');
		const response = await fetch(url, { ...options, headers, credentials: 'include' });
		if (response.status === 401) {
			window.location.href = '/auth';
		}
		return response;
	};

	const initialLoad = async () => {
		await Promise.all([loadGalaxies(), loadAllUsers()]);
	};

	const loadGalaxies = async () => {
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/galaxies`);
			const data = await res.json().catch(() => null);
			const list: Galaxy[] = Array.isArray(data) ? data : [];
			setGalaxies(list);
			if (selectedGalaxyId == null && list.length > 0) {
				const sorted = [...list].sort(
					(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
				const preferred = sorted.find((g) => g.status === 'active') ?? sorted[0];
				setSelectedGalaxyId(preferred.id);
			} else {
				setLoading(false);
			}
		} catch {
			setLoading(false);
		}
	};

	const loadAllUsers = async () => {
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/users/all`);
			const data = await res.json().catch(() => null);
			setAllUsers(Array.isArray(data) ? data : []);
		} catch {
			/* silent */
		}
	};

	const loadGalaxyData = async (galaxyId: number) => {
		try {
			const [usersRes, statsRes, attacksRes, factionsRes] = await Promise.all([
				adminFetch(`${ADMIN_API_URL}/users?galaxyId=${galaxyId}`),
				adminFetch(`${ADMIN_API_URL}/stats?galaxyId=${galaxyId}`),
				adminFetch(`${ADMIN_API_URL}/attacks?galaxyId=${galaxyId}`),
				adminFetch(`${ADMIN_API_URL}/factions?galaxyId=${galaxyId}`)
			]);
			const [usersData, statsData, attacksData, factionsData] = await Promise.all([
				usersRes.json().catch(() => null),
				statsRes.json().catch(() => null),
				attacksRes.json().catch(() => null),
				factionsRes.json().catch(() => null)
			]);

			setGalaxyUsers(
				Array.isArray(usersData)
					? usersData.map((u) => ({ ...u, nexuses: Array.isArray(u?.nexuses) ? u.nexuses : [] }))
					: []
			);
			setAttacks(Array.isArray(attacksData) ? attacksData : []);
			setStats(
				statsData && typeof statsData === 'object'
					? {
							userCount: Number(statsData.userCount ?? 0),
							villageCount: Number(statsData.villageCount ?? 0),
							travelingAttackCount: Number(statsData.travelingAttackCount ?? 0),
							totalAttackCount: Number(statsData.totalAttackCount ?? 0),
							newUsersThisWeek: Number(statsData.newUsersThisWeek ?? 0),
							zeroNexusCount: Number(statsData.zeroNexusCount ?? 0),
							totalTroops: Number(statsData.totalTroops ?? 0),
							avgPoints: Number(statsData.avgPoints ?? 0),
							marketCount: Number(statsData.marketCount ?? 0),
							factionCount: Number(statsData.factionCount ?? 0),
							topUsers: Array.isArray(statsData.topUsers) ? statsData.topUsers : []
						}
					: null
			);
			setFactions(Array.isArray(factionsData) ? factionsData : []);
		} catch {
			setGalaxyUsers([]);
			setStats(null);
			setAttacks([]);
			setFactions([]);
		} finally {
			setLoading(false);
		}
	};

	const loadFactions = async (galaxyId: number) => {
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/factions?galaxyId=${galaxyId}`);
			const data = await res.json().catch(() => null);
			setFactions(Array.isArray(data) ? data : []);
		} catch {
			setFactions([]);
		}
	};

	const reloadAll = async () => {
		await Promise.all([
			loadGalaxies(),
			loadAllUsers(),
			...(selectedGalaxyId != null ? [loadGalaxyData(selectedGalaxyId)] : [])
		]);
	};

	const reloadFactions = async () => {
		if (selectedGalaxyId == null) return;
		await Promise.all([loadFactions(selectedGalaxyId), loadGalaxyData(selectedGalaxyId)]);
	};

	const handleAddUser = async () => {
		if (!addUserForm.username || !addUserForm.email || !addUserForm.password) {
			showToast('Username, email and password are required', 'error');
			return;
		}
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/users`, {
				method: 'POST',
				body: JSON.stringify(addUserForm)
			});
			const data = await res.json();
			if (!res.ok) {
				showToast(data.error || 'Failed to add user', 'error');
				return;
			}
			showToast(`User "${addUserForm.username}" created`, 'success');
			setAddUserForm({ username: '', email: '', password: '' });
			setAddUserModal(null);
			reloadAll();
		} catch {
			showToast('Error adding user', 'error');
		}
	};

	if (loading) return <div className="loading">Loading admin panel…</div>;

	return (
		<div className="admin-panel">
			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

			{/* Top bar */}
			<div className="admin-top-bar">
				<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
					<h2 className="admin-title">Admin</h2>
					<div className="admin-tabs">
						<button
							className={`admin-tab${tab === 'galaxy' ? ' admin-tab-active' : ''}`}
							onClick={() => setTab('galaxy')}
						>
							Galaxy
						</button>
						<button
							className={`admin-tab${tab === 'users' ? ' admin-tab-active' : ''}`}
							onClick={() => setTab('users')}
						>
							Users
							{allUsers.filter((u) => !u.emailVerified).length > 0 && (
								<span className="admin-tab-badge">
									{allUsers.filter((u) => !u.emailVerified).length}
								</span>
							)}
							{allUsers.filter((u) => u.isFlagged).length > 0 && (
								<span
									className="admin-tab-badge"
									style={{ background: 'rgba(245,158,11,0.25)', color: 'var(--warning)' }}
								>
									{allUsers.filter((u) => u.isFlagged).length} flagged
								</span>
							)}
						</button>
						<button
							className={`admin-tab${tab === 'factions' ? ' admin-tab-active' : ''}`}
							onClick={() => setTab('factions')}
						>
							Factions
							{factions.length > 0 && <span className="admin-tab-badge">{factions.length}</span>}
						</button>
						<button
							className={`admin-tab${tab === 'broadcast' ? ' admin-tab-active' : ''}`}
							onClick={() => setTab('broadcast')}
						>
							Broadcast
						</button>
					</div>
				</div>
				<button className="btn-primary" onClick={() => setAddUserModal({ open: true })}>
					+ Add User
				</button>
			</div>

			{/* Tab content */}
			{tab === 'galaxy' && (
				<GalaxyTab
					galaxies={galaxies}
					selectedGalaxyId={selectedGalaxyId}
					onSelectGalaxy={setSelectedGalaxyId}
					users={galaxyUsers}
					stats={stats}
					attacks={attacks}
					currentTime={currentTime}
					adminFetch={adminFetch}
					showToast={showToast}
					onChanged={reloadAll}
					onAddUserClick={() => setAddUserModal({ open: true })}
				/>
			)}
			{tab === 'users' && (
				<UsersTab
					users={allUsers}
					adminFetch={adminFetch}
					showToast={showToast}
					onUserChanged={reloadAll}
				/>
			)}
			{tab === 'factions' && (
				<FactionsTab
					galaxies={galaxies}
					selectedGalaxyId={selectedGalaxyId}
					onSelectGalaxy={setSelectedGalaxyId}
					factions={factions}
					adminFetch={adminFetch}
					showToast={showToast}
					onChanged={reloadFactions}
				/>
			)}
			{tab === 'broadcast' && <BroadcastTab adminFetch={adminFetch} showToast={showToast} />}

			{/* Add user modal */}
			{addUserModal && (
				<div className="modal-overlay" onClick={() => setAddUserModal(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Add User</h3>
							<button className="modal-close" onClick={() => setAddUserModal(null)}>
								×
							</button>
						</div>
						<div className="modal-body">
							<div className="form-grid">
								<div className="form-group">
									<label>Username</label>
									<input
										value={addUserForm.username}
										onChange={(e) => setAddUserForm({ ...addUserForm, username: e.target.value })}
									/>
								</div>
								<div className="form-group">
									<label>Email</label>
									<input
										value={addUserForm.email}
										onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
									/>
								</div>
								<div className="form-group">
									<label>Password</label>
									<input
										type="password"
										value={addUserForm.password}
										onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })}
									/>
								</div>
							</div>
						</div>
						<div className="modal-footer">
							<button className="btn-secondary" onClick={() => setAddUserModal(null)}>
								Cancel
							</button>
							<button className="btn-primary" onClick={handleAddUser}>
								Create User
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Admin;
