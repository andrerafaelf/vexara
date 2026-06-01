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
	const qc = useQueryClient();
	const { data, isLoading, isFetching, isSuccess, refetch } = useQuery({
		queryKey: MY_NEXUSES_KEY,
		queryFn: () => getMyNexuses().then((r) => r.data as Nexus[]),
		staleTime: 20 * 1000,
		refetchInterval: (query) => {
			if ((query.state.error as any)?.response?.status === 429) return false;
			return 30_000;
		},
		enabled: typeof window !== 'undefined' && !!window.localStorage.getItem('token'),
		// Seed from cache so page switches never show a loading state when data is already known
		initialData: () => qc.getQueryData<Nexus[]>(MY_NEXUSES_KEY),
		initialDataUpdatedAt: () => qc.getQueryState(MY_NEXUSES_KEY)?.dataUpdatedAt
	});

	const nexuses: Nexus[] = data ?? [];

	const selectedNexus = useMemo(() => {
		if (nexuses.length === 0) return null;
		const storedId = getStoredNexusId();
		return nexuses.find((n) => String(n._id) === storedId) ?? nexuses[0];
	}, [nexuses]);

	// hasResolved = "the server has actually answered at least once". We need this distinct from
	// !isLoading because on a cold F5 the query is briefly in a quiet idle state with no data,
	// and any gate of the form `!isLoading && nexuses.length === 0` would flash an empty/eliminated
	// UI for a frame before the request resolves.
	const hasResolved = isSuccess && !isFetching;

	return {
		nexuses,
		selectedNexus,
		isLoading: isLoading && nexuses.length === 0,
		isFetching,
		hasResolved,
		refetch
	};
}

export function useInvalidateNexuses() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
}
