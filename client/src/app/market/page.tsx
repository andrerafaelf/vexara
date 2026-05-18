'use client';

import GameLayout from '@/components/GameLayout';
import Market from '@/components/Market';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MarketPage() {
  const { nexuses, selectedNexus, refetch } = useMyNexuses();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectNexus = (nexus: { _id: string | number }) => {
    localStorage.setItem('selectedNexusId', String(nexus._id));
    router.push(`/nexus/${nexus._id}`);
  };

  return (
    <GameLayout activePage="market" onSelectNexus={handleSelectNexus}>
      <Market
        nexuses={nexuses}
        selectedNexusId={selectedNexus ? String(selectedNexus._id) : null}
        onRefresh={refetch}
      />
    </GameLayout>
  );
}
