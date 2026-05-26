'use client';

import React, { useEffect, useState } from 'react';
import { getGalaxies, getGalaxyWinResults, leaveGalaxy, selectGalaxy } from '../services/api';
import Username from './Username';
import '../styles/GalaxyPicker.css';

export interface Galaxy {
  id: number;
  name: string;
  status: 'active' | 'ended';
  startsAt: string | null;
  endedAt: string | null;
  winnerUserId: number | null;
  winnerFactionId: number | null;
  createdAt: string;
  isJoined: boolean;
}

interface FactionEntry {
  id: number;
  name: string;
  tag: string;
  points: number;
  nexuses: number;
  isWinner: boolean;
}

interface PlayerEntry {
  userId: number;
  username: string;
  isSupporter?: boolean;
  supporterTier?: string | null;
  points: number;
  nexuses: number;
  factionId: number | null;
}

interface WinResults {
  galaxy: Galaxy;
  factionLeaderboard: FactionEntry[];
  topPlayers: PlayerEntry[];
}

const WIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface Props {
  /** If true, the user has not yet selected a galaxy, close button is hidden. */
  forced?: boolean;
  onClose?: () => void;
  onSelected?: (galaxy: Galaxy) => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const GalaxyPicker: React.FC<Props> = ({ forced = false, onClose, onSelected }) => {
  const [galaxies, setGalaxies] = useState<Galaxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingJoin, setConfirmingJoin] = useState<Galaxy | null>(null);
  // Two-step leave confirmation. step 1 = generic "are you sure", step 2 = final destructive warning.
  const [leaveTarget, setLeaveTarget] = useState<Galaxy | null>(null);
  const [leaveStep, setLeaveStep] = useState<1 | 2>(1);
  const [leaving, setLeaving] = useState(false);
  const [winScreen, setWinScreen] = useState<WinResults | null>(null);
  const [loadingWin, setLoadingWin] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const hasUpcoming = galaxies.some((g) => g.startsAt && new Date(g.startsAt).getTime() > Date.now());
    if (!hasUpcoming) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [galaxies]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getGalaxies();
        if (!cancelled) setGalaxies(res.data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load galaxies');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openWinScreen = async (galaxy: Galaxy) => {
    setLoadingWin(true);
    try {
      const res = await getGalaxyWinResults(galaxy.id);
      setWinScreen(res.data);
    } catch {
      // silently ignore, the button won't appear for truly old galaxies
    } finally {
      setLoadingWin(false);
    }
  };

  const requestSelect = (galaxy: Galaxy) => {
    if (galaxy.status !== 'active') return;
    if (galaxy.startsAt && new Date(galaxy.startsAt).getTime() > Date.now()) return;
    if (!galaxy.isJoined) {
      setConfirmingJoin(galaxy);
      return;
    }
    void doSelect(galaxy);
  };

  const doSelect = async (galaxy: Galaxy) => {
    setConfirmingJoin(null);
    setSelecting(galaxy.id);
    setError(null);
    try {
      await selectGalaxy(galaxy.id);
      onSelected?.(galaxy);
    } catch (err: any) {
      setError(err?.message || 'Failed to select galaxy');
      setSelecting(null);
    }
  };

  const requestLeave = (galaxy: Galaxy) => {
    setLeaveTarget(galaxy);
    setLeaveStep(1);
  };

  const doLeave = async () => {
    if (!leaveTarget) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveGalaxy(leaveTarget.id);
      // Easiest way to reset every cached bit of galaxy-scoped state.
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || 'Failed to leave galaxy');
      setLeaving(false);
      setLeaveTarget(null);
    }
  };

  return (
    <div
      className="gp-overlay"
      onClick={() => {
        if (!forced) onClose?.();
      }}
    >
      <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gp-header">
          <h2 className="gp-title">Select a Galaxy</h2>
          {!forced && onClose && (
            <button className="gp-close" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        {forced && (
          <p className="gp-intro">
            Pick a galaxy to enter. Joining a new galaxy gives you a fresh starter nexus there.
          </p>
        )}

        {loading && null}
        {error && <div className="gp-error">{error}</div>}

        {!loading && galaxies.length === 0 && <div className="gp-empty">No galaxies exist yet.</div>}

        <ul className="gp-list">
          {galaxies.map((g) => {
            const isEnded = g.status === 'ended';
            const isRecentlyEnded = !!(isEnded && g.endedAt && Date.now() - new Date(g.endedAt).getTime() < WIN_WINDOW_MS);
            const startsAtMs = g.startsAt ? new Date(g.startsAt).getTime() : null;
            const isPending = !isEnded && startsAtMs !== null && startsAtMs > now;
            const countdownMs = isPending ? startsAtMs! - now : 0;
            const cardClass = [
              'gp-card',
              isRecentlyEnded ? 'gp-card-ended-recent' : '',
              isEnded && !isRecentlyEnded ? 'gp-card-ended-old' : '',
              isPending ? 'gp-card-pending' : '',
              g.isJoined && !isEnded && !isPending ? 'gp-card-joined' : '',
            ].filter(Boolean).join(' ');
            return (
              <li key={g.id} className={cardClass}>
                <div className="gp-card-body">
                  <div className="gp-card-name">
                    <span>{g.name}</span>
                    {isRecentlyEnded && <span className="gp-card-tag gp-card-tag-ended">Ended</span>}
                    {isEnded && !isRecentlyEnded && <span className="gp-card-tag gp-card-tag-old">Ended</span>}
                    {isPending && <span className="gp-card-tag gp-card-tag-pending">Starting soon</span>}
                    {g.isJoined && !isEnded && !isPending && (
                      <span className="gp-card-tag gp-card-tag-joined">Joined</span>
                    )}
                  </div>
                  <div className="gp-card-meta">
                    <span>Created {new Date(g.createdAt).toLocaleDateString()}</span>
                    {isRecentlyEnded && g.endedAt && (
                      <span className="gp-card-meta-ended">
                        · Ended {new Date(g.endedAt).toLocaleDateString()}
                      </span>
                    )}
                    {isPending && (
                      <span className="gp-card-meta-strong">
                        · Starts in {formatCountdown(countdownMs)}
                      </span>
                    )}
                  </div>
                  {isPending && (
                    <div className="gp-card-tz">
                      15:30 UTC · 16:30 Lisbon · 17:30 Paris · 11:30 New York · 08:30 Los Angeles
                    </div>
                  )}
                </div>
                <div className="gp-card-actions">
                  {isRecentlyEnded && (
                    <button
                      className="gp-btn gp-btn-results"
                      disabled={loadingWin}
                      onClick={() => openWinScreen(g)}
                    >
                      {loadingWin ? '...' : 'Results'}
                    </button>
                  )}
                  {!isEnded && (
                    <button
                      className={`gp-btn ${isPending ? 'gp-btn-pending' : 'gp-btn-primary'}`}
                      disabled={selecting !== null || isPending}
                      onClick={() => requestSelect(g)}
                    >
                      {selecting === g.id ? '…' : isPending ? 'Locked' : g.isJoined ? 'Enter' : 'Join'}
                    </button>
                  )}
                  {g.isJoined && !isEnded && !isPending && (
                    <button
                      className="gp-btn gp-btn-danger-ghost"
                      disabled={selecting !== null}
                      onClick={() => requestLeave(g)}
                    >
                      Leave
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {confirmingJoin && (
        <div className="gp-overlay" onClick={() => setConfirmingJoin(null)}>
          <div className="gp-modal gp-modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="gp-confirm-title">Join {confirmingJoin.name}?</h3>
            <p className="gp-confirm-body">
              You&apos;ll be placed in this galaxy with a fresh starter nexus. Your progress in other galaxies is unaffected.
            </p>
            <div className="gp-confirm-actions">
              <button className="gp-btn gp-btn-ghost" onClick={() => setConfirmingJoin(null)}>
                Cancel
              </button>
              <button className="gp-btn gp-btn-primary" onClick={() => doSelect(confirmingJoin)}>
                Join
              </button>
            </div>
          </div>
        </div>
      )}

      {winScreen && (
        <div className="gp-overlay" onClick={() => setWinScreen(null)}>
          <div className="gp-modal gp-modal-winscreen" onClick={(e) => e.stopPropagation()}>
            <div className="gp-win-header">
              <span className="gp-win-eyebrow">{'// GALAXY · CONCLUDED'}</span>
              <h2 className="gp-win-title">
                <span className="gp-win-title-strong">{winScreen.galaxy.name}</span> · Galaxy Ended
              </h2>
              {winScreen.galaxy.endedAt && (
                <div className="gp-win-date">
                  Ended {new Date(winScreen.galaxy.endedAt).toLocaleString()}
                </div>
              )}
              {winScreen.factionLeaderboard[0]?.isWinner && (
                <div className="gp-win-victor">
                  {winScreen.factionLeaderboard[0].name} [{winScreen.factionLeaderboard[0].tag}] achieved dominance
                </div>
              )}
            </div>

            <h3 className="gp-win-section">{'// Faction Leaderboard'}</h3>
            <table className="gp-win-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Faction</th>
                  <th className="gp-num">Points</th>
                  <th className="gp-num">Nexuses</th>
                </tr>
              </thead>
              <tbody>
                {winScreen.factionLeaderboard.map((f, i) => (
                  <tr
                    key={f.id}
                    className={f.isWinner ? 'gp-win-row-winner' : i % 2 === 0 ? 'gp-win-row-zebra' : ''}
                  >
                    <td className="gp-win-rank">{i + 1}</td>
                    <td>[{f.tag}] {f.name}</td>
                    <td className="gp-num">{f.points.toLocaleString()}</td>
                    <td className="gp-num">{f.nexuses}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="gp-win-section">{'// Top Players'}</h3>
            <table className="gp-win-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th className="gp-num">Points</th>
                  <th className="gp-num">Nexuses</th>
                </tr>
              </thead>
              <tbody>
                {winScreen.topPlayers.map((p, i) => {
                  const faction = winScreen.factionLeaderboard.find((f) => f.id === p.factionId);
                  return (
                    <tr key={p.userId} className={i % 2 === 0 ? 'gp-win-row-zebra' : ''}>
                      <td className="gp-win-rank">{i + 1}</td>
                      <td>
                        <Username name={p.username} isSupporter={p.isSupporter} supporterTier={p.supporterTier as any} />
                        {faction && <span className="gp-win-faction-tag">[{faction.tag}]</span>}
                      </td>
                      <td className="gp-num">{p.points.toLocaleString()}</td>
                      <td className="gp-num">{p.nexuses}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="gp-win-close">
              <button className="gp-btn gp-btn-ghost" onClick={() => setWinScreen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveTarget && (
        <div
          className="gp-overlay"
          onClick={() => {
            if (!leaving) {
              setLeaveTarget(null);
              setLeaveStep(1);
            }
          }}
        >
          <div className="gp-modal gp-modal-confirm gp-modal-confirm-danger" onClick={(e) => e.stopPropagation()}>
            {leaveStep === 1 ? (
              <>
                <h3 className="gp-confirm-title gp-confirm-title-leave">Leave {leaveTarget.name}?</h3>
                <p className="gp-confirm-body">
                  Your nexuses will be abandoned and turn into neutral NPC outposts that other players can conquer.
                  Your resources, buildings, and troops stay in those nexuses for whoever takes them.
                </p>
                <p className="gp-confirm-body gp-confirm-body-warn">
                  Quest progress, dominance, nexus groups, and any in-flight attacks or transfers in this galaxy will
                  be lost.
                </p>
                <div className="gp-confirm-actions">
                  <button
                    className="gp-btn gp-btn-ghost"
                    onClick={() => {
                      setLeaveTarget(null);
                      setLeaveStep(1);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="gp-btn gp-btn-danger-ghost" onClick={() => setLeaveStep(2)}>
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="gp-confirm-title gp-confirm-title-final">Are you sure?</h3>
                <p className="gp-confirm-body gp-confirm-body-warn">
                  This cannot be undone. {leaveTarget.name} progress will be permanently abandoned.
                </p>
                <div className="gp-confirm-actions">
                  <button
                    className="gp-btn gp-btn-ghost"
                    disabled={leaving}
                    onClick={() => setLeaveStep(1)}
                  >
                    Back
                  </button>
                  <button className="gp-btn gp-btn-danger" disabled={leaving} onClick={doLeave}>
                    {leaving ? 'Leaving…' : 'Leave galaxy'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GalaxyPicker;
