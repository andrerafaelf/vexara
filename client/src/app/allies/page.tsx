'use client';

import GameLayout from '@/components/GameLayout';
import FriendsView from '@/components/FriendsView';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function FriendsPage() {
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout activePage="allies">
      <FriendsView />
    </GameLayout>
  );
}
