import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelBuildQueueItem,
  cancelTrainingQueueItem,
  checkBuildQueue,
  checkTrainingQueue,
  createNexus,
  getMyNexuses,
  getNexus,
  renameNexus,
  specializeNexus,
  trainTroops,
  transferResources,
  upgradeBuilding,
} from '../../services/api';

export const nexusKeys = {
  all: ['nexuses'] as const,
  mine: () => [...nexusKeys.all, 'mine'] as const,
  single: (id: string) => [...nexusKeys.all, id] as const,
};

export function useMyNexuses() {
  return useQuery({
    queryKey: nexusKeys.mine(),
    queryFn: () => getMyNexuses().then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useNexus(nexusId: string) {
  return useQuery({
    queryKey: nexusKeys.single(nexusId),
    queryFn: () => getNexus(nexusId).then((r) => r.data),
    staleTime: 15_000,
    enabled: !!nexusId,
  });
}

export function useUpgradeBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nexusId, building }: { nexusId: string; building: string }) =>
      upgradeBuilding(nexusId, building),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useCheckBuildQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nexusId: string) => checkBuildQueue(nexusId),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useCancelBuildQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nexusId, index }: { nexusId: string; index: number }) =>
      cancelBuildQueueItem(nexusId, index),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useTrainTroops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nexusId, troopType, amount }: { nexusId: string; troopType: string; amount: number }) =>
      trainTroops(nexusId, troopType, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useCheckTrainingQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nexusId: string) => checkTrainingQueue(nexusId),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useCancelTrainingQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nexusId, index }: { nexusId: string; index: number }) =>
      cancelTrainingQueueItem(nexusId, index),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useTransferResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fromNexusId, toNexusId, biomass, alloy, ore,
    }: { fromNexusId: string; toNexusId: string; biomass: number; alloy: number; ore: number }) =>
      transferResources(fromNexusId, toNexusId, biomass, alloy, ore),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useRenameNexus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nexusId, name }: { nexusId: string; name: string }) => renameNexus(nexusId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useCreateNexus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createNexus(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}

export function useSpecializeNexus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nexusId, nexusType }: { nexusId: string; nexusType: string }) =>
      specializeNexus(nexusId, nexusType),
    onSuccess: () => qc.invalidateQueries({ queryKey: nexusKeys.mine() }),
  });
}
