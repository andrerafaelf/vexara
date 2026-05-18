'use client';

import GameLayout from '@/components/GameLayout';
import ProfileStats from '@/components/ProfileStats';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout activePage="profile">
      <ProfileStats />
    </GameLayout>
  );
}
