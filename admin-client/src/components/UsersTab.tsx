import { AlertTriangle, ArrowDown, ArrowUp, Flag, FlagOff } from 'lucide-react';
import React, { useState } from 'react';
import type { AdminFetch, AllUser } from '../types/admin';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface Props {
  users: AllUser[];
  adminFetch: AdminFetch;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onUserChanged: () => void;
}

type FilterValue = 'all' | 'unverified' | 'verified' | 'flagged';
type SortKey = 'createdAt' | 'username' | 'galaxyCount';
type SortDir = 'asc' | 'desc';
type EditModal = { userId: string; username: string; email: string } | null;
type EditForm = { username: string; email: string; password: string };
type TokenModal = { userId: string; username: string } | null;
type FlagModal = { userId: string; username: string; currentReason?: string | null } | null;

export default function UsersTab({ users, adminFetch, showToast, onUserChanged }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editModal, setEditModal] = useState<EditModal>(null);
  const [editForm, setEditForm] = useState<EditForm>({ username: '', email: '', password: '' });
  const [tokenModal, setTokenModal] = useState<TokenModal>(null);
  const [tokenCount, setTokenCount] = useState('1');
  const [tokenReason, setTokenReason] = useState('manual');
  const [flagModal, setFlagModal] = useState<FlagModal>(null);
  const [flagReason, setFlagReason] = useState('');

  const term = search.trim().toLowerCase();

  const filtered = users.filter((u) => {
    if (filter === 'unverified' && u.emailVerified) return false;
    if (filter === 'verified' && !u.emailVerified) return false;
    if (filter === 'flagged' && !u.isFlagged) return false;
    if (!term) return true;
    return u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    else if (sortKey === 'username') cmp = a.username.localeCompare(b.username);
    else if (sortKey === 'galaxyCount') cmp = a.galaxyCount - b.galaxyCount;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ArrowUp size={11} style={{ marginLeft: 3, verticalAlign: '-1px' }} /> : <ArrowDown size={11} style={{ marginLeft: 3, verticalAlign: '-1px' }} />;
  };

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
      if (res.ok) showToast(data.message || `Verification email sent to ${target}`, 'success');
      else showToast(data.error || 'Failed to send verification email', 'error');
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
    if (!Object.keys(payload).length) { showToast('No changes to save', 'info'); return; }
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
    if (!Number.isFinite(count) || count < 1 || count > 50) { showToast('Count must be 1–50', 'error'); return; }
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${tokenModal.userId}/tokens`, {
        method: 'POST',
        body: JSON.stringify({ count, reason: tokenReason || 'admin_grant' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Granted ${data.granted} token${data.granted !== 1 ? 's' : ''} to ${tokenModal.username}`, 'success');
        setTokenModal(null); setTokenCount('1'); setTokenReason('manual');
      } else {
        showToast(data.error || 'Failed to grant tokens', 'error');
      }
    } catch {
      showToast('Error granting tokens', 'error');
    }
  };

  const openFlagModal = (u: AllUser) => {
    setFlagReason(u.flagReason || '');
    setFlagModal({ userId: u._id, username: u.username, currentReason: u.flagReason });
  };

  const handleFlagUser = async () => {
    if (!flagModal) return;
    const reason = flagReason.trim();
    if (!reason) { showToast('A reason is required', 'error'); return; }
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${flagModal.userId}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${flagModal.username} flagged`, 'success');
        setFlagModal(null); setFlagReason('');
        onUserChanged();
      } else {
        showToast(data.error || 'Failed to flag user', 'error');
      }
    } catch {
      showToast('Error flagging user', 'error');
    }
  };

  const handleUnflagUser = async (u: AllUser) => {
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${u._id}/flag`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(`${u.username} unflagged`, 'success');
        onUserChanged();
      } else {
        showToast(data.error || 'Failed to unflag user', 'error');
      }
    } catch {
      showToast('Error unflagging user', 'error');
    }
  };

  const flaggedCount = users.filter((u) => u.isFlagged).length;

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
          {(['all', 'unverified', 'verified', 'flagged'] as FilterValue[]).map((f) => (
            <button
              key={f}
              className={`filter-chip${filter === f ? ' filter-chip-active' : ''}${f === 'flagged' && flaggedCount > 0 ? ' filter-chip-warn' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${users.length})`
                : f === 'unverified' ? `Unverified (${users.filter((u) => !u.emailVerified).length})`
                : f === 'verified' ? `Verified (${users.filter((u) => u.emailVerified).length})`
                : <>
                    <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                    Flagged ({flaggedCount})
                  </>}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="users-tab-table-wrap">
        <table className="users-tab-table">
          <thead>
            <tr>
              <th>
                <button className="sort-btn" onClick={() => toggleSort('username')}>
                  User <SortIcon col="username" />
                </button>
              </th>
              <th>Email</th>
              <th>Status</th>
              <th>
                <button className="sort-btn" onClick={() => toggleSort('galaxyCount')}>
                  Galaxies <SortIcon col="galaxyCount" />
                </button>
              </th>
              <th>
                <button className="sort-btn" onClick={() => toggleSort('createdAt')}>
                  Joined <SortIcon col="createdAt" />
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                  No users match
                </td>
              </tr>
            )}
            {sorted.map((u) => (
              <tr key={u._id} className={u.isFlagged ? 'row-flagged' : ''}>
                <td className="cell-username">
                  {u.username}
                  {u.isFlagged && (
                    <span
                      className="flag-badge"
                      title={u.flagReason || 'Flagged'}
                    >
                      <AlertTriangle size={11} /> flagged
                    </span>
                  )}
                </td>
                <td className="cell-email">
                  {u.email}
                  {u.registrationIp && (
                    <span style={{ display: 'block', fontSize: '0.75em', color: 'var(--text-muted)', marginTop: 2 }}>
                      IP: {u.registrationIp}
                    </span>
                  )}
                </td>
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
                        Resend verify
                      </button>
                    )}
                    {u.isFlagged ? (
                      <button className="btn-action btn-cmpl" onClick={() => handleUnflagUser(u)} title="Remove flag">
                        <FlagOff size={11} aria-hidden="true" style={{ marginRight: 4, verticalAlign: '-1px' }} />
                        Unflag
                      </button>
                    ) : (
                      <button className="btn-action btn-reset" onClick={() => openFlagModal(u)} title="Flag this account">
                        <Flag size={11} aria-hidden="true" style={{ marginRight: 4, verticalAlign: '-1px' }} />
                        Flag
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

      {/* Flag modal */}
      {flagModal && (
        <div className="modal-overlay" onClick={() => setFlagModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'rgba(245,158,11,0.4)' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--warning)' }}>
                <Flag size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                Flag account: {flagModal.username}
              </h3>
              <button className="modal-close" onClick={() => setFlagModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {flagModal.currentReason && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4, fontSize: '0.875em', color: 'var(--text-muted)' }}>
                  Current flag: <strong>{flagModal.currentReason}</strong>
                </div>
              )}
              <div className="form-group">
                <label>Reason</label>
                <input
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="e.g. Suspected bot, multiaccounting, abuse…"
                  maxLength={200}
                  autoFocus
                />
                <span style={{ fontSize: '0.75em', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  {flagReason.length}/200
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setFlagModal(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleFlagUser}
                disabled={!flagReason.trim()}
                style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.4)' }}
              >
                Flag Account
              </button>
            </div>
          </div>
        </div>
      )}

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
