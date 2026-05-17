'use client';

import React, { useEffect, useState } from 'react';
import { getGalaxies, getGalaxyWinResults, leaveGalaxy, selectGalaxy } from '../services/api';

export interface Galaxy {
  id: number;
  name: string;
  status: 'active' | 'ended';
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
  /** If true, the user has not yet selected a galaxy — close button is hidden. */
  forced?: boolean;
  onClose?: () => void;
  onSelected?: (galaxy: Galaxy) => void;
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
      // silently ignore — the button won't appear for truly old galaxies
    } finally {
      setLoadingWin(false);
    }
  };

  const requestSelect = (galaxy: Galaxy) => {
    if (galaxy.status !== 'active') return;
    if (!galaxy.isJoined) {
      // First-time join: confirm before placing a starter nexus
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
      onClick={() => {
        if (!forced) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0e1430',
          border: '1px solid #2c3a78',
          borderRadius: 8,
          padding: '1.5rem',
          width: '100%',
          maxWidth: 520,
          color: '#e0e8ff',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Select a Galaxy</h2>
          {!forced && onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #2c3a78',
                color: '#e0e8ff',
                padding: '0.25rem 0.6rem',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          )}
        </div>

        {forced && (
          <p style={{ marginTop: 0, color: '#9ab' }}>
            Pick a galaxy to enter. Joining a new galaxy gives you a fresh starter nexus there.
          </p>
        )}

        {loading && <div>Loading galaxies…</div>}
        {error && <div style={{ color: '#ff8a8a' }}>{error}</div>}

        {!loading && galaxies.length === 0 && <div>No galaxies exist yet.</div>}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {galaxies.map((g) => {
            const isEnded = g.status === 'ended';
            const isRecentlyEnded = isEnded && g.endedAt && Date.now() - new Date(g.endedAt).getTime() < WIN_WINDOW_MS;
            return (
              <li
                key={g.id}
                style={{
                  border: isRecentlyEnded ? '1px solid #c4a000' : '1px solid #2c3a78',
                  borderRadius: 6,
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  opacity: isEnded && !isRecentlyEnded ? 0.5 : 1,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {g.name}{' '}
                    {isRecentlyEnded && <span style={{ color: '#ffd700', fontSize: '0.85em' }}>👑 Ended</span>}
                    {isEnded && !isRecentlyEnded && <span style={{ color: '#ffae3a', fontSize: '0.85em' }}>(Ended)</span>}
                    {g.isJoined && !isEnded && (
                      <span style={{ color: '#7df58c', fontSize: '0.85em', marginLeft: 6 }}>(Joined)</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#8a98c2' }}>
                    Created {new Date(g.createdAt).toLocaleDateString()}
                    {isRecentlyEnded && g.endedAt && (
                      <span style={{ marginLeft: 8, color: '#c4a000' }}>
                        · Ended {new Date(g.endedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isRecentlyEnded && (
                    <button
                      disabled={loadingWin}
                      onClick={() => openWinScreen(g)}
                      style={{
                        background: '#2a2200',
                        color: '#ffd700',
                        border: '1px solid #c4a000',
                        padding: '0.45rem 0.9rem',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {loadingWin ? '…' : '👑 Results'}
                    </button>
                  )}
                  {!isEnded && (
                    <button
                      disabled={selecting !== null}
                      onClick={() => requestSelect(g)}
                      style={{
                        background: '#3a55c4',
                        color: '#fff',
                        border: 'none',
                        padding: '0.45rem 0.9rem',
                        borderRadius: 4,
                        cursor: 'pointer',
                        minWidth: 92,
                      }}
                    >
                      {selecting === g.id ? '…' : g.isJoined ? 'Enter' : 'Join'}
                    </button>
                  )}
                  {g.isJoined && !isEnded && (
                    <button
                      disabled={selecting !== null}
                      onClick={() => requestLeave(g)}
                      style={{
                        background: 'transparent',
                        color: '#ff8a8a',
                        border: '1px solid #6a2030',
                        padding: '0.45rem 0.9rem',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
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
        <div
          onClick={() => setConfirmingJoin(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0e1430',
              border: '1px solid #2c3a78',
              borderRadius: 8,
              padding: '1.25rem',
              width: '100%',
              maxWidth: 420,
              color: '#e0e8ff',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Join {confirmingJoin.name}?</h3>
            <p style={{ color: '#9ab', marginTop: 0 }}>
              You'll be placed in this galaxy with a fresh starter nexus. Your progress in other galaxies is unaffected.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
              <button
                onClick={() => setConfirmingJoin(null)}
                style={{
                  background: 'transparent',
                  color: '#e0e8ff',
                  border: '1px solid #2c3a78',
                  padding: '0.45rem 0.9rem',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => doSelect(confirmingJoin)}
                style={{
                  background: '#3a55c4',
                  color: '#fff',
                  border: 'none',
                  padding: '0.45rem 0.9rem',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}

      {winScreen && (
        <div
          onClick={() => setWinScreen(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0e1430',
              border: '2px solid #c4a000',
              borderRadius: 10,
              padding: '1.5rem',
              width: '100%',
              maxWidth: 560,
              color: '#e0e8ff',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '2rem' }}>👑</div>
              <h2 style={{ margin: '0.25rem 0 0.1rem', color: '#ffd700', fontSize: '1.4rem' }}>
                {winScreen.galaxy.name} — Galaxy Ended
              </h2>
              {winScreen.galaxy.endedAt && (
                <div style={{ color: '#8a98c2', fontSize: '0.8em' }}>
                  Ended {new Date(winScreen.galaxy.endedAt).toLocaleString()}
                </div>
              )}
              {winScreen.factionLeaderboard[0]?.isWinner && (
                <div style={{ marginTop: '0.5rem', color: '#ffd700', fontWeight: 700, fontSize: '1.05rem' }}>
                  🏆 {winScreen.factionLeaderboard[0].name} [{winScreen.factionLeaderboard[0].tag}] achieved dominance!
                </div>
              )}
            </div>

            {/* Faction leaderboard */}
            <h3 style={{ margin: '0 0 0.5rem', color: '#a0b0ff', fontSize: '1rem', borderBottom: '1px solid #2c3a78', paddingBottom: '0.4rem' }}>
              Faction Leaderboard
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.88em' }}>
              <thead>
                <tr style={{ color: '#8a98c2' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem' }}>Faction</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>Points</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>Nexuses</th>
                </tr>
              </thead>
              <tbody>
                {winScreen.factionLeaderboard.map((f, i) => (
                  <tr
                    key={f.id}
                    style={{
                      background: f.isWinner ? 'rgba(196,160,0,0.1)' : i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                      borderLeft: f.isWinner ? '3px solid #ffd700' : '3px solid transparent',
                    }}
                  >
                    <td style={{ padding: '0.4rem 0.5rem', color: f.isWinner ? '#ffd700' : '#8a98c2' }}>{f.isWinner ? '👑' : i + 1}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: f.isWinner ? 700 : 400, color: f.isWinner ? '#ffd700' : '#e0e8ff' }}>
                      [{f.tag}] {f.name}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{f.points.toLocaleString()}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{f.nexuses}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Top players */}
            <h3 style={{ margin: '0 0 0.5rem', color: '#a0b0ff', fontSize: '1rem', borderBottom: '1px solid #2c3a78', paddingBottom: '0.4rem' }}>
              Top Players
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
              <thead>
                <tr style={{ color: '#8a98c2' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem' }}>Player</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>Points</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>Nexuses</th>
                </tr>
              </thead>
              <tbody>
                {winScreen.topPlayers.map((p, i) => {
                  const faction = winScreen.factionLeaderboard.find((f) => f.id === p.factionId);
                  return (
                    <tr key={p.userId} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#8a98c2' }}>{i + 1}</td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        {p.username}
                        {faction && <span style={{ marginLeft: 6, color: '#8a98c2', fontSize: '0.85em' }}>[{faction.tag}]</span>}
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{p.points.toLocaleString()}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{p.nexuses}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                onClick={() => setWinScreen(null)}
                style={{
                  background: '#2c3a78',
                  color: '#e0e8ff',
                  border: 'none',
                  padding: '0.5rem 1.5rem',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveTarget && (
        <div
          onClick={() => {
            if (!leaving) {
              setLeaveTarget(null);
              setLeaveStep(1);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0e1430',
              border: '1px solid #6a2030',
              borderRadius: 8,
              padding: '1.25rem',
              width: '100%',
              maxWidth: 440,
              color: '#e0e8ff',
            }}
          >
            {leaveStep === 1 ? (
              <>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>Leave {leaveTarget.name}?</h3>
                <p style={{ color: '#9ab', marginTop: 0 }}>
                  Your nexuses will be abandoned and turn into neutral NPC outposts that other players can conquer.
                  Your resources, buildings, and troops stay in those nexuses for whoever takes them.
                </p>
                <p style={{ color: '#ff8a8a', marginTop: 0 }}>
                  Quest progress, dominance, nexus groups, and any in-flight attacks or transfers in this galaxy will
                  be lost.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
                  <button
                    onClick={() => {
                      setLeaveTarget(null);
                      setLeaveStep(1);
                    }}
                    style={{
                      background: 'transparent',
                      color: '#e0e8ff',
                      border: '1px solid #2c3a78',
                      padding: '0.45rem 0.9rem',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setLeaveStep(2)}
                    style={{
                      background: '#6a2030',
                      color: '#fff',
                      border: 'none',
                      padding: '0.45rem 0.9rem',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>Are you sure?</h3>
                <p style={{ color: '#ff8a8a', marginTop: 0 }}>
                  This cannot be undone. {leaveTarget.name} progress will be permanently abandoned.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
                  <button
                    disabled={leaving}
                    onClick={() => setLeaveStep(1)}
                    style={{
                      background: 'transparent',
                      color: '#e0e8ff',
                      border: '1px solid #2c3a78',
                      padding: '0.45rem 0.9rem',
                      borderRadius: 4,
                      cursor: leaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Back
                  </button>
                  <button
                    disabled={leaving}
                    onClick={doLeave}
                    style={{
                      background: '#a02030',
                      color: '#fff',
                      border: 'none',
                      padding: '0.45rem 0.9rem',
                      borderRadius: 4,
                      cursor: leaving ? 'not-allowed' : 'pointer',
                    }}
                  >
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
