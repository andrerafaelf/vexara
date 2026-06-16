export type ChallengeCategory = 'combat' | 'empire' | 'galaxy' | 'economy' | 'loyalty';
export type ChallengeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ChallengeTier {
	threshold: number;
	title: string;
}

export interface ChallengeDefinition {
	id: string;
	name: string;
	description: string;
	category: ChallengeCategory;
	rarity: ChallengeRarity;
	stat: keyof ChallengeStats;
	tiers: ChallengeTier[];
	unit?: string;
}

// All stats derivable at request time from existing DB records — no new schema.
export interface ChallengeStats {
	// combat — from Attack rows
	troopsKilled: number;
	troopsLost: number;
	victories: number;
	defeats: number;
	attacksLaunched: number;
	attacksDefended: number;
	nexusesCaptured: number;
	scoutsMade: number;
	supportMissionsSent: number;
	defenseVictories: number;
	perfectVictories: number;        // won with 0 troops lost
	resourcesStolen: number;
	resourcesLost: number;
	// empire — from Nexus + User rows
	nexusCount: number;
	lifetimePoints: number;
	totalTroopsEverTrained: number;
	// galaxy — from User + SeasonRecord
	galaxiesWon: number;
	galaxiesPlayed: number;
	bestGalaxyPoints: number;
	// economy — from MarketTransaction rows
	tradesMade: number;
	totalTradeVolume: number;
	// loyalty — from User
	accountAgeDays: number;
	referralCount: number;
}

export interface ChallengeProgress {
	id: string;
	name: string;
	description: string;
	category: ChallengeCategory;
	rarity: ChallengeRarity;
	unit?: string;
	currentValue: number;
	tiers: ChallengeTier[];
	completedTierIndex: number;
	nextTierThreshold: number | null;
	nextTierTitle: string | null;
	progress: number;
	unlockedTitle: string | null;
}

