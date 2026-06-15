// Shop catalog: all purchasable titles and borders, plus daily rotation logic.
// Rotation is deterministic from UTC date so every server instance agrees.

export type ShopItemType = 'title' | 'border' | 'rename' | 'gift_pass';

export interface ShopItem {
	key: string;
	type: ShopItemType;
	name: string;
	description: string;
	vpCost: number;
	cssClass?: string;
	// For borders: which collection this variant belongs to
	collection?: string;
	// Index within the collection (1–6)
	variant?: number;
}

// ── Titles ────────────────────────────────────────────────────────────────────
// 25 total. All titles are flat-priced (see TITLE_COST). The per-entry vpCost
// values below are ignored — TITLE_COST is applied to every title at export.

export const TITLE_COST = 50;

const TITLE_DEFS: ShopItem[] = [
	// ── Tier 1 – 100 VP ──────────────────────────────────────────────────────
	{
		key: 'title_drifter',
		type: 'title',
		name: 'Drifter',
		description: 'A wanderer between the stars.',
		vpCost: 100,
	},
	{
		key: 'title_scavenger',
		type: 'title',
		name: 'Scavenger',
		description: 'Takes what others leave behind.',
		vpCost: 100,
	},
	{
		key: 'title_outrider',
		type: 'title',
		name: 'Outrider',
		description: 'First through the breach, last to leave.',
		vpCost: 100,
	},
	{
		key: 'title_grit',
		type: 'title',
		name: 'The Grit',
		description: 'Worn down but never broken.',
		vpCost: 100,
	},
	{
		key: 'title_infiltrator',
		type: 'title',
		name: 'Infiltrator',
		description: 'Slips through every defence.',
		vpCost: 100,
	},
	{
		key: 'title_signal_runner',
		type: 'title',
		name: 'Signal Runner',
		description: 'Carries the word across the void.',
		vpCost: 100,
	},
	{
		key: 'title_iron_pact',
		type: 'title',
		name: 'Iron Pact',
		description: 'Bound by oath to the cause.',
		vpCost: 100,
	},
	{
		key: 'title_frontier_hand',
		type: 'title',
		name: 'Frontier Hand',
		description: 'Builds empires at the edge of nothing.',
		vpCost: 100,
	},
	{
		key: 'title_static_eye',
		type: 'title',
		name: 'Static Eye',
		description: 'Always watching, never blinking.',
		vpCost: 100,
	},
	// ── Tier 2 – 250 VP ──────────────────────────────────────────────────────
	{
		key: 'title_void_herald',
		type: 'title',
		name: 'Void Herald',
		description: 'Messenger of the deep dark between galaxies.',
		vpCost: 250,
	},
	{
		key: 'title_arc_breaker',
		type: 'title',
		name: 'Arc Breaker',
		description: 'Shatters shields with plasma and will.',
		vpCost: 250,
	},
	{
		key: 'title_iron_veil',
		type: 'title',
		name: 'Iron Veil',
		description: 'A fortress that walks and breathes.',
		vpCost: 250,
	},
	{
		key: 'title_null_sovereign',
		type: 'title',
		name: 'Null Sovereign',
		description: 'Rules the space between signals.',
		vpCost: 250,
	},
	{
		key: 'title_vex_oracle',
		type: 'title',
		name: 'Vex Oracle',
		description: 'Reads the Protocol like scripture.',
		vpCost: 250,
	},
	{
		key: 'title_chain_warden',
		type: 'title',
		name: 'Chain Warden',
		description: 'Every front is yours to hold.',
		vpCost: 250,
	},
	{
		key: 'title_phantom_axis',
		type: 'title',
		name: 'Phantom Axis',
		description: 'The war pivots around this ghost.',
		vpCost: 250,
	},
	{
		key: 'title_remnant',
		type: 'title',
		name: 'The Remnant',
		description: 'Last standing after every storm.',
		vpCost: 250,
	},
	// ── Tier 3 – 400 VP ──────────────────────────────────────────────────────
	{
		key: 'title_void_architect',
		type: 'title',
		name: 'Void Architect',
		description: 'Redraws the galaxy in their own image.',
		vpCost: 400,
	},
	{
		key: 'title_oblivion_hand',
		type: 'title',
		name: 'Hand of Oblivion',
		description: 'Chosen instrument of the Protocol\'s end.',
		vpCost: 400,
	},
	{
		key: 'title_galactic_scourge',
		type: 'title',
		name: 'Galactic Scourge',
		description: 'A name that empties systems before arrival.',
		vpCost: 400,
	},
	{
		key: 'title_abyssal_throne',
		type: 'title',
		name: 'Throne of the Abyss',
		description: 'Sovereign of the unreachable dark.',
		vpCost: 400,
	},
	{
		key: 'title_eternal_vanguard',
		type: 'title',
		name: 'Eternal Vanguard',
		description: 'Has held the line across more seasons than memory allows.',
		vpCost: 400,
	},
	{
		key: 'title_null_emperor',
		type: 'title',
		name: 'Null Emperor',
		description: 'Commands the silence between stars.',
		vpCost: 400,
	},
	{
		key: 'title_reckoning',
		type: 'title',
		name: 'The Reckoning',
		description: 'Not a title — a warning.',
		vpCost: 400,
	},
	{
		key: 'title_last_signal',
		type: 'title',
		name: 'Last Signal',
		description: 'What the Protocol broadcasts at the end of all things.',
		vpCost: 400,
	},
];

