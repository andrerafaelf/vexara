'use client';

import { useToast } from '@/context/ToastContext';
import { createNexus, getMyGalaxy } from '@/services/api';
import GalaxyPicker, { Galaxy } from '@/components/GalaxyPicker';
import { usePageReady } from '@/components/NavigationProgress';
import { useMyNexuses, useInvalidateNexuses } from '@/hooks/useMyNexuses';
import '@/styles/Game.css';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  // Read localStorage synchronously on mount so the fast-path redirect fires before any render.
  const [isAuthed] = useState(() => typeof window !== 'undefined' && !!localStorage.getItem('token'));
  const [hasStoredNexus] = useState(() => typeof window !== 'undefined' && !!localStorage.getItem(SELECTED_NEXUS_KEY));
  const { nexuses, isLoading, isFetching, hasResolved } = useMyNexuses();
  const invalidateNexuses = useInvalidateNexuses();
  // Home page is "ready" once we know whether to redirect or show the create UI.
  // Require a successful server response (not just idle) before showing the create-nexus UI,
  // so an F5 with no cache doesn't briefly render it before the redirect fires.
  const homeReady = hasResolved && !hasStoredNexus && nexuses.length === 0;
  usePageReady(homeReady || hasStoredNexus, 'home');
  const [creating, setCreating] = useState(false);
  const [activeGalaxy, setActiveGalaxy] = useState<Galaxy | null>(null);
  const [showGalaxyPicker, setShowGalaxyPicker] = useState(false);
  // True between "user just picked a galaxy" and the nexus list refetch landing.
  // The server creates a starter nexus on join, so we must not render the manual-create
  // button during this window or the user will end up with two nexuses.
  const [joiningGalaxy, setJoiningGalaxy] = useState(false);

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

  // Clear the joining-galaxy gate once the post-join refetch settles. If the server provisioned
  // a starter nexus the redirect effect above will fire first; if not (rejoining an existing
  // galaxyPlayer with 0 nexuses), we drop back to the manual-create UI.
  useEffect(() => {
    if (joiningGalaxy && hasResolved) setJoiningGalaxy(false);
  }, [joiningGalaxy, hasResolved]);

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
      invalidateNexuses();
      // Leave creating=true — button stays disabled until the nexus list refetches and redirects
    } catch {
      toast('Failed to create nexus', 'error');
      setCreating(false);
    }
  };

  // While we're determining where to go, render nothing (no "Loading..." text).
  // !hasResolved keeps the page blank during the F5 race window where the query is briefly
  // idle with no data, before redirecting or showing the create UI.
  // joiningGalaxy keeps the page blank between "user picked a galaxy" and the nexus refetch
  // landing — otherwise the manual-create button would flash and could be clicked, producing
  // a second nexus on top of the starter the server just provisioned.
  if (!isAuthed || !hasResolved || isLoading || isFetching || nexuses.length > 0 || hasStoredNexus || joiningGalaxy) {
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
                Galaxy: <strong>{activeGalaxy.name}</strong>,{' '}
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
            // Joining a galaxy provisions a starter nexus server-side. Refetch so the
            // redirect effect picks it up instead of showing the manual-create button.
            setJoiningGalaxy(true);
            invalidateNexuses();
          }}
        />
      )}
    </div>
  );
}
