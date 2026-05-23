'use client';

import { useSyncExternalStore } from 'react';
import { useGatedNow } from '@/hooks/useNow';
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
 * Subscribes to the realtime store for a given nexus *without* subscribing to
 * the 1Hz clock. Use this when the caller only needs the server-anchored
 * baseline (production rate, storage cap, the values at last snapshot) and
 * does not need to re-render between snapshots. Re-renders only when a fresh
 * server snapshot arrives (push or refetch). Suitable for parent containers
 * that distribute the snapshot to leaves which do their own interpolation.
 */
export function useResourceSnapshot(nexusId: string | null | undefined): ResourceSnapshot | null {
  const snap = useSyncExternalStore(
    realtimeStore.subscribe,
    () => (nexusId ? realtimeStore.get(nexusId) : undefined),
    getServerSnapshot,
  );
  return snap ?? null;
}

/**
 * Returns the interpolated resource amounts for a nexus at the current tick.
 * Returns null until a snapshot for that nexus has been written into the store.
 * Re-renders the calling component at 1Hz via the shared useNow() clock.
 *
 * Cost note: this hook subscribes the *calling component* to the shared 1Hz
 * clock. For large components prefer useResourceSnapshot at the parent and
 * useLiveResources inside the leaves that actually render ticking values.
 */
export function useLiveResources(nexusId: string | null | undefined): LiveResources | null {
  return useGatedLiveResources(nexusId, true);
}

/**
 * Same as useLiveResources but only ticks at 1Hz when `tick` is true. When
 * `tick` is false the calling component re-renders only when the underlying
 * snapshot changes (push/refetch). Use for list items that only need to react
 * to the clock under specific conditions (e.g. a button on the affordability
 * boundary). The returned values are the snapshot-time values when not ticking.
 */
export function useGatedLiveResources(
  nexusId: string | null | undefined,
  tick: boolean,
): LiveResources | null {
  const snap = useResourceSnapshot(nexusId);
  const now = useGatedNow(tick);

  if (!snap) return null;

  // When tick is false useGatedNow returns 0; fall back to the snapshot anchor
  // so interpolation yields the values at last snapshot, not in 1970.
  const effectiveNow = tick ? now : snap.anchorMs;
  const interpolated = interpolateResources(
    snap.base,
    snap.production,
    snap.storageMax,
    snap.anchorMs,
    effectiveNow,
  );

  return {
    biomass: interpolated.biomass,
    alloy: interpolated.alloy,
    ore: interpolated.ore,
    production: snap.production,
    storageMax: snap.storageMax,
  };
}
