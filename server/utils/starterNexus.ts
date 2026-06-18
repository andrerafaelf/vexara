import type { PrismaClient } from '@prisma/client';
import { getPopulationMax } from './population.js';
import { calculatePoints, getMaxStorage } from './economy.js';
import { MIN_NEXUS_SPACING } from './neutralNexuses.js';

export const STARTER_NEXUS_DEFAULTS = {
	commandCore: 0,
	hangarBay: 0,
	plasmaForge: 0,
	armorFoundry: 0,
	lifeSupport: 0,
	storageVault: 0,
	biomassFarm: 1,
	alloyForge: 1,
	oreExtractor: 1,
	shieldGrid: 0
} as const;

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function findOpenStarterCoordinates(
	tx: TxClient,
	galaxyId: number,
	{ mapSize = 50, maxAttempts = 100 } = {}
): Promise<{ x: number; y: number } | null> {
	// New players used to be placed with only an exact-collision check, so they
	// could spawn directly adjacent to NPCs or each other - which both fed the
	// map's clustering and dropped newbies right next to bigger fish. Enforce the
	// same MIN_NEXUS_SPACING the neutral spawner uses so starters land with at
	// least one empty cell of breathing room. Falls back to spacing=1 (exact
	// collision only) on a tight map so a join never hard-fails for want of room.
	const existing = await tx.nexus.findMany({ where: { galaxyId }, select: { x: true, y: true } });
	const fits = (x: number, y: number, spacing: number) =>
		!existing.some((n) => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) < spacing);

	for (const spacing of [MIN_NEXUS_SPACING, 1]) {
		for (let i = 0; i < maxAttempts; i++) {
			const x = Math.floor(Math.random() * mapSize);
			const y = Math.floor(Math.random() * mapSize);
			if (fits(x, y, spacing)) return { x, y };
		}
	}
	return null;
}

// Was 3 days. Raised to 5: long enough to clear the tutorial and build a first
// defensible garrison without freezing early-map land-grab dynamics for a full
// week. Paired with PROTECTION_TAPER_DURATION_MS in gameConstants.ts, which
// softens (not removes) vulnerability for a further 7 days after this expires.
export const NEWBIE_PROTECTION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

// Bonus troops credited to a new player's starter nexus when they joined via a referral link.
// Resources can't exceed day-1 storage (1500 each), so we give troops instead —
// they're immediately useful and don't silently overflow the storage cap.
export const REFERRAL_SIGNUP_BONUS = 0; // kept for backward-compat imports
export const REFERRAL_TROOP_BONUS = { reconOperative: 15, sentinelLancer: 10, assaultTrooper: 10 };

export async function createStarterNexus(
	tx: TxClient,
	{
		userId,
		username,
		galaxyId,
		referredById
	}: { userId: number; username: string; galaxyId: number; referredById?: number | null }
) {
	const coords = (await findOpenStarterCoordinates(tx, galaxyId)) ?? { x: 0, y: 0 };
	const troopBonus = referredById ? REFERRAL_TROOP_BONUS : {};
	return tx.nexus.create({
		data: {
			name: `${username}'s Nexus`,
			ownerId: userId,
			galaxyId,
			x: coords.x,
			y: coords.y,
			...STARTER_NEXUS_DEFAULTS,
			...troopBonus,
			biomass: 1500,
			alloy: 1500,
			ore: 1500,
			populationMax: getPopulationMax(STARTER_NEXUS_DEFAULTS.lifeSupport),
			newbieProtectionEndsAt: new Date(Date.now() + NEWBIE_PROTECTION_DURATION_MS),
			// One-time relocation token: fresh signups only. Lets a new player who
			// landed in a bad spot warp near a chosen nexus once, while still
			// protected. Consumed on use and dead when protection lapses.
			relocationTokenAvailable: true
		}
	});
}

// ---------------------------------------------------------------------------
// Eliminated-player respawn sizing
//
// A returning veteran shouldn't be reset to a bare day-one starter. Their
// respawn nexus is scaled to a fraction of the *peak total influence* they held
// in this galaxy before losing their last nexus, so someone who topped out at
// 5,000 influence comes back at "just over half" of that, while a player who
// never built much comes back at a solid mid-tier floor.
//
// The fixed floor template below is the minimum a respawn can be; from there we
// scale building levels and the garrison up toward the influence target. Both
// the floor and the per-level caps keep a megaplayer from respawning as an
// instant galaxy threat.
// ---------------------------------------------------------------------------

