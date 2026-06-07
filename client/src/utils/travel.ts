import { NEXUS_TYPE_BONUSES } from '../realtime/economy.shared';

// Includes legacy keys so a travel-time calculation against a historical
// troop snapshot still resolves the right speed under the pre-Stage-2d names.
export const TROOP_SPEED: Record<string, number> = {
	sentinelLancer: 20,
	assaultTrooper: 18,
	vanguardBreaker: 16,
	reconOperative: 50,
	wraithSkimmer: 22,
	siegeMech: 10,
	bulwarkGuard: 12,
	aegisSkirmisher: 24,
	pyreSuppressor: 15,
	arcDisruptor: 17,
	phantomLance: 28,
	annihilatorPlatform: 8,
	voidStalker: 32,
	siegeColossus: 6,
	overseer: 6,
	// Legacy keys for historical reports / in-flight snapshots.
	lancerDrone: 20,
	breakerUnit: 16,
	skimmerBike: 22,
	suppressorTeam: 15,
	disruptorUnit: 17,
	interceptorBike: 28
};

export const TRANSFER_TRAVEL_MINUTES_PER_UNIT = 5;

type TravelSource = {
	x: number;
	y: number;
	nexusType?: string | null;
	nexusTypeDoubled?: boolean;
};

type TravelTarget = {
	x: number;
	y: number;
};

type TravelMission = 'attack' | 'scout' | 'support';

function travelMultiplier(source: TravelSource): number {
	const base = NEXUS_TYPE_BONUSES[source.nexusType ?? '']?.travelTimeMultiplier ?? 1;
	if (base === 1) return 1;
	return source.nexusTypeDoubled ? Math.pow(base, 2) : base;
}

export function hasOnlyRecon(troops: Record<string, number>): boolean {
	return (
		(troops.reconOperative ?? 0) > 0 &&
		Object.entries(troops).every(([type, count]) => type === 'reconOperative' || count === 0)
	);
}

export function travelMinutes(
	source: TravelSource,
	target: TravelTarget,
	troops: Record<string, number>,
	// Retained for call-site compatibility; travel time is now purely speed-based
	// for every mission (scouts included), so the kind no longer affects it.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_mission: TravelMission = 'attack'
): number {
	const dist = Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2);
	const multiplier = travelMultiplier(source);

	// Scout missions are pure Recon Operative, so the standard speed-based formula
	// resolves to Recon's speed (50) — the fastest mission in the game. No flat-rate
	// special case; keep this in lockstep with server computeTravelMinutes.
	let minSpeed = Infinity;
	for (const [type, count] of Object.entries(troops)) {
		if (count > 0 && TROOP_SPEED[type]) {
			minSpeed = Math.min(minSpeed, TROOP_SPEED[type]);
		}
	}
	if (!isFinite(minSpeed)) return 0;

	const hasOverseer = (troops.overseer ?? 0) > 0;
	return dist * (4 + (28 - minSpeed) / 10) * (hasOverseer ? 3 : 1) * multiplier;
}

export function transferTravelMinutes(source: TravelSource, target: TravelTarget): number {
	const dist = Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2);
	return dist * TRANSFER_TRAVEL_MINUTES_PER_UNIT * travelMultiplier(source);
}

export function formatDuration(minutes: number): string {
	const totalSeconds = Math.max(0, Math.round(minutes * 60));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}
