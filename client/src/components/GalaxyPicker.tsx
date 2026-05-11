'use client';

import React, { useEffect, useState } from 'react';
import { getGalaxies, selectGalaxy } from '../services/api';

export interface Galaxy {
  id: number;
  name: string;
  status: 'active' | 'ended';
  endedAt: string | null;
  winnerUserId: number | null;
  createdAt: string;
  isJoined: boolean;
}

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
            return (
              <li
                key={g.id}
                style={{
                  border: '1px solid #2c3a78',
                  borderRadius: 6,
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  opacity: isEnded ? 0.6 : 1,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {g.name}{' '}
                    {isEnded && <span style={{ color: '#ffae3a', fontSize: '0.85em' }}>(Ended)</span>}
                    {g.isJoined && !isEnded && (
                      <span style={{ color: '#7df58c', fontSize: '0.85em', marginLeft: 6 }}>(Joined)</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#8a98c2' }}>
                    Created {new Date(g.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  disabled={isEnded || selecting !== null}
                  onClick={() => requestSelect(g)}
                  style={{
                    background: isEnded ? '#2a3050' : '#3a55c4',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 0.9rem',
                    borderRadius: 4,
                    cursor: isEnded ? 'not-allowed' : 'pointer',
                    minWidth: 92,
                  }}
                >
                  {selecting === g.id ? '…' : g.isJoined ? 'Enter' : 'Join'}
                </button>
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
              You'll be placed in this galaxy with a fresh starter nexus. Your progress in other galaxies is unaffected,
              but you cannot leave a galaxy once joined.
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
    </div>
  );
};

export default GalaxyPicker;
