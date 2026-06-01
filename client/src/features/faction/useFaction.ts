import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	acceptFactionInvite,
	acceptTreaty,
	acceptWar,
	cancelTreaty,
	createFaction,
	declineFactionInvite,
	declineWar,
	declareWar,
	disbandFaction,
	getActiveTreaties,
	getFaction,
	getFactionEvents,
	getFactionJoinRequests,
	getFactionLeaderboard,
	getFactionWars,
	getGalaxyDiplomacy,
	getMyFaction,
	getMyFactionInvites,
	kickFactionMember,
	leaveFaction,
	listFactionsInGalaxy,
	proposeCeasefire,
	proposeTreaty,
	requestToJoinFaction,
	sendFactionMessage,
	setFactionMemberRole,
	transferFactionLeader,
	updateFactionMotd
} from '../../services/api';

export const factionKeys = {
	mine: () => ['faction', 'mine'] as const,
	single: (id: number) => ['faction', id] as const,
	list: () => ['faction', 'list'] as const,
	leaderboard: () => ['faction', 'leaderboard'] as const,
	invites: () => ['faction', 'invites'] as const,
	wars: (id: number) => ['faction', id, 'wars'] as const,
	treaties: (id: number) => ['faction', id, 'treaties'] as const,
	diplomacy: () => ['faction', 'diplomacy'] as const,
	joinRequests: (id: number) => ['faction', id, 'join-requests'] as const
};

export function useMyFaction() {
	return useQuery({
		queryKey: factionKeys.mine(),
		queryFn: () => getMyFaction().then((r) => r.data),
		staleTime: 30_000
	});
}

export function useFaction(id: number) {
	return useQuery({
		queryKey: factionKeys.single(id),
		queryFn: () => getFaction(id).then((r) => r.data),
		staleTime: 30_000,
		enabled: !!id
	});
}

export function useFactionList() {
	return useQuery({
		queryKey: factionKeys.list(),
		queryFn: () => listFactionsInGalaxy().then((r) => r.data),
		staleTime: 60_000
	});
}

export function useFactionLeaderboard() {
	return useQuery({
		queryKey: factionKeys.leaderboard(),
		queryFn: () => getFactionLeaderboard().then((r) => r.data),
		staleTime: 60_000
	});
}

export function useMyFactionInvites() {
	return useQuery({
		queryKey: factionKeys.invites(),
		queryFn: () => getMyFactionInvites().then((r) => r.data),
		staleTime: 30_000
	});
}

export function useFactionWars(factionId: number) {
	return useQuery({
		queryKey: factionKeys.wars(factionId),
		queryFn: () => getFactionWars(factionId).then((r) => r.data),
		staleTime: 30_000,
		enabled: !!factionId
	});
}

export function useActiveTreaties(factionId: number) {
	return useQuery({
		queryKey: factionKeys.treaties(factionId),
		queryFn: () => getActiveTreaties(factionId).then((r) => r.data),
		staleTime: 60_000,
		enabled: !!factionId
	});
}

export function useGalaxyDiplomacy() {
	return useQuery({
		queryKey: factionKeys.diplomacy(),
		queryFn: () => getGalaxyDiplomacy().then((r) => r.data),
		staleTime: 60_000
	});
}

export function useCreateFaction() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: { name: string; tag: string; description?: string }) => createFaction(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: factionKeys.mine() });
			qc.invalidateQueries({ queryKey: factionKeys.list() });
		}
	});
}

export function useLeaveFaction() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (factionId: number) => leaveFaction(factionId),
		onSuccess: () => qc.invalidateQueries({ queryKey: factionKeys.mine() })
	});
}

export function useDisbandFaction() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (factionId: number) => disbandFaction(factionId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: factionKeys.mine() });
			qc.invalidateQueries({ queryKey: factionKeys.list() });
		}
	});
}

export function useAcceptFactionInvite() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (inviteId: number) => acceptFactionInvite(inviteId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: factionKeys.mine() });
			qc.invalidateQueries({ queryKey: factionKeys.invites() });
		}
	});
}

export function useDeclineFactionInvite() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (inviteId: number) => declineFactionInvite(inviteId),
		onSuccess: () => qc.invalidateQueries({ queryKey: factionKeys.invites() })
	});
}

export function useKickFactionMember() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ factionId, userId }: { factionId: number; userId: number }) =>
			kickFactionMember(factionId, userId),
		onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: factionKeys.single(vars.factionId) })
	});
}

export function useSetFactionMemberRole() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			factionId,
			userId,
			role
		}: {
			factionId: number;
			userId: number;
			role: string;
		}) => setFactionMemberRole(factionId, userId, role),
		onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: factionKeys.single(vars.factionId) })
	});
}

export function useTransferFactionLeader() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ factionId, userId }: { factionId: number; userId: number }) =>
			transferFactionLeader(factionId, userId),
		onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: factionKeys.single(vars.factionId) })
	});
}

export function useUpdateFactionMotd() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ factionId, motd }: { factionId: number; motd: string }) =>
			updateFactionMotd(factionId, motd),
		onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: factionKeys.single(vars.factionId) })
	});
}

export function useDeclareWar() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ factionId, targetFactionId }: { factionId: number; targetFactionId: number }) =>
			declareWar(factionId, targetFactionId),
		onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: factionKeys.wars(vars.factionId) })
	});
}

export function useProposeTreaty() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			factionId,
			targetFactionId,
			type,
			durationDays
		}: {
			factionId: number;
			targetFactionId: number;
			type: string;
			durationDays?: number;
		}) => proposeTreaty(factionId, targetFactionId, type, durationDays),
		onSuccess: (_d, vars) =>
			qc.invalidateQueries({ queryKey: factionKeys.treaties(vars.factionId) })
	});
}

export function useAcceptTreaty() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (treatyId: number) => acceptTreaty(treatyId),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['faction'] })
	});
}

export function useCancelTreaty() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (treatyId: number) => cancelTreaty(treatyId),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['faction'] })
	});
}

export function useRequestToJoinFaction() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ factionId, message }: { factionId: number; message?: string }) =>
			requestToJoinFaction(factionId, message),
		onSuccess: () => qc.invalidateQueries({ queryKey: factionKeys.mine() })
	});
}

export function useFactionJoinRequests(factionId: number) {
	return useQuery({
		queryKey: factionKeys.joinRequests(factionId),
		queryFn: () => getFactionJoinRequests(factionId).then((r) => r.data),
		staleTime: 30_000,
		enabled: !!factionId
	});
}

export function useSendFactionMessage() {
	return useMutation({
		mutationFn: ({ factionId, content }: { factionId: number; content: string }) =>
			sendFactionMessage(factionId, content)
	});
}
