export type TroopClass = 'mobile' | 'armor' | 'fire' | 'special';

export type TroopDoc = {
	key: string;
	name: string;
	role: string;
	description: string;
	unitClass: TroopClass;
	stats: { attack: number; defense: number; speed: number; carry: number };
	cost: { biomass: number; alloy: number; ore: number; population: number; time: string };
	requirements: string[];
	notes?: string[];
};

// Counter matrix: attacker class deals extra damage to the listed defender class.
// Triangle: mobile > armor > fire > mobile. Special is neutral everywhere.
// (Pulled from server/utils/combatMath.ts; if you change one, change the other.)
export const CLASS_COUNTERS: Array<{
	attacker: TroopClass;
	beats: TroopClass;
	multiplier: number;
}> = [
	{ attacker: 'mobile', beats: 'armor', multiplier: 1.35 },
	{ attacker: 'armor', beats: 'fire', multiplier: 1.35 },
	{ attacker: 'fire', beats: 'mobile', multiplier: 1.35 }
];

export const CLASS_COUNTERED_BY: Record<TroopClass, TroopClass | null> = {
	armor: 'mobile',
	fire: 'armor',
	mobile: 'fire',
	special: null // special units (Overseer, Recon Operative) have no counter - they don't fight
};

// How the counter system works in mixed engagements:
// The attacker force's damage is computed per unit. Each unit's attack stat is
// multiplied by a weighted-average counter multiplier against the DEFENDER'S
// class composition. If half the defenders are armor and half are fire, a
// mobile attacker gets roughly 50% of the 1.35 bonus (since it only counters the
// armor half) - not the full bonus. The counter activates proportionally to
// how much of the enemy force it actually counters.
//
// Example: 10 Fire vs 5 Armor + 5 Mobile
// Fire counters Mobile (1.35x) and is countered by Armor (0.75x).
// Defender composition: 50% Mobile, 50% Armor.
// Effective fire multiplier: (0.5 × 1.35) + (0.5 × 0.75) = 0.675 + 0.375 = 1.05
// Result: fire gets a slight edge - partial counter, not full.
//
// Full counter only applies when 100% of defenders are of the countered class.
export const CLASS_COUNTER_CODEX = `
**Class Counter System**

Vexara uses a rock-paper-scissors class triangle: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Special units (Overseer, Recon Operative) are neutral - they have no counter advantage or vulnerability because they do not fight.

**The triangle:**
- Mobile (Breaker Unit, Skimmer Bike, Interceptor Bike, Void Stalker) - fast assault forces that exploit armor gaps and overwhelm armored units
- Armor (Assault Trooper, Bulwark Guard, Siege Mech) - armored units that close distance and suppress fire emplacements
- Fire (Lancer Drone, Suppressor Team, Disruptor Unit, Annihilator Platform, Plasma Turret) - fire support that pins down fast-moving mobile forces
- Special (Overseer, Recon Operative) - no counter in either direction

**Multipliers:** A class that counters the opposing class deals ×1.35 damage. A class being countered receives ×0.75 effective damage (its attacks are weakened). Neutral matchups are ×1.0.

**Partial counters in mixed engagements:** The counter bonus is proportional to how much of the enemy force your class actually counters. If you send 10 Fire units against a mix of 5 Mobile + 5 Armor defenders, Fire counters the Mobile half (×1.35) but is countered by the Armor half (×0.75). Your effective multiplier is the weighted average: (0.5 × 1.35) + (0.5 × 0.75) = 1.05 - a small edge, not the full bonus. You only get the full ×1.35 if 100% of defenders are of the class you counter.

**Armory amplification:** Each level of Armory (+1.5%, cap +30% at Lv20) amplifies counter bonuses above 1.0 and slightly deepens disadvantage penalties. A Lv20 Armory turns a ×1.35 counter into ×1.65 - a significant force multiplier for well-composed attacks.

**Matchup affects survival too, not just damage:** When you win an engagement, your per-unit loss rate is also nudged by the same class triangle. Units with the class advantage against the bulk of the enemy take fewer casualties; units with the disadvantage take more. The effect is mild (about ±15% on loss rate) so matchup is a tilt, not a coin flip - sending Armor into a Fire-heavy enemy survives roughly 1.15x as well as sending it into another Armor force. Combine with the defense stat (higher defense = lower loss rate, with a meaningful spread between glass cannons and tank units) to predict how a winning engagement will burn through your stack.

**Defender advantage:** The defender's Shield Grid multiplies total defensive power on top of all class counters. The attacker never gets the Shield Grid bonus, so pure defensive nexuses with high Shield Grid levels are always harder to break than their raw troop count suggests.

**How losses scale - win or lose:** Combat is no longer all-or-nothing. Both sides' casualties scale with how close the fight was (the loser/winner power ratio). The losing side takes heavy losses - a blowout near-wipes them, but a narrow defeat leaves a real remnant (~85% lost, not 100%). The winning side stays light on a dominant win but bleeds badly on a coin-flip (up to ~45% lost when the fight was nearly even). The lesson: attacking a force of comparable strength is costly even when you win, and being slightly outgunned no longer means automatic annihilation. Use the in-game combat preview on the attack screen to gauge the outcome before committing.

**Conquest is a gradient, not a cliff:** When an Overseer rides with a winning attack, it drains the defender's Control Level by an amount that scales with how dominant the strike was. The same power ratio that decides casualties also decides Control drain - crushing wins (3:1 or better) drain 50, clear wins drain 34, and narrow wins still drain 15. A nexus is conquered the moment its Control hits 0. This means a dominant attacker can take a nexus in two strikes; a careful planned attacker takes it in three; and a coalition of smaller players can grind down a fortified target together. Control regenerates at +10 per hour for owned nexuses, so a lone trickle of weak strikes will never succeed - coordinated waves do.
`;