// "Just over half" of the player's peak influence.
export const RESPAWN_INFLUENCE_FRACTION = 0.55;

// Floor template — what every respawn gets at minimum, regardless of peak.
// (Matches the historical fixed respawn so existing balance is the lower bound.)
const RESPAWN_FLOOR = {
	buildings: {
		commandCore: 12,
		// The retired RC respawn floor was 7. Granted as 7 to each of the three
		// class buildings so a respawning player retains balanced production
		// capacity across all classes.
		hangarBay: 7,
		plasmaForge: 7,
		armorFoundry: 7,
		lifeSupport: 12,
		storageVault: 12,
		biomassFarm: 12,
		alloyForge: 12,
		oreExtractor: 12,
		shieldGrid: 8,
		targetingCore: 0,
		stealthArray: 0
	},
	troops: {
		assaultTrooper: 100,
		sentinelLancer: 60,
		vanguardBreaker: 40,
		reconOperative: 20,
		pyreSuppressor: 15,
		bulwarkGuard: 15
	}
} as const;

// Hard ceilings so a respawn can grow with peak influence without becoming
// untouchable. Buildings cap at Lv20; the garrison cap multiplies the floor.
const RESPAWN_BUILDING_LEVEL_CAP = 20;
const RESPAWN_TROOP_SCALE_CAP = 6;

export type RespawnNexusConfig = {
	buildings: Record<string, number>;
	troops: Record<string, number>;
	resources: { biomass: number; alloy: number; ore: number };
	populationCurrent: number;
	populationMax: number;
};

function floorInfluence(): number {
	return calculatePoints({
		...RESPAWN_FLOOR.buildings,
		...RESPAWN_FLOOR.troops
	} as unknown as Parameters<typeof calculatePoints>[0]);
}

// Build a respawn nexus configuration scaled to a fraction of `peakPoints`.
// Deterministic and bounded: never below the floor, never above the caps.
export function buildRespawnNexusConfig(peakPoints: number): RespawnNexusConfig {
	const floorPts = floorInfluence();
	const targetPts = Math.max(floorPts, Math.round((peakPoints || 0) * RESPAWN_INFLUENCE_FRACTION));
	// How much bigger than the floor we want to be (>= 1).
	const scale = targetPts / Math.max(1, floorPts);

	const buildings: Record<string, number> = {};
	for (const [key, lvl] of Object.entries(RESPAWN_FLOOR.buildings)) {
		if (lvl <= 0) {
			buildings[key] = lvl;
			continue;
		}
		buildings[key] = Math.min(RESPAWN_BUILDING_LEVEL_CAP, Math.round(lvl * scale));
	}

	const troopScale = Math.min(RESPAWN_TROOP_SCALE_CAP, scale);
	const troops: Record<string, number> = {};
	for (const [key, count] of Object.entries(RESPAWN_FLOOR.troops)) {
		troops[key] = Math.round(count * troopScale);
	}

	const populationMax = getPopulationMax(buildings.lifeSupport);
	const populationCurrent = Math.min(
		populationMax,
		Object.values(troops).reduce((sum, n) => sum + n, 0)
	);

	// Hand back a full stockpile sized to the (scaled) storage vault so the
	// returning player has resources to act with immediately, clamped to cap.
	const maxStorage = getMaxStorage({
		nexusType: null,
		storageVault: buildings.storageVault,
		biomassFarm: buildings.biomassFarm,
		alloyForge: buildings.alloyForge,
		oreExtractor: buildings.oreExtractor,
		biomass: 0,
		alloy: 0,
		ore: 0,
		lastResourceUpdate: new Date()
	} as unknown as Parameters<typeof getMaxStorage>[0]);
	const stockpile = Math.floor(Math.min(maxStorage, 100_000 * scale));

	return {
		buildings,
		troops,
		resources: { biomass: stockpile, alloy: stockpile, ore: stockpile },
		populationCurrent,
		populationMax
	};
}
