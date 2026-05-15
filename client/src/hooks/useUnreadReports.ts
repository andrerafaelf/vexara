'use client';

import { getUnreadNexusIds } from '@/services/api';
import { useCallback, useEffect, useState } from 'react';

export function useUnreadReports() {
  const [hasUnreadReports, setHasUnreadReports] = useState(false);
  const [unreadNexusIds, setUnreadNexusIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await getUnreadNexusIds();
      const ids: string[] = Array.isArray(res.data) ? res.data : [];
      setUnreadNexusIds(new Set(ids));
      setHasUnreadReports(ids.length > 0);
    } catch {
      setUnreadNexusIds(new Set());
      setHasUnreadReports(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  return { hasUnreadReports, unreadNexusIds, refresh };
}
