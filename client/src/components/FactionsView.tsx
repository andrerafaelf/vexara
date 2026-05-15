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
} from '../services/api';
import '../styles/Factions.css';

interface Faction {
  id: number;
  name: string;
  tag: string;
  description?: string;
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

export default function FactionsView() {
  const [myFaction, setMyFaction] = useState<(Faction & { myRole: string }) | null>(null);
  const [allFactions, setAllFactions] = useState<GalaxyFaction[]>([]);
  const [invites, setInvites] = useState<FactionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTag, setFormTag] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

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
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCreateFaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    try {
      await createFaction({ name: formName, tag: formTag, description: formDesc });
      const newMyFaction = await getMyFaction();
      setMyFaction(newMyFaction.data.faction);
      setShowCreateForm(false);
      setFormName('');
      setFormTag('');
      setFormDesc('');
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
      const newMyFaction = await getMyFaction();
      setMyFaction(newMyFaction.data.faction);
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

  const handleKickMember = async (userId: number) => {
    if (!myFaction || !confirm('Are you sure you want to kick this member?')) return;
    try {
      await kickFactionMember(myFaction.id, userId);
      const newMyFaction = await getMyFaction();
      setMyFaction(newMyFaction.data.faction);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePromoteOfficer = async (userId: number) => {
    if (!myFaction) return;
    try {
      await setFactionMemberRole(myFaction.id, userId, 'officer');
      const newMyFaction = await getMyFaction();
      setMyFaction(newMyFaction.data.faction);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDemoteOfficer = async (userId: number) => {
    if (!myFaction) return;
    try {
      await setFactionMemberRole(myFaction.id, userId, 'member');
      const newMyFaction = await getMyFaction();
      setMyFaction(newMyFaction.data.faction);
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
      const newAllFactions = await listFactionsInGalaxy();
      setAllFactions(newAllFactions.data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return <div className="factions-container">Loading factions...</div>;
  }

  return (
    <div className="factions-container">
      {error && <div className="factions-error" role="alert">{error}</div>}

      {myFaction ? (
        <section className="factions-panel factions-my-faction">
          <h2>My Faction: {myFaction.name} [{myFaction.tag}]</h2>
          {myFaction.description && <p className="factions-description">{myFaction.description}</p>}
          <p className="factions-role">Your role: <strong>{myFaction.myRole}</strong></p>

          <div className="factions-members">
            <h3>Members ({myFaction.members?.length || 0})</h3>
            <div className="factions-member-list">
              {myFaction.members?.map((member) => (
                <div key={member.id} className="factions-member-row">
                  <div className="factions-member-info">
                    <span className="factions-member-name">{member.username}</span>
                    <span className="factions-member-role">{member.role}</span>
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
                      <button className="factions-btn-small factions-btn-danger" onClick={() => handleKickMember(member.userId)}>
                        Kick
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(myFaction.myRole === 'leader' || myFaction.myRole === 'officer') && (
            <form onSubmit={handleInvite} className="factions-invite-form">
              <h3>Invite Member</h3>
              <label className="factions-field">
                <span className="factions-label">Username</span>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="Enter username"
                  disabled={inviteSubmitting}
                />
              </label>
              {inviteError && <div className="factions-field-error">{inviteError}</div>}
              <button type="submit" disabled={inviteSubmitting}>
                {inviteSubmitting ? 'Inviting...' : 'Send Invite'}
              </button>
            </form>
          )}

          <div className="factions-actions">
            {myFaction.myRole === 'leader' ? (
              <button className="factions-btn-danger" onClick={handleDisbandFaction}>
                Disband Faction
              </button>
            ) : (
              <button className="factions-btn-danger" onClick={handleLeaveFaction}>
                Leave Faction
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="factions-panel factions-no-faction">
          <h2>You are not in a faction</h2>
          <p>Create a new faction or ask someone to invite you.</p>
          <button className="factions-btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create Faction'}
          </button>
        </section>
      )}

      {showCreateForm && !myFaction && (
        <section className="factions-panel factions-create-form">
          <h2>Create a New Faction</h2>
          <form onSubmit={handleCreateFaction}>
            <label className="factions-field">
              <span className="factions-label">Faction Name</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Vexara Collective"
                disabled={formSubmitting}
                required
              />
            </label>
            <label className="factions-field">
              <span className="factions-label">Tag (2-6 characters)</span>
              <input
                type="text"
                value={formTag}
                onChange={(e) => setFormTag(e.target.value.toUpperCase())}
                placeholder="e.g. VEX"
                maxLength={6}
                disabled={formSubmitting}
                required
              />
            </label>
            <label className="factions-field">
              <span className="factions-label">Description (optional)</span>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Tell us about your faction..."
                rows={3}
                disabled={formSubmitting}
              />
            </label>
            {formError && <div className="factions-field-error">{formError}</div>}
            <button type="submit" disabled={formSubmitting} className="factions-btn-primary">
              {formSubmitting ? 'Creating...' : 'Create Faction'}
            </button>
          </form>
        </section>
      )}

      {invites.length > 0 && (
        <section className="factions-panel factions-invites">
          <h2>Pending Invites ({invites.length})</h2>
          <div className="factions-invite-list">
            {invites.map((invite) => (
              <div key={invite.id} className="factions-invite-item">
                <div className="factions-invite-info">
                  <strong>{invite.factionName}</strong>
                  <span className="factions-invite-tag">{invite.factionTag}</span>
                  <p>Invited by: {invite.invitedByUsername}</p>
                </div>
                <div className="factions-invite-actions">
                  <button className="factions-btn-primary" onClick={() => handleAcceptInvite(invite.id)}>
                    Accept
                  </button>
                  <button className="factions-btn-danger" onClick={() => handleDeclineInvite(invite.id)}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
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
