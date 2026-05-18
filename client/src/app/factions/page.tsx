'use client';

import GameLayout from '@/components/GameLayout';
import FactionsView from '@/components/FactionsView';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function FactionsPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout activePage="factions">
      <FactionsView />
    </GameLayout>
  );
}
