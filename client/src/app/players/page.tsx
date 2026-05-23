'use client';

import GameLayout from '@/components/GameLayout';
import PlayersView from '@/components/PlayersView';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PlayersPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout activePage="players">
      <PlayersView />
    </GameLayout>
  );
}