// Flat-price every title at TITLE_COST.
export const ALL_TITLES: ShopItem[] = TITLE_DEFS.map((t) => ({ ...t, vpCost: TITLE_COST }));

// ── Borders ───────────────────────────────────────────────────────────────────
// 12 collections × 6 variants = 72 purchasable borders.
// Individual: 75 VP. Bundle (all 6 in a collection): 300 VP.
// One collection rotates into the shop per day (deterministic by UTC date).
// CDN URL pattern: https://cdn.vexara.world/borders/<collection>/<variant>.png

export const CDN_BORDERS = 'https://cdn.vexara.world/borders';
export const BORDER_INDIVIDUAL_COST = 75;
export const BORDER_BUNDLE_COST = 300;

const COLLECTIONS = [
	{ key: 'banner',   name: 'Banner' },
	{ key: 'cube',     name: 'Cube' },
	{ key: 'edge',     name: 'Edge' },
	{ key: 'frame',    name: 'Frame' },
	{ key: 'glitch',   name: 'Glitch' },
	{ key: 'gridlock', name: 'Gridlock' },
	{ key: 'mist',     name: 'Mist' },
	{ key: 'monolith', name: 'Monolith' },
	{ key: 'portal',   name: 'Portal' },
	{ key: 'runner',   name: 'Runner' },
	{ key: 'sunfall',  name: 'Sunfall' },
	{ key: 'terminal', name: 'Terminal' },
] as const;

export type CollectionKey = typeof COLLECTIONS[number]['key'];

// Generate all 72 individual border items
export const ALL_BORDERS: ShopItem[] = COLLECTIONS.flatMap(({ key, name }) =>
	[1, 2, 3, 4, 5, 6].map((v) => ({
		key: `border_${key}_${v}`,
		type: 'border' as const,
		name: `${name} ${v}`,
		description: `${name} portrait frame, variant ${v}.`,
		vpCost: BORDER_INDIVIDUAL_COST,
		cssClass: `${key}-${v}`,
		collection: key,
		variant: v,
	}))
);

// Convenience lookup: collection key → its 6 border items
export function getCollectionBorders(collectionKey: string): ShopItem[] {
	return ALL_BORDERS.filter((b) => b.collection === collectionKey);
}

// Alpha Commander border: entitlement for alpha commander-tier supporters.
// Not purchasable — injected into ownedKeys server-side.
export const BORDER_ALPHA_COMMANDER: ShopItem = {
	key: 'border_alpha_commander',
	type: 'border',
	name: 'Alpha Commander',
	description: 'Exclusive portrait frame for commander-tier supporters who backed Vexara during alpha.',
	vpCost: 0,
	cssClass: 'alpha-commander',
	collection: 'alpha',
	variant: 1,
};

// ── Utility items (fixed, always available) ───────────────────────────────────
export const UTILITY_ITEMS: ShopItem[] = [
	{
		key: 'rename',
		type: 'rename',
		name: 'Commander Rename',
		description: 'Change your username once. 30-day cooldown applies.',
		vpCost: 500,
	},
	{
		key: 'gift_pass',
		type: 'gift_pass',
		name: 'Gift Vex Protocol Pass',
		description: 'Unlock the battle pass premium track for a galaxy mate.',
		vpCost: 1000,
	},
];

// ── Daily rotation ────────────────────────────────────────────────────────────
// Uses a deterministic day-based seed so all instances return the same items.

function dayIndex(): number {
	return Math.floor(Date.now() / 86_400_000);
}

/** Returns the 3 titles on sale today. */
export function getDailyTitles(): ShopItem[] {
	const seed = dayIndex();
	// Fisher-Yates shuffle seeded by day
	const arr = ALL_TITLES.slice();
	let s = seed;
	for (let i = arr.length - 1; i > 0; i--) {
		s = (s * 1664525 + 1013904223) & 0xffffffff;
		const j = Math.abs(s) % (i + 1);
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr.slice(0, 3);
}

/** Returns today's border collection (6 items, cycles through all 12 collections). */
export function getDailyBorderCollection(): { collectionKey: string; collectionName: string; borders: ShopItem[] } {
	const idx = dayIndex() % COLLECTIONS.length;
	const col = COLLECTIONS[idx];
	return {
		collectionKey: col.key,
		collectionName: col.name,
		borders: getCollectionBorders(col.key),
	};
}

/** Returns the full shop payload for today. */
export function getDailyShop() {
	const now = new Date();
	const utcMidnightMs =
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
	const refreshesAt = new Date(utcMidnightMs).toISOString();
	const borderCollection = getDailyBorderCollection();

	return {
		titles: getDailyTitles(),
		borderCollection,
		utilities: UTILITY_ITEMS,
		refreshesAt,
	};
}