export const CHALLENGE_DEFS: ChallengeDefinition[] = [

	// ═══════════════════════════════════════════════════════════════════════════
	// COMBAT
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'butcher',
		name: 'Butcher',
		description: 'Destroy enemy troops in battle.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'troopsKilled',
		unit: 'troops',
		tiers: [
			{ threshold: 100,    title: 'Combatant' },
			{ threshold: 1_000,  title: 'Slaughterer' },
			{ threshold: 5_000,  title: 'Exterminator' },
			{ threshold: 10_000, title: 'Annihilator' },
			{ threshold: 50_000, title: 'God of War' },
		],
	},
	{
		id: 'acceptable_losses',
		name: 'Acceptable Losses',
		description: 'Lose troops across all battles.',
		category: 'combat',
		rarity: 'common',
		stat: 'troopsLost',
		unit: 'troops',
		tiers: [
			{ threshold: 50,    title: 'Expendable' },
			{ threshold: 500,   title: 'Blood Price' },
			{ threshold: 2_500, title: 'The Fallen' },
			{ threshold: 10_000, title: 'Pyrrhic' },
		],
	},
	{
		id: 'warlord_path',
		name: "Warlord's Path",
		description: 'Win battles as the attacking commander.',
		category: 'combat',
		rarity: 'rare',
		stat: 'victories',
		unit: 'victories',
		tiers: [
			{ threshold: 5,   title: 'Skirmisher' },
			{ threshold: 25,  title: 'Aggressor' },
			{ threshold: 75,  title: 'Warhound' },
			{ threshold: 200, title: "Warlord's Chosen" },
			{ threshold: 500, title: 'Unbroken' },
		],
	},
	{
		id: 'iron_wall',
		name: 'Iron Wall',
		description: 'Repel enemy attacks on your nexuses.',
		category: 'combat',
		rarity: 'rare',
		stat: 'attacksDefended',
		unit: 'defenses',
		tiers: [
			{ threshold: 3,   title: 'Sentry' },
			{ threshold: 15,  title: 'Defender' },
			{ threshold: 50,  title: 'Bulwark' },
			{ threshold: 150, title: 'Iron Wall' },
			{ threshold: 400, title: 'Citadel' },
		],
	},
	{
		id: 'nexus_breaker',
		name: 'Nexus Breaker',
		description: 'Capture enemy nexuses.',
		category: 'combat',
		rarity: 'epic',
		stat: 'nexusesCaptured',
		unit: 'nexuses',
		tiers: [
			{ threshold: 1,   title: 'Raider' },
			{ threshold: 5,   title: 'Plunderer' },
			{ threshold: 15,  title: 'Despoiler' },
			{ threshold: 40,  title: 'Nexus Breaker' },
			{ threshold: 100, title: 'World Eater' },
		],
	},
	{
		id: 'berserker',
		name: 'Berserker',
		description: 'Launch attacks across all galaxies.',
		category: 'combat',
		rarity: 'common',
		stat: 'attacksLaunched',
		unit: 'attacks',
		tiers: [
			{ threshold: 5,   title: 'Agitator' },
			{ threshold: 25,  title: 'Provocateur' },
			{ threshold: 100, title: 'Instigator' },
			{ threshold: 300, title: 'Berserker' },
		],
	},
	{
		id: 'eyes_open',
		name: 'Eyes Open',
		description: 'Send scouts to survey enemy nexuses.',
		category: 'combat',
		rarity: 'common',
		stat: 'scoutsMade',
		unit: 'scouts',
		tiers: [
			{ threshold: 3,   title: 'Spotter' },
			{ threshold: 20,  title: 'Scout' },
			{ threshold: 75,  title: 'Pathfinder' },
			{ threshold: 200, title: 'Shadow Eye' },
		],
	},
	{
		id: 'guardian',
		name: 'Guardian',
		description: 'Win battles as the defending commander.',
		category: 'combat',
		rarity: 'rare',
		stat: 'defenseVictories',
		unit: 'defenses won',
		tiers: [
			{ threshold: 2,   title: 'Watchman' },
			{ threshold: 10,  title: 'Shield Bearer' },
			{ threshold: 35,  title: 'Bastion' },
			{ threshold: 100, title: 'Guardian' },
			{ threshold: 300, title: 'Inviolate' },
		],
	},
	{
		id: 'flawless',
		name: 'Flawless',
		description: 'Win battles without losing a single troop.',
		category: 'combat',
		rarity: 'epic',
		stat: 'perfectVictories',
		unit: 'flawless wins',
		tiers: [
			{ threshold: 1,  title: 'Precise' },
			{ threshold: 5,  title: 'Immaculate' },
			{ threshold: 20, title: 'Unchallenged' },
			{ threshold: 60, title: 'Flawless' },
		],
	},
	{
		id: 'defeat_accepted',
		name: 'Defeat Accepted',
		description: 'Suffer defeats in battle.',
		category: 'combat',
		rarity: 'common',
		stat: 'defeats',
		unit: 'defeats',
		tiers: [
			{ threshold: 3,  title: 'Bloodied' },
			{ threshold: 15, title: 'Battle-Scarred' },
			{ threshold: 50, title: 'Survivor' },
			{ threshold: 150, title: 'Never Surrendered' },
		],
	},
	{
		id: 'logistics_corps',
		name: 'Logistics Corps',
		description: 'Send support missions to allied nexuses.',
		category: 'combat',
		rarity: 'rare',
		stat: 'supportMissionsSent',
		unit: 'missions',
		tiers: [
			{ threshold: 2,  title: 'Auxiliary' },
			{ threshold: 10, title: 'Quartermaster' },
			{ threshold: 35, title: 'Logistics Officer' },
			{ threshold: 100, title: 'Iron Supply' },
		],
	},
	{
		id: 'arms_race',
		name: 'Arms Race',
		description: 'Train troops across all nexuses over your career.',
		category: 'combat',
		rarity: 'epic',
		stat: 'totalTroopsEverTrained',
		unit: 'troops',
		tiers: [
			{ threshold: 500,    title: 'Drill Sergeant' },
			{ threshold: 5_000,  title: 'War Machine' },
			{ threshold: 25_000, title: 'Grand Arsenal' },
			{ threshold: 100_000, title: 'Forge of Worlds' },
			{ threshold: 500_000, title: 'Legion Eternal' },
		],
	},
	{
		id: 'blitz',
		name: 'Blitz',
		description: 'Achieve the highest victory rate (50+ attacks required).',
		category: 'combat',
		rarity: 'legendary',
		stat: 'victories',
		unit: 'victories',
		tiers: [
			{ threshold: 10,  title: 'Fighter' },
			{ threshold: 50,  title: 'Striker' },
			{ threshold: 150, title: 'Blade of the Vex' },
			{ threshold: 400, title: 'Apex Predator' },
			{ threshold: 1_000, title: 'The Inevitable' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// EMPIRE
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'empire_builder',
		name: 'Empire Builder',
		description: 'Hold nexuses simultaneously in an active galaxy.',
		category: 'empire',
		rarity: 'rare',
		stat: 'nexusCount',
		unit: 'nexuses',
		tiers: [
			{ threshold: 3,  title: 'Settler' },
			{ threshold: 8,  title: 'Colonist' },
			{ threshold: 15, title: 'Expansionist' },
			{ threshold: 25, title: 'Overlord' },
			{ threshold: 50, title: 'Emperor' },
		],
	},
	{
		id: 'influence_broker',
		name: 'Influence Broker',
		description: 'Accumulate total lifetime influence across all galaxies.',
		category: 'empire',
		rarity: 'epic',
		stat: 'lifetimePoints',
		unit: 'influence',
		tiers: [
			{ threshold: 10_000,     title: 'Ensign' },
			{ threshold: 100_000,    title: 'Commander' },
			{ threshold: 500_000,    title: 'Grand Commander' },
			{ threshold: 2_000_000,  title: 'Supreme Warlord' },
			{ threshold: 10_000_000, title: 'Eternal Sovereign' },
		],
	},
	{
		id: 'peak_performance',
		name: 'Peak Performance',
		description: 'Reach a high influence score in a single galaxy season.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'bestGalaxyPoints',
		unit: 'influence',
		tiers: [
			{ threshold: 5_000,    title: 'Rising Power' },
			{ threshold: 25_000,   title: 'Dominant Force' },
			{ threshold: 100_000,  title: 'Hegemon' },
			{ threshold: 500_000,  title: 'Titan of the Vex' },
			{ threshold: 2_000_000, title: 'Singularity' },
		],
	},
	{
		id: 'mass_mobilisation',
		name: 'Mass Mobilisation',
		description: 'Train troops in total across all nexuses and seasons.',
		category: 'empire',
		rarity: 'rare',
		stat: 'totalTroopsEverTrained',
		unit: 'troops',
		tiers: [
			{ threshold: 250,    title: 'Conscript Commander' },
			{ threshold: 2_500,  title: 'Mobiliser' },
			{ threshold: 15_000, title: 'Warlord of Legions' },
			{ threshold: 75_000, title: 'Grand Marshal' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// GALAXY
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'galaxy_winner',
		name: 'Galaxy Winner',
		description: 'Win galaxy seasons.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'galaxiesWon',
		unit: 'wins',
		tiers: [
			{ threshold: 1,  title: 'Conqueror' },
			{ threshold: 3,  title: 'Warlord' },
			{ threshold: 5,  title: 'Supreme Commander' },
			{ threshold: 10, title: 'Galaxy Master' },
		],
	},
	{
		id: 'veteran_traveler',
		name: 'Veteran Traveler',
		description: 'Participate in galaxy seasons.',
		category: 'galaxy',
		rarity: 'common',
		stat: 'galaxiesPlayed',
		unit: 'seasons',
		tiers: [
			{ threshold: 1,  title: 'Recruit' },
			{ threshold: 3,  title: 'Veteran' },
			{ threshold: 7,  title: 'Seasoned Commander' },
			{ threshold: 15, title: 'Eternal Traveler' },
		],
	},
	{
		id: 'season_contender',
		name: 'Season Contender',
		description: 'Finish in a top-influence position — reach a high single-season score.',
		category: 'galaxy',
		rarity: 'epic',
		stat: 'bestGalaxyPoints',
		unit: 'points',
		tiers: [
			{ threshold: 1_000,   title: 'Contender' },
			{ threshold: 10_000,  title: 'Challenger' },
			{ threshold: 50_000,  title: 'Apex Contender' },
			{ threshold: 250_000, title: 'Season Titan' },
			{ threshold: 1_000_000, title: 'Living Legend' },
		],
	},
	{
		id: 'dynasty',
		name: 'Dynasty',
		description: 'Win multiple galaxy seasons consecutively or overall.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'galaxiesWon',
		unit: 'wins',
		tiers: [
			{ threshold: 2,  title: 'Heir' },
			{ threshold: 4,  title: 'Sovereign' },
			{ threshold: 7,  title: 'Dynast' },
			{ threshold: 15, title: 'Immortal Dynasty' },
		],
	},
	{
		id: 'never_stop',
		name: 'Never Stop',
		description: 'Return and play in season after season.',
		category: 'galaxy',
		rarity: 'rare',
		stat: 'galaxiesPlayed',
		unit: 'seasons',
		tiers: [
			{ threshold: 2,  title: 'Returning' },
			{ threshold: 5,  title: 'Persistent' },
			{ threshold: 10, title: 'Relentless' },
			{ threshold: 20, title: 'Undying' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// ECONOMY
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'war_profiteer',
		name: 'War Profiteer',
		description: 'Steal resources from defeated enemies.',
		category: 'economy',
		rarity: 'epic',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 50_000,     title: 'Scavenger' },
			{ threshold: 500_000,    title: 'Looter' },
			{ threshold: 2_000_000,  title: 'Plunderer' },
			{ threshold: 10_000_000, title: 'War Profiteer' },
			{ threshold: 50_000_000, title: 'Void Merchant' },
		],
	},
	{
		id: 'market_veteran',
		name: 'Market Veteran',
		description: 'Complete trades on the open market.',
		category: 'economy',
		rarity: 'rare',
		stat: 'tradesMade',
		unit: 'trades',
		tiers: [
			{ threshold: 5,   title: 'Trader' },
			{ threshold: 25,  title: 'Broker' },
			{ threshold: 100, title: 'Exchange Master' },
			{ threshold: 300, title: 'Market Veteran' },
		],
	},
	{
		id: 'commodity_king',
		name: 'Commodity King',
		description: 'Trade a high volume of resources through the market.',
		category: 'economy',
		rarity: 'epic',
		stat: 'totalTradeVolume',
		unit: 'resources',
		tiers: [
			{ threshold: 100_000,    title: 'Vendor' },
			{ threshold: 1_000_000,  title: 'Merchant Prince' },
			{ threshold: 10_000_000, title: 'Trade Baron' },
			{ threshold: 50_000_000, title: 'Commodity King' },
		],
	},
	{
		id: 'the_price_of_war',
		name: 'The Price of War',
		description: 'Lose resources to enemy raids.',
		category: 'economy',
		rarity: 'common',
		stat: 'resourcesLost',
		unit: 'resources',
		tiers: [
			{ threshold: 10_000,   title: 'Raided' },
			{ threshold: 100_000,  title: 'Stripped' },
			{ threshold: 1_000_000, title: 'Plundered' },
			{ threshold: 5_000_000, title: 'Scorched Earth' },
		],
	},
	{
		id: 'black_market',
		name: 'Black Market',
		description: 'List goods and complete transactions as a seller.',
		category: 'economy',
		rarity: 'rare',
		stat: 'tradesMade',
		unit: 'trades',
		tiers: [
			{ threshold: 3,   title: 'Fence' },
			{ threshold: 15,  title: 'Dealer' },
			{ threshold: 50,  title: 'Trafficker' },
			{ threshold: 150, title: 'Black Market Baron' },
		],
	},
	{
		id: 'resource_baron',
		name: 'Resource Baron',
		description: 'Steal enormous quantities of enemy resources.',
		category: 'economy',
		rarity: 'legendary',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 1_000_000,  title: 'Opportunist' },
			{ threshold: 5_000_000,  title: 'Exploiter' },
			{ threshold: 20_000_000, title: 'Exactor' },
			{ threshold: 100_000_000, title: 'Resource Baron' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// LOYALTY
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'old_guard',
		name: 'Old Guard',
		description: 'Serve in the Vexara galaxy over time.',
		category: 'loyalty',
		rarity: 'rare',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 7,   title: 'Initiate' },
			{ threshold: 30,  title: 'Steadfast' },
			{ threshold: 90,  title: 'Iron Loyal' },
			{ threshold: 180, title: 'Old Guard' },
			{ threshold: 365, title: 'Immortal' },
		],
	},
	{
		id: 'two_years',
		name: 'Two Years of Service',
		description: 'Remain an active commander for over two years.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 400,  title: 'Devoted' },
			{ threshold: 600,  title: 'Faithful' },
			{ threshold: 730,  title: 'Two-Year Veteran' },
			{ threshold: 1_000, title: 'Eternal Servant' },
		],
	},
	{
		id: 'word_of_mouth',
		name: 'Word of Mouth',
		description: 'Recruit new commanders to Vexara.',
		category: 'loyalty',
		rarity: 'epic',
		stat: 'referralCount',
		unit: 'referrals',
		tiers: [
			{ threshold: 1,  title: 'Recruiter' },
			{ threshold: 5,  title: 'Headhunter' },
			{ threshold: 15, title: 'Talent Scout' },
			{ threshold: 50, title: 'Legion Builder' },
		],
	},
	{
		id: 'six_months',
		name: 'Half-Year Commander',
		description: 'Serve for six months without leaving.',
		category: 'loyalty',
		rarity: 'rare',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 14,  title: 'Present' },
			{ threshold: 60,  title: 'Committed' },
			{ threshold: 120, title: 'Entrenched' },
			{ threshold: 180, title: 'Half-Year Commander' },
		],
	},
	{
		id: 'founding_era',
		name: 'Founding Era',
		description: 'Have played since the early days of Vexara.',
		category: 'loyalty',
		rarity: 'epic',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 30,  title: 'Early Arrival' },
			{ threshold: 90,  title: 'Pioneer' },
			{ threshold: 270, title: 'Founding Member' },
			{ threshold: 500, title: 'Vex Original' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// Additional COMBAT depth
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'shock_and_awe',
		name: 'Shock & Awe',
		description: 'Capture nexuses through aggressive assault.',
		category: 'combat',
		rarity: 'epic',
		stat: 'nexusesCaptured',
		unit: 'nexuses',
		tiers: [
			{ threshold: 3,  title: 'Territorial' },
			{ threshold: 10, title: 'Conqueror' },
			{ threshold: 25, title: 'Shock Trooper' },
			{ threshold: 75, title: 'Shock & Awe' },
		],
	},
	{
		id: 'total_war',
		name: 'Total War',
		description: 'Rack up battles on both sides of the front.',
		category: 'combat',
		rarity: 'rare',
		stat: 'attacksLaunched',
		unit: 'attacks',
		tiers: [
			{ threshold: 10,  title: 'Skirmish Veteran' },
			{ threshold: 50,  title: 'Front Line' },
			{ threshold: 200, title: 'Total War' },
			{ threshold: 600, title: 'Endless Conflict' },
		],
	},
	{
		id: 'ghost_protocol',
		name: 'Ghost Protocol',
		description: 'Build up intelligence via scouting operations.',
		category: 'combat',
		rarity: 'rare',
		stat: 'scoutsMade',
		unit: 'scouts',
		tiers: [
			{ threshold: 5,   title: 'Lurker' },
			{ threshold: 30,  title: 'Intelligence Officer' },
			{ threshold: 100, title: 'Ghost' },
			{ threshold: 300, title: 'Phantom Watch' },
		],
	},
	{
		id: 'alliance_strength',
		name: 'Alliance Strength',
		description: 'Reinforce allied positions with troop support.',
		category: 'combat',
		rarity: 'rare',
		stat: 'supportMissionsSent',
		unit: 'missions',
		tiers: [
			{ threshold: 5,  title: 'Ally' },
			{ threshold: 25, title: 'Reinforcer' },
			{ threshold: 80, title: 'Brotherhood' },
			{ threshold: 200, title: 'Unbreakable Alliance' },
		],
	},
	{
		id: 'massacre',
		name: 'Massacre',
		description: 'Kill an extreme number of enemy troops lifetime.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'troopsKilled',
		unit: 'troops',
		tiers: [
			{ threshold: 2_000,  title: 'Executioner' },
			{ threshold: 8_000,  title: 'Massacre' },
			{ threshold: 20_000, title: 'Decimator' },
			{ threshold: 75_000, title: 'Void Reaper' },
		],
	},
	{
		id: 'steel_nerve',
		name: 'Steel Nerve',
		description: 'Win defensive battles under pressure.',
		category: 'combat',
		rarity: 'epic',
		stat: 'defenseVictories',
		unit: 'defenses won',
		tiers: [
			{ threshold: 5,   title: 'Composed' },
			{ threshold: 20,  title: 'Resolute' },
			{ threshold: 60,  title: 'Steel Nerve' },
			{ threshold: 200, title: 'Immovable' },
		],
	},
	{
		id: 'precision_strike',
		name: 'Precision Strike',
		description: 'Win battles without a single casualty.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'perfectVictories',
		unit: 'flawless wins',
		tiers: [
			{ threshold: 3,   title: 'Sharpshooter' },
			{ threshold: 10,  title: 'Surgical' },
			{ threshold: 30,  title: 'Precision Strike' },
			{ threshold: 100, title: 'The Untouchable' },
		],
	},
	{
		id: 'war_veteran',
		name: 'War Veteran',
		description: 'Survive and endure many defeats in battle.',
		category: 'combat',
		rarity: 'rare',
		stat: 'defeats',
		unit: 'defeats',
		tiers: [
			{ threshold: 5,   title: 'Tested' },
			{ threshold: 25,  title: 'Hardened' },
			{ threshold: 75,  title: 'Battle Worn' },
			{ threshold: 200, title: 'War Veteran' },
		],
	},
	{
		id: 'blood_and_iron',
		name: 'Blood and Iron',
		description: 'Sustain massive troop losses in the line of duty.',
		category: 'combat',
		rarity: 'epic',
		stat: 'troopsLost',
		unit: 'troops lost',
		tiers: [
			{ threshold: 1_000,  title: 'Scarred' },
			{ threshold: 5_000,  title: 'The Bleeding Edge' },
			{ threshold: 20_000, title: 'Blood and Iron' },
			{ threshold: 75_000, title: 'The Weight of Command' },
		],
	},
	{
		id: 'supply_line',
		name: 'Supply Line',
		description: 'Keep allies fighting with sustained logistical support.',
		category: 'combat',
		rarity: 'epic',
		stat: 'supportMissionsSent',
		unit: 'missions',
		tiers: [
			{ threshold: 15,  title: 'Supply Runner' },
			{ threshold: 50,  title: 'Logistics Specialist' },
			{ threshold: 150, title: 'Supply Line' },
			{ threshold: 400, title: 'Master of Logistics' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// Additional EMPIRE depth
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'territorial_expansion',
		name: 'Territorial Expansion',
		description: 'Grow your nexus holdings to dominate the galaxy map.',
		category: 'empire',
		rarity: 'epic',
		stat: 'nexusCount',
		unit: 'nexuses',
		tiers: [
			{ threshold: 5,  title: 'Territory Holder' },
			{ threshold: 12, title: 'Domain Lord' },
			{ threshold: 20, title: 'Province Master' },
			{ threshold: 35, title: 'Territorial Commander' },
		],
	},
	{
		id: 'hegemon',
		name: 'Hegemon',
		description: 'Achieve extreme lifetime influence dominance.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'lifetimePoints',
		unit: 'influence',
		tiers: [
			{ threshold: 50_000,     title: 'Notable' },
			{ threshold: 250_000,    title: 'Power Broker' },
			{ threshold: 1_000_000,  title: 'Hegemon' },
			{ threshold: 5_000_000,  title: 'Supreme Hegemon' },
		],
	},
	{
		id: 'first_among_equals',
		name: 'First Among Equals',
		description: 'Dominate a galaxy season with a peak score.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'bestGalaxyPoints',
		unit: 'points',
		tiers: [
			{ threshold: 10_000,   title: 'Notable Commander' },
			{ threshold: 75_000,   title: 'Galaxy Power' },
			{ threshold: 300_000,  title: 'First Among Equals' },
			{ threshold: 1_500_000, title: 'Undisputed' },
		],
	},
	{
		id: 'grand_architect',
		name: 'Grand Architect',
		description: 'Train massive armies from your command infrastructure.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'totalTroopsEverTrained',
		unit: 'troops',
		tiers: [
			{ threshold: 1_000,   title: 'Quartermaster' },
			{ threshold: 10_000,  title: 'Armament Chief' },
			{ threshold: 50_000,  title: 'Grand Architect' },
			{ threshold: 250_000, title: 'Architect of Ruin' },
		],
	},
	{
		id: 'the_long_game',
		name: 'The Long Game',
		description: 'Accumulate vast influence across a long career.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'lifetimePoints',
		unit: 'influence',
		tiers: [
			{ threshold: 200_000,    title: 'Influential' },
			{ threshold: 1_000_000,  title: 'Power Player' },
			{ threshold: 4_000_000,  title: 'The Long Game' },
			{ threshold: 15_000_000, title: 'Infinite Legacy' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// Additional GALAXY depth
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'once_more',
		name: 'Once More Into the Void',
		description: 'Return to the galaxy again and again.',
		category: 'galaxy',
		rarity: 'epic',
		stat: 'galaxiesPlayed',
		unit: 'seasons',
		tiers: [
			{ threshold: 3,  title: 'Returning Commander' },
			{ threshold: 6,  title: 'Galaxy Regular' },
			{ threshold: 12, title: 'Void Walker' },
			{ threshold: 25, title: 'Endless Crusader' },
		],
	},
	{
		id: 'champion',
		name: 'Champion',
		description: 'Prove dominance by winning multiple galaxies.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'galaxiesWon',
		unit: 'wins',
		tiers: [
			{ threshold: 2,  title: 'Double Victor' },
			{ threshold: 5,  title: 'Champion' },
			{ threshold: 8,  title: 'Grand Champion' },
			{ threshold: 20, title: 'Galaxy God' },
		],
	},
	{
		id: 'rising_star',
		name: 'Rising Star',
		description: 'Make your mark in a single season with a massive score.',
		category: 'galaxy',
		rarity: 'rare',
		stat: 'bestGalaxyPoints',
		unit: 'points',
		tiers: [
			{ threshold: 2_000,  title: 'Emerging' },
			{ threshold: 8_000,  title: 'Rising Star' },
			{ threshold: 30_000, title: 'Galaxy Force' },
			{ threshold: 150_000, title: 'Superstar' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// Additional ECONOMY depth
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'opportunist',
		name: 'Opportunist',
		description: 'Strike and seize enemy stockpiles.',
		category: 'economy',
		rarity: 'common',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 5_000,   title: 'Pickpocket' },
			{ threshold: 50_000,  title: 'Raider' },
			{ threshold: 250_000, title: 'Opportunist' },
			{ threshold: 1_000_000, title: 'Spoils of War' },
		],
	},
	{
		id: 'trade_empire',
		name: 'Trade Empire',
		description: 'Build a vast commercial operation through market trading.',
		category: 'economy',
		rarity: 'legendary',
		stat: 'totalTradeVolume',
		unit: 'resources',
		tiers: [
			{ threshold: 250_000,    title: 'Merchant' },
			{ threshold: 2_500_000,  title: 'Trade Magnate' },
			{ threshold: 15_000_000, title: 'Trade Empire' },
			{ threshold: 100_000_000, title: 'Interstellar Cartel' },
		],
	},
	{
		id: 'stripped_bare',
		name: 'Stripped Bare',
		description: 'Endure extreme resource losses to enemy raids.',
		category: 'economy',
		rarity: 'rare',
		stat: 'resourcesLost',
		unit: 'resources',
		tiers: [
			{ threshold: 25_000,   title: 'Looted' },
			{ threshold: 250_000,  title: 'Ransacked' },
			{ threshold: 2_000_000, title: 'Desolated' },
			{ threshold: 10_000_000, title: 'Stripped Bare' },
		],
	},
	{
		id: 'open_market',
		name: 'Open Market',
		description: 'Engage frequently with the galactic market.',
		category: 'economy',
		rarity: 'common',
		stat: 'tradesMade',
		unit: 'trades',
		tiers: [
			{ threshold: 2,   title: 'Buyer' },
			{ threshold: 10,  title: 'Regular' },
			{ threshold: 40,  title: 'Market Goer' },
			{ threshold: 120, title: 'Open Market' },
		],
	},
	{
		id: 'raid_economy',
		name: 'Raid Economy',
		description: 'Fund your war machine entirely through pillaging.',
		category: 'economy',
		rarity: 'epic',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 100_000,   title: 'Pillager' },
			{ threshold: 750_000,   title: 'Sacker' },
			{ threshold: 3_000_000, title: 'Raid Economy' },
			{ threshold: 15_000_000, title: 'Empire of Spoils' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// Additional LOYALTY depth
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'ambassador',
		name: 'Ambassador',
		description: 'Bring many new commanders into the fold.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'referralCount',
		unit: 'referrals',
		tiers: [
			{ threshold: 3,   title: 'Envoy' },
			{ threshold: 10,  title: 'Ambassador' },
			{ threshold: 25,  title: 'High Ambassador' },
			{ threshold: 100, title: 'Architect of Alliances' },
		],
	},
	{
		id: 'long_service',
		name: 'Long Service',
		description: 'Show unwavering commitment to the Vexara galaxy.',
		category: 'loyalty',
		rarity: 'epic',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 45,  title: 'Regular' },
			{ threshold: 120, title: 'Veteran Presence' },
			{ threshold: 240, title: 'Long Service' },
			{ threshold: 450, title: 'Pillar of the Vex' },
		],
	},
	{
		id: 'spreader',
		name: 'Word Spreader',
		description: 'Grow the galaxy by bringing in new players.',
		category: 'loyalty',
		rarity: 'rare',
		stat: 'referralCount',
		unit: 'referrals',
		tiers: [
			{ threshold: 1,  title: 'Inviter' },
			{ threshold: 3,  title: 'Promoter' },
			{ threshold: 8,  title: 'Advocate' },
			{ threshold: 20, title: 'Word Spreader' },
		],
	},
	{
		id: 'three_years',
		name: 'Three Years Strong',
		description: 'Serve as a commander for three full years.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 500,   title: 'Seasoned Elder' },
			{ threshold: 730,   title: 'Two-Year Oath' },
			{ threshold: 1_000, title: 'Oath Keeper' },
			{ threshold: 1_095, title: 'Three Years Strong' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// COMBAT — final wave
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'first_blood',
		name: 'First Blood',
		description: 'Win your very first battle.',
		category: 'combat',
		rarity: 'common',
		stat: 'victories',
		unit: 'victories',
		tiers: [
			{ threshold: 1,  title: 'Baptised in Fire' },
			{ threshold: 3,  title: 'Bloodied' },
			{ threshold: 10, title: 'Seasoned' },
			{ threshold: 30, title: 'Battle Hardened' },
		],
	},
	{
		id: 'siege_master',
		name: 'Siege Master',
		description: 'Capture nexuses relentlessly over your career.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'nexusesCaptured',
		unit: 'nexuses',
		tiers: [
			{ threshold: 2,  title: 'Siege Apprentice' },
			{ threshold: 8,  title: 'Siege Engineer' },
			{ threshold: 20, title: 'Siege Master' },
			{ threshold: 50, title: 'Siege Lord' },
		],
	},
	{
		id: 'the_unstoppable',
		name: 'The Unstoppable',
		description: 'Keep attacking, no matter the cost.',
		category: 'combat',
		rarity: 'epic',
		stat: 'attacksLaunched',
		unit: 'attacks',
		tiers: [
			{ threshold: 15,  title: 'Persistent' },
			{ threshold: 75,  title: 'Relentless' },
			{ threshold: 250, title: 'The Unstoppable' },
			{ threshold: 750, title: 'Force of Nature' },
		],
	},
	{
		id: 'collateral',
		name: 'Collateral Damage',
		description: 'Accumulate total troop losses across all battles.',
		category: 'combat',
		rarity: 'rare',
		stat: 'troopsLost',
		unit: 'troops lost',
		tiers: [
			{ threshold: 200,   title: 'The Grieving' },
			{ threshold: 1_500, title: 'Heavy Losses' },
			{ threshold: 7_000, title: 'Mass Casualty' },
			{ threshold: 30_000, title: 'Collateral Damage' },
		],
	},
	{
		id: 'deathmachine',
		name: 'Death Machine',
		description: 'Eliminate enemies at a massive scale.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'troopsKilled',
		unit: 'troops',
		tiers: [
			{ threshold: 500,    title: 'Efficient' },
			{ threshold: 3_000,  title: 'Killing Machine' },
			{ threshold: 15_000, title: 'Death Machine' },
			{ threshold: 40_000, title: 'Omega Protocol' },
		],
	},
	{
		id: 'never_blink',
		name: 'Never Blink',
		description: 'Defend your nexuses without ever losing one.',
		category: 'combat',
		rarity: 'epic',
		stat: 'defenseVictories',
		unit: 'defenses won',
		tiers: [
			{ threshold: 1,   title: 'Alert' },
			{ threshold: 8,   title: 'Watchful' },
			{ threshold: 30,  title: 'Never Blink' },
			{ threshold: 80,  title: 'Eternal Watch' },
		],
	},
	{
		id: 'shadow_war',
		name: 'Shadow War',
		description: 'Build a surveillance network through extensive scouting.',
		category: 'combat',
		rarity: 'epic',
		stat: 'scoutsMade',
		unit: 'scouts',
		tiers: [
			{ threshold: 10,  title: 'Watcher' },
			{ threshold: 50,  title: 'Analyst' },
			{ threshold: 150, title: 'Shadow War' },
			{ threshold: 500, title: 'Omniscient' },
		],
	},
	{
		id: 'allied_force',
		name: 'Allied Force',
		description: 'Forge a reputation as a reliable ally through support.',
		category: 'combat',
		rarity: 'common',
		stat: 'supportMissionsSent',
		unit: 'missions',
		tiers: [
			{ threshold: 1,  title: 'Wingman' },
			{ threshold: 5,  title: 'Reliable Ally' },
			{ threshold: 20, title: 'Allied Force' },
			{ threshold: 60, title: 'Coalition Architect' },
		],
	},
	{
		id: 'untouchable',
		name: 'Untouchable',
		description: 'Win battles without taking any casualties at all.',
		category: 'combat',
		rarity: 'rare',
		stat: 'perfectVictories',
		unit: 'flawless wins',
		tiers: [
			{ threshold: 2,  title: 'Near-Perfect' },
			{ threshold: 8,  title: 'Surgical Strike' },
			{ threshold: 25, title: 'Untouchable' },
			{ threshold: 75, title: 'Ghost Commander' },
		],
	},
	{
		id: 'war_machine',
		name: 'War Machine',
		description: 'Sustain an unrelenting campaign of attacks.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'attacksLaunched',
		unit: 'attacks',
		tiers: [
			{ threshold: 50,   title: 'Aggressive' },
			{ threshold: 200,  title: 'Warmonger' },
			{ threshold: 600,  title: 'War Machine' },
			{ threshold: 2_000, title: 'Engine of Destruction' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// EMPIRE — final wave
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'landgrab',
		name: 'Land Grab',
		description: 'Expand your territory rapidly.',
		category: 'empire',
		rarity: 'common',
		stat: 'nexusCount',
		unit: 'nexuses',
		tiers: [
			{ threshold: 2,  title: 'Landholder' },
			{ threshold: 5,  title: 'Territory Claimer' },
			{ threshold: 10, title: 'Land Grabber' },
			{ threshold: 20, title: 'Domain Holder' },
		],
	},
	{
		id: 'forge_of_war',
		name: 'Forge of War',
		description: 'Train an extreme number of troops throughout your career.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'totalTroopsEverTrained',
		unit: 'troops',
		tiers: [
			{ threshold: 2_000,   title: 'Armourer' },
			{ threshold: 20_000,  title: 'Forge Master' },
			{ threshold: 100_000, title: 'Forge of War' },
			{ threshold: 500_000, title: 'The Eternal Forge' },
		],
	},
	{
		id: 'deep_pockets',
		name: 'Deep Pockets',
		description: 'Accumulate colossal lifetime influence.',
		category: 'empire',
		rarity: 'epic',
		stat: 'lifetimePoints',
		unit: 'influence',
		tiers: [
			{ threshold: 25_000,    title: 'Resourceful' },
			{ threshold: 150_000,   title: 'Affluent' },
			{ threshold: 750_000,   title: 'Deep Pockets' },
			{ threshold: 3_000_000, title: 'Infinite Reserves' },
		],
	},
	{
		id: 'iron_fist',
		name: 'Iron Fist',
		description: 'Rule vast territories with an iron grip.',
		category: 'empire',
		rarity: 'rare',
		stat: 'nexusCount',
		unit: 'nexuses',
		tiers: [
			{ threshold: 4,  title: 'Minor Lord' },
			{ threshold: 10, title: 'Lord' },
			{ threshold: 18, title: 'Iron Fist' },
			{ threshold: 30, title: 'Absolute Ruler' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// GALAXY — final wave
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'perennial',
		name: 'Perennial',
		description: 'Keep coming back season after season.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'galaxiesPlayed',
		unit: 'seasons',
		tiers: [
			{ threshold: 4,  title: 'Regular' },
			{ threshold: 8,  title: 'Faithful' },
			{ threshold: 15, title: 'Perennial' },
			{ threshold: 30, title: 'The Endless Commander' },
		],
	},
	{
		id: 'galaxy_elite',
		name: 'Galaxy Elite',
		description: 'Reach elite-tier scores repeatedly across seasons.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'bestGalaxyPoints',
		unit: 'points',
		tiers: [
			{ threshold: 3_000,    title: 'Noteworthy' },
			{ threshold: 20_000,   title: 'Elite' },
			{ threshold: 100_000,  title: 'Galaxy Elite' },
			{ threshold: 750_000,  title: 'Transcendent' },
		],
	},
	{
		id: 'hall_of_fame',
		name: 'Hall of Fame',
		description: 'Carve your name into galaxy history with wins.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'galaxiesWon',
		unit: 'wins',
		tiers: [
			{ threshold: 1,  title: 'Inscribed' },
			{ threshold: 3,  title: 'Hall of Fame' },
			{ threshold: 6,  title: 'Legend' },
			{ threshold: 12, title: 'Myth' },
		],
	},
	{
		id: 'veteran_commander',
		name: 'Veteran Commander',
		description: 'Build decades of experience across galaxy seasons.',
		category: 'galaxy',
		rarity: 'rare',
		stat: 'galaxiesPlayed',
		unit: 'seasons',
		tiers: [
			{ threshold: 2,  title: 'Two-Time' },
			{ threshold: 4,  title: 'Experienced' },
			{ threshold: 9,  title: 'Veteran Commander' },
			{ threshold: 18, title: 'Galactic Elder' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// ECONOMY — final wave
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'pillage_economy',
		name: 'Pillage Economy',
		description: 'Sustain yourself entirely on stolen resources.',
		category: 'economy',
		rarity: 'legendary',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 200_000,    title: 'Dependent on Spoils' },
			{ threshold: 1_500_000,  title: 'Pillage Economy' },
			{ threshold: 8_000_000,  title: 'Predator State' },
			{ threshold: 40_000_000, title: 'Apex Pillager' },
		],
	},
	{
		id: 'market_mogul',
		name: 'Market Mogul',
		description: 'Execute a high number of market transactions.',
		category: 'economy',
		rarity: 'epic',
		stat: 'tradesMade',
		unit: 'trades',
		tiers: [
			{ threshold: 10,  title: 'Active Trader' },
			{ threshold: 50,  title: 'Power Trader' },
			{ threshold: 200, title: 'Market Mogul' },
			{ threshold: 500, title: 'Galactic Exchange' },
		],
	},
	{
		id: 'supply_chain',
		name: 'Supply Chain',
		description: 'Move enormous quantities of resources through the economy.',
		category: 'economy',
		rarity: 'rare',
		stat: 'totalTradeVolume',
		unit: 'resources',
		tiers: [
			{ threshold: 50_000,    title: 'Supplier' },
			{ threshold: 500_000,   title: 'Distributor' },
			{ threshold: 5_000_000, title: 'Supply Chain' },
			{ threshold: 25_000_000, title: 'Economic Engine' },
		],
	},
	{
		id: 'warlord_economics',
		name: 'Warlord Economics',
		description: 'Build wealth through conquest and commerce combined.',
		category: 'economy',
		rarity: 'epic',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 25_000,    title: 'Opportunistic' },
			{ threshold: 200_000,   title: 'Calculated' },
			{ threshold: 1_000_000, title: 'Warlord Economics' },
			{ threshold: 6_000_000, title: 'Conquest Capital' },
		],
	},
	{
		id: 'war_tax',
		name: 'War Tax',
		description: 'Pay the price of being targeted — take heavy resource losses.',
		category: 'economy',
		rarity: 'rare',
		stat: 'resourcesLost',
		unit: 'resources',
		tiers: [
			{ threshold: 5_000,     title: 'Taxed' },
			{ threshold: 50_000,    title: 'Heavily Taxed' },
			{ threshold: 500_000,   title: 'War Tax' },
			{ threshold: 3_000_000, title: 'Bled Dry' },
		],
	},
	{
		id: 'market_first',
		name: 'First to Market',
		description: 'Establish yourself early as a market participant.',
		category: 'economy',
		rarity: 'common',
		stat: 'tradesMade',
		unit: 'trades',
		tiers: [
			{ threshold: 1,  title: 'Market Entrant' },
			{ threshold: 5,  title: 'Active' },
			{ threshold: 20, title: 'Market Regular' },
			{ threshold: 75, title: 'Established Trader' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// LOYALTY — final wave
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'growth_engine',
		name: 'Growth Engine',
		description: 'Fuel the expansion of the Vexara galaxy.',
		category: 'loyalty',
		rarity: 'rare',
		stat: 'referralCount',
		unit: 'referrals',
		tiers: [
			{ threshold: 2,  title: 'Networker' },
			{ threshold: 7,  title: 'Growth Driver' },
			{ threshold: 20, title: 'Growth Engine' },
			{ threshold: 60, title: 'Viral Commander' },
		],
	},
	{
		id: 'century_of_service',
		name: 'Century of Service',
		description: 'Reach 100 days as an active commander.',
		category: 'loyalty',
		rarity: 'rare',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 30,  title: 'Month One' },
			{ threshold: 60,  title: 'Two Months In' },
			{ threshold: 100, title: 'Centurion' },
			{ threshold: 200, title: 'Bicentennial' },
		],
	},
	{
		id: 'iron_core',
		name: 'Iron Core',
		description: 'Remain in the galaxy long enough to be considered a cornerstone.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 60,  title: 'Core Member' },
			{ threshold: 150, title: 'Cornerstone' },
			{ threshold: 300, title: 'Iron Core' },
			{ threshold: 600, title: 'The Foundation' },
		],
	},
	{
		id: 'vex_original',
		name: 'Vex Original',
		description: 'Have been in service since the early days of the galaxy.',
		category: 'loyalty',
		rarity: 'epic',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 45,  title: 'Early Adopter' },
			{ threshold: 150, title: 'First Wave' },
			{ threshold: 365, title: 'Vex Original' },
			{ threshold: 700, title: 'Genesis Commander' },
		],
	},
	{
		id: 'network_effect',
		name: 'Network Effect',
		description: 'Create a cascade of new commanders through referrals.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'referralCount',
		unit: 'referrals',
		tiers: [
			{ threshold: 5,   title: 'Influencer' },
			{ threshold: 15,  title: 'Network Builder' },
			{ threshold: 40,  title: 'Network Effect' },
			{ threshold: 150, title: 'Galactic Influence' },
		],
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// FINAL 11
	// ═══════════════════════════════════════════════════════════════════════════

	{
		id: 'apex_combat',
		name: 'Apex Combat',
		description: 'Reach the absolute pinnacle of battlefield kills.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'troopsKilled',
		unit: 'troops',
		tiers: [
			{ threshold: 5_000,   title: 'Elite Killer' },
			{ threshold: 20_000,  title: 'Apex Predator' },
			{ threshold: 60_000,  title: 'Apex Combat' },
			{ threshold: 150_000, title: 'God Slayer' },
		],
	},
	{
		id: 'no_retreat',
		name: 'No Retreat',
		description: 'Keep fighting through defeat after defeat.',
		category: 'combat',
		rarity: 'epic',
		stat: 'defeats',
		unit: 'defeats',
		tiers: [
			{ threshold: 10,  title: 'Stubborn' },
			{ threshold: 40,  title: 'Refuses to Yield' },
			{ threshold: 120, title: 'No Retreat' },
			{ threshold: 300, title: 'The Unbreakable' },
		],
	},
	{
		id: 'supply_mastermind',
		name: 'Supply Mastermind',
		description: 'Orchestrate a vast web of logistical support across the galaxy.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'supportMissionsSent',
		unit: 'missions',
		tiers: [
			{ threshold: 25,  title: 'Logistics Lead' },
			{ threshold: 75,  title: 'Supply Architect' },
			{ threshold: 200, title: 'Supply Mastermind' },
			{ threshold: 600, title: 'Logistical Overlord' },
		],
	},
	{
		id: 'empire_eternal',
		name: 'Empire Eternal',
		description: 'Hold territory across every galaxy you enter.',
		category: 'empire',
		rarity: 'legendary',
		stat: 'nexusCount',
		unit: 'nexuses',
		tiers: [
			{ threshold: 6,  title: 'Ambitious' },
			{ threshold: 14, title: 'Expansive' },
			{ threshold: 22, title: 'Empire Rising' },
			{ threshold: 40, title: 'Empire Eternal' },
		],
	},
	{
		id: 'undefeated_season',
		name: 'Season Immortal',
		description: 'Reach unprecedented heights in a single galaxy season.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'bestGalaxyPoints',
		unit: 'points',
		tiers: [
			{ threshold: 5_000,     title: 'Breakout Season' },
			{ threshold: 40_000,    title: 'Dominant Season' },
			{ threshold: 200_000,   title: 'Historic Season' },
			{ threshold: 1_000_000, title: 'Season Immortal' },
		],
	},
	{
		id: 'conqueror_of_worlds',
		name: 'Conqueror of Worlds',
		description: 'Win galaxy after galaxy in an unstoppable run.',
		category: 'galaxy',
		rarity: 'legendary',
		stat: 'galaxiesWon',
		unit: 'wins',
		tiers: [
			{ threshold: 1,  title: 'World Conqueror' },
			{ threshold: 4,  title: 'Serial Victor' },
			{ threshold: 8,  title: 'Conqueror of Worlds' },
			{ threshold: 16, title: 'Unstoppable Tide' },
		],
	},
	{
		id: 'grand_economy',
		name: 'Grand Economy',
		description: 'Move staggering amounts of resources through trade.',
		category: 'economy',
		rarity: 'legendary',
		stat: 'totalTradeVolume',
		unit: 'resources',
		tiers: [
			{ threshold: 500_000,     title: 'Wholesaler' },
			{ threshold: 5_000_000,   title: 'Grand Dealer' },
			{ threshold: 30_000_000,  title: 'Grand Economy' },
			{ threshold: 150_000_000, title: 'Galactic Trade Network' },
		],
	},
	{
		id: 'eternal_raider',
		name: 'Eternal Raider',
		description: 'Never stop pillaging — a career defined by conquest.',
		category: 'economy',
		rarity: 'legendary',
		stat: 'resourcesStolen',
		unit: 'resources',
		tiers: [
			{ threshold: 500_000,    title: 'Persistent Raider' },
			{ threshold: 5_000_000,  title: 'Relentless Raider' },
			{ threshold: 25_000_000, title: 'Eternal Raider' },
			{ threshold: 75_000_000, title: 'Raider Incarnate' },
		],
	},
	{
		id: 'decade_of_loyalty',
		name: 'Decade of Loyalty',
		description: 'Serve as a Vexara commander across the years.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'accountAgeDays',
		unit: 'days',
		tiers: [
			{ threshold: 100,   title: 'Committed Servant' },
			{ threshold: 365,   title: 'Year One' },
			{ threshold: 730,   title: 'Two-Year Oath' },
			{ threshold: 1_825, title: 'Five Years Strong' },
		],
	},
	{
		id: 'legion_of_honor',
		name: 'Legion of Honor',
		description: 'Bring a large number of new commanders into the Vexara universe.',
		category: 'loyalty',
		rarity: 'legendary',
		stat: 'referralCount',
		unit: 'referrals',
		tiers: [
			{ threshold: 5,   title: 'Recruiter' },
			{ threshold: 20,  title: 'Sponsor' },
			{ threshold: 60,  title: 'Legion of Honor' },
			{ threshold: 200, title: 'Supreme Patron' },
		],
	},
	{
		id: 'deathless',
		name: 'Deathless',
		description: 'Win battles flawlessly time after time.',
		category: 'combat',
		rarity: 'legendary',
		stat: 'perfectVictories',
		unit: 'flawless wins',
		tiers: [
			{ threshold: 5,   title: 'Near Flawless' },
			{ threshold: 15,  title: 'Immaculate Record' },
			{ threshold: 50,  title: 'Deathless' },
			{ threshold: 150, title: 'Beyond Reach' },
		],
	},

];

export function computeChallengeProgress(
	defs: ChallengeDefinition[],
	stats: ChallengeStats
): ChallengeProgress[] {
	return defs.map((def) => {
		const currentValue = stats[def.stat] as number;

		let completedTierIndex = -1;
		for (let i = 0; i < def.tiers.length; i++) {
			if (currentValue >= def.tiers[i].threshold) completedTierIndex = i;
			else break;
		}

		const allComplete = completedTierIndex === def.tiers.length - 1;
		const nextTierIndex = completedTierIndex + 1;
		const nextTier = allComplete ? null : def.tiers[nextTierIndex];
		const prevThreshold = completedTierIndex >= 0 ? def.tiers[completedTierIndex].threshold : 0;

		let progress = 0;
		if (nextTier) {
			const range = nextTier.threshold - prevThreshold;
			const done = currentValue - prevThreshold;
			progress = Math.min(1, Math.max(0, done / range));
		} else {
			progress = 1;
		}

		return {
			id: def.id,
			name: def.name,
			description: def.description,
			category: def.category,
			rarity: def.rarity,
			unit: def.unit,
			currentValue,
			tiers: def.tiers,
			completedTierIndex,
			nextTierThreshold: nextTier?.threshold ?? null,
			nextTierTitle: nextTier?.title ?? null,
			progress,
			unlockedTitle: completedTierIndex >= 0 ? def.tiers[completedTierIndex].title : null,
		};
	});
}
