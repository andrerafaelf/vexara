'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUnreadNexusIds } from '@/services/api';

export function useUnreadReports() {
  const queryClient = useQueryClient();

  const { data = [] } = useQuery<string[]>({
    queryKey: ['unreadNexusIds'],
    queryFn: () => getUnreadNexusIds().then((r) => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['unreadNexusIds'] });

  return {
    hasUnreadReports: data.length > 0,
    unreadNexusIds: new Set(data),
    refresh,
  };
}