export type BuildingDoc = {
	key: string;
	name: string;
	role: string;
	description: string;
	baseCost: { biomass: number; alloy: number; ore: number; timeSeconds: number };
	maxLevel: number;
	unlock?: string;
	milestones: Array<{ level: number; requires: string[] }>;
	impact: string[];
};

export const TROOPS_DOC: TroopDoc[] = [
	{
		key: 'lancerDrone',
		name: 'Lancer Drone',
		role: 'Fire interceptor - counters Mobile',
		description: 'Cheap suppression drone that pins down early mobile raiders.',
		unitClass: 'fire',
		stats: { attack: 12, defense: 22, speed: 20, carry: 30 },
		cost: { biomass: 150, alloy: 150, ore: 200, population: 1, time: '53s' },
		requirements: ['Recruitment Core Lv2']
	},
	{
		key: 'assaultTrooper',
		name: 'Assault Trooper',
		role: 'Armor frontline infantry - counters Fire',
		description:
			'Durable frontline unit built to hold ground and close distance on fire emplacements. Low attack - its job is to survive and keep the line.',
		unitClass: 'armor',
		stats: { attack: 18, defense: 45, speed: 18, carry: 60 },
		cost: { biomass: 150, alloy: 150, ore: 350, population: 1, time: '1m 19s' },
		requirements: ['Recruitment Core Lv1']
	},
	{
		key: 'breakerUnit',
		name: 'Breaker Unit',
		role: 'Mobile assault breacher - counters Armor',
		description:
			'Early-game mobile attacker. Decent damage and cheap to produce, but glass-fragile and lightly carries — its job is to soften armored defenders in the opening phase, not anchor a late-game army.',
		unitClass: 'mobile',
		stats: { attack: 35, defense: 3, speed: 16, carry: 40 },
		cost: { biomass: 250, alloy: 150, ore: 300, population: 1, time: '2m 40s' },
		requirements: ['Recruitment Core Lv3', 'Ore Extractor Lv3']
	},
	{
		key: 'reconOperative',
		name: 'Recon Operative',
		role: 'Scout / intel gatherer (Special - no counter in either direction)',
		description:
			'Lightly armed intel gatherer that reveals enemy nexus resources, troops, and defenses. Not a frontline fighter.',
		unitClass: 'special',
		stats: { attack: 5, defense: 20, speed: 25, carry: 10 },
		cost: { biomass: 400, alloy: 150, ore: 400, population: 1, time: '3m 0s' },
		requirements: ['Recruitment Core Lv4', 'Command Core Lv3'],
		notes: ['This is the unit used for scouting and espionage missions.']
	},
	{
		key: 'suppressorTeam',
		name: 'Suppressor Team',
		role: 'Fire support - counters Mobile',
		description:
			'Aggressive fire support that pins down mobile forces. High attack for its tier but fragile - keep it behind your armor.',
		unitClass: 'fire',
		stats: { attack: 65, defense: 30, speed: 15, carry: 20 },
		cost: { biomass: 450, alloy: 400, ore: 450, population: 2, time: '9m 0s' },
		requirements: ['Recruitment Core Lv7', 'Command Core Lv6']
	},
	{
		key: 'skimmerBike',
		name: 'Skimmer Bike',
		role: 'Fast mobile raider - counters Armor',
		description:
			'High mobility raider with strong carry. Good attack, mediocre defense - trades hits for resource hauls and speed.',
		unitClass: 'mobile',
		stats: { attack: 80, defense: 40, speed: 22, carry: 80 },
		cost: { biomass: 625, alloy: 500, ore: 750, population: 3, time: '12m 0s' },
		requirements: ['Recruitment Core Lv5', 'Alloy Forge Lv4']
	},
	{
		key: 'bulwarkGuard',
		name: 'Bulwark Guard',
		role: 'Elite armor defender - counters Fire',
		description:
			'Defensive anchor of any mid-game garrison. Exceptional survivability, minimal attack - it holds the line while your fire units deal damage.',
		unitClass: 'armor',
		stats: { attack: 10, defense: 130, speed: 12, carry: 25 },
		cost: { biomass: 400, alloy: 600, ore: 500, population: 2, time: '12m 0s' },
		requirements: ['Recruitment Core Lv5', 'Life Support Lv5']
	},
	{
		key: 'disruptorUnit',
		name: 'Disruptor Unit',
		role: 'Fire EMP specialist - counters Mobile',
		description:
			'Aggressive fire specialist that suppresses mobile skirmishers on the offensive. Strong damage, low defense - commit it to attacks, not defense.',
		unitClass: 'fire',
		stats: { attack: 75, defense: 35, speed: 17, carry: 25 },
		cost: { biomass: 550, alloy: 750, ore: 650, population: 2, time: '14m 0s' },
		requirements: ['Recruitment Core Lv7', 'Ore Extractor Lv6'],
		notes: ['No special anti-mech multiplier is currently applied in combat code.']
	},
	{
		key: 'interceptorBike',
		name: 'Interceptor Bike',
		role: 'Mobile rapid-response cavalry - counters Armor',
		description:
			'Very fast mobile raider, ideal for rapid redeploy and cracking armored defenders. High attack and carry, moderate defense.',
		unitClass: 'mobile',
		stats: { attack: 95, defense: 50, speed: 28, carry: 100 },
		cost: { biomass: 750, alloy: 600, ore: 900, population: 3, time: '18m 0s' },
		requirements: ['Recruitment Core Lv8', 'Alloy Forge Lv7']
	},
	{
		key: 'voidStalker',
		name: 'Void Stalker',
		role: 'Endgame mobile striker - counters Armor',
		description:
			'Tier-3 fast attacker. The fastest unit in the game and the mobile half of the endgame line - pairs with the Annihilator Platform as the two top-end offensive units. Cracks armored defensive lines at speed; still lightly armored, so use its speed and shock value rather than slugging it out.',
		unitClass: 'mobile',
		stats: { attack: 150, defense: 15, speed: 32, carry: 60 },
		cost: { biomass: 1100, alloy: 900, ore: 1400, population: 3, time: '27m 0s' },
		requirements: ['Recruitment Core Lv9', 'Alloy Forge Lv8', 'Armory Lv3'],
		notes: [
			'Speed 32 - the fastest unit in the roster.',
			'Mobile class is countered BY Fire (Suppressor / Lancer / Disruptor / Annihilator / Plasma Turret).',
			'Fire class is countered BY Armor (Assault Trooper / Bulwark Guard / Siege Mech).'
		]
	},
	{
		key: 'siegeMech',
		name: 'Siege Mech',
		role: 'Endgame armor anchor - counters Fire',
		description:
			'Tier-3 mobile defender. Towering armored platform built for survival, with enough attack to punish anything that crashes into it. Exceptional durability lets it absorb punishment while your fire support does the killing - the field anvil of an endgame army.',
		unitClass: 'armor',
		stats: { attack: 40, defense: 260, speed: 10, carry: 20 },
		cost: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: '30m 0s' },
		requirements: ['Recruitment Core Lv10', 'Ore Extractor Lv9', 'Command Core Lv8']
	},
	{
		key: 'plasmaTurret',
		name: 'Plasma Turret',
		role: 'Static fire emplacement - counters Mobile',
		description:
			'Immobile defensive emplacement. Cannot be sent on attacks, transfers, or raids - it always defends the nexus that built it. Decimates mobile forces that try to rush you.',
		unitClass: 'fire',
		stats: { attack: 0, defense: 160, speed: 0, carry: 0 },
		cost: { biomass: 1500, alloy: 1200, ore: 2500, population: 2, time: '45m 0s' },
		requirements: ['Recruitment Core Lv11', 'Command Core Lv9', 'Armory Lv5'],
		notes: [
			'Speed 0 - stripped from any outgoing strike or transfer.',
			'Hard counters Void Stalker, Skimmer Bike, Interceptor Bike, and Breaker Unit.'
		]
	},
	{
		key: 'annihilatorPlatform',
		name: 'Annihilator Platform',
		role: 'Endgame fire artillery - counters Mobile',
		description:
			'Tier-3 heavy attacker. Top-end fire platform for heavy assaults and sieges with the highest single-unit attack and carry in the game - protect it with Siege Mechs and Bulwark Guards. The fire half of the endgame line; paired with the Void Stalker, two Annihilators delivers more force than a horde of mass-produced T1 spam.',
		unitClass: 'fire',
		stats: { attack: 320, defense: 35, speed: 8, carry: 250 },
		cost: { biomass: 2000, alloy: 1750, ore: 3000, population: 4, time: '40m 0s' },
		requirements: ['Recruitment Core Lv12', 'Command Core Lv10', 'Shield Grid Lv10']
	},
	{
		key: 'overseer',
		name: 'Overseer',
		role: 'Conquest / control unit (Special - no counter in either direction)',
		description:
			'The Overseer is a high-value command unit that enables nexus conquest. It does not fight - it administers. Sending an Overseer on a victorious strike reduces the target\'s Control Level by an amount that scales with how dominant your attack was: a crushing win (3:1 power advantage or better) drains 50, a clear win drains 34, and a narrow win still drains 15. Control starts at 100; once it reaches 0, the nexus is conquered and changes ownership to you. Two crushing strikes, three clear strikes, or a sustained coalition campaign can all reach conquest. The defending force does not need to be wiped - any victory with a surviving Overseer drains Control. Owned nexuses regenerate +10 Control per hour, so a lone weak attacker cannot grind a target down alone - coordinated waves are required for an attrition path. Overseer strikes travel 3x slower than standard attacks - giving defenders time to react. The Overseer is only useful if the attack wins - if the attack fails, the Overseer is not used and survives the defeat alongside its escort. If every non-Overseer troop in the strike is killed, the Overseer dies too. On the final conquering strike (the one that brings Control to 0), the Overseer is consumed - it does not return. The other surviving attackers are stationed at the newly captured nexus. The conquered nexus keeps its type (Resource Depot, Military Outpost, etc.) and retains its current building levels, but its name resets to "Conquered Nexus." NPC nexus bonuses are acquired at base tier; the doubled tier unlocks when the new owner reaches Command Core 15.',
		unitClass: 'special',
		stats: { attack: 0, defense: 30, speed: 15, carry: 0 },
		cost: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: '4h 0m' },
		requirements: ['Recruitment Core Lv14', 'Command Core Lv14', 'Shield Grid Lv13'],
		notes: [
			'Maximum 3 per nexus at any time; maximum 1 per strike.',
			'Trains in an independent queue - does not block other troop training.',
			'Control drain scales with strike dominance (power ratio = defender_power / attacker_power):',
			'  • Crushing win (ratio ≤ 0.33, i.e. 3:1 power advantage or better): -50 Control. Two strikes can conquer.',
			'  • Clear win (0.33 < ratio ≤ 0.66): -34 Control. Three strikes conquer - the standard planned attack.',
			'  • Narrow win (ratio > 0.66): -15 Control. Designed for coalition attrition, not solo conquest.',
			'A wipe of the defending force is NOT required for the Overseer to drain Control. Any victorious strike with a surviving Overseer drains.',
			'Owned nexuses regenerate +10 Control per hour. A single attacker landing weak strikes far apart will be outpaced by regen.',
			'Overseer survives a failed attack (as long as its escort is not completely wiped).',
			'Overseer survives non-conquering control strikes (control reduced but nexus not taken).',
			'On conquest: the Overseer is consumed. Other surviving attackers are stationed at the captured nexus.',
			'The conquered nexus retains its type and building levels; enemy support stationed there is destroyed.',
			'Conquered NPC nexus bonuses start at base tier and double when Command Core reaches 15.',
			'Follow-up waves that land on a nexus you have just conquered bounce back home with no combat - the Overseer is preserved for the next target.'
		]
	}
];

