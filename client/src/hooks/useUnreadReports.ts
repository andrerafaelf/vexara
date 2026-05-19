'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: UNREAD_NEXUS_IDS_KEY });

  return {
    hasUnreadReports: data.length > 0,
    unreadNexusIds: new Set(data),
    refresh,
  };
}
