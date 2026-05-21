import {
  AlertTriangle,
  Building2,
  ScrollText,
  ShoppingCart,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import React, { useState } from 'react';
import type { AdminFetch, Attack, Galaxy, GalaxyStats, GalaxyUser } from '../types/admin';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

const TROOP_OPTIONS = [
  { key: 'lancerDrone', label: 'Lancer Drone' },
  { key: 'assaultTrooper', label: 'Assault Trooper' },
  { key: 'breakerUnit', label: 'Breaker Unit' },
  { key: 'reconOperative', label: 'Recon Operative' },
  { key: 'skimmerBike', label: 'Skimmer Bike' },
  { key: 'siegeMech', label: 'Siege Mech' },
  { key: 'bulwarkGuard', label: 'Bulwark Guard' },
  { key: 'suppressorTeam', label: 'Suppressor Team' },
  { key: 'disruptorUnit', label: 'Disruptor Unit' },
  { key: 'interceptorBike', label: 'Interceptor Bike' },
  { key: 'annihilatorPlatform', label: 'Annihilator Platform' },
  { key: 'overseer', label: 'Overseer' },
];

const BUILDING_OPTIONS = [
  { key: 'commandCore', label: 'Command Core' },
  { key: 'recruitmentCore', label: 'Recruitment Core' },
  { key: 'lifeSupport', label: 'Life Support' },
  { key: 'storageVault', label: 'Storage Vault' },
  { key: 'biomassFarm', label: 'Biomass Farm' },
  { key: 'alloyForge', label: 'Alloy Forge' },
  { key: 'oreExtractor', label: 'Ore Extractor' },
  { key: 'shieldGrid', label: 'Shield Grid' },
  { key: 'armory', label: 'Armory' },
  { key: 'stealthArray', label: 'Stealth Array' },
];

type PlayerModal = 'editUser' | 'resources' | 'troops' | 'buildings' | null;

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
  galaxies, selectedGalaxyId, onSelectGalaxy,
  users, stats, attacks, currentTime,
  adminFetch, showToast, onChanged, onAddUserClick,
}: Props) {
  const [modal, setModal] = useState<PlayerModal>(null);
  const [selectedUser, setSelectedUser] = useState<GalaxyUser | null>(null);
  const [editForm, setEditForm] = useState({ email: '', password: '' });
  const [resourcesForm, setResourcesForm] = useState({ nexusId: '', biomass: 0, alloy: 0, ore: 0 });
  const [troopsForm, setTroopsForm] = useState({ nexusId: '', troopType: 'reconOperative', amount: 0 });
  const [buildingsForm, setBuildingsForm] = useState({ nexusId: '', building: 'shieldGrid', level: 0 });
  const [deleteGalaxyTarget, setDeleteGalaxyTarget] = useState<Galaxy | null>(null);
  const [deleteGalaxyInput, setDeleteGalaxyInput] = useState('');
  const [deletingGalaxy, setDeletingGalaxy] = useState(false);
  const [newGalaxyName, setNewGalaxyName] = useState('');
  const [newGalaxyStartsAt, setNewGalaxyStartsAt] = useState('');
  const [creatingGalaxy, setCreatingGalaxy] = useState(false);

  const selectedGalaxy = galaxies.find((g) => g.id === selectedGalaxyId) ?? null;

  const withGalaxy = (path: string) => `${path}${path.includes('?') ? '&' : '?'}galaxyId=${selectedGalaxyId}`;

  const requireGalaxy = (): boolean => {
    if (selectedGalaxyId == null) { showToast('Select a galaxy first', 'error'); return false; }
    return true;
  };

  const openModal = (type: Exclude<PlayerModal, null>, user: GalaxyUser) => {
    const defaultNexus = user.nexuses?.[0]?._id || '';
    setSelectedUser(user);
    if (type === 'editUser') setEditForm({ email: user.email, password: '' });
    if (type === 'resources') setResourcesForm({ nexusId: defaultNexus, biomass: 0, alloy: 0, ore: 0 });
    if (type === 'troops') setTroopsForm({ nexusId: defaultNexus, troopType: 'reconOperative', amount: 0 });
    if (type === 'buildings') setBuildingsForm({ nexusId: defaultNexus, building: 'shieldGrid', level: 0 });
    setModal(type);
  };

  const closeModal = () => { setModal(null); setSelectedUser(null); };

  // ── Galaxy CRUD ──────────────────────────────────────────────────────────

  const handleCreateGalaxy = async () => {
    const name = newGalaxyName.trim();
    if (name.length < 3 || name.length > 40) { showToast('Galaxy name must be 3–40 characters', 'error'); return; }
    setCreatingGalaxy(true);
    try {
      const body: Record<string, unknown> = { name };
      if (newGalaxyStartsAt) body.startsAt = new Date(newGalaxyStartsAt).toISOString();
      const res = await adminFetch(`${ADMIN_API_URL}/galaxies`, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'Failed to create galaxy', 'error'); return; }
      showToast(`Galaxy "${name}" created`, 'success');
      setNewGalaxyName('');
      setNewGalaxyStartsAt('');
      onChanged();
    } catch { showToast('Error creating galaxy', 'error'); }
    finally { setCreatingGalaxy(false); }
  };

  const handleDeleteGalaxy = async () => {
    if (!deleteGalaxyTarget || deleteGalaxyInput !== 'delete') return;
    setDeletingGalaxy(true);
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/galaxies/${deleteGalaxyTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'Failed to delete galaxy', 'error'); return; }
      showToast(`Galaxy "${deleteGalaxyTarget.name}" deleted`, 'success');
      setDeleteGalaxyTarget(null);
      setDeleteGalaxyInput('');
      onChanged();
    } catch { showToast('Error deleting galaxy', 'error'); }
    finally { setDeletingGalaxy(false); }
  };

  // ── Player actions ───────────────────────────────────────────────────────

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    const payload: { email?: string; password?: string } = {};
    if (editForm.email) payload.email = editForm.email;
    if (editForm.password) payload.password = editForm.password;
    if (!Object.keys(payload).length) { showToast('Provide a new email or password', 'error'); return; }
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${selectedUser._id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to update user', 'error'); return; }
      showToast(`Updated credentials for ${selectedUser.username}`, 'success');
      closeModal(); onChanged();
    } catch { showToast('Error updating user', 'error'); }
  };

  const handleAdjustResources = async () => {
    if (!selectedUser || !requireGalaxy()) return;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${selectedUser._id}/resources`), { method: 'POST', body: JSON.stringify(resourcesForm) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to adjust resources', 'error'); return; }
      showToast(`Resources updated for ${selectedUser.username}`, 'success');
      closeModal(); onChanged();
    } catch { showToast('Error adjusting resources', 'error'); }
  };

  const handleAdjustTroops = async (direction: 'add' | 'remove') => {
    if (!selectedUser || !requireGalaxy()) return;
    const magnitude = Math.max(0, Math.floor(Number(troopsForm.amount) || 0));
    if (magnitude === 0) { showToast('Enter a positive amount', 'error'); return; }
    const signedAmount = direction === 'add' ? magnitude : -magnitude;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${selectedUser._id}/troops`), { method: 'POST', body: JSON.stringify({ ...troopsForm, amount: signedAmount }) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to adjust troops', 'error'); return; }
      showToast(`Troops ${direction === 'add' ? 'added' : 'removed'} for ${selectedUser.username}`, 'success');
      closeModal(); onChanged();
    } catch { showToast('Error adjusting troops', 'error'); }
  };

  const handleSetBuilding = async () => {
    if (!selectedUser || !requireGalaxy()) return;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${selectedUser._id}/buildings`), { method: 'POST', body: JSON.stringify(buildingsForm) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to update building', 'error'); return; }
      showToast(`Building updated for ${selectedUser.username}`, 'success');
      closeModal(); onChanged();
    } catch { showToast('Error updating building', 'error'); }
  };

  const handleResendVerification = async (user: GalaxyUser) => {
    const correctedEmail = window.prompt(`Resend verification email for ${user.username}.\nCorrect email if needed:`, user.email);
    if (correctedEmail === null) return;
    const target = correctedEmail.trim() || user.email;
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/resend-verification`, { method: 'POST', body: JSON.stringify({ email: target }) });
      const data = await res.json();
      if (res.ok) showToast(data.message || `Verification email sent to ${target}`, 'success');
      else showToast(data.error || 'Failed to send verification email', 'error');
    } catch { showToast('Error sending verification email', 'error'); }
  };

  const handleTestNotification = async (user: GalaxyUser) => {
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/test-notification`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) showToast(`Test notification sent to ${user.username}`, 'success');
      else showToast(data.error || 'Failed to send notification', 'error');
    } catch { showToast('Error sending test notification', 'error'); }
  };

  const handleDeleteUser = async (user: GalaxyUser) => {
    if (!window.confirm(`Delete user "${user.username}"?`)) return;
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}`, { method: 'DELETE' });
      if (res.ok) { showToast(`User "${user.username}" deleted`, 'success'); onChanged(); }
      else { const data = await res.json(); showToast(data.error || 'Failed to delete user', 'error'); }
    } catch { showToast('Error deleting user', 'error'); }
  };

  const handleResetUser = async (user: GalaxyUser) => {
    if (!requireGalaxy()) return;
    const galaxyName = selectedGalaxy?.name ?? 'this galaxy';
    if (!window.confirm(`Reset "${user.username}" in "${galaxyName}"? Removes their nexuses, attacks, queues, troops, and resources.`)) return;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${user._id}/reset-account`), { method: 'POST' });
      if (res.ok) { showToast(`Account reset for ${user.username}`, 'success'); onChanged(); }
      else { const data = await res.json(); showToast(data.error || 'Failed to reset account', 'error'); }
    } catch { showToast('Error resetting account', 'error'); }
  };

  const handleCompleteStrike = async (user: GalaxyUser) => {
    if (!requireGalaxy()) return;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${user._id}/complete-strike`), { method: 'POST' });
      if (res.ok) { showToast(`Strike completed for ${user.username}`, 'success'); onChanged(); }
      else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
    } catch { showToast('Error', 'error'); }
  };

  const handleCompleteBuild = async (user: GalaxyUser) => {
    if (!requireGalaxy()) return;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${user._id}/complete-build`), { method: 'POST', body: JSON.stringify({}) });
      if (res.ok) { showToast(`Build completed for ${user.username}`, 'success'); onChanged(); }
      else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
    } catch { showToast('Error', 'error'); }
  };

  const handleCompleteTraining = async (user: GalaxyUser) => {
    if (!requireGalaxy()) return;
    try {
      const res = await adminFetch(withGalaxy(`${ADMIN_API_URL}/users/${user._id}/complete-training`), { method: 'POST', body: JSON.stringify({}) });
      if (res.ok) { showToast(`Training completed for ${user.username}`, 'success'); onChanged(); }
      else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
    } catch { showToast('Error', 'error'); }
  };

  const handleCompleteAttack = async (attackId: string) => {
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/attacks/${attackId}/complete`, { method: 'POST' });
      if (res.ok) { showToast('Strike completed instantly', 'success'); onChanged(); }
      else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
    } catch { showToast('Error completing strike', 'error'); }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const galaxyStatus = (g: Galaxy) =>
    g.status === 'ended' ? 'ended' : g.startsAt && new Date(g.startsAt) > new Date() ? 'pending' : 'active';

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
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGalaxy(); }}
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
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectGalaxy(g.id); }}
                className={`galaxy-row${selected ? ' galaxy-row-selected' : ''}`}
              >
                <div style={{ flex: 1 }}>
                  <span className="galaxy-row-name">{g.name}</span>
                  <span className="galaxy-row-status" style={{ color: statusColor(s) }}>{s}</span>
                  <span className="galaxy-row-meta">
                    {g.playerCount} players · {g.nexusCount} nexuses
                    {g.winnerUserId ? ` · Winner #${g.winnerUserId}` : ''}
                    {' · '}{new Date(g.createdAt).toLocaleDateString()}
                    {g.startsAt ? ` · Starts ${new Date(g.startsAt).toLocaleString()}` : ''}
                  </span>
                </div>
                <button
                  className="btn-action btn-delete"
                  onClick={(e) => { e.stopPropagation(); setDeleteGalaxyTarget(g); setDeleteGalaxyInput(''); }}
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
              { icon: <Swords size={18} />, value: stats.travelingAttackCount, label: 'Active Strikes' },
              { icon: <Swords size={18} />, value: stats.totalTroops.toLocaleString(), label: 'World Troops' },
              { icon: <TrendingUp size={18} />, value: stats.avgPoints.toLocaleString(), label: 'Avg Influence' },
              { icon: <Sparkles size={18} />, value: stats.newUsersThisWeek, label: 'New This Week' },
              { icon: <AlertTriangle size={18} />, value: stats.zeroNexusCount, label: 'No Nexus', warn: true },
              { icon: <ShoppingCart size={18} />, value: stats.marketCount, label: 'Market Listings' },
              { icon: <ScrollText size={18} />, value: stats.totalAttackCount.toLocaleString(), label: 'All-time Strikes' },
            ].map(({ icon, value, label, warn }) => (
              <div key={label} className={`stat-card${warn ? ' stat-card-warn' : ''}`}>
                <div className="stat-card-icon" aria-hidden="true">{icon}</div>
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
                <h3><Trophy size={16} aria-hidden="true" /> Top Players</h3>
              </div>
              <div className="leaderboard">
                {stats.topUsers.map((u, i) => (
                  <div key={u._id} className="leaderboard-row">
                    <span className={`leaderboard-rank rank-${i + 1}`}>#{i + 1}</span>
                    <span className="leaderboard-name">{u.username}</span>
                    <span className="leaderboard-pts">{u.points.toLocaleString()} pts</span>
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
          <button className="btn-primary" style={{ fontSize: '0.8em', padding: '6px 14px' }} onClick={onAddUserClick}>
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
                  <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="user-actions">
                <button className="btn-action btn-edit" onClick={() => openModal('editUser', user)}>Edit login</button>
                <div className="action-divider" />
                <button className="btn-action btn-res" onClick={() => openModal('resources', user)}>Resources</button>
                <button className="btn-action btn-troops" onClick={() => openModal('troops', user)}>Troops</button>
                <button className="btn-action btn-bld" onClick={() => openModal('buildings', user)}>Building</button>
                <div className="action-divider" />
                <button className="btn-action btn-cmpl" onClick={() => handleCompleteStrike(user)}>Finish strike</button>
                <button className="btn-action btn-cmpl" onClick={() => handleCompleteBuild(user)}>Finish build</button>
                <button className="btn-action btn-cmpl" onClick={() => handleCompleteTraining(user)}>Finish training</button>
                <div className="action-divider" />
                <button className="btn-action btn-reset" onClick={() => handleResetUser(user)}>Reset</button>
                <button className="btn-action btn-notif" onClick={() => handleResendVerification(user)}>Resend verify</button>
                <button className="btn-action btn-notif" onClick={() => handleTestNotification(user)}>Test notif</button>
                <button className="btn-action btn-delete" onClick={() => handleDeleteUser(user)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attacks */}
      {attacks.length > 0 && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h3><Swords size={16} aria-hidden="true" /> Traveling Strikes ({attacks.length})</h3>
          </div>
          <div className="attacks-table">
            <table>
              <thead>
                <tr>
                  <th>Attacker</th>
                  <th>Defender</th>
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
                  const timeStr = h > 0 ? `${h}h ${m % 60}m ${s % 60}s` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
                  const totalTroops = Object.values(attack.troops || {}).reduce((a, b) => a + Number(b || 0), 0);
                  return (
                    <tr key={attack._id}>
                      <td>{attack.attacker?.user?.username || 'Unknown'}</td>
                      <td>{attack.defender?.user?.username || 'Unknown'}</td>
                      <td>{totalTroops}</td>
                      <td><span className={diff <= 10000 ? 'time-urgent' : ''}>{timeStr}</span></td>
                      <td>
                        <button className="btn-action btn-cmpl" onClick={() => handleCompleteAttack(attack._id)}>Complete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Player modals */}
      {modal && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {modal === 'editUser' && `Edit login: ${selectedUser.username}`}
                {modal === 'resources' && `Resources: ${selectedUser.username}`}
                {modal === 'troops' && `Troops: ${selectedUser.username}`}
                {modal === 'buildings' && `Building: ${selectedUser.username}`}
              </h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {modal === 'editUser' && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Email</label>
                    <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input type="password" placeholder="Leave blank to keep current" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                  </div>
                </div>
              )}
              {modal === 'resources' && (
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <small>Use negative values to remove resources.</small>
                  </div>
                  <div className="form-group">
                    <label>Nexus</label>
                    <select value={resourcesForm.nexusId} onChange={(e) => setResourcesForm({ ...resourcesForm, nexusId: e.target.value })}>
                      {selectedUser.nexuses.map((n) => <option key={n._id} value={n._id}>{n.name}</option>)}
                    </select>
                  </div>
                  {(['biomass', 'alloy', 'ore'] as const).map((r) => (
                    <div key={r} className="form-group">
                      <label>{r.charAt(0).toUpperCase() + r.slice(1)}</label>
                      <input type="number" value={resourcesForm[r]} onChange={(e) => setResourcesForm({ ...resourcesForm, [r]: Number(e.target.value) || 0 })} />
                    </div>
                  ))}
                </div>
              )}
              {modal === 'troops' && (
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <small>Enter a positive amount, then choose Add or Remove.</small>
                  </div>
                  <div className="form-group">
                    <label>Nexus</label>
                    <select value={troopsForm.nexusId} onChange={(e) => setTroopsForm({ ...troopsForm, nexusId: e.target.value })}>
                      {selectedUser.nexuses.map((n) => <option key={n._id} value={n._id}>{n.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Troop</label>
                    <select value={troopsForm.troopType} onChange={(e) => setTroopsForm({ ...troopsForm, troopType: e.target.value })}>
                      {TROOP_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input type="number" min="0" value={troopsForm.amount} onChange={(e) => setTroopsForm({ ...troopsForm, amount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                  </div>
                </div>
              )}
              {modal === 'buildings' && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nexus</label>
                    <select value={buildingsForm.nexusId} onChange={(e) => setBuildingsForm({ ...buildingsForm, nexusId: e.target.value })}>
                      {selectedUser.nexuses.map((n) => <option key={n._id} value={n._id}>{n.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Building</label>
                    <select value={buildingsForm.building} onChange={(e) => setBuildingsForm({ ...buildingsForm, building: e.target.value })}>
                      {BUILDING_OPTIONS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Level</label>
                    <input type="number" min="0" value={buildingsForm.level} onChange={(e) => setBuildingsForm({ ...buildingsForm, level: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              {modal === 'editUser' && <button className="btn-primary" onClick={handleUpdateUser}>Save Changes</button>}
              {modal === 'resources' && <button className="btn-primary" onClick={handleAdjustResources}>Apply</button>}
              {modal === 'troops' && (
                <>
                  <button className="btn-primary" onClick={() => handleAdjustTroops('add')}>Add Troops</button>
                  <button className="btn-secondary" onClick={() => handleAdjustTroops('remove')}>Remove Troops</button>
                </>
              )}
              {modal === 'buildings' && <button className="btn-primary" onClick={handleSetBuilding}>Set Level</button>}
            </div>
          </div>
        </div>
      )}

      {/* Delete galaxy confirm */}
      {deleteGalaxyTarget && (
        <div className="modal-overlay" onClick={() => { setDeleteGalaxyTarget(null); setDeleteGalaxyInput(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'rgba(248,81,73,0.4)' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)' }}>Delete Galaxy</h3>
              <button className="modal-close" onClick={() => { setDeleteGalaxyTarget(null); setDeleteGalaxyInput(''); }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-default)', marginBottom: 12 }}>
                Permanently delete <strong>{deleteGalaxyTarget.name}</strong>? All players, nexuses, and attacks inside will be removed.
              </p>
              <p style={{ fontSize: '0.875em', color: 'var(--text-muted)', marginBottom: 12 }}>Type <strong>delete</strong> to confirm.</p>
              <input
                type="text"
                value={deleteGalaxyInput}
                onChange={(e) => setDeleteGalaxyInput(e.target.value)}
                placeholder='Type "delete" to confirm'
                className="form-group input"
                style={{ width: '100%', padding: '9px 10px', background: 'var(--color-navy-900)', border: '1px solid var(--color-navy-400)', color: 'var(--text-strong)', borderRadius: 4, boxSizing: 'border-box' }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setDeleteGalaxyTarget(null); setDeleteGalaxyInput(''); }}>Cancel</button>
              <button
                disabled={deleteGalaxyInput !== 'delete' || deletingGalaxy}
                onClick={handleDeleteGalaxy}
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid rgba(248,81,73,0.4)', padding: '9px 20px', borderRadius: 4, fontWeight: 700, fontSize: 13, cursor: deleteGalaxyInput === 'delete' ? 'pointer' : 'not-allowed', opacity: deleteGalaxyInput === 'delete' ? 1 : 0.5 }}
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