export const BUILDINGS_DOC: BuildingDoc[] = [
	{
		key: 'commandCore',
		name: 'Command Core',
		role: 'Strategic progression building',
		description: 'Central control structure for unlocking progression milestones.',
		baseCost: { biomass: 90, alloy: 80, ore: 70, timeSeconds: 120 },
		maxLevel: 20,
		milestones: [
			{ level: 4, requires: ['Life Support Lv2'] },
			{ level: 6, requires: ['Shield Grid Lv2'] },
			{ level: 10, requires: ['Storage Vault Lv5'] }
		],
		impact: [
			'Primary unlock gate for multiple systems and troop tiers.',
			'5% faster construction per level (compounding) - applies to every building.',
			'Veteran tier: +1 build queue slot at Lv16 and Lv17 (max 7). +1 training queue slot at Lv18 and Lv19 (max 7). Lv20 unlocks no extra slot but keeps the standard build-time discount.'
		]
	},
	{
		key: 'recruitmentCore',
		name: 'Recruitment Core',
		role: 'Military production building',
		description: 'Enables troop training and unlocks higher combat tiers.',
		baseCost: { biomass: 180, alloy: 150, ore: 80, timeSeconds: 180 },
		maxLevel: 15,
		unlock: 'Command Core Lv2',
		milestones: [
			{ level: 4, requires: ['Biomass Farm Lv2'] },
			{ level: 6, requires: ['Alloy Forge Lv2'] },
			{ level: 10, requires: ['Life Support Lv5'] }
		],
		impact: ['Required to train troops at all.', 'Higher levels unlock stronger troop classes.']
	},
	{
		key: 'lifeSupport',
		name: 'Life Support',
		role: 'Population capacity building',
		description: 'Increases maximum population to support larger armies.',
		baseCost: { biomass: 80, alloy: 100, ore: 70, timeSeconds: 150 },
		maxLevel: 25,
		unlock: 'Command Core Lv2',
		milestones: [
			{ level: 4, requires: ['Biomass Farm Lv2'] },
			{ level: 8, requires: ['Storage Vault Lv4'] }
		],
		impact: ['Population max formula: floor(100 * 1.19^level).']
	},
	{
		key: 'storageVault',
		name: 'Storage Vault',
		role: 'Resource cap building',
		description: 'Raises resource storage to reduce overflow waste.',
		baseCost: { biomass: 60, alloy: 50, ore: 70, timeSeconds: 120 },
		maxLevel: 20,
		unlock: 'Command Core Lv2',
		milestones: [
			{ level: 4, requires: ['Ore Extractor Lv2'] },
			{ level: 6, requires: ['Alloy Forge Lv2'] },
			{ level: 10, requires: ['Command Core Lv8'] }
		],
		impact: ['Storage formula: floor(1500 * 1.5^level).']
	},
	{
		key: 'biomassFarm',
		name: 'Biomass Farm',
		role: 'Biomass production',
		description: 'Generates biomass resource over time.',
		baseCost: { biomass: 50, alloy: 60, ore: 60, timeSeconds: 120 },
		maxLevel: 20,
		unlock: 'Life Support Lv1',
		milestones: [
			{ level: 6, requires: ['Recruitment Core Lv2'] },
			{ level: 10, requires: ['Life Support Lv5'] }
		],
		impact: ['Production scales by floor(800 * 1.35^(level-1)).']
	},
	{
		key: 'alloyForge',
		name: 'Alloy Forge',
		role: 'Alloy production',
		description: 'Generates alloy resource over time.',
		baseCost: { biomass: 65, alloy: 40, ore: 60, timeSeconds: 120 },
		maxLevel: 20,
		unlock: 'Ore Extractor Lv2',
		milestones: [
			{ level: 6, requires: ['Command Core Lv4'] },
			{ level: 10, requires: ['Ore Extractor Lv8'] }
		],
		impact: ['Production scales by floor(800 * 1.35^(level-1)).']
	},
	{
		key: 'oreExtractor',
		name: 'Ore Extractor',
		role: 'Ore production',
		description: 'Generates ore resource over time.',
		baseCost: { biomass: 75, alloy: 65, ore: 70, timeSeconds: 150 },
		maxLevel: 20,
		unlock: 'Command Core Lv1',
		milestones: [{ level: 8, requires: ['Alloy Forge Lv4'] }],
		impact: ['Production scales by floor(800 * 1.35^(level-1)).']
	},
	{
		key: 'shieldGrid',
		name: 'Shield Grid',
		role: 'Defensive multiplier',
		description:
			"How defense works: when an enemy attack arrives, every defending troop contributes its Defense stat to the total defending force power. That power is then multiplied by (1 + shieldGrid × 0.02) - so each Shield Grid level is worth +2% of your entire garrison's HP-equivalent. The defending power is then compared against the attacker's class-weighted attack power. The side with higher power wins. Losers take heavy losses (~50–90% depending on the power gap); winners take light losses (~0–18% depending on how close the fight was). Your Shield Grid bonus stacks with allied support troops stationed at your nexus and with the class-counter system. Military Outpost nexus type multiplies shield efficiency by 2x (3x if doubled at CC15).",
		baseCost: { biomass: 50, alloy: 100, ore: 60, timeSeconds: 180 },
		maxLevel: 15,
		unlock: 'Command Core Lv3',
		milestones: [
			{ level: 4, requires: ['Storage Vault Lv3'] },
			{ level: 8, requires: ['Alloy Forge Lv5'] }
		],
		impact: [
			'Defense bonus: +2% total defending force power per level (multiplicative with troop defense stats).',
			"At Lv15 (max): +30% to your entire garrison's effective defense.",
			'Military Outpost nexuses gain 2x shield efficiency (3x if the bonus is doubled at CC15).',
			'Stacks additively with allied support troops stationed at your nexus.'
		]
	},
	{
		key: 'armory',
		name: 'Armory',
		role: 'Counter amplifier + advanced unit unlocks',
		description:
			'Amplifies the class-counter damage triangle, and gates training of the Void Stalker and Plasma Turret.',
		baseCost: { biomass: 120, alloy: 180, ore: 140, timeSeconds: 210 },
		maxLevel: 20,
		unlock: 'Command Core Lv5',
		milestones: [
			{ level: 3, requires: ['Recruitment Core Lv5'] },
			{ level: 5, requires: ['Recruitment Core Lv7', 'Shield Grid Lv3'] },
			{ level: 10, requires: ['Command Core Lv10', 'Recruitment Core Lv10'] }
		],
		impact: [
			'Each level adds +1.5% amplification to class-counter bonuses (cap +30% at Lv20).',
			'Lv3 unlocks Void Stalker training.',
			'Lv5 unlocks Plasma Turret training.'
		]
	},
	{
		key: 'stealthArray',
		name: 'Stealth Array',
		role: 'Counter-espionage',
		description:
			'Defensive counter-intelligence array. Raises the chance that enemy embedded operatives are detected, and that their intel refreshes get discovered.',
		baseCost: { biomass: 100, alloy: 150, ore: 180, timeSeconds: 210 },
		maxLevel: 15,
		unlock: 'Command Core Lv7',
		milestones: [
			{ level: 3, requires: ['Armory Lv3'] },
			{ level: 7, requires: ['Shield Grid Lv5', 'Command Core Lv10'] },
			{ level: 12, requires: ['Armory Lv10', 'Command Core Lv15'] }
		],
		impact: [
			'Embed detection: 5% base + 2% per level (cap 15%).',
			'Refresh-intel discovery chance scales the same way.'
		]
	}
];

