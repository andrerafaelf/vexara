import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getIncomingAttacks,
  getOutgoingAttacks,
  getReports,
  getReadReportIds,
  getUnreadNexusIds,
  markReportRead,
  markAllReportsRead,
  sendAttack,
  sendTroops,
  recallTroops,
  sendBackTroops,
  getNexusTroopTransfers,
} from '../../services/api';
import { NOTIFICATION_BADGES_KEY } from '../../hooks/useNotificationBadges';

export const combatKeys = {
  incoming: (nexusId: string) => ['attacks', 'incoming', nexusId] as const,
  outgoing: (nexusId: string) => ['attacks', 'outgoing', nexusId] as const,
  reports: (nexusId: string) => ['reports', nexusId] as const,
  readIds: () => ['reports', 'read-ids'] as const,
  unreadNexusIds: () => ['reports', 'unread-nexus-ids'] as const,
  transfers: (nexusId: string) => ['transfers', nexusId] as const,
};

export function useIncomingAttacks(nexusId: string) {
  return useQuery({
    queryKey: combatKeys.incoming(nexusId),
    queryFn: () => getIncomingAttacks(nexusId).then((r) => r.data),
    enabled: !!nexusId,
  });
}

export function useOutgoingAttacks(nexusId: string) {
  return useQuery({
    queryKey: combatKeys.outgoing(nexusId),
    queryFn: () => getOutgoingAttacks(nexusId).then((r) => r.data),
    enabled: !!nexusId,
  });
}

export function useReports(nexusId: string) {
  return useQuery({
    queryKey: combatKeys.reports(nexusId),
    queryFn: () => getReports(nexusId).then((r) => r.data),
    staleTime: 30_000,
    enabled: !!nexusId,
  });
}

export function useReadReportIds() {
  return useQuery({
    queryKey: combatKeys.readIds(),
    queryFn: () => getReadReportIds().then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useUnreadNexusIds() {
  return useQuery({
    queryKey: combatKeys.unreadNexusIds(),
    queryFn: () => getUnreadNexusIds().then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useSendAttack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fromNexusId, toNexusId, troops, type,
    }: { fromNexusId: string; toNexusId: string; troops: Record<string, number>; type?: string }) =>
      sendAttack(fromNexusId, toNexusId, troops, type),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: combatKeys.outgoing(vars.fromNexusId) });
    },
  });
}

export function useMarkReportRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attackId: string) => markReportRead(attackId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: combatKeys.readIds() });
      qc.invalidateQueries({ queryKey: combatKeys.unreadNexusIds() });
      qc.invalidateQueries({ queryKey: NOTIFICATION_BADGES_KEY });
    },
  });
}

export function useMarkAllReportsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nexusId: string) => markAllReportsRead(nexusId),
    onSuccess: (_data, nexusId) => {
      qc.invalidateQueries({ queryKey: combatKeys.reports(nexusId) });
      qc.invalidateQueries({ queryKey: combatKeys.readIds() });
      qc.invalidateQueries({ queryKey: combatKeys.unreadNexusIds() });
      qc.invalidateQueries({ queryKey: NOTIFICATION_BADGES_KEY });
    },
  });
}

export function useSendTroops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fromNexusId, toNexusId, troops,
    }: { fromNexusId: string; toNexusId: string; troops: Record<string, number> }) =>
      sendTroops(fromNexusId, toNexusId, troops),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: combatKeys.transfers(vars.fromNexusId) });
    },
  });
}

export function useRecallTroops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => recallTroops(transferId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });
}

export function useSendBackTroops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => sendBackTroops(transferId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });
}

export function useNexusTroopTransfers(nexusId: string) {
  return useQuery({
    queryKey: combatKeys.transfers(nexusId),
    queryFn: () => getNexusTroopTransfers(nexusId).then((r) => r.data),
    enabled: !!nexusId,
  });
}
