'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyNexuses } from '@/services/api';
import { Nexus } from '@/types/game';
import { useMemo } from 'react';

export const MY_NEXUSES_KEY = ['myNexuses'] as const;

function getStoredNexusId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('selectedNexusId');
}

export function useMyNexuses() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: MY_NEXUSES_KEY,
    queryFn: () => getMyNexuses().then((r) => r.data as Nexus[]),
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
    enabled: typeof window !== 'undefined' && typeof localStorage !== 'undefined' && !!localStorage.getItem('token'),
  });

  const nexuses: Nexus[] = data ?? [];

  const selectedNexus = useMemo(() => {
    if (nexuses.length === 0) return null;
    const storedId = getStoredNexusId();
    return nexuses.find((n) => String(n._id) === storedId) ?? nexuses[0];
  }, [nexuses]);

  return { nexuses, selectedNexus, isLoading: isLoading && nexuses.length === 0, refetch };
}

export function useInvalidateNexuses() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
}