export const BUILDING_SCALING_DOC = {
	costScaling: { early: 1.5, mid: 1.65, late: 1.8 },
	timeScaling: { early: 1.25, mid: 1.35, late: 1.45 },
	stages: [
		'Target levels 1-5: early scaling',
		'Target levels 6-10: mid scaling',
		'Target levels 11+: late scaling'
	]
};

/* ───────────────────────────────────────────────────────── ESPIONAGE === */
// Mirrors server/controllers/spyController.ts. If you tune one, tune the other.

export type EspionageMissionDoc = {
	key: 'embed' | 'sabotage';
	name: string;
	oneLiner: string;
	intent: string;
	cost: { biomass: number; secondary: { name: string; amount: number }; perOperative: boolean };
	operatives: string;
	resolution: string[];
	successEffect: string[];
	failureEffect: string[];
	losses: string;
};

export const ESPIONAGE_DOC: {
	overview: string;
	missions: EspionageMissionDoc[];
	travel: string[];
	intelScope: string[];
	embedAsset: string[];
	defense: string[];
	lifecycle: string[];
	tips: string[];
} = {
	overview:
		'Espionage is the off-the-battlefield arm of Vexara. Two mission types - Embed and Sabotage - both dispatched as Recon Operatives from your Nexus to an enemy one. Embed installs a long-term asset that streams intel back. Sabotage is a one-shot strike that hurts the defender directly if you bring enough operatives to overwhelm theirs.',

	missions: [
		{
			key: 'embed',
			name: 'Embed',
			oneLiner: 'Insert one operative as a long-term asset for repeatable intel.',
			intent:
				'Use embed to monitor a high-value target - a feeder farm, a rival hub, a coalition member you want to keep tabs on. Once installed, intel refreshes are instant and free; the asset only consumes a slot until detected.',
			cost: { biomass: 400, secondary: { name: 'alloy', amount: 200 }, perOperative: false },
			operatives:
				'Flat 1-operative cost regardless of how many you send. Sending extras does NOT increase success chance - embed is a stealth roll, not a numbers contest. Send only 1.',
			resolution: [
				'On arrival, a single detection roll fires.',
				'Detection chance = 5% base + 2% per defender Stealth Array level, capped at 15%.',
				'If undetected: a SpyAsset is created (or an existing one is refreshed) and full intel is returned.',
				'If detected: 1 operative dies, mission returns empty.'
			],
			successEffect: [
				'Persistent SpyAsset linked to the target Nexus.',
				'Immediate intel snapshot: troops, resources, key buildings, queues, nexus type.',
				'Asset can be polled later via Refresh Intel - instant, no travel.',
				'Each refresh re-rolls discovery: 4% base + 1.5% per Stealth Array level, capped at 12%.',
				'You can manually recall an asset at any time (no penalty, no operatives recovered).'
			],
			failureEffect: ['Defender is not directly notified, but the operative is lost.'],
			losses:
				'Detected → 1 operative lost. Undetected → all operatives return (after the return trip).'
		},
		{
			key: 'sabotage',
			name: 'Sabotage',
			oneLiner:
				"Overwhelm the defender's Recon Operatives to delay training or stall construction.",
			intent:
				"Use sabotage to stall a rival's production - delay their training queue before a raid, or grief their build timing mid-campaign. Effect scales with how badly you outnumber their stationed Recon Operatives.",
			cost: { biomass: 300, secondary: { name: 'ore', amount: 300 }, perOperative: true },
			operatives:
				'Numbers matter. You MUST send strictly more operatives than the defender has stationed. Cost scales linearly per operative sent.',
			resolution: [
				'Deterministic: success ⇔ operatives_sent > defender.reconOperative.',
				'No randomness - scout first if you can, or assume the worst.',
				'Excess ratio = (sent − defenderRecon) / sent. Bigger overkill, bigger effect.'
			],
			successEffect: [
				"Target = troops → delays every item in the defender's training queue by 30 minutes per excess operative. No garrison troops are killed. Empty queue = fizzle.",
				"Target = building → delays every item in the defender's build queue by 30 minutes per excess operative.",
				"Defender's stationed Recon Operatives are wiped to 0 in either case.",
				'75% of your operatives return; 25% are lost during exfil.'
			],
			failureEffect: [
				'ALL sent operatives are lost.',
				'Defender is alerted (mission result flags them detected).',
				'Resources spent are gone.'
			],
			losses: 'Success → 25% of sent operatives lost. Failure → 100% lost.'
		}
	],

	travel: [
		'Both mission types use Recon Operative travel speed (25), same formula as the scout mission in the attack system.',
		'Travel time (minutes) = distance × (4 + (28 − 25) / 10) = distance × 4.3.',
		'Operatives and resources are deducted immediately on dispatch - they cannot be re-spent while the mission is in flight.',
		'Mission results transmit on target arrival. Surviving operatives still need the return trip before they re-enter your garrison.',
		'After resolution, surviving operatives spend the same travel time returning home before they re-enter your garrison.'
	],

	intelScope: [
		'Troops - every unit count (all 12 types including Overseer and Recon Operative).',
		'Resources - biomass, alloy, ore (floored to whole numbers).',
		'Buildings - Command Core, Shield Grid, Recruitment Core levels.',
		'Nexus type - capital, outpost, etc.',
		'Build queue - every queued building, target level, and completion timestamp.',
		'Training queue - every queued troop batch.',
		'Note: scout missions (from the attack system) give a similar one-shot snapshot. Embed gives the same snapshot but lets you refresh on demand.'
	],

	embedAsset: [
		'Status lifecycle: active → discovered (defender catches a refresh), recalled (you pulled out), or lost (target nexus destroyed).',
		"Multiple embed missions against the same target do NOT stack - a second successful insert just refreshes the existing asset's timestamp.",
		'Active assets persist across sessions until discovered or recalled.',
		'Refresh discovery is per-poll, not cumulative - spamming refreshes increases your odds of getting caught.'
	],

	defense: [
		'Stealth Array (Command Core Lv7) - raises both embed-detection chance (up to 15%) and refresh-discovery chance (up to 12%). The ONLY building-based counter-intel.',
		'Stationed Recon Operatives - the only defense against sabotage. The defender needs >= sent operatives to fully block a sabotage attempt.',
		'Sabotage success wipes your stationed Recon Operatives to 0 - re-garrison fast if you survived an attempt and expect another.',
		'There is no early-warning system: you only learn an embed exists if your Stealth Array discovers it during a refresh.'
	],

	lifecycle: [
		'1. Dispatch → status: traveling. Operatives and resources deducted immediately.',
		'2. Arrival → background job (runs every 10 seconds) resolves the mission, reveals the result, and sets status: returning.',
		'3. Return trip → same travel time as the outbound leg.',
		'4. Completion → status: completed. Surviving operatives re-enter the source Nexus garrison.',
		'Mission history (last 10 completed) is retrievable per Nexus so you can review past outcomes.'
	],

	tips: [
		"ALWAYS scout before sabotaging - sending one operative short of the defender's count means losing every operative you sent.",
		'Embed is cheap insurance against a single rival. Sabotage is a tool for active campaigns, not exploration.',
		'For sabotage, overkill is efficient: the more excess operatives, the more minutes of delay per queue entry (30 min per excess op).',
		"Building a Stealth Array on outpost Nexuses costs the same as on your capital but defends them just as well - don't leave outposts blind.",
		'Refresh an embed only when you actually need fresh intel. Each refresh is a discovery roll.'
	]
};
