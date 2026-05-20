'use client';

import GameLayout from '@/components/GameLayout';
import PageSkeleton from '@/components/PageSkeleton';
import Reports from '@/components/Reports';
import { usePageReady } from '@/components/NavigationProgress';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CombatLogsPage() {
  const { selectedNexus } = useMyNexuses();
  const { refresh: refreshUnreadReports } = useUnreadReports();
  const router = useRouter();

  usePageReady(!!selectedNexus, 'combat-logs');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout activePage="combat-logs">
      {selectedNexus ? (
        <Reports nexus={selectedNexus} onReadStateChange={refreshUnreadReports} />
      ) : (
        <PageSkeleton variant="rows" count={5} />
      )}
    </GameLayout>
  );
}
