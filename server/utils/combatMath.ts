import type { TroopKey, TroopStat } from '../types/index.js';

export const TROOP_STATS: Record<TroopKey, TroopStat> = {
  lancerDrone:          { attack: 15,  defense: 25,  speed: 20, carry: 20  },
  assaultTrooper:       { attack: 30,  defense: 40,  speed: 18, carry: 15  },
  breakerUnit:          { attack: 50,  defense: 15,  speed: 16, carry: 10  },
  reconOperative:       { attack: 5,   defense: 20,  speed: 25, carry: 10  },
  skimmerBike:          { attack: 80,  defense: 70,  speed: 22, carry: 60  },
  siegeMech:            { attack: 150, defense: 200, speed: 10, carry: 80  },
  bulwarkGuard:         { attack: 20,  defense: 120, speed: 12, carry: 25  },
  suppressorTeam:       { attack: 60,  defense: 50,  speed: 15, carry: 20  },
  disruptorUnit:        { attack: 70,  defense: 60,  speed: 17, carry: 25  },
  interceptorBike:      { attack: 90,  defense: 80,  speed: 28, carry: 50  },
  annihilatorPlatform:  { attack: 200, defense: 150, speed: 8,  carry: 100 },
  overseer:             { attack: 0,   defense: 30,  speed: 15, carry: 0   },
};

const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

export function computeForcePower(
  forceTroops: Partial<Record<TroopKey, number>> | Record<string, unknown>,
  statKey: keyof TroopStat,
): number {
  return TROOP_KEYS.reduce((sum, troopType) => {
    const count = Number((forceTroops as Record<string, unknown>)[troopType] || 0);
    const stat = TROOP_STATS[troopType]?.[statKey] || 0;
    return sum + count * stat;
  }, 0);
}
