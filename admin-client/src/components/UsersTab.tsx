import React, { useState } from 'react';
import type { AllUser, AdminFetch } from '../types/admin';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface Props {
  users: AllUser[];
  adminFetch: AdminFetch;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onUserChanged: () => void;
}

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

type FilterValue = 'all' | 'unverified' | 'verified';
type EditModal = { userId: string; username: string; email: string } | null;
type EditForm = { username: string; email: string; password: string };
type TokenModal = { userId: string; username: string } | null;

export default function UsersTab({ users, adminFetch, showToast, onUserChanged }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [editModal, setEditModal] = useState<EditModal>(null);
  const [editForm, setEditForm] = useState<EditForm>({ username: '', email: '', password: '' });
  const [tokenModal, setTokenModal] = useState<TokenModal>(null);
  const [tokenCount, setTokenCount] = useState('1');
  const [tokenReason, setTokenReason] = useState('manual');

  const term = search.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (filter === 'unverified' && u.emailVerified) return false;
    if (filter === 'verified' && !u.emailVerified) return false;
    if (!term) return true;
    return u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  const handleResendVerification = async (u: AllUser) => {
    const correctedEmail = window.prompt(
      `Resend verification email for ${u.username}.\nCorrect the email if needed:`,
      u.email,
    );
    if (correctedEmail === null) return;
    const target = correctedEmail.trim() || u.email;
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${u._id}/resend-verification`, {
        method: 'POST',
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Verification email sent to ${target}`, 'success');
      } else {
        showToast(data.error || 'Failed to send verification email', 'error');
      }
    } catch {
      showToast('Error sending verification email', 'error');
    }
  };

  const openEdit = (u: AllUser) => {
    setEditForm({ username: u.username, email: u.email, password: '' });
    setEditModal({ userId: u._id, username: u.username, email: u.email });
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    const payload: { username?: string; email?: string; password?: string } = {};
    if (editForm.username && editForm.username !== editModal.username) payload.username = editForm.username;
    if (editForm.email && editForm.email !== editModal.email) payload.email = editForm.email;
    if (editForm.password) payload.password = editForm.password;
    if (!Object.keys(payload).length) {
      showToast('No changes to save', 'info');
      return;
    }
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${editModal.userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Updated credentials for ${editModal.username}`, 'success');
        setEditModal(null);
        onUserChanged();
      } else {
        showToast(data.error || 'Failed to update user', 'error');
      }
    } catch {
      showToast('Error updating user', 'error');
    }
  };

  const handleDeleteUser = async (u: AllUser) => {
    if (!window.confirm(`Permanently delete "${u.username}"? This cannot be undone.`)) return;
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${u._id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`User "${u.username}" deleted`, 'success');
        onUserChanged();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete user', 'error');
      }
    } catch {
      showToast('Error deleting user', 'error');
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
        body: JSON.stringify({ count, reason: tokenReason || 'admin_grant' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Granted ${data.granted} token${data.granted !== 1 ? 's' : ''} to ${tokenModal.username}`, 'success');
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

  return (
    <div>
      {/* Toolbar */}
      <div className="users-tab-toolbar">
        <input
          type="text"
          placeholder="Search username or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="users-tab-search"
        />
        <div className="users-tab-filters">
          {(['all', 'unverified', 'verified'] as FilterValue[]).map((f) => (
            <button
              key={f}
              className={`filter-chip${filter === f ? ' filter-chip-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${users.length})` : f === 'unverified' ? `Unverified (${users.filter((u) => !u.emailVerified).length})` : `Verified (${users.filter((u) => u.emailVerified).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="users-tab-table-wrap">
        <table className="users-tab-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Status</th>
              <th>Galaxies</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                  No users match
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u._id}>
                <td className="cell-username">{u.username}</td>
                <td className="cell-email">{u.email}</td>
                <td>
                  <span className={`status-badge ${u.emailVerified ? 'status-verified' : 'status-unverified'}`}>
                    {u.emailVerified ? 'Verified' : 'Unverified'}
                  </span>
                </td>
                <td className="cell-num">{u.galaxyCount}</td>
                <td className="cell-date">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="user-row-actions">
                    <button className="btn-action btn-edit" onClick={() => openEdit(u)}>
                      Edit
                    </button>
                    <button className="btn-action btn-notif" onClick={() => setTokenModal({ userId: u._id, username: u.username })}>
                      Tokens
                    </button>
                    {!u.emailVerified && u.hasPendingToken && (
                      <button className="btn-action btn-notif" onClick={() => handleResendVerification(u)}>
                        Resend verification
                      </button>
                    )}
                    <button className="btn-action btn-delete" onClick={() => handleDeleteUser(u)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Grant tokens modal */}
      {tokenModal && (
        <div className="modal-overlay" onClick={() => setTokenModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Grant tokens: {tokenModal.username}</h3>
              <button className="modal-close" onClick={() => setTokenModal(null)}>×</button>
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
                    value={['manual', 'compensation', 'contest', 'supporter', 'bug_fix'].includes(tokenReason) ? tokenReason : '__custom'}
                    onChange={(e) => setTokenReason(e.target.value === '__custom' ? '' : e.target.value)}
                  >
                    <option value="manual">Manual grant</option>
                    <option value="compensation">Compensation</option>
                    <option value="contest">Contest reward</option>
                    <option value="supporter">Supporter bonus</option>
                    <option value="bug_fix">Bug fix / make-good</option>
                    <option value="__custom">Custom reason…</option>
                  </select>
                  {!['manual', 'compensation', 'contest', 'supporter', 'bug_fix'].includes(tokenReason) && (
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
              <button className="btn-secondary" onClick={() => setTokenModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleGrantTokens}>Grant</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit: {editModal.username}</h3>
              <button className="modal-close" onClick={() => setEditModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  />
                </div>
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
              <button className="btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
