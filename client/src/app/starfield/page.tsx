'use client';

import GameLayout from '@/components/GameLayout';
import Map from '@/components/Map';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function StarfieldPage() {
  const { selectedNexus, refetch } = useMyNexuses();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout activePage="starfield" mainClassName="main-content--map">
      {selectedNexus ? (
        <Map currentNexus={selectedNexus} onRefresh={refetch} />
      ) : (
        <div className="loading">No nexuses available</div>
      )}
    </GameLayout>
  );
}
