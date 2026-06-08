// Shared resource math + formatters for the Dashboard, the empire Logistics
// view, and the Send-Resources modal. These delegate to the CANONICAL economy
// functions in realtime/economy.shared.ts (the client mirror of the server's
// economy.ts) so every surface computes storage caps and production from one
// source of truth — caps shown here drive real transfers, so they must match
// what the server will accept.
import {
	getResourceProduction,
	getMaxStorage,
	type EconomyNexus
} from '../realtime/economy.shared';
import type { Nexus } from '../types/game';

// Map the client Nexus shape onto the EconomyNexus the shared functions expect.
// nexusType / nexusTypeDoubled / isDerelict are optional on Nexus; when absent
// the economy functions fall back to the base (×1) multiplier, which is correct
// for a standard player nexus.
function toEconomyNexus(nexus: Nexus): EconomyNexus {
	const n = nexus as Nexus & {
		nexusType?: string | null;
		nexusTypeDoubled?: boolean;
		isDerelict?: boolean;
	};
	return {
		nexusType: n.nexusType ?? null,
		nexusTypeDoubled: n.nexusTypeDoubled,
		isDerelict: n.isDerelict,
		commandCore: nexus.buildings.commandCore,
		biomassFarm: nexus.buildings.biomassFarm,
		alloyForge: nexus.buildings.alloyForge,
		oreExtractor: nexus.buildings.oreExtractor,
		storageVault: nexus.buildings.storageVault
	};
}

export function calcNexusProduction(nexus: Nexus) {
	const p = getResourceProduction(toEconomyNexus(nexus));
	return {
		biomass: Math.floor(p.biomass),
		alloy: Math.floor(p.alloy),
		ore: Math.floor(p.ore)
	};
}

export function calcNexusStorage(nexus: Nexus): number {
	return Math.floor(getMaxStorage(toEconomyNexus(nexus)));
}

export interface LiveResources {
	biomass: number;
	alloy: number;
	ore: number;
	cap: number;
	prod: { biomass: number; alloy: number; ore: number };
}

// Project a nexus's stored resources forward to `now`, clamped to its cap —
// matching the server's production interpolation so the numbers don't jump when
// a real refresh lands.
export function liveResources(nexus: Nexus, now: number): LiveResources {
	const prod = calcNexusProduction(nexus);
	const cap = calcNexusStorage(nexus);
	const anchor = nexus.lastResourceUpdate ? new Date(nexus.lastResourceUpdate).getTime() : now;
	const elapsed = Math.max(0, (now - anchor) / 3_600_000);
	return {
		biomass: Math.min(cap, nexus.resources.biomass + prod.biomass * elapsed),
		alloy: Math.min(cap, nexus.resources.alloy + prod.alloy * elapsed),
		ore: Math.min(cap, nexus.resources.ore + prod.ore * elapsed),
		cap,
		prod
	};
}

export function fmtAmount(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return Math.floor(v).toString();
}

export function fmtRate(v: number): string {
	if (v >= 1_000) return `+${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k/h`;
	return `+${v}/h`;
}
