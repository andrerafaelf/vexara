'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getUnreadNexusIds } from '@/services/api';
import { useGameSocket } from './useGameSocket';

const UNREAD_NEXUS_IDS_KEY = ['unreadNexusIds'] as const;

export function useUnreadReports() {
  const queryClient = useQueryClient();

  // useGameSocket already invalidates ['unreadNexusIds'] on 'reports:refresh' events.
  useGameSocket();

  const { data = [] } = useQuery<string[]>({
    queryKey: UNREAD_NEXUS_IDS_KEY,
    queryFn: () => getUnreadNexusIds().then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60_000,
  });

  // Memoize the Set so its identity is stable across renders when the data array hasn't changed.
  // Without this, every consumer of `unreadNexusIds` would re-render on every parent render even
  // when the contents are unchanged — defeating React.memo on the sidebar.
  const unreadNexusIds = useMemo(() => new Set(data), [data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: UNREAD_NEXUS_IDS_KEY });

  return {
    hasUnreadReports: data.length > 0,
    unreadNexusIds,
    refresh,
  };
}
