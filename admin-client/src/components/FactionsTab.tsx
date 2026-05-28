import { Crown, Search, Shield, Swords, Trash2, UserMinus, Users } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { AdminFaction, AdminFetch, FactionMember, FactionRole, Galaxy } from '../types/admin';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface Props {
  galaxies: Galaxy[];
  selectedGalaxyId: number | null;
  onSelectGalaxy: (id: number) => void;
  factions: AdminFaction[];
  adminFetch: AdminFetch;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onChanged: () => void;
}

const ROLE_LABELS: Record<FactionRole, string> = {
  leader: 'Leader',
  officer: 'Officer',
  member: 'Member',
};

export default function FactionsTab({
  galaxies,
  selectedGalaxyId,
  onSelectGalaxy,
  factions,
  adminFetch,
  showToast,
  onChanged,
}: Props) {
  const [search, setSearch] = useState('');
  const [expandedFactionId, setExpandedFactionId] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [disbandTarget, setDisbandTarget] = useState<AdminFaction | null>(null);
  const [disbandInput, setDisbandInput] = useState('');

  const selectedGalaxy = galaxies.find((g) => g.id === selectedGalaxyId) ?? null;
  const term = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!term) return factions;
    return factions.filter((faction) => {
      const haystack = [
        faction.name,
        faction.tag,
        faction.description ?? '',
        ...faction.members.map((m) => `${m.username} ${m.email}`),
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [factions, term]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
    } finally {
      setBusyKey(null);
    }
  };

  const handleRoleChange = async (faction: AdminFaction, member: FactionMember, role: FactionRole) => {
    if (member.role === role) return;
    await runAction(`role-${member.id}`, async () => {
      const res = await adminFetch(`${ADMIN_API_URL}/factions/${faction.id}/members/${member.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to update member role', 'error');
        return;
      }
      showToast(`${member.username} is now ${ROLE_LABELS[role].toLowerCase()}`, 'success');
      onChanged();
    });
  };

  const handleKickMember = async (faction: AdminFaction, member: FactionMember) => {
    const warning =
      member.role === 'leader'
        ? `Kick leader "${member.username}" from [${faction.tag}] ${faction.name}? Another member will be promoted if possible.`
        : `Kick "${member.username}" from [${faction.tag}] ${faction.name}?`;
    if (!window.confirm(warning)) return;
    await runAction(`kick-${member.id}`, async () => {
      const res = await adminFetch(`${ADMIN_API_URL}/factions/${faction.id}/members/${member.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to kick member', 'error');
        return;
      }
      showToast(data.message || `${member.username} removed from faction`, 'success');
      onChanged();
    });
  };

  const handleDisband = async () => {
    if (!disbandTarget || disbandInput !== disbandTarget.tag) return;
    await runAction(`disband-${disbandTarget.id}`, async () => {
      const res = await adminFetch(`${ADMIN_API_URL}/factions/${disbandTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to disband faction', 'error');
        return;
      }
      showToast(`Faction [${disbandTarget.tag}] ${disbandTarget.name} disbanded`, 'success');
      setDisbandTarget(null);
      setDisbandInput('');
      onChanged();
    });
  };

  return (
    <div>
      <div className="admin-section">
        <div className="admin-section-header factions-toolbar">
          <h3>
            <Shield size={16} aria-hidden="true" />
            Factions in {selectedGalaxy?.name ?? 'Galaxy'} ({factions.length})
          </h3>
          <div className="factions-toolbar-controls">
            <select
              value={selectedGalaxyId ?? ''}
              onChange={(e) => onSelectGalaxy(Number(e.target.value))}
              className="galaxy-name-input"
              aria-label="Galaxy"
            >
              {galaxies.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="factions-search">
              <Search size={14} aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search faction, tag, member..."
              />
            </div>
          </div>
        </div>

        <div className="faction-admin-list">
          {filtered.length === 0 && (
            <div className="faction-admin-empty">
              {factions.length === 0 ? 'No factions in this galaxy.' : 'No factions match your search.'}
            </div>
          )}

          {filtered.map((faction) => {
            const expanded = expandedFactionId === faction.id;
            const leader = faction.members.find((m) => m.role === 'leader');
            return (
              <section key={faction.id} className="faction-admin-row">
                <button
                  type="button"
                  className="faction-admin-summary"
                  onClick={() => setExpandedFactionId(expanded ? null : faction.id)}
                >
                  <div className="faction-admin-main">
                    <span className="faction-admin-tag">[{faction.tag}]</span>
                    <span className="faction-admin-name">{faction.name}</span>
                    {leader && <span className="faction-admin-leader"><Crown size={12} /> {leader.username}</span>}
                  </div>
                  <div className="faction-admin-metrics">
                    <span><Users size={13} /> {faction.memberCount}</span>
                    <span>{faction.nexusCount} nexuses</span>
                    <span>{faction.totalPoints.toLocaleString()} pts</span>
                    <span><Swords size={13} /> {faction.activeWarCount}</span>
                    <span>{faction.activeTreatyCount} treaties</span>
                  </div>
                </button>

                {expanded && (
                  <div className="faction-admin-details">
                    <div className="faction-admin-meta-grid">
                      <Metric label="Invites" value={faction.inviteCount} />
                      <Metric label="Join requests" value={faction.joinRequestCount} />
                      <Metric label="Pending wars" value={faction.pendingWarCount} />
                      <Metric label="Targets" value={faction.targetCount} />
                      <Metric label="Created" value={new Date(faction.createdAt).toLocaleDateString()} />
                    </div>

                    {(faction.description || faction.motd) && (
                      <div className="faction-admin-copy">
                        {faction.description && <p>{faction.description}</p>}
                        {faction.motd && <p><strong>MOTD:</strong> {faction.motd}</p>}
                      </div>
                    )}

                    <div className="faction-member-table-wrap">
                      <table className="faction-member-table">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Points</th>
                            <th>Nexuses</th>
                            <th>Joined</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {faction.members.map((member) => (
                            <tr key={member.id}>
                              <td className="cell-username">{member.username}</td>
                              <td className="cell-email">{member.email}</td>
                              <td>
                                <select
                                  className="faction-role-select"
                                  value={member.role}
                                  disabled={busyKey === `role-${member.id}`}
                                  onChange={(e) => handleRoleChange(faction, member, e.target.value as FactionRole)}
                                >
                                  {(['leader', 'officer', 'member'] as FactionRole[]).map((role) => (
                                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                  ))}
                                </select>
                              </td>
                              <td>{member.points.toLocaleString()}</td>
                              <td>{member.nexusCount}</td>
                              <td className="cell-date">{new Date(member.joinedAt).toLocaleDateString()}</td>
                              <td>
                                <button
                                  className="btn-action btn-delete"
                                  disabled={busyKey === `kick-${member.id}`}
                                  onClick={() => handleKickMember(faction, member)}
                                >
                                  <UserMinus size={12} aria-hidden="true" /> Kick
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="faction-danger-zone">
                      <button className="btn-action btn-delete" onClick={() => setDisbandTarget(faction)}>
                        <Trash2 size={12} aria-hidden="true" /> Disband faction
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {disbandTarget && (
        <div className="modal-overlay" onClick={() => { setDisbandTarget(null); setDisbandInput(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'rgba(248,81,73,0.4)' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)' }}>Disband Faction</h3>
              <button className="modal-close" onClick={() => { setDisbandTarget(null); setDisbandInput(''); }}>x</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-default)', marginBottom: 12 }}>
                Permanently disband <strong>[{disbandTarget.tag}] {disbandTarget.name}</strong>? Members, invites, chat,
                events, wars, treaties, operations, and targets tied to the faction will be removed by cascade.
              </p>
              <p style={{ fontSize: '0.875em', color: 'var(--text-muted)', marginBottom: 12 }}>
                Type <strong>{disbandTarget.tag}</strong> to confirm.
              </p>
              <input
                value={disbandInput}
                onChange={(e) => setDisbandInput(e.target.value)}
                placeholder={disbandTarget.tag}
                style={{ width: '100%' }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setDisbandTarget(null); setDisbandInput(''); }}>Cancel</button>
              <button
                className="btn-primary"
                disabled={disbandInput !== disbandTarget.tag || busyKey === `disband-${disbandTarget.id}`}
                onClick={handleDisband}
                style={{ background: 'var(--danger)' }}
              >
                Disband
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="faction-admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
