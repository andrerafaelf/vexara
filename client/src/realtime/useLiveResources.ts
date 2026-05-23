'use client';

import { useSyncExternalStore } from 'react';
import { useNow } from '@/hooks/useNow';
import { interpolateResources, type ResourceAmounts } from './economy.shared';
import { realtimeStore, type ResourceSnapshot } from './store';

export interface LiveResources {
  biomass: number;
  alloy: number;
  ore: number;
  production: ResourceAmounts;
  storageMax: number;
}

// SSR snapshot is undefined so React's hydration matches the first client render
// (which is also undefined until a snapshot has been written into the store).
const getServerSnapshot = (): ResourceSnapshot | undefined => undefined;

/**
 * Returns the interpolated resource amounts for a nexus at the current tick.
 * Returns null until a snapshot for that nexus has been written into the store.
 * Re-renders the calling component at 1Hz via the shared useNow() clock.
 */
export function useLiveResources(nexusId: string | null | undefined): LiveResources | null {
  const snap = useSyncExternalStore(
    realtimeStore.subscribe,
    () => (nexusId ? realtimeStore.get(nexusId) : undefined),
    getServerSnapshot,
  );
  const now = useNow();

  if (!snap || !nexusId) return null;

  const interpolated = interpolateResources(
    snap.base,
    snap.production,
    snap.storageMax,
    snap.anchorMs,
    now,
  );

  return {
    biomass: interpolated.biomass,
    alloy: interpolated.alloy,
    ore: interpolated.ore,
    production: snap.production,
    storageMax: snap.storageMax,
  };
}
