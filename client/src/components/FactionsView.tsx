'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
  setFactionMemberRole,
  transferFactionLeader,
  updateFactionMotd,
  getFactionWars,
  declareWar,
  proposeCeasefire,
  acceptCeasefire,
  declineCeasefire,
  listFactionsInGalaxy,
  requestToJoinFaction,
  cancelFactionJoinRequest,
  getMyFactionJoinRequests,
  getFactionJoinRequests,
  approveJoinRequest,
  declineJoinRequest,
  getActiveTreaties,
  proposeTreaty,
  acceptTreaty,
  cancelTreaty,
  getGalaxyDiplomacy,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import FactionChat from './FactionChat';
import DiplomacyChat from './DiplomacyChat';
import Username from './Username';
import FactionActivity from './FactionActivity';
import FactionLeaderboard from './FactionLeaderboard';
import WarRoom from './WarRoom';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';
import '../styles/Factions.css';

interface Faction {
  id: number;
  name: string;
  tag: string;
  description?: string;
  motd?: string;
  createdAt: string;
  myRole?: string;
  members?: Array<{ id: number; userId: number; username: string; isSupporter?: boolean; role: string }>;
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

interface FactionWar {
  id: number;
  status: 'pending' | 'active' | 'ceasefire_pending' | 'ended';
  declarerFactionId: number;
  targetFactionId: number;
  declarerFaction: { name: string; tag: string };
  targetFaction: { name: string; tag: string };
  declaredAt: string;
  acceptedAt: string | null;
  ceasefireProposerFactionId: number | null;
}

interface GalaxyFaction {
  id: number;
  name: string;
  tag: string;
  description?: string;
  memberCount: number;
}

interface JoinRequest {
  id: number;
  userId: number;
  username: string;
  isSupporter?: boolean;
  message: string | null;
  createdAt: string;
}

interface MyJoinRequest {
  id: number;
  factionId: number;
  factionName: string;
  factionTag: string;
  message: string | null;
  createdAt: string;
}

type Tab = 'overview' | 'chat' | 'warroom' | 'members' | 'wars' | 'diplomacy' | 'activity';

interface FactionTreaty {
  id: number;
  type: 'nap' | 'trade' | 'vassal';
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  proposerFactionId: number;
  targetFactionId: number;
  proposerFaction?: { id: number; name: string; tag: string };
  targetFaction?: { id: number; name: string; tag: string };
  durationDays?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

const ROLE_ORDER: Record<string, number> = { leader: 0, officer: 1, member: 2 };

export default function FactionsView() {
  const [myFaction, setMyFaction] = useState<(Faction & { myRole: string }) | null>(null);
  const [invites, setInvites] = useState<FactionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  usePageReady(!loading, 'factions');

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

  const [wars, setWars] = useState<FactionWar[]>([]);
  const [galaxyFactions, setGalaxyFactions] = useState<GalaxyFaction[]>([]);
  const [selectedDeclareTarget, setSelectedDeclareTarget] = useState('');
  const [warError, setWarError] = useState('');
  const [warSubmitting, setWarSubmitting] = useState(false);

  const [treaties, setTreaties] = useState<FactionTreaty[]>([]);
  const [treatyTarget, setTreatyTarget] = useState('');
  const [treatyType, setTreatyType] = useState<'nap' | 'trade' | 'vassal'>('nap');
  const [treatyDuration, setTreatyDuration] = useState(30);
  const [treatyError, setTreatyError] = useState('');
  const [treatySubmitting, setTreatySubmitting] = useState(false);
  const [galaxyTreaties, setGalaxyTreaties] = useState<FactionTreaty[]>([]);
  const [activeDiplomacyTreatyId, setActiveDiplomacyTreatyId] = useState<number | null>(null);

  // Join requests (for leader/officer view inside a faction)
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestsError, setJoinRequestsError] = useState('');

