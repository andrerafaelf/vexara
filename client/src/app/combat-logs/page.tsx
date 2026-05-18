'use client';

import GameLayout from '@/components/GameLayout';
import Reports from '@/components/Reports';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CombatLogsPage() {
  const { selectedNexus } = useMyNexuses();
  const { refresh: refreshUnreadReports } = useUnreadReports();
  const router = useRouter();

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
        <div className="loading">No nexuses available</div>
      )}
    </GameLayout>
  );
}
