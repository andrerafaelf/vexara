'use client';

import { useToast } from '@/context/ToastContext';
import { createNexus, getMyGalaxy } from '@/services/api';
import GalaxyPicker, { Galaxy } from '@/components/GalaxyPicker';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import '@/styles/Game.css';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const isAuthed = typeof window !== 'undefined' && !!localStorage.getItem('token');
  const { nexuses, isLoading, isFetching } = useMyNexuses();
  const [creating, setCreating] = useState(false);
  const [activeGalaxy, setActiveGalaxy] = useState<Galaxy | null>(null);
  const [showGalaxyPicker, setShowGalaxyPicker] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }

    // Fast path: if we already know the last nexus, navigate immediately
    // without waiting for the API response. The nexus page will handle
    // re-validating the ID against the real list.
    const storedId = localStorage.getItem(SELECTED_NEXUS_KEY);
    if (storedId) {
      router.replace(`/nexus/${storedId}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slow path: once nexuses load (cache miss on first login), redirect
  useEffect(() => {
    if (nexuses.length > 0) {
      const storedId = localStorage.getItem(SELECTED_NEXUS_KEY);
      const preferred = nexuses.find((n) => n._id === storedId) ?? nexuses[0];
      localStorage.setItem(SELECTED_NEXUS_KEY, preferred._id);
      router.replace(`/nexus/${preferred._id}`);
    }
  }, [nexuses, router]);

  // If no nexus yet + not loading: show the create-nexus/galaxy UI
  useEffect(() => {
    if (!isLoading && nexuses.length === 0 && !localStorage.getItem(SELECTED_NEXUS_KEY)) {
      getMyGalaxy()
        .then((res) => {
          const g = res.data?.activeGalaxy ?? null;
          setActiveGalaxy(g);
          if (!g) setShowGalaxyPicker(true);
        })
        .catch(() => setShowGalaxyPicker(true));
    }
  }, [isLoading, nexuses.length]);

  const handleCreateNexus = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createNexus();
    } catch {
      toast('Failed to create nexus', 'error');
    } finally {
      setCreating(false);
    }
  };

  // While we're determining where to go, render nothing (no "Loading..." text)
  const hasStoredNexus = typeof window !== 'undefined' && !!localStorage.getItem(SELECTED_NEXUS_KEY);
  if (!isAuthed || isLoading || isFetching || nexuses.length > 0 || hasStoredNexus) {
    return null;
  }

  return (
    <div className="game-container">
      <header className="game-header">
        <div className="header-left">
          <h1>Vexara</h1>
        </div>
      </header>

      <main className="game-main">
        <div className="no-nexuses">
          <h2>Welcome to Vexara!</h2>
          {activeGalaxy ? (
            <>
              <p>
                Galaxy: <strong>{activeGalaxy.name}</strong> —{' '}
                <button className="link-btn" onClick={() => setShowGalaxyPicker(true)}>
                  change
                </button>
              </p>
              <p>Ready to start your empire? Create your first nexus!</p>
              <button onClick={handleCreateNexus} className="create-nexus-btn" disabled={creating}>
                {creating ? 'Creating...' : 'Create Your First Nexus'}
              </button>
            </>
          ) : (
            <>
              <p>Select a galaxy to begin, then create your first nexus.</p>
              <button className="create-nexus-btn" onClick={() => setShowGalaxyPicker(true)}>
                Select a Galaxy
              </button>
            </>
          )}
        </div>
      </main>

      {showGalaxyPicker && (
        <GalaxyPicker
          forced={!activeGalaxy}
          onClose={() => setShowGalaxyPicker(false)}
          onSelected={(g) => {
            setActiveGalaxy(g);
            setShowGalaxyPicker(false);
          }}
        />
      )}
    </div>
  );
}
