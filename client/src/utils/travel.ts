import { NEXUS_TYPE_BONUSES } from '../realtime/economy.shared';

export const TROOP_SPEED: Record<string, number> = {
  lancerDrone: 20,
  assaultTrooper: 18,
  breakerUnit: 16,
  reconOperative: 25,
  skimmerBike: 22,
  siegeMech: 10,
  bulwarkGuard: 12,
  suppressorTeam: 15,
  disruptorUnit: 17,
  interceptorBike: 28,
  annihilatorPlatform: 8,
  voidStalker: 32,
  overseer: 6,
};

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
  return (troops.reconOperative ?? 0) > 0 &&
    Object.entries(troops).every(([type, count]) => type === 'reconOperative' || count === 0);
}

export function travelMinutes(
  source: TravelSource,
  target: TravelTarget,
  troops: Record<string, number>,
  mission: TravelMission = 'attack',
): number {
  const dist = Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2);
  const multiplier = travelMultiplier(source);

  if (mission === 'scout') {
    return dist * 4 * multiplier;
  }

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

export function formatDuration(minutes: number): string {
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
