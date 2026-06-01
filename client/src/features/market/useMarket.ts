import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	buyMarketListing,
	cancelMarketListing,
	createMarketListing,
	getMarketHistory,
	getMarketListings,
	systemBuyResource
} from '../../services/api';

export const marketKeys = {
	listings: () => ['market', 'listings'] as const,
	history: () => ['market', 'history'] as const
};

export function useMarketListings() {
	return useQuery({
		queryKey: marketKeys.listings(),
		queryFn: () => getMarketListings().then((r) => r.data),
		staleTime: 30_000,
		refetchInterval: 60_000
	});
}

export function useMarketHistory() {
	return useQuery({
		queryKey: marketKeys.history(),
		queryFn: () => getMarketHistory().then((r) => r.data),
		staleTime: 60_000
	});
}

export function useCreateMarketListing() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			nexusId,
			offerResource,
			offerAmount,
			wantResource,
			wantAmount
		}: {
			nexusId: string;
			offerResource: string;
			offerAmount: number;
			wantResource: string;
			wantAmount: number;
		}) => createMarketListing(nexusId, offerResource, offerAmount, wantResource, wantAmount),
		onSuccess: () => qc.invalidateQueries({ queryKey: marketKeys.listings() })
	});
}

export function useBuyMarketListing() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ listingId, buyerNexusId }: { listingId: number; buyerNexusId: string }) =>
			buyMarketListing(listingId, buyerNexusId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: marketKeys.listings() });
			qc.invalidateQueries({ queryKey: ['nexuses', 'mine'] });
		}
	});
}

export function useCancelMarketListing() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (listingId: number) => cancelMarketListing(listingId),
		onSuccess: () => qc.invalidateQueries({ queryKey: marketKeys.listings() })
	});
}

export function useSystemBuy() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			nexusId,
			receiveResource,
			receiveAmount,
			payResource
		}: {
			nexusId: string;
			receiveResource: string;
			receiveAmount: number;
			payResource: string;
		}) => systemBuyResource(nexusId, receiveResource, receiveAmount, payResource),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['nexuses', 'mine'] })
	});
}
