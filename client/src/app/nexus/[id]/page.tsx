'use client';

import GameLayout from '@/components/GameLayout';
import NexusView from '@/components/NexusView';
import PageSkeleton from '@/components/PageSkeleton';
import PwaGuideModal from '@/components/PwaGuideModal';
import WhileYouWereAway from '@/components/WhileYouWereAway';
import { usePageReady } from '@/components/NavigationProgress';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { createNexus, getNexus } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const PWA_GUIDE_SEEN_KEY = 'pwa_guide_seen';
const WYWA_SESSION_KEY = 'wywa_shown_session';
const SELECTED_NEXUS_KEY = 'selectedNexusId';

type NexusTab = 'overview' | 'buildings' | 'troops' | 'deployed' | 'map' | 'espionage';

function parseTab(value: string | null): NexusTab {
  if (
    value === 'buildings' ||
    value === 'troops' ||
    value === 'deployed' ||
    value === 'map' ||
    value === 'espionage'
  ) return value;
  return 'overview';
}

export default function NexusPage() {
  const { refresh: refreshUnread } = useUnreadReports();
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [showWywa, setShowWywa] = useState(false);
  const [creatingNexus, setCreatingNexus] = useState(false);
  const [nexusNameInput, setNexusNameInput] = useState('');
  const wywaChecked = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const nexusId = params.id as string;
  const activeTab = parseTab(searchParams.get('tab'));

  const qc = useQueryClient();
  const {
    nexuses,
    isLoading: nexusesLoading,
    isFetching: nexusesFetching,
    hasResolved: nexusesResolved,
    refetch: refetchNexuses,
  } = useMyNexuses();

  const {
    data: selectedNexusData,
    isFetching: nexusFetching,
    isSuccess: nexusSucceeded,
    refetch: refetchSelectedNexus,
  } = useQuery({
    queryKey: ['nexus', nexusId],
    queryFn: () => getNexus(nexusId).then((r) => r.data as Nexus),
    staleTime: 20 * 1000,
    refetchInterval: (query) => {
      if ((query.state.error as any)?.response?.status === 429) return false;
      return 30_000;
    },
    enabled: !!nexusId && typeof window !== 'undefined' && !!localStorage.getItem('token'),
    // Seed from the nexuses list so NexusView renders immediately without a loading flash
    initialData: () => {
      const cached = qc.getQueryData<Nexus[]>(['myNexuses']);
      return cached?.find((n) => String(n._id) === nexusId);
    },
    initialDataUpdatedAt: () => qc.getQueryState(['myNexuses'])?.dataUpdatedAt,
  });

  const selectedNexus: Nexus | null = selectedNexusData ?? null;

  // Latch: once we've ever seen nexuses we know the user isn't eliminated, so never show that screen.
  const everHadNexus = useRef(false);
  if (nexuses.length > 0 || selectedNexus) everHadNexus.current = true;

  // Page is ready when we have a nexus to render, OR we've confirmed (via a real server response)
  // there are no nexuses. nexusesResolved guards the F5 race where the query is briefly idle
  // with no data, in that window pageReady must stay false to avoid an eliminated-screen flash.
  const pageReady = !!selectedNexus || (nexusesResolved && nexuses.length === 0);
  usePageReady(pageReady, 'nexus');

  useEffect(() => {
    if (!localStorage.getItem(PWA_GUIDE_SEEN_KEY)) {
      setShowPwaGuide(true);
      localStorage.setItem(PWA_GUIDE_SEEN_KEY, '1');
    }
  }, []);

  // Show WYWA once per browser session (sessionStorage flag)
  useEffect(() => {
    if (wywaChecked.current) return;
    wywaChecked.current = true;
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) return;
    if (sessionStorage.getItem(WYWA_SESSION_KEY)) return;
    sessionStorage.setItem(WYWA_SESSION_KEY, '1');
    setShowWywa(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nexuses.length > 0) {
      const routeNexusId = nexuses.find((n: Nexus) => String(n._id) === nexusId)?._id;
      const storedNexusId = localStorage.getItem(SELECTED_NEXUS_KEY);
      const storedValidNexusId = nexuses.find((n: Nexus) => n._id === storedNexusId)?._id;
      const fallbackNexusId = routeNexusId ?? storedValidNexusId ?? nexuses[0]._id;
      localStorage.setItem(SELECTED_NEXUS_KEY, fallbackNexusId);
      if (!routeNexusId) {
        router.replace(`/nexus/${fallbackNexusId}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nexuses.length, nexusId]);

  useEffect(() => {
    if (selectedNexusData) {
      localStorage.setItem(SELECTED_NEXUS_KEY, String(selectedNexusData._id));
    }
  }, [selectedNexusData]);

  const handleSelectNexus = (nexus: Nexus) => {
    localStorage.setItem(SELECTED_NEXUS_KEY, String(nexus._id));
    const tabParam = searchParams.get('tab');
    const query = tabParam ? `?tab=${tabParam}` : '';
    router.push(`/nexus/${nexus._id}${query}`);
  };

  const handleTabChange = (tab: NexusTab) => {
    const query = tab === 'overview' ? '' : `?tab=${tab}`;
    router.replace(`/nexus/${nexusId}${query}`, { scroll: false });
  };

  const handleUpdate = () => {
    refetchNexuses();
    refetchSelectedNexus();
    refreshUnread();
  };

  const handleCreateNexus = async () => {
    setCreatingNexus(true);
    try {
      const name = nexusNameInput.trim() || undefined;
      const result = await createNexus(name);
      const newNexus = result.data as Nexus;
      localStorage.setItem(SELECTED_NEXUS_KEY, String(newNexus._id));
      await refetchNexuses();
      router.replace(`/nexus/${newNexus._id}`);
    } catch {
      // leave creatingNexus=false so user can retry
    } finally {
      setCreatingNexus(false);
    }
  };

  // Hard gate: only show eliminated screen after BOTH the myNexuses list AND the per-nexus query
  // have actually resolved on the server (not just gone idle), and we still see zero nexuses.
  // The everHadNexus latch prevents flashing the create screen during the window between
  // myNexuses resolving and selectedNexus populating from initialData.
  const isEliminated =
    nexusesResolved &&
    nexuses.length === 0 &&
    nexusSucceeded &&
    !nexusFetching &&
    !selectedNexus &&
    !everHadNexus.current;

  return (
    <>
      {showPwaGuide && <PwaGuideModal onClose={() => setShowPwaGuide(false)} />}
      {showWywa && <WhileYouWereAway onDismiss={() => setShowWywa(false)} />}
      <GameLayout
        activePage="dashboard"
        selectedNexusId={nexusId}
        onSelectNexus={handleSelectNexus}
      >
        {selectedNexus ? (
          <NexusView
            nexus={selectedNexus}
            onUpdate={handleUpdate}
            initialTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : isEliminated ? (
          <div className="eliminated-screen">
            <div className="eliminated-card">
              <div className="eliminated-icon">💀</div>
              <h2 className="eliminated-title">Eliminated</h2>
              <p className="eliminated-subtitle">All your nexuses have been conquered. Rise from the ashes - your comeback starts now.</p>
              <ul className="eliminated-perks">
                <li>Level 10 resource buildings - hit the ground running</li>
                <li>100,000 of each resource to rebuild fast</li>
                <li>24 hours of attack protection</li>
              </ul>
              <input
                className="eliminated-name-input"
                type="text"
                placeholder="Name your new nexus (optional)"
                value={nexusNameInput}
                onChange={(e) => setNexusNameInput(e.target.value)}
                maxLength={32}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNexus(); }}
                disabled={creatingNexus}
              />
              <button
                className="eliminated-create-btn"
                onClick={handleCreateNexus}
                disabled={creatingNexus}
              >
                {creatingNexus ? 'Rebuilding...' : 'Rise Again'}
              </button>
            </div>
          </div>
        ) : (
          <PageSkeleton variant="rows" count={6} />
        )}
      </GameLayout>
    </>
  );
}
