'use client';

import GameLayout from '@/components/GameLayout';
import NexusView from '@/components/NexusView';
import PwaGuideModal from '@/components/PwaGuideModal';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { getNexus } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const PWA_GUIDE_SEEN_KEY = 'pwa_guide_seen';
const SELECTED_NEXUS_KEY = 'selectedNexusId';

type NexusTab = 'overview' | 'buildings' | 'troops' | 'map';

function parseTab(value: string | null): NexusTab {
  if (value === 'buildings' || value === 'troops' || value === 'map') return value;
  return 'overview';
}

export default function NexusPage() {
  const { refresh: refreshUnread } = useUnreadReports();
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const nexusId = params.id as string;
  const activeTab = parseTab(searchParams.get('tab'));

  const { nexuses, refetch: refetchNexuses } = useMyNexuses();

  const { data: selectedNexusData, refetch: refetchSelectedNexus } = useQuery({
    queryKey: ['nexus', nexusId],
    queryFn: () => getNexus(nexusId).then((r) => r.data as Nexus),
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
    enabled: !!nexusId && typeof window !== 'undefined' && !!localStorage.getItem('token'),
  });

  const selectedNexus: Nexus | null = selectedNexusData ?? null;

  useEffect(() => {
    if (!localStorage.getItem(PWA_GUIDE_SEEN_KEY)) {
      setShowPwaGuide(true);
      localStorage.setItem(PWA_GUIDE_SEEN_KEY, '1');
    }
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
    router.replace(`/nexus/${nexusId}${query}`);
  };

  const handleUpdate = () => {
    refetchNexuses();
    refetchSelectedNexus();
    refreshUnread();
  };

  return (
    <>
      {showPwaGuide && <PwaGuideModal onClose={() => setShowPwaGuide(false)} />}
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
        ) : (
          <div className="loading">Loading nexus...</div>
        )}
      </GameLayout>
    </>
  );
}