  // My pending join requests (for players without a faction)
  const [myJoinRequests, setMyJoinRequests] = useState<MyJoinRequest[]>([]);
  // All factions in galaxy (for the browser when player has no faction)
  const [allGalaxyFactions, setAllGalaxyFactions] = useState<GalaxyFaction[]>([]);
  const [joinRequestMsg, setJoinRequestMsg] = useState<Record<number, string>>({});
  const [joinRequestSubmitting, setJoinRequestSubmitting] = useState<Record<number, boolean>>({});
  const [joinRequestError, setJoinRequestError] = useState<Record<number, string>>({});

  const { user: authUser } = useAuth();
  const currentUserId = authUser ? parseInt(authUser.id, 10) : undefined;

  const refreshJoinRequests = useCallback(async (factionId: number) => {
    try {
      const res = await getFactionJoinRequests(factionId);
      setJoinRequests(res.data);
    } catch {
      setJoinRequestsError('Failed to load join requests');
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [myFactionRes, invitesRes] = await Promise.all([
          getMyFaction(),
          getMyFactionInvites(),
        ]);
        const faction = myFactionRes.data.faction;
        setMyFaction(faction);
        setInvites(invitesRes.data);
        if (faction?.motd) setMotdDraft(faction.motd);
        if (faction) {
          const [warsRes, factionsRes, treatiesRes, galaxyDipRes] = await Promise.all([
            getFactionWars(faction.id),
            listFactionsInGalaxy(),
            getActiveTreaties(faction.id),
            getGalaxyDiplomacy(),
          ]);
          setWars(warsRes.data);
          setGalaxyFactions(factionsRes.data.filter((f: GalaxyFaction) => f.id !== faction.id));
          setTreaties(treatiesRes.data ?? []);
          setGalaxyTreaties(galaxyDipRes.data ?? []);
          if (faction.myRole === 'leader' || faction.myRole === 'officer') {
            await refreshJoinRequests(faction.id);
          }
        } else {
          const [factionsRes, myReqRes] = await Promise.all([
            listFactionsInGalaxy(),
            getMyFactionJoinRequests(),
          ]);
          setAllGalaxyFactions(factionsRes.data);
          setMyJoinRequests(myReqRes.data);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [refreshJoinRequests]);

  const refreshWars = async (factionId: number) => {
    const res = await getFactionWars(factionId);
    setWars(res.data);
  };

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

  const handleTransferLeader = async (userId: number, username: string) => {
    if (!myFaction || !confirm(`Transfer leadership to ${username}? You will become a regular member. This cannot be undone.`)) return;
    try {
      await transferFactionLeader(myFaction.id, userId);
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

  const handleDeclareWar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myFaction || !selectedDeclareTarget) return;
    setWarError('');
    setWarSubmitting(true);
    try {
      await declareWar(myFaction.id, parseInt(selectedDeclareTarget));
      setSelectedDeclareTarget('');
      await refreshWars(myFaction.id);
    } catch (err) {
      setWarError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    } finally {
      setWarSubmitting(false);
    }
  };

  const handleProposeCeasefire = async (warId: number) => {
    if (!myFaction) return;
    try {
      await proposeCeasefire(warId);
      await refreshWars(myFaction.id);
    } catch (err) {
      setWarError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  const handleAcceptCeasefire = async (warId: number) => {
    if (!myFaction) return;
    try {
      await acceptCeasefire(warId);
      await refreshWars(myFaction.id);
    } catch (err) {
      setWarError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  const handleDeclineCeasefire = async (warId: number) => {
    if (!myFaction) return;
    try {
      await declineCeasefire(warId);
      await refreshWars(myFaction.id);
    } catch (err) {
      setWarError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  // ── Treaty handlers ──────────────────────────────────────────────────────────

  const refreshTreaties = async (factionId: number) => {
    try {
      const [treatiesRes, galaxyDipRes] = await Promise.all([
        getActiveTreaties(factionId),
        getGalaxyDiplomacy(),
      ]);
      setTreaties(treatiesRes.data ?? []);
      setGalaxyTreaties(galaxyDipRes.data ?? []);
    } catch {}
  };

  const handleProposeTreaty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myFaction || !treatyTarget) return;
    setTreatySubmitting(true);
    setTreatyError('');
    try {
      await proposeTreaty(myFaction.id, parseInt(treatyTarget), treatyType, treatyDuration);
      setTreatyTarget('');
      await refreshTreaties(myFaction.id);
    } catch (err) {
      setTreatyError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    } finally {
      setTreatySubmitting(false);
    }
  };

  const handleAcceptTreaty = async (treatyId: number) => {
    if (!myFaction) return;
    try {
      await acceptTreaty(treatyId);
      await refreshTreaties(myFaction.id);
    } catch (err) {
      setTreatyError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  const handleCancelTreaty = async (treatyId: number) => {
    if (!myFaction) return;
    try {
      await cancelTreaty(treatyId);
      await refreshTreaties(myFaction.id);
    } catch (err) {
      setTreatyError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  // ── Join-request handlers (player without faction) ──────────────────────────

  const handleRequestToJoin = async (factionId: number) => {
    setJoinRequestSubmitting((prev) => ({ ...prev, [factionId]: true }));
    setJoinRequestError((prev) => ({ ...prev, [factionId]: '' }));
    try {
      await requestToJoinFaction(factionId, joinRequestMsg[factionId]);
      const res = await getMyFactionJoinRequests();
      setMyJoinRequests(res.data);
      setJoinRequestMsg((prev) => ({ ...prev, [factionId]: '' }));
    } catch (err) {
      setJoinRequestError((prev) => ({
        ...prev,
        [factionId]: (err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message,
      }));
    } finally {
      setJoinRequestSubmitting((prev) => ({ ...prev, [factionId]: false }));
    }
  };

  const handleCancelJoinRequest = async (factionId: number) => {
    try {
      await cancelFactionJoinRequest(factionId);
      setMyJoinRequests((prev) => prev.filter((r) => r.factionId !== factionId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Join-request handlers (leader/officer inside faction) ───────────────────

  const handleApproveJoinRequest = async (requestId: number) => {
    if (!myFaction) return;
    try {
      await approveJoinRequest(myFaction.id, requestId);
      await Promise.all([refreshFaction(), refreshJoinRequests(myFaction.id)]);
    } catch (err) {
      setJoinRequestsError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  const handleDeclineJoinRequest = async (requestId: number) => {
    if (!myFaction) return;
    try {
      await declineJoinRequest(myFaction.id, requestId);
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      setJoinRequestsError((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message);
    }
  };

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (loading) {
    return <PageSkeleton variant="rows" count={6} />;
  }

  // ── No faction: browser + create ────────────────────────────────────────────

  if (!myFaction) {
    const pendingFactionIds = new Set(myJoinRequests.map((r) => r.factionId));

    return (
      <div className="factions-container">
        {error && <div className="factions-error" role="alert">{error}</div>}

        {/* Pending invites */}
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

        {/* My pending join requests */}
        {myJoinRequests.length > 0 && (
          <section className="factions-panel factions-join-requests-sent">
            <h2>Pending Join Requests</h2>
            <div className="factions-invite-list">
              {myJoinRequests.map((req) => (
                <div key={req.id} className="factions-invite-item">
                  <div className="factions-invite-info">
                    <strong>{req.factionName}</strong>
                    <span className="factions-invite-tag">[{req.factionTag}]</span>
                    <p className="factions-join-req-status">Awaiting leader approval</p>
                  </div>
                  <div className="factions-invite-actions">
                    <button className="factions-btn-small factions-btn-danger" onClick={() => handleCancelJoinRequest(req.factionId)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Create faction */}
        <section className="factions-panel factions-no-faction">
          <h2>You are not in a faction</h2>
          <p>Browse factions below and request to join, or create your own.</p>
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
                  placeholder="e.g. Vexara Collective" disabled={formSubmitting} required
                  autoCorrect="off" spellCheck={false} />
              </label>
              <label className="factions-field">
                <span className="factions-label">Tag (2–6 characters)</span>
                <input type="text" value={formTag} onChange={(e) => setFormTag(e.target.value.toUpperCase())}
                  placeholder="e.g. VEX" maxLength={6} disabled={formSubmitting} required
                  autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
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

        {/* All factions browser */}
        <section className="factions-panel factions-browser">
          <h2>All Factions ({allGalaxyFactions.length})</h2>
          {allGalaxyFactions.length === 0 ? (
            <p className="factions-browser-empty">No factions exist in this galaxy yet. Be the first!</p>
          ) : (
            <div className="factions-browser-list">
              {allGalaxyFactions.map((f) => {
                const hasPending = pendingFactionIds.has(f.id);
                const submitting = joinRequestSubmitting[f.id] ?? false;
                const reqError = joinRequestError[f.id] ?? '';
                return (
                  <div key={f.id} className="factions-browser-card">
                    <div className="factions-browser-card-header">
                      <div className="factions-browser-card-identity">
                        <span className="factions-browser-card-name">{f.name}</span>
                        <span className="factions-browser-card-tag">[{f.tag}]</span>
                      </div>
                      <span className="factions-browser-card-members">{f.memberCount} member{f.memberCount !== 1 ? 's' : ''}</span>
                    </div>
                    {f.description && (
                      <p className="factions-browser-card-desc">{f.description}</p>
                    )}
                    {hasPending ? (
                      <div className="factions-browser-card-pending">
                        <span className="factions-join-req-status">Request pending</span>
                        <button className="factions-btn-small factions-btn-danger" onClick={() => handleCancelJoinRequest(f.id)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="factions-browser-card-join">
                        <input
                          className="factions-join-req-msg"
                          type="text"
                          placeholder="Optional message to leader..."
                          value={joinRequestMsg[f.id] ?? ''}
                          onChange={(e) => setJoinRequestMsg((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          maxLength={256}
                          disabled={submitting}
                        />
                        <button
                          className="factions-btn-primary factions-btn-join"
                          disabled={submitting}
                          onClick={() => handleRequestToJoin(f.id)}
                        >
                          {submitting ? 'Requesting...' : 'Request to Join'}
                        </button>
                      </div>
                    )}
                    {reqError && <div className="factions-field-error">{reqError}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="factions-panel factions-all">
          <h2>Galaxy Standings</h2>
          <FactionLeaderboard />
        </section>
      </div>
    );
  }

  // ── In a faction ─────────────────────────────────────────────────────────────

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
        {(['overview', 'chat', 'warroom', 'members', 'wars', 'diplomacy', 'activity'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`factions-tab${activeTab === tab ? ' factions-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && 'Overview'}
            {tab === 'chat' && 'Chat'}
            {tab === 'warroom' && 'War Room'}
            {tab === 'members' && (
              <>
                Members ({myFaction.members?.length ?? 0})
                {canManage && joinRequests.length > 0 && (
                  <span className="factions-tab-badge factions-tab-badge--alert">{joinRequests.length}</span>
                )}
              </>
            )}
            {tab === 'activity' && 'Activity'}
            {tab === 'wars' && (
              <>
                Wars
                {wars.filter((w) => w.status === 'active').length > 0 && (
                  <span className="factions-tab-badge">{wars.filter((w) => w.status === 'active').length}</span>
                )}
                {(wars.some((w) => w.status === 'pending' && w.targetFactionId === myFaction.id) ||
                  wars.some((w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId !== myFaction.id)) && (
                  <span className="factions-tab-badge factions-tab-badge--alert">!</span>
                )}
              </>
            )}
            {tab === 'diplomacy' && (
              <>
                Diplomacy
                {treaties.some((t) => t.status === 'pending' && t.targetFactionId === myFaction.id) && (
                  <span className="factions-tab-badge factions-tab-badge--alert">!</span>
                )}
              </>
            )}
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
                    <span className="factions-member-name"><Username name={member.username} isSupporter={member.isSupporter} linkToProfile /></span>
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

          <div className="factions-overview-section">
            <h3>Galaxy Standings</h3>
            <FactionLeaderboard myFactionId={myFaction.id} />
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

      {/* Tab: War Room */}
      {activeTab === 'warroom' && (
        <section className="factions-panel factions-tab-content factions-tab-content--chat">
          <WarRoom factionId={myFaction.id} myRole={myFaction.myRole as 'leader' | 'officer' | 'member'} />
        </section>
      )}

      {/* Tab: Members */}
      {activeTab === 'members' && (
        <section className="factions-panel factions-tab-content">
          {/* Join requests (leader/officer only) */}
          {canManage && (
            <div className="factions-join-requests-section">
              <h3>
                Join Requests
                {joinRequests.length > 0 && <span className="factions-tab-badge factions-tab-badge--alert" style={{ marginLeft: 8 }}>{joinRequests.length}</span>}
              </h3>
              {joinRequestsError && <div className="factions-field-error">{joinRequestsError}</div>}
              {joinRequests.length === 0 ? (
                <p className="factions-join-requests-empty">No pending join requests.</p>
              ) : (
                <div className="factions-member-list">
                  {joinRequests.map((req) => (
                    <div key={req.id} className="factions-member-row factions-join-req-row">
                      <div className="factions-member-info">
                        <span className="factions-member-name"><Username name={req.username} isSupporter={req.isSupporter} linkToProfile /></span>
                        {req.message && <span className="factions-join-req-msg-display">&ldquo;{req.message}&rdquo;</span>}
                      </div>
                      <div className="factions-member-actions">
                        <button className="factions-btn-primary" onClick={() => handleApproveJoinRequest(req.id)}>Approve</button>
                        <button className="factions-btn-small factions-btn-danger" onClick={() => handleDeclineJoinRequest(req.id)}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Invite member */}
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
                  <span className="factions-member-name"><Username name={member.username} isSupporter={member.isSupporter} linkToProfile /></span>
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
                    <button className="factions-btn-small" onClick={() => handleTransferLeader(member.userId, member.username)}>
                      Make Leader
                    </button>
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

      {/* Tab: Wars */}
      {activeTab === 'wars' && (
        <section className="factions-panel factions-tab-content">
          {warError && <div className="factions-field-error factions-war-error">{warError}</div>}

          {wars.filter((w) => w.status === 'active').length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title factions-war-section-title--active">Active Wars</h3>
              {wars
                .filter((w) => w.status === 'active')
                .map((w) => {
                  const enemy = w.declarerFactionId === myFaction.id ? w.targetFaction : w.declarerFaction;
                  return (
                    <div key={w.id} className="factions-war-card factions-war-card--active">
                      <div className="factions-war-info">
                        <span className="factions-war-vs">WAR</span>
                        <span className="factions-war-faction">[{enemy.tag}] {enemy.name}</span>
                        {w.acceptedAt && (
                          <span className="factions-war-meta">
                            since {new Date(w.acceptedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <button className="factions-btn-small" onClick={() => handleProposeCeasefire(w.id)}>Propose Ceasefire</button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {wars.filter((w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId !== myFaction.id).length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title factions-war-section-title--alert">Ceasefire Proposals</h3>
              {wars
                .filter((w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId !== myFaction.id)
                .map((w) => {
                  const enemy = w.declarerFactionId === myFaction.id ? w.targetFaction : w.declarerFaction;
                  return (
                    <div key={w.id} className="factions-war-card factions-war-card--ceasefire-incoming">
                      <div className="factions-war-info">
                        <span className="factions-war-faction">[{enemy.tag}] {enemy.name}</span>
                        <span className="factions-war-meta">proposed a ceasefire</span>
                      </div>
                      {canManage && (
                        <div className="factions-war-actions">
                          <button className="factions-btn-primary" onClick={() => handleAcceptCeasefire(w.id)}>Accept</button>
                          <button className="factions-btn-small factions-btn-danger" onClick={() => handleDeclineCeasefire(w.id)}>Decline</button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {wars.filter((w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId === myFaction.id).length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title">Ceasefire Awaiting Response</h3>
              {wars
                .filter((w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId === myFaction.id)
                .map((w) => {
                  const enemy = w.declarerFactionId === myFaction.id ? w.targetFaction : w.declarerFaction;
                  return (
                    <div key={w.id} className="factions-war-card factions-war-card--ceasefire-outgoing">
                      <div className="factions-war-info">
                        <span className="factions-war-faction">[{enemy.tag}] {enemy.name}</span>
                        <span className="factions-war-meta">considering your ceasefire proposal</span>
                      </div>
                      <span className="factions-war-status-badge factions-war-status-badge--pending">Pending</span>
                    </div>
                  );
                })}
            </div>
          )}

          {wars.length === 0 && (
            <p className="factions-war-empty">No active wars or pending declarations.</p>
          )}

          {canManage && galaxyFactions.length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title">Declare War</h3>
              <form onSubmit={handleDeclareWar} className="factions-war-declare-form">
                <select
                  value={selectedDeclareTarget}
                  onChange={(e) => setSelectedDeclareTarget(e.target.value)}
                  className="factions-war-select"
                  disabled={warSubmitting}
                >
                  <option value="">Select a faction...</option>
                  {galaxyFactions
                    .filter((f) => !wars.some((w) => w.status === 'active' &&
                      ((w.declarerFactionId === myFaction.id && w.targetFactionId === f.id) ||
                       (w.targetFactionId === myFaction.id && w.declarerFactionId === f.id))))
                    .map((f) => (
                      <option key={f.id} value={f.id}>[{f.tag}] {f.name}</option>
                    ))}
                </select>
                <button type="submit" className="factions-btn-danger" disabled={!selectedDeclareTarget || warSubmitting}>
                  {warSubmitting ? 'Declaring...' : 'Declare War'}
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      {/* Tab: Diplomacy */}
      {activeTab === 'diplomacy' && (
        <section className="factions-panel factions-tab-content">
          {treatyError && <div className="factions-field-error factions-war-error">{treatyError}</div>}

          {treaties.filter((t) => t.status === 'pending' && t.targetFactionId === myFaction.id).length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title factions-war-section-title--alert">Incoming Treaty Proposals</h3>
              {treaties
                .filter((t) => t.status === 'pending' && t.targetFactionId === myFaction.id)
                .map((t) => (
                  <div key={t.id} className="factions-war-card factions-war-card--pending-incoming">
                    <div className="factions-war-info">
                      <span className="factions-war-faction">[{t.proposerFaction?.tag}] {t.proposerFaction?.name}</span>
                      <span className="factions-war-meta">
                        proposes a <strong>{TREATY_LABELS[t.type]}</strong>
                        {t.durationDays ? ` (${t.durationDays} days)` : ''}
                      </span>
                    </div>
                    {canManage && (
                      <div className="factions-war-actions">
                        <button className="factions-btn-small" onClick={() => handleAcceptTreaty(t.id)}>Accept</button>
                        <button className="factions-btn-small factions-btn-danger" onClick={() => handleCancelTreaty(t.id)}>Decline</button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {treaties.filter((t) => t.status === 'active').length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title factions-war-section-title--active">Active Agreements</h3>
              {treaties.filter((t) => t.status === 'active').map((t) => {
                const other = t.proposerFactionId === myFaction.id ? t.targetFaction : t.proposerFaction;
                const isOpen = activeDiplomacyTreatyId === t.id;
                return (
                  <div key={t.id} className="factions-war-card factions-war-card--active">
                    <div className="factions-war-info">
                      <span className="factions-treaty-type factions-treaty-type--active">{TREATY_LABELS[t.type]}</span>
                      <span className="factions-war-faction">[{other?.tag}] {other?.name}</span>
                      {t.expiresAt && (
                        <span className="factions-war-meta">
                          expires {new Date(t.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <div className="factions-war-actions">
                      <button
                        className={`factions-btn-small${isOpen ? ' factions-btn-active' : ''}`}
                        onClick={() => setActiveDiplomacyTreatyId(isOpen ? null : t.id)}
                      >
                        {isOpen ? 'Close Chat' : 'Chat'}
                      </button>
                      {canManage && (
                        <button className="factions-btn-small factions-btn-danger" onClick={() => handleCancelTreaty(t.id)}>Cancel</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeDiplomacyTreatyId !== null && (() => {
            const t = treaties.find((x) => x.id === activeDiplomacyTreatyId && x.status === 'active');
            if (!t) return null;
            const other = t.proposerFactionId === myFaction.id ? t.targetFaction : t.proposerFaction;
            return (
              <DiplomacyChat
                treatyId={t.id}
                currentUserId={currentUserId}
                partnerFactionName={other ? `[${other.tag}] ${other.name}` : 'Ally'}
                onClose={() => setActiveDiplomacyTreatyId(null)}
              />
            );
          })()}

          {treaties.filter((t) => t.status === 'pending' && t.proposerFactionId === myFaction.id).length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title">Pending Proposals</h3>
              {treaties.filter((t) => t.status === 'pending' && t.proposerFactionId === myFaction.id).map((t) => (
                <div key={t.id} className="factions-war-card factions-war-card--pending-outgoing">
                  <div className="factions-war-info">
                    <span className="factions-treaty-type">{TREATY_LABELS[t.type]}</span>
                    <span className="factions-war-faction">[{t.targetFaction?.tag}] {t.targetFaction?.name}</span>
                    <span className="factions-war-meta">awaiting response</span>
                  </div>
                  <button className="factions-btn-small factions-btn-danger" onClick={() => handleCancelTreaty(t.id)}>Withdraw</button>
                </div>
              ))}
            </div>
          )}

          {canManage && galaxyFactions.length > 0 && (
            <div className="factions-war-section">
              <h3 className="factions-war-section-title">Propose Treaty</h3>
              <form onSubmit={handleProposeTreaty} className="factions-war-declare-form factions-treaty-form">
                <select
                  value={treatyTarget}
                  onChange={(e) => setTreatyTarget(e.target.value)}
                  className="factions-war-select"
                  disabled={treatySubmitting}
                >
                  <option value="">Select faction...</option>
                  {galaxyFactions.map((f) => (
                    <option key={f.id} value={f.id}>[{f.tag}] {f.name}</option>
                  ))}
                </select>
                <select
                  value={treatyType}
                  onChange={(e) => setTreatyType(e.target.value as 'nap' | 'trade' | 'vassal')}
                  className="factions-war-select"
                  disabled={treatySubmitting}
                >
                  <option value="nap">Non-Aggression Pact</option>
                  <option value="trade">Trade Agreement</option>
                  <option value="vassal">Vassal Treaty</option>
                </select>
                <input
                  type="number"
                  min={1} max={90}
                  value={treatyDuration}
                  onChange={(e) => setTreatyDuration(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                  className="factions-treaty-duration-input"
                  title="Duration in days"
                  placeholder="Days"
                  disabled={treatySubmitting}
                />
                <button type="submit" className="factions-btn-small" disabled={!treatyTarget || treatySubmitting}>
                  {treatySubmitting ? 'Sending...' : 'Propose'}
                </button>
              </form>
              <p className="factions-treaty-hint">
                NAP: no-attack agreement. Trade: shared market bonuses. Vassal: protective relationship (vassal agrees to support liege in wars).
              </p>
            </div>
          )}

          <div className="factions-war-section">
            <h3 className="factions-war-section-title">Galaxy Diplomacy Board</h3>
            {galaxyTreaties.length === 0 ? (
              <p className="factions-war-empty">No public agreements in this galaxy.</p>
            ) : (
              <div className="factions-diplomacy-board">
                {galaxyTreaties.map((t) => (
                  <div key={t.id} className={`factions-diplomacy-row${t.status === 'pending' ? ' factions-diplomacy-row--pending' : ''}`}>
                    <span className={`factions-treaty-type factions-treaty-type--${t.status === 'active' ? 'active' : 'pending'}`}>{TREATY_LABELS[t.type]}</span>
                    <span className="factions-diplomacy-parties">
                      [{t.proposerFaction?.tag}] {t.proposerFaction?.name}
                      <span className="factions-diplomacy-sep">{t.status === 'pending' ? 'proposed to' : 'and'}</span>
                      [{t.targetFaction?.tag}] {t.targetFaction?.name}
                    </span>
                    <span className="factions-diplomacy-status">{t.status === 'pending' ? 'Pending' : 'Active'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const TREATY_LABELS: Record<string, string> = {
  nap: 'Non-Aggression Pact',
  trade: 'Trade Agreement',
  vassal: 'Vassal Treaty',
};
