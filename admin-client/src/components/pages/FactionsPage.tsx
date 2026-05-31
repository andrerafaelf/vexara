'use client';
import { ChevronDown, ChevronRight, Crown, Search, Shield, Swords, Trash2, UserMinus, Users } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminFaction, AdminFetch, FactionMember, FactionRole, Galaxy } from '../../types/admin';
import ConfirmModal from '../shared/ConfirmModal';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

const ROLE_LABELS: Record<FactionRole, string> = { leader: 'Leader', officer: 'Officer', member: 'Member' };

interface Props {
  adminFetch: AdminFetch;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  galaxies: Galaxy[];
  selectedGalaxyId: number | null;
  onSelectGalaxy: (id: number) => void;
  factions: AdminFaction[];
  onChanged: () => void;
}

export default function FactionsPage({ adminFetch, showToast, galaxies, selectedGalaxyId, onSelectGalaxy, factions, onChanged }: Props) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [disbandTarget, setDisbandTarget] = useState<AdminFaction | null>(null);
  const [kickTarget, setKickTarget] = useState<{ faction: AdminFaction; member: FactionMember } | null>(null);

  const selectedGalaxy = galaxies.find((g) => g.id === selectedGalaxyId) ?? null;
  const term = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!term) return factions;
    return factions.filter((f) =>
      [f.name, f.tag, f.description ?? '', ...f.members.map((m) => `${m.username} ${m.email}`)].join(' ').toLowerCase().includes(term),
    );
  }, [factions, term]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try { await action(); } finally { setBusyKey(null); }
  };

  const handleRoleChange = async (faction: AdminFaction, member: FactionMember, role: FactionRole) => {
    if (member.role === role) return;
    await runAction(`role-${member.id}`, async () => {
      const res = await adminFetch(`${API}/factions/${faction.id}/members/${member.id}/role`, {
        method: 'PATCH', body: JSON.stringify({ role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error || 'Failed', 'error'); return; }
      showToast(`${member.username} is now ${ROLE_LABELS[role].toLowerCase()}`, 'success');
      onChanged();
    });
  };

  const handleKickMember = async () => {
    if (!kickTarget) return;
    const { faction, member } = kickTarget;
    await runAction(`kick-${member.id}`, async () => {
      const res = await adminFetch(`${API}/factions/${faction.id}/members/${member.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error || 'Failed', 'error'); return; }
      showToast(d.message || `${member.username} removed from faction`, 'success');
      setKickTarget(null);
      onChanged();
    });
  };

  const handleDisband = async () => {
    if (!disbandTarget) return;
    await runAction(`disband-${disbandTarget.id}`, async () => {
      const res = await adminFetch(`${API}/factions/${disbandTarget.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error || 'Failed', 'error'); return; }
      showToast(`[${disbandTarget.tag}] ${disbandTarget.name} disbanded`, 'success');
      setDisbandTarget(null);
      onChanged();
    });
  };

  return (
    <div className="page-body">
      <div className="section">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search faction, tag, member…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ marginLeft: 'auto' }}>
            <select
              value={selectedGalaxyId ?? ''}
              onChange={(e) => onSelectGalaxy(Number(e.target.value))}
              style={{ padding: '6px 10px', fontSize: 13, background: 'var(--color-navy-800)', border: '1px solid var(--border-default)', borderRadius: 3, color: 'var(--text-strong)' }}
            >
              {galaxies.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="faction-list">
          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon"><Shield size={18} /></div>
              <div className="empty-title">{factions.length === 0 ? 'No factions in this galaxy' : 'No factions match your search'}</div>
            </div>
          )}

          {filtered.map((faction) => {
            const expanded = expandedId === faction.id;
            const leader = faction.members.find((m) => m.role === 'leader');

            return (
              <div key={faction.id}>
                <button
                  type="button"
                  className="faction-summary"
                  onClick={() => setExpandedId(expanded ? null : faction.id)}
                >
                  <span className="faction-tag">[{faction.tag}]</span>
                  <span className="faction-name">{faction.name}</span>
                  {leader && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <Crown size={11} /> {leader.username}
                    </span>
                  )}
                  <div className="faction-metrics">
                    <span className="faction-metric"><Users size={11} /> {faction.memberCount}</span>
                    <span className="faction-metric">{faction.nexusCount} nexuses</span>
                    <span className="faction-metric">{(faction.totalPoints ?? 0).toLocaleString()} pts</span>
                    {faction.activeWarCount > 0 && (
                      <span className="faction-metric" style={{ color: 'var(--danger)' }}><Swords size={11} /> {faction.activeWarCount} wars</span>
                    )}
                    {faction.activeTreatyCount > 0 && (
                      <span className="faction-metric" style={{ color: 'var(--success)' }}>{faction.activeTreatyCount} treaties</span>
                    )}
                  </div>
                  <span style={{ color: 'var(--text-faint)', marginLeft: 4, flexShrink: 0 }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>

                {expanded && (
                  <div className="faction-details">
                    <div className="faction-meta-strip">
                      {[
                        { k: 'Invites',       v: faction.inviteCount },
                        { k: 'Join requests', v: faction.joinRequestCount },
                        { k: 'Pending wars',  v: faction.pendingWarCount },
                        { k: 'Targets',       v: faction.targetCount },
                        { k: 'Created',       v: new Date(faction.createdAt).toLocaleDateString() },
                      ].map(({ k, v }) => (
                        <div key={k} className="faction-meta-kv">
                          <span>{k}</span>
                          <strong>{v}</strong>
                        </div>
                      ))}
                    </div>

                    {(faction.description || faction.motd) && (
                      <div className="faction-desc">
                        {faction.description && <p>{faction.description}</p>}
                        {faction.motd && <p><strong>MOTD:</strong> {faction.motd}</p>}
                      </div>
                    )}

                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th className="hide-mobile">Email</th>
                            <th>Role</th>
                            <th className="r">Points</th>
                            <th className="r hide-mobile">Nexuses</th>
                            <th className="hide-mobile">Joined</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {faction.members.map((m) => (
                            <tr key={m.id}>
                              <td data-label="Member" className="col-strong">{m.username}</td>
                              <td data-label="Email" className="col-mono hide-mobile">{m.email}</td>
                              <td data-label="Role">
                                <select
                                  style={{ padding: '3px 7px', fontSize: 12, background: 'var(--color-navy-800)', border: '1px solid var(--border-default)', borderRadius: 3, color: 'var(--text-strong)' }}
                                  value={m.role}
                                  disabled={busyKey === `role-${m.id}`}
                                  onChange={(e) => handleRoleChange(faction, m, e.target.value as FactionRole)}
                                >
                                  {(['leader', 'officer', 'member'] as FactionRole[]).map((r) => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                  ))}
                                </select>
                              </td>
                              <td data-label="Points" className="col-r">{(m.points ?? 0).toLocaleString()}</td>
                              <td data-label="Nexuses" className="col-r hide-mobile">{m.nexusCount}</td>
                              <td data-label="Joined" className="hide-mobile">{new Date(m.joinedAt).toLocaleDateString()}</td>
                              <td className="col-actions">
                                <button
                                  className="btn btn-danger btn-xs"
                                  disabled={busyKey === `kick-${m.id}`}
                                  onClick={() => setKickTarget({ faction, member: m })}
                                >
                                  <UserMinus size={10} /> Kick
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="faction-danger-zone">
                      <button className="btn btn-danger btn-sm" onClick={() => setDisbandTarget(faction)}>
                        <Trash2 size={11} /> Disband Faction
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Kick confirm */}
      {kickTarget && (
        <ConfirmModal
          title={`Kick "${kickTarget.member.username}"`}
          description={`Remove ${kickTarget.member.username} from [${kickTarget.faction.tag}] ${kickTarget.faction.name}?${kickTarget.member.role === 'leader' ? ' Another member will be promoted if possible.' : ''}`}
          confirmLabel="Kick Member"
          variant="warning"
          onConfirm={handleKickMember}
          onCancel={() => setKickTarget(null)}
        />
      )}

      {/* Disband confirm */}
      {disbandTarget && (
        <ConfirmModal
          title={`Disband [${disbandTarget.tag}] ${disbandTarget.name}`}
          description="Members, invites, chat, events, wars, treaties, operations, and targets will all be removed."
          typeToConfirm={disbandTarget.tag}
          confirmLabel="Disband Faction"
          variant="danger"
          onConfirm={handleDisband}
          onCancel={() => setDisbandTarget(null)}
        />
      )}
    </div>
  );
}
