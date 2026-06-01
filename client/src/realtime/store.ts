// Vanilla pub-sub store for realtime nexus snapshots. Read by React via
// useSyncExternalStore (see useLiveResources); written by the socket handler in
// useGameSocket.ts. Module-scope state lets the writer run outside React.
//
// Why not Zustand: TanStack Query already owns server cache. A second store
// would create two sources of truth for the same data. This store holds only
// the *ticking-between-snapshots* part - current resource baseline plus
// production rate - and is the single source of truth for buttons that need
// to react to the live tick.

import type { ResourceAmounts } from './economy.shared';

export interface ResourceSnapshot {
	nexusId: string;
	base: ResourceAmounts;
	production: ResourceAmounts;
	storageMax: number;
	// Timestamp the snapshot's `base` values are accurate as of. Writers must
	// use the server-provided lastResourceUpdate (not client Date.now()) so that
	// interpolation doesn't double-count network latency on each snapshot arrival.
	anchorMs: number;
}

type Listener = () => void;

const snapshots = new Map<string, ResourceSnapshot>();
const listeners = new Set<Listener>();

function snapshotsEqual(a: ResourceSnapshot, b: ResourceSnapshot): boolean {
	return (
		a.nexusId === b.nexusId &&
		a.anchorMs === b.anchorMs &&
		a.storageMax === b.storageMax &&
		a.base.biomass === b.base.biomass &&
		a.base.alloy === b.base.alloy &&
		a.base.ore === b.base.ore &&
		a.production.biomass === b.production.biomass &&
		a.production.alloy === b.production.alloy &&
		a.production.ore === b.production.ore
	);
}

function notify() {
	for (const l of listeners) l();
}

export const realtimeStore = {
	get(nexusId: string): ResourceSnapshot | undefined {
		return snapshots.get(nexusId);
	},

	set(snap: ResourceSnapshot): void {
		// Skip notify if the incoming snapshot is byte-identical to the existing
		// one. Important because NexusView's seed effect runs on every refetch
		// and would otherwise re-publish the same baseline, causing every leaf
		// subscriber to re-render even when nothing actually changed.
		const existing = snapshots.get(snap.nexusId);
		if (existing && snapshotsEqual(existing, snap)) return;
		snapshots.set(snap.nexusId, snap);
		notify();
	},

	// Seed from a TanStack Query nexus payload so the first render of any
	// consumer has a snapshot to interpolate against, even before the first
	// socket event arrives. Idempotent: calling repeatedly with the same data
	// is a no-op for re-renders because identity comparison in selectors filters.
	seedIfMissing(snap: ResourceSnapshot): void {
		if (snapshots.has(snap.nexusId)) return;
		snapshots.set(snap.nexusId, snap);
		notify();
	},

	clear(nexusId: string): void {
		if (snapshots.delete(nexusId)) notify();
	},

	clearAll(): void {
		if (snapshots.size === 0) return;
		snapshots.clear();
		notify();
	},

	subscribe(listener: Listener): () => void {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}
};
