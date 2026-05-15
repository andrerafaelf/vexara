'use client';

import React, { useEffect, useState } from 'react';
import {
  acceptFactionInvite,
  createFaction,
  declineFactionInvite,
  disbandFaction,
  getMyFaction,
  getMyFactionInvites,
  inviteToFaction,
  kickFactionMember,
  leaveFaction,
  listFactionsInGalaxy,
  setFactionMemberRole,
  updateFactionMotd,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import FactionChat from './FactionChat';
import FactionActivity from './FactionActivity';
import '../styles/Factions.css';

interface Faction {
  id: number;
  name: string;
  tag: string;
  description?: string;
  motd?: string;
  createdAt: string;
  myRole?: string;
  members?: Array<{ id: number; userId: number; username: string; role: string }>;
}

interface FactionInvite {
  id: number;
  factionId: number;
  galaxyId: number;
  factionName: string;
  factionTag: string;
  invitedByUsername: string;
  expiresAt: string;
}

interface GalaxyFaction {
  id: number;
  name: string;
  tag: string;
  description?: string;
  createdAt: string;
  memberCount: number;
}

type Tab = 'overview' | 'chat' | 'members' | 'activity';

const ROLE_ORDER: Record<string, number> = { leader: 0, officer: 1, member: 2 };

export default function FactionsView() {
  const [myFaction, setMyFaction] = useState<(Faction & { myRole: string }) | null>(null);
  const [allFactions, setAllFactions] = useState<GalaxyFaction[]>([]);
  const [invites, setInvites] = useState<FactionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTag, setFormTag] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [motdDraft, setMotdDraft] = useState('');
  const [editingMotd, setEditingMotd] = useState(false);
  const [motdSubmitting, setMotdSubmitting] = useState(false);
  const [motdError, setMotdError] = useState('');

  const { user: authUser } = useAuth();
  const currentUserId = authUser ? parseInt(authUser.id, 10) : undefined;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [myFactionRes, allFactionsRes, invitesRes] = await Promise.all([
          getMyFaction(),
          listFactionsInGalaxy(),
          getMyFactionInvites(),
        ]);
        setMyFaction(myFactionRes.data.faction);
        setAllFactions(allFactionsRes.data);
        setInvites(invitesRes.data);
        if (myFactionRes.data.faction?.motd) {
          setMotdDraft(myFactionRes.data.faction.motd);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const refreshFaction = async () => {
    const res = await getMyFaction();
    setMyFaction(res.data.faction);
    if (res.data.faction?.motd) setMotdDraft(res.data.faction.motd);
  };

  const handleCreateFaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);
    try {
      await createFaction({ name: formName, tag: formTag, description: formDesc });
      await refreshFaction();
      setShowCreateForm(false);
      setFormName(''); setFormTag(''); setFormDesc('');
    } catch (err) {
      setFormError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myFaction) return;
    setInviteError('');
    setInviteSubmitting(true);
    try {
      await inviteToFaction(myFaction.id, inviteUsername);
      setInviteUsername('');
    } catch (err) {
      setInviteError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleAcceptInvite = async (inviteId: number) => {
    try {
      await acceptFactionInvite(inviteId);
      setInvites(invites.filter((i) => i.id !== inviteId));
      await refreshFaction();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeclineInvite = async (inviteId: number) => {
    try {
      await declineFactionInvite(inviteId);
      setInvites(invites.filter((i) => i.id !== inviteId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleKickMember = async (userId: number, username: string) => {
    if (!myFaction || !confirm(`Kick ${username} from the faction?`)) return;
    try {
      await kickFactionMember(myFaction.id, userId);
      await refreshFaction();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePromoteOfficer = async (userId: number) => {
    if (!myFaction) return;
    try {
      await setFactionMemberRole(myFaction.id, userId, 'officer');
      await refreshFaction();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDemoteOfficer = async (userId: number) => {
    if (!myFaction) return;
    try {
      await setFactionMemberRole(myFaction.id, userId, 'member');
      await refreshFaction();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLeaveFaction = async () => {
    if (!myFaction || !confirm('Are you sure you want to leave this faction?')) return;
    try {
      await leaveFaction(myFaction.id);
      setMyFaction(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDisbandFaction = async () => {
    if (!myFaction || !confirm('Are you sure you want to disband this faction? This cannot be undone.')) return;
    try {
      await disbandFaction(myFaction.id);
      setMyFaction(null);
      const newAll = await listFactionsInGalaxy();
      setAllFactions(newAll.data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveMotd = async () => {
    if (!myFaction) return;
    setMotdSubmitting(true);
    setMotdError('');
    try {
      await updateFactionMotd(myFaction.id, motdDraft);
      await refreshFaction();
      setEditingMotd(false);
    } catch (err) {
      setMotdError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to save');
    } finally {
      setMotdSubmitting(false);
    }
  };

  if (loading) {
    return <div className="factions-container"><div className="factions-loading">Loading factions...</div></div>;
  }

  if (!myFaction) {
    return (
      <div className="factions-container">
        {error && <div className="factions-error" role="alert">{error}</div>}

        {invites.length > 0 && (
          <section className="factions-panel factions-invites">
            <h2>Pending Invites ({invites.length})</h2>
            <div className="factions-invite-list">
              {invites.map((invite) => (
                <div key={invite.id} className="factions-invite-item">
                  <div className="factions-invite-info">
                    <strong>{invite.factionName}</strong>
                    <span className="factions-invite-tag">[{invite.factionTag}]</span>
                    <p>Invited by {invite.invitedByUsername}</p>
                  </div>
                  <div className="factions-invite-actions">
                    <button className="factions-btn-primary" onClick={() => handleAcceptInvite(invite.id)}>Accept</button>
                    <button className="factions-btn-danger" onClick={() => handleDeclineInvite(invite.id)}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="factions-panel factions-no-faction">
          <h2>You are not in a faction</h2>
          <p>Create a new faction or ask someone to invite you.</p>
          <button className="factions-btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create Faction'}
          </button>
        </section>

        {showCreateForm && (
          <section className="factions-panel factions-create-form">
            <h2>Create a New Faction</h2>
            <form onSubmit={handleCreateFaction}>
              <label className="factions-field">
                <span className="factions-label">Faction Name</span>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Vexara Collective" disabled={formSubmitting} required />
              </label>
              <label className="factions-field">
                <span className="factions-label">Tag (2–6 characters)</span>
                <input type="text" value={formTag} onChange={(e) => setFormTag(e.target.value.toUpperCase())}
                  placeholder="e.g. VEX" maxLength={6} disabled={formSubmitting} required />
              </label>
              <label className="factions-field">
                <span className="factions-label">Description (optional)</span>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Tell us about your faction..." rows={3} disabled={formSubmitting} />
              </label>
              {formError && <div className="factions-field-error">{formError}</div>}
              <button type="submit" disabled={formSubmitting} className="factions-btn-primary">
                {formSubmitting ? 'Creating...' : 'Create Faction'}
              </button>
            </form>
          </section>
        )}

        <section className="factions-panel factions-all">
          <h2>All Factions in Galaxy ({allFactions.length})</h2>
          {allFactions.length === 0 ? (
            <p className="factions-empty">No factions yet. Be the first to create one!</p>
          ) : (
            <div className="factions-list">
              {allFactions.map((faction) => (
                <div key={faction.id} className="factions-item">
                  <div className="factions-item-header">
                    <h3>{faction.name}</h3>
                    <span className="factions-tag">{faction.tag}</span>
                  </div>
                  {faction.description && <p className="factions-item-desc">{faction.description}</p>}
                  <div className="factions-item-meta">
                    <span>{faction.memberCount} member{faction.memberCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const canManage = myFaction.myRole === 'leader' || myFaction.myRole === 'officer';
  const sortedMembers = [...(myFaction.members ?? [])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3)
  );

  return (
    <div className="factions-container">
      {error && <div className="factions-error" role="alert">{error}</div>}

      {/* Header */}
      <div className="factions-header">
        <div className="factions-header-name">
          <h1>{myFaction.name}</h1>
          <span className="factions-tag factions-tag--lg">{myFaction.tag}</span>
        </div>
        <div className="factions-header-meta">
          <span className={`factions-role-badge factions-role-badge--${myFaction.myRole}`}>{myFaction.myRole}</span>
          <span className="factions-member-count">{myFaction.members?.length ?? 0} members</span>
        </div>
      </div>

      {/* MOTD */}
      <div className="factions-motd-area">
        {editingMotd ? (
          <div className="factions-motd-editor">
            <textarea
              className="factions-motd-input"
              value={motdDraft}
              onChange={(e) => setMotdDraft(e.target.value)}
              placeholder="Set a message of the day for your faction..."
              rows={3}
              maxLength={512}
              disabled={motdSubmitting}
            />
            <div className="factions-motd-editor-actions">
              {motdError && <span className="factions-field-error">{motdError}</span>}
              <button className="factions-btn-small" onClick={() => setEditingMotd(false)}>Cancel</button>
              <button className="factions-btn-primary" onClick={handleSaveMotd} disabled={motdSubmitting}>
                {motdSubmitting ? 'Saving...' : 'Save MOTD'}
              </button>
            </div>
          </div>
        ) : (
          <div className="factions-motd-display">
            {myFaction.motd ? (
              <p className="factions-motd-text">{myFaction.motd}</p>
            ) : (
              <p className="factions-motd-empty">No message of the day set.</p>
            )}
            {canManage && (
              <button className="factions-btn-small" onClick={() => { setMotdDraft(myFaction.motd ?? ''); setEditingMotd(true); }}>
                {myFaction.motd ? 'Edit MOTD' : 'Set MOTD'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="factions-tabs">
        {(['overview', 'chat', 'members', 'activity'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`factions-tab${activeTab === tab ? ' factions-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && 'Overview'}
            {tab === 'chat' && 'Chat'}
            {tab === 'members' && `Members (${myFaction.members?.length ?? 0})`}
            {tab === 'activity' && 'Activity'}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <section className="factions-panel factions-tab-content">
          {myFaction.description && (
            <div className="factions-overview-section">
              <h3>About</h3>
              <p className="factions-description">{myFaction.description}</p>
            </div>
          )}

          <div className="factions-overview-section">
            <h3>Roster Preview</h3>
            <div className="factions-member-list">
              {sortedMembers.slice(0, 5).map((member) => (
                <div key={member.id} className="factions-member-row">
                  <div className="factions-member-info">
                    <span className="factions-member-name">{member.username}</span>
                    <span className={`factions-member-role factions-member-role--${member.role}`}>{member.role}</span>
                  </div>
                </div>
              ))}
              {sortedMembers.length > 5 && (
                <button className="factions-see-all" onClick={() => setActiveTab('members')}>
                  See all {sortedMembers.length} members →
                </button>
              )}
            </div>
          </div>

          <div className="factions-overview-stats">
            <div className="factions-stat">
              <span className="factions-stat-value">{myFaction.members?.length ?? 0}</span>
              <span className="factions-stat-label">Members</span>
            </div>
            <div className="factions-stat">
              <span className="factions-stat-value">
                {myFaction.members?.filter((m) => m.role === 'officer' || m.role === 'leader').length ?? 0}
              </span>
              <span className="factions-stat-label">Officers</span>
            </div>
            <div className="factions-stat">
              <span className="factions-stat-value">
                {new Date(myFaction.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="factions-stat-label">Founded</span>
            </div>
          </div>

          <div className="factions-actions">
            {myFaction.myRole === 'leader' ? (
              <button className="factions-btn-danger" onClick={handleDisbandFaction}>Disband Faction</button>
            ) : (
              <button className="factions-btn-danger" onClick={handleLeaveFaction}>Leave Faction</button>
            )}
          </div>
        </section>
      )}

      {/* Tab: Chat */}
      {activeTab === 'chat' && (
        <section className="factions-panel factions-tab-content factions-tab-content--chat">
          <FactionChat factionId={myFaction.id} currentUserId={currentUserId} />
        </section>
      )}

      {/* Tab: Members */}
      {activeTab === 'members' && (
        <section className="factions-panel factions-tab-content">
          {canManage && (
            <form onSubmit={handleInvite} className="factions-invite-form">
              <h3>Invite Member</h3>
              <div className="factions-invite-inline">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="Enter username"
                  disabled={inviteSubmitting}
                />
                <button type="submit" disabled={inviteSubmitting} className="factions-btn-primary">
                  {inviteSubmitting ? 'Inviting...' : 'Send Invite'}
                </button>
              </div>
              {inviteError && <div className="factions-field-error">{inviteError}</div>}
            </form>
          )}

          <div className="factions-member-list">
            {sortedMembers.map((member) => (
              <div key={member.id} className="factions-member-row">
                <div className="factions-member-info">
                  <span className="factions-member-name">{member.username}</span>
                  <span className={`factions-member-role factions-member-role--${member.role}`}>{member.role}</span>
                </div>
                {myFaction.myRole === 'leader' && member.role !== 'leader' && (
                  <div className="factions-member-actions">
                    {member.role === 'member' ? (
                      <button className="factions-btn-small" onClick={() => handlePromoteOfficer(member.userId)}>
                        Promote
                      </button>
                    ) : (
                      <button className="factions-btn-small" onClick={() => handleDemoteOfficer(member.userId)}>
                        Demote
                      </button>
                    )}
                    <button className="factions-btn-small factions-btn-danger" onClick={() => handleKickMember(member.userId, member.username)}>
                      Kick
                    </button>
                  </div>
                )}
                {myFaction.myRole === 'officer' && member.role === 'member' && (
                  <div className="factions-member-actions">
                    <button className="factions-btn-small factions-btn-danger" onClick={() => handleKickMember(member.userId, member.username)}>
                      Kick
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && (
        <section className="factions-panel factions-tab-content">
          <FactionActivity factionId={myFaction.id} />
        </section>
      )}
    </div>
  );
}
