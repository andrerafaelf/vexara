'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getFaction, getFactionLeaderboard } from '../services/api';
import { serverNow } from '../realtime/serverClock';
import Username from './Username';

interface LeaderboardRow {
  id: number;
  name: string;
  tag: string;
  memberCount: number;
  nexusCount: number;
  totalNexuses: number;
  pct: number;
  isDominating: boolean;
  dominanceSince: string | null;
  dominancePct: number;
}

interface LeaderboardData {
  rows: LeaderboardRow[];
  totalNexuses: number;
  dominanceThresholdPct: number;
  dominanceLocked: boolean;
  galaxyPlayerCount: number;
  factionCount: number;
  dominanceMinPlayers: number;
  dominanceMinFactions: number;
}

interface FactionMemberDetails {
  userId: number;
  username: string;
  isSupporter: boolean;
  supporterTier?: string | null;
  role: string;
  points: number;
  nexusCount: number;
  joinedAt?: string | null;
}

const DOMINANCE_SUSTAIN_MS = 36 * 60 * 60 * 1000;

function formatDominanceCountdown(dominanceSince: string): string {
  const elapsed = serverNow() - new Date(dominanceSince).getTime();
  const remaining = Math.max(0, DOMINANCE_SUSTAIN_MS - elapsed);
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function FactionLeaderboard({ myFactionId }: { myFactionId?: number }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedFactionId, setExpandedFactionId] = useState<number | null>(null);
  const [memberCache, setMemberCache] = useState<Record<number, FactionMemberDetails[] | 'loading' | 'error'>>({});

  const load = useCallback(async () => {
    try {
      const res = await getFactionLeaderboard();
      setData(res.data);
    } catch {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleFaction = useCallback(async (factionId: number) => {
    setExpandedFactionId((prev) => (prev === factionId ? null : factionId));
    if (memberCache[factionId] !== undefined) return;
    setMemberCache((prev) => ({ ...prev, [factionId]: 'loading' }));
    try {
      const res = await getFaction(factionId);
      const members = (res.data?.members ?? []).map((m: Partial<FactionMemberDetails> & { userId: number; username: string; role: string }) => ({
        userId: m.userId,
        username: m.username,
        isSupporter: !!m.isSupporter,
        supporterTier: m.supporterTier ?? null,
        role: m.role,
        points: m.points ?? 0,
        nexusCount: m.nexusCount ?? 0,
        joinedAt: m.joinedAt ?? null,
      }));
      members.sort((a: FactionMemberDetails, b: FactionMemberDetails) => b.points - a.points);
      setMemberCache((prev) => ({ ...prev, [factionId]: members }));
    } catch {
      setMemberCache((prev) => ({ ...prev, [factionId]: 'error' }));
    }
  }, [memberCache]);

  if (loading) return null;
  if (error) return <div className="flb-error">{error}</div>;
  if (!data || data.rows.length === 0) return <div className="flb-empty">No factions in this galaxy yet.</div>;

  const { rows, totalNexuses, dominanceThresholdPct, dominanceLocked, galaxyPlayerCount, factionCount, dominanceMinPlayers, dominanceMinFactions } = data;
  const dominating = !dominanceLocked ? rows.find((r) => r.isDominating && r.dominanceSince) : undefined;

  return (
    <div className="flb">
      {/* Dominance locked notice */}
      {dominanceLocked && (
        <div className="flb-locked-notice">
          <span className="flb-locked-icon">🔒</span>
          <div className="flb-locked-text">
            <strong>Dominance tracking inactive</strong>
            <span>
              Requires {dominanceMinPlayers} players ({galaxyPlayerCount}/{dominanceMinPlayers}) and {dominanceMinFactions} factions ({factionCount}/{dominanceMinFactions})
            </span>
          </div>
        </div>
      )}

      {/* Dominance alert, only when unlocked */}
      {dominating && (
        <div className="flb-dominance-alert">
          <div className="flb-dominance-alert-header">
            <span className="flb-dominance-name">{dominating.name} <span className="flb-dominance-tag">[{dominating.tag}]</span></span>
            <span className="flb-dominance-label">is dominating</span>
          </div>
          <div className="flb-dominance-bar-wrap">
            <div className="flb-dominance-bar" style={{ width: `${dominating.dominancePct}%` }} />
          </div>
          <div className="flb-dominance-footer">
            <span>{Math.round(dominating.dominancePct)}% of hold time</span>
            <span>Victory in {formatDominanceCountdown(dominating.dominanceSince!)}</span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flb-meta">
        <span>{totalNexuses} nexuses on the map</span>
        {!dominanceLocked && <span>Threshold: {dominanceThresholdPct}% to dominate</span>}
      </div>

      {/* Table */}
      <div className="flb-table">
        <div className="flb-thead">
          <span className="flb-th flb-th--rank">#</span>
          <span className="flb-th flb-th--name">Faction</span>
          <span className="flb-th flb-th--nexus">Nexuses</span>
          {!dominanceLocked && <span className="flb-th flb-th--bar">Progress to {dominanceThresholdPct}%</span>}
          <span className="flb-th flb-th--members">Members</span>
        </div>

        {rows.map((row, i) => {
          const isMe = row.id === myFactionId;
          const barPct = Math.min((row.pct / dominanceThresholdPct) * 100, 100);
          const overThreshold = !dominanceLocked && row.pct >= dominanceThresholdPct;
          const isExpanded = expandedFactionId === row.id;
          const cachedMembers = memberCache[row.id];

          return (
            <React.Fragment key={row.id}>
              <div className={`flb-row${isMe ? ' flb-row--mine' : ''}${overThreshold ? ' flb-row--dominating' : ''}${isExpanded ? ' flb-row--expanded' : ''}`}>
                <span className="flb-td flb-td--rank">{i + 1}</span>

                <span className="flb-td flb-td--name">
                  <button
                    type="button"
                    className="flb-faction-name flb-faction-name-button"
                    onClick={() => toggleFaction(row.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`flb-members-${row.id}`}
                  >
                    {row.name}
                  </button>
                  <span className="flb-faction-tag">[{row.tag}]</span>
                  {isMe && <span className="flb-mine-badge">you</span>}
                </span>

                <span className="flb-td flb-td--nexus">
                  <span className="flb-nexus-count">{row.nexusCount}</span>
                  <span className="flb-nexus-pct">{row.pct.toFixed(1)}%</span>
                </span>

                {!dominanceLocked && (
                  <span className="flb-td flb-td--bar">
                    <div className="flb-bar-track">
                      <div
                        className={`flb-bar-fill${overThreshold ? ' flb-bar-fill--over' : ''}`}
                        style={{ width: `${barPct}%` }}
                      />
                      <div className="flb-bar-threshold-line" style={{ left: '100%' }} />
                    </div>
                    {overThreshold && row.dominanceSince && (
                      <span className="flb-hold-time">{formatDominanceCountdown(row.dominanceSince)} left</span>
                    )}
                  </span>
                )}

                <span className="flb-td flb-td--members">{row.memberCount}</span>
              </div>
              {isExpanded && (
                <div className="flb-member-panel" id={`flb-members-${row.id}`}>
                  {cachedMembers === 'loading' && <span className="flb-member-status">Loading members...</span>}
                  {cachedMembers === 'error' && <span className="flb-member-status flb-error">Failed to load members.</span>}
                  {Array.isArray(cachedMembers) && cachedMembers.length === 0 && <span className="flb-member-status">This faction has no members.</span>}
                  {Array.isArray(cachedMembers) && cachedMembers.length > 0 && (
                    <div className="flb-member-list">
                      {cachedMembers.map((member) => (
                        <div key={member.userId} className="flb-member-item">
                          <div className="flb-member-main">
                            <Username name={member.username} isSupporter={member.isSupporter} supporterTier={member.supporterTier as any} linkToProfile />
                            <span className={`factions-role-badge factions-role-badge--${member.role}`}>{member.role}</span>
                          </div>
                          <div className="flb-member-stats">
                            <span>{member.points.toLocaleString()} inf</span>
                            <span>{member.nexusCount} nexus{member.nexusCount !== 1 ? 'es' : ''}</span>
                            {member.joinedAt && <span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
