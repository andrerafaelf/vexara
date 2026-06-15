// Single source of truth for troop + building artwork.
//
// All art is served from the Cloudflare CDN at https://cdn.vexara.world as
// optimized .webp, keyed by the canonical camelCase troop/building key:
//   troops:    https://cdn.vexara.world/troops/<key>.webp
//   buildings: https://cdn.vexara.world/buildings/<key>.webp
//
// Migrated off bundled local PNG imports (StaticImageData) so the client ships
// no image bytes and new/updated art is a CDN upload, not a code change. Every
// key has its own dedicated image — no shared placeholders.
//
// Values are plain URL strings. Consumers that use a plain <img src> work as-is.
// Consumers that use next/image <Image src> require cdn.vexara.world in
// next.config images.remotePatterns (configured).

export const CDN_BASE = 'https://cdn.vexara.world';

export function troopIcon(key: string): string {
	return `${CDN_BASE}/troops/${key}.webp`;
}

export function buildingIcon(key: string): string {
	return `${CDN_BASE}/buildings/${key}.webp`;
}

// Player rank/supporter badges, served from the CDN at /badges/<key>.webp.
// Same upload-not-code convention as troop/building art.
export function badgeIcon(key: string): string {
	return `${CDN_BASE}/badges/${key}.webp`;
}

// Alpha Player: granted to early/founding players (isAlphaFounder). Permanent historical badge.
export const ALPHA_PLAYER_BADGE = badgeIcon('alphaPlayer_nobg_trimmed');
// Alpha Commander: granted to commander-tier supporters during alpha. Frozen — no new grants after 28 Jun 2026.
export const ALPHA_COMMANDER_BADGE = badgeIcon('alphaCommander_nobg_trimmed');
// Vanguard: replaces Alpha Commander for new commander-tier supporters from 28 Jun 2026 onwards.
// Upload badge art to cdn.vexara.world/badges/vanguard_nobg_trimmed.webp to activate.
export const VANGUARD_BADGE = badgeIcon('vanguard_nobg_trimmed');

const TROOP_KEYS = [
	'assaultTrooper',
	'sentinelLancer',
	'vanguardBreaker',
	'reconOperative',
	'wraithSkimmer',
	'bulwarkGuard',
	'aegisSkirmisher',
	'pyreSuppressor',
	'arcDisruptor',
	'phantomLance',
	'voidStalker',
	'siegeMech',
	'plasmaTurret',
	'annihilatorPlatform',
	'siegeColossus',
	'overseer'
] as const;

const BUILDING_KEYS = [
	'commandCore',
	'hangarBay',
	'plasmaForge',
	'armorFoundry',
	'lifeSupport',
	'storageVault',
	'biomassFarm',
	'alloyForge',
	'oreExtractor',
	'shieldGrid',
	'targetingCore',
	'stealthArray'
] as const;

// Pre-built key -> CDN URL maps, kept for existing consumers (Codex, Landing)
// that index by key. New code can call troopIcon()/buildingIcon() directly.
export const TROOP_ICONS: Record<string, string> = Object.fromEntries(
	TROOP_KEYS.map((k) => [k, troopIcon(k)])
);

export const BUILDING_ICONS: Record<string, string> = Object.fromEntries(
	BUILDING_KEYS.map((k) => [k, buildingIcon(k)])
);
