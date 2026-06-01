'use client';

import { useLiveResources } from './useLiveResources';

export interface Cost {
	biomass: number;
	alloy: number;
	ore: number;
}

export interface CanAffordResult {
	// True the instant the live tick crosses every cost threshold.
	canAfford: boolean;
	// Seconds until canAfford would flip true assuming current production. Null
	// when storage caps would prevent ever reaching the cost (e.g. cost > storageMax),
	// or when the nexus has no snapshot yet.
	secondsUntilAffordable: number | null;
}

/**
 * Live gate for any action with a resource cost. Re-renders the calling
 * component at 1Hz so a disabled button flips to enabled the moment the live
 * resource value crosses the threshold, with no refetch round-trip.
 */
export function useCanAfford(
	nexusId: string | null | undefined,
	cost: Cost | null | undefined
): CanAffordResult {
	const live = useLiveResources(nexusId);

	if (!cost) {
		// No cost (e.g. building at max level) - treat as "always affordable" so
		// callers can compose this with their own atMax / queueFull gates.
		return { canAfford: true, secondsUntilAffordable: 0 };
	}
	if (!live) {
		return { canAfford: false, secondsUntilAffordable: null };
	}

	const need = {
		biomass: Math.max(0, cost.biomass - live.biomass),
		alloy: Math.max(0, cost.alloy - live.alloy),
		ore: Math.max(0, cost.ore - live.ore)
	};

	if (need.biomass === 0 && need.alloy === 0 && need.ore === 0) {
		return { canAfford: true, secondsUntilAffordable: 0 };
	}

	const wait = (deficit: number, perHour: number): number => {
		if (deficit === 0) return 0;
		if (perHour <= 0) return Infinity;
		return (deficit / perHour) * 3600;
	};

	const seconds = Math.max(
		wait(need.biomass, live.production.biomass),
		wait(need.alloy, live.production.alloy),
		wait(need.ore, live.production.ore)
	);

	return {
		canAfford: false,
		secondsUntilAffordable: Number.isFinite(seconds) ? seconds : null
	};
}
