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
- Mobile (Vanguard Breaker, Wraith Skimmer, Phantom Lance, Void Stalker, Aegis Skirmisher) - fast assault forces that exploit armor gaps and overwhelm armored units
- Armor (Assault Trooper, Bulwark Guard, Siege Mech, Siege Colossus) - armored units that close distance and suppress fire emplacements
- Fire (Sentinel Lancer, Pyre Suppressor, Arc Disruptor, Annihilator Platform, Plasma Turret) - fire support that pins down fast-moving mobile forces
- Special (Overseer, Recon Operative) - no counter in either direction

**The triangle now cuts BOTH ways (attack AND defense).** This is the core of the v0.22 combat rework. Previously the counter only boosted the attacker's damage; defense was raw, so stacking the single highest-defense unit was always the best garrison regardless of what attacked. Now a defending unit whose class counters the incoming attacker has its DEFENSE amplified, and one being countered defends for less. Bringing the wrong class into a fight is punished on both sides of the engagement.

**Multipliers:** On attack, a class that counters the opposing class deals ×1.35 damage; a class being countered deals ×0.75. On defense, the spread is slightly milder - ×1.25 when your garrison counters the attacker, ×0.80 when it's countered - so the attacker keeps a small initiative and can't be stonewalled by a defender who simply sits still. Neutral matchups are ×1.0 on both sides.

**Strikers vs anvils:** Every class has STRIKERS (high attack, low defense - your offensive units) and ANVILS (high defense, low attack - your garrison units). Garrison with anvils and attack with strikers. A glass-cannon striker left on defense barely contributes its tiny defense stat AND can be class-countered on top of that, so a striker garrison folds fast. Each class has at least one anvil, so every attacker has an equal-resource answer on defense: Armor anvils (Assault Trooper / Bulwark Guard / Siege Mech) stop Fire; the Mobile anvil (Aegis Skirmisher) stops Armor; Fire anvils (Arc Disruptor / Plasma Turret) stop Mobile.

**Partial counters in mixed engagements:** The counter bonus is proportional to how much of the enemy force your class actually counters - on attack AND defense. If you send 10 Fire units against a mix of 5 Mobile + 5 Armor defenders, Fire counters the Mobile half (×1.35) but is countered by the Armor half (×0.75). Your effective multiplier is the weighted average: (0.5 × 1.35) + (0.5 × 0.75) = 1.05 - a small edge, not the full bonus. You only get the full counter if 100% of the enemy is the class you counter. Scouting the defender's composition before you commit is no longer optional.

**Targeting Core amplification:** Each level of Targeting Core (+1.5%, cap +30% at Lv20) amplifies your ATTACK counter bonuses above 1.0 and slightly deepens disadvantage penalties. A Lv20 Targeting Core turns a ×1.35 counter into ×1.65 - a significant force multiplier for well-composed attacks. The Targeting Core is an offensive building: it sharpens your strikes and does not boost a defender's class-counter on the wall.

**Matchup affects survival too, not just damage:** When you win an engagement, your per-unit loss rate is also nudged by the same class triangle. Units with the class advantage against the bulk of the enemy take fewer casualties; units with the disadvantage take more. The effect is mild (about ±15% on loss rate) so matchup is a tilt, not a coin flip - sending Armor into a Fire-heavy enemy survives roughly 1.15x as well as sending it into another Armor force. Combine with the defense stat (higher defense = lower loss rate, with a meaningful spread between glass cannons and tank units) to predict how a winning engagement will burn through your stack.

**Defender advantage:** The defender's Shield Grid multiplies total defensive power (now +1.5% per level) on top of all class counters. The attacker never gets the Shield Grid bonus, so a well-composed defensive nexus with anvils, high Shield Grid, and a turret is genuinely hard to break - but it is not unbreakable. A correctly-countered, scouted attack with enough committed force will crack even a deep turtle; it just costs you real losses to do it. Blind or wrong-class assaults still bounce off, no matter how big.

**Stationing is defense-only (support AND transfer):** Parking troops at another nexus - whether an ally's (a support mission) or one of your own (a troop transfer) - is the same operation, and only ANVILS (defensive units) may go: Assault Trooper, Bulwark Guard, Siege Mech, Aegis Skirmisher, and Arc Disruptor. Send them to reinforce a wall wherever you need one. Strikers, Overseers, Recon Operatives, and the stationary Plasma Turret are never stationable - an attacking unit only ever leaves its nexus to attack, and always strikes from the nexus that trained it.

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
		key: 'sentinelLancer',
		name: 'Sentinel Lancer',
		role: 'Fire striker - counters Mobile',
		description:
			'Cheap early-game fire striker. Punches above its cost against mobile raiders, but lightly built — keep it attacking, not garrisoning.',
		unitClass: 'fire',
		stats: { attack: 28, defense: 14, speed: 20, carry: 30 },
		cost: { biomass: 200, alloy: 200, ore: 250, population: 1, time: '53s' },
		requirements: ['Plasma Forge Lv2']
	},
	{
		key: 'assaultTrooper',
		name: 'Assault Trooper',
		role: 'Armor anvil - counters Fire',
		description:
			'The cheapest garrison anvil. Durable frontline infantry that holds ground and defends hardest against Fire attackers. Low attack — its job is to survive and keep the line while strikers do the killing.',
		unitClass: 'armor',
		stats: { attack: 16, defense: 30, speed: 18, carry: 60 },
		cost: { biomass: 150, alloy: 150, ore: 350, population: 1, time: '1m 19s' },
		requirements: ['Armor Foundry Lv1']
	},
	{
		key: 'vanguardBreaker',
		name: 'Vanguard Breaker',
		role: 'Mobile striker - counters Armor',
		description:
			'Early-game mobile striker. Good damage and cheap to produce, but glass-fragile — its job is to soften armored defenders in the opening phase, not anchor a late-game army.',
		unitClass: 'mobile',
		stats: { attack: 32, defense: 14, speed: 16, carry: 40 },
		cost: { biomass: 250, alloy: 150, ore: 300, population: 1, time: '2m 40s' },
		requirements: ['Hangar Bay Lv3', 'Ore Extractor Lv3']
	},
	{
		key: 'reconOperative',
		name: 'Recon Operative',
		role: 'Scout / intel gatherer (Special - no counter in either direction)',
		description:
			'Lightly armed intel gatherer that reveals enemy nexus resources, troops, and defenses. Not a frontline fighter.',
		unitClass: 'special',
		stats: { attack: 1, defense: 20, speed: 25, carry: 10 },
		cost: { biomass: 400, alloy: 150, ore: 400, population: 1, time: '3m 0s' },
		requirements: ['Command Core Lv3'],
		notes: ['This is the unit used for scouting missions.']
	},
	{
		key: 'pyreSuppressor',
		name: 'Pyre Suppressor',
		role: 'Fire striker - counters Mobile',
		description:
			'Aggressive mid-game fire striker that pins down mobile forces. High attack for its tier but fragile - keep it behind your anvils.',
		unitClass: 'fire',
		stats: { attack: 80, defense: 20, speed: 15, carry: 20 },
		cost: { biomass: 520, alloy: 460, ore: 520, population: 2, time: '9m 0s' },
		requirements: ['Plasma Forge Lv7', 'Command Core Lv6']
	},
	{
		key: 'wraithSkimmer',
		name: 'Wraith Skimmer',
		role: 'Mobile raider - counters Armor',
		description:
			'Stealth hovercraft raider with strong carry. High attack, light defense - trades hits for resource hauls and speed. A striker, not a garrison unit.',
		unitClass: 'mobile',
		stats: { attack: 105, defense: 22, speed: 22, carry: 80 },
		cost: { biomass: 650, alloy: 520, ore: 780, population: 3, time: '12m 0s' },
		requirements: ['Hangar Bay Lv5', 'Alloy Forge Lv4']
	},
	{
		key: 'bulwarkGuard',
		name: 'Bulwark Guard',
		role: 'Armor anvil - counters Fire',
		description:
			'Defensive anchor of any mid-game garrison. Exceptional survivability, minimal attack - it holds the line while your strikers deal damage, and defends hardest against Fire attackers.',
		unitClass: 'armor',
		stats: { attack: 18, defense: 90, speed: 12, carry: 25 },
		cost: { biomass: 400, alloy: 600, ore: 500, population: 2, time: '12m 0s' },
		requirements: ['Armor Foundry Lv5', 'Life Support Lv5']
	},
	{
		key: 'aegisSkirmisher',
		name: 'Aegis Skirmisher',
		role: 'Mobile anvil - counters Armor',
		description:
			'The mobile-class anvil. The defensive answer to Armor attackers (mobile counters armor on defense too), and fast enough to redeploy where the wall is needed. Defense-first — modest attack keeps it an anchor, not a raider.',
		unitClass: 'mobile',
		stats: { attack: 34, defense: 64, speed: 24, carry: 30 },
		cost: { biomass: 500, alloy: 550, ore: 450, population: 2, time: '12m 0s' },
		requirements: ['Hangar Bay Lv5', 'Shield Grid Lv2']
	},
	{
		key: 'arcDisruptor',
		name: 'Arc Disruptor',
		role: 'Fire anvil (EMP) - counters Mobile',
		description:
			'The fire-class anvil. An EMP interceptor reworked to be the mid-game garrison answer to Mobile raiders — solid defense that the triangle amplifies against incoming mobile forces. Hybrid attack lets it punish what it pins, but its value is on the wall.',
		unitClass: 'fire',
		stats: { attack: 55, defense: 95, speed: 17, carry: 25 },
		cost: { biomass: 550, alloy: 750, ore: 650, population: 2, time: '14m 0s' },
		requirements: ['Plasma Forge Lv7', 'Ore Extractor Lv6'],
		notes: ['Stationable: lend it to allies as a mobile-stopping reinforcement.']
	},
	{
		key: 'phantomLance',
		name: 'Phantom Lance',
		role: 'Mobile raider striker - counters Armor',
		description:
			'Very fast mobile raider striker, ideal for rapid redeploy and cracking armored defenders. High attack and the best carry of its tier; light defense, so strike and withdraw.',
		unitClass: 'mobile',
		stats: { attack: 125, defense: 26, speed: 28, carry: 100 },
		cost: { biomass: 780, alloy: 630, ore: 940, population: 3, time: '18m 0s' },
		requirements: ['Hangar Bay Lv8', 'Alloy Forge Lv7']
	},
	{
		key: 'voidStalker',
		name: 'Void Stalker',
		role: 'Endgame mobile striker - counters Armor',
		description:
			'Tier-3 fast striker. The fastest unit in the game and the mobile half of the endgame line - pairs with the Annihilator Platform as the two top-end offensive units. Cracks armored defensive lines at speed; still lightly armored, so use its speed and shock value rather than slugging it out.',
		unitClass: 'mobile',
		stats: { attack: 215, defense: 36, speed: 32, carry: 60 },
		cost: { biomass: 1120, alloy: 910, ore: 1420, population: 3, time: '27m 0s' },
		requirements: ['Hangar Bay Lv9', 'Alloy Forge Lv8', 'Targeting Core Lv3'],
		notes: [
			'Speed 32 - the fastest unit in the roster.',
			'Mobile class is countered BY Fire (Suppressor / Lancer / Disruptor / Annihilator / Plasma Turret).',
			'Fire class is countered BY Armor (Assault Trooper / Bulwark Guard / Siege Mech).'
		]
	},
	{
		key: 'siegeMech',
		name: 'Siege Mech',
		role: 'Endgame armor anvil - counters Fire',
		description:
			'Tier-3 armor anvil. Towering armored platform built for survival, with enough attack to punish anything that crashes into it. Exceptional durability lets it absorb punishment while your strikers do the killing - the great wall of an endgame garrison, defending hardest against Fire.',
		unitClass: 'armor',
		stats: { attack: 70, defense: 215, speed: 10, carry: 20 },
		cost: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: '30m 0s' },
		requirements: ['Armor Foundry Lv10', 'Ore Extractor Lv9', 'Command Core Lv8']
	},
	{
		key: 'plasmaTurret',
		name: 'Plasma Turret',
		role: 'Static fire emplacement - counters Mobile',
		description:
			'Immobile defensive emplacement and the heaviest anti-mobile anchor in the game. Cannot be sent on attacks, scouts, support, or transfers - it always defends the nexus that built it. Decimates mobile forces that try to rush you, and the triangle amplifies its already-huge defense against them.',
		unitClass: 'fire',
		stats: { attack: 0, defense: 340, speed: 0, carry: 0 },
		cost: { biomass: 1500, alloy: 1200, ore: 2500, population: 3, time: '45m 0s' },
		requirements: ['Plasma Forge Lv11', 'Command Core Lv9', 'Targeting Core Lv5'],
		notes: [
			'Speed 0 - stationary. It is never offered as an option on any outgoing mission (attack, scout, support, or transfer); you cannot lend it to an ally.',
			'Hard counters all Mobile strikers - Void Stalker, Wraith Skimmer, Phantom Lance, and Vanguard Breaker.'
		]
	},
	{
		key: 'annihilatorPlatform',
		name: 'Annihilator Platform',
		role: 'Endgame fire artillery - counters Mobile',
		description:
			'Tier-3 heavy fire striker. Top-end artillery platform for heavy assaults and sieges with the highest single-unit attack and carry in the game - protect it with Siege Mechs and Bulwark Guards. The fire half of the endgame line; paired with the Void Stalker, two Annihilators delivers more force than a horde of mass-produced T1 spam.',
		unitClass: 'fire',
		stats: { attack: 360, defense: 55, speed: 8, carry: 250 },
		cost: { biomass: 1900, alloy: 1660, ore: 2840, population: 4, time: '40m 0s' },
		requirements: ['Plasma Forge Lv12', 'Command Core Lv10', 'Shield Grid Lv10']
	},
	{
		key: 'siegeColossus',
		name: 'Siege Colossus',
		role: 'Endgame armor striker - counters Fire',
		description:
			'Tier-3 elite armor striker - the siege hammer. Extreme attack with enough defense to survive its own assault, and the slowest speed in the game. Built to crack fortified Nexuses where lighter forces would shatter, and armor counters Fire on the way in. The armor half of the endgame line; paired with Annihilator Platforms for a balanced siege force.',
		unitClass: 'armor',
		stats: { attack: 300, defense: 130, speed: 6, carry: 150 },
		cost: { biomass: 1550, alloy: 1890, ore: 2760, population: 4, time: '50m 0s' },
		requirements: ['Armor Foundry Lv13', 'Command Core Lv10', 'Targeting Core Lv5']
	},
	{
		key: 'overseer',
		name: 'Overseer',
		role: 'Conquest / control unit (Special - no counter in either direction)',
		description:
			'The Overseer is a high-value command unit that enables nexus conquest. It does not fight - it administers. Sending an Overseer on a victorious strike reduces the target\'s Control Level by an amount that scales with how dominant your attack was: a crushing win (3:1 power advantage or better) drains 50, a clear win drains 34, and a narrow win still drains 15. Control starts at 100; once it reaches 0, the nexus is conquered and changes ownership to you. Two crushing strikes, three clear strikes, or a sustained coalition campaign can all reach conquest. The defending force does not need to be wiped - any victory with a surviving Overseer drains Control. Owned nexuses regenerate +10 Control per hour, so a lone weak attacker cannot grind a target down alone - coordinated waves are required for an attrition path. Overseer strikes travel 3x slower than standard attacks - giving defenders time to react. The Overseer is only useful if the attack wins - if the attack fails, the Overseer is not used and survives the defeat alongside its escort. If every non-Overseer troop in the strike is killed, the Overseer dies too. On the final conquering strike (the one that brings Control to 0), the Overseer is consumed - it does not return. The other surviving attackers are stationed at the newly captured nexus. The conquered nexus keeps its type (Resource Depot, Military Outpost, etc.), its name, and its current building levels - you take it as-is and can rename it yourself. NPC nexus bonuses are acquired at base tier; the doubled tier unlocks when the new owner reaches Command Core 15.',
		unitClass: 'special',
		stats: { attack: 0, defense: 8, speed: 15, carry: 0 },
		cost: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: '4h 0m' },
		requirements: ['Command Core Lv14', 'Shield Grid Lv13'],
		notes: [
			'Maximum 3 per nexus at any time; maximum 1 per strike.',
			'Trains in an independent queue - does not block other troop training.',
			'Overseer resource cost scales with empire size: base cost through 3 owned nexuses, then a smooth ramp to 4x cost at 12+ owned nexuses.',
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
			'5% faster construction per level (compounding) - applies to every building. Worked example: Lv5 = 23% faster, Lv10 = 40% faster, Lv20 = 64% faster.',
			'⚡ Also trains the Specials (Recon Operative at Lv3, Overseer at Lv14) and gates Pyre Suppressor (Lv6), Siege Mech (Lv8), Plasma Turret (Lv9), Annihilator + Siege Colossus (Lv10), and the doubled NPC-nexus bonus tier (Lv15).',
			'Veteran tier: +1 build queue slot at Lv16 and Lv17 (max 7).',
			'Lv15 splits training into parallel class lanes: your single combat queue becomes three concurrent lanes (Mobile, Armor, Fire) plus the Special lane (Recon + Overseer). Below Lv15 you have one combat queue (5 slots) + the Special queue. From Lv15 each lane starts at 2 slots; Lv18 and Lv19 each add +1 (to 4). Parallel lanes let you build a balanced army in one pass - population cap is still the ceiling. Lv20 adds no extra slot but keeps the standard build-time discount.'
		]
	},
	{
		key: 'hangarBay',
		name: 'Hangar Bay',
		role: 'Mobile-class production building',
		description: 'Produces mobile-class units (Breaker, Skimmer, Interceptor, Void Stalker).',
		baseCost: { biomass: 180, alloy: 150, ore: 80, timeSeconds: 180 },
		maxLevel: 20,
		unlock: 'Command Core Lv2',
		milestones: [
			{ level: 4, requires: ['Alloy Forge Lv2'] },
			{ level: 6, requires: ['Life Support Lv3'] },
			{ level: 10, requires: ['Command Core Lv6'] }
		],
		impact: [
			'Required to train any mobile-class unit.',
			'Cuts mobile-class training time -9% per level through Lv15, then -5% per level for Lv16-20 (compounding). Worked example: Lv1 = 9% faster, Lv10 = 61% faster (2.6×), Lv15 = 76% faster (4.1×), Lv20 = 81% faster (5.3×).',
			'⚡ Unlock gates: Lv3 unlocks Vanguard Breaker, Lv5 unlocks Wraith Skimmer + Aegis Skirmisher, Lv8 unlocks Phantom Lance, Lv9 unlocks Void Stalker (with Targeting Core Lv3).'
		]
	},
	{
		key: 'plasmaForge',
		name: 'Plasma Forge',
		role: 'Fire-class production building',
		description:
			'Produces fire-class units (Sentinel Lancer, Pyre Suppressor, Arc Disruptor, Plasma Turret, Annihilator Platform).',
		baseCost: { biomass: 180, alloy: 150, ore: 80, timeSeconds: 180 },
		maxLevel: 20,
		unlock: 'Command Core Lv2',
		milestones: [
			{ level: 4, requires: ['Ore Extractor Lv3'] },
			{ level: 6, requires: ['Alloy Forge Lv4'] },
			{ level: 10, requires: ['Shield Grid Lv4'] }
		],
		impact: [
			'Required to train any fire-class unit.',
			'Cuts fire-class training time -9% per level through Lv15, then -5% per level for Lv16-20 (compounding). Worked example: Lv1 = 9% faster, Lv10 = 61% faster (2.6×), Lv15 = 76% faster (4.1×), Lv20 = 81% faster (5.3×).',
			'⚡ Unlock gates: Lv2 unlocks Sentinel Lancer, Lv7 unlocks Pyre Suppressor + Arc Disruptor, Lv11 unlocks Plasma Turret (with Targeting Core Lv5), Lv12 unlocks Annihilator Platform.'
		]
	},
	{
		key: 'armorFoundry',
		name: 'Armor Foundry',
		role: 'Armor-class production building',
		description: 'Produces armor-class units (Assault Trooper, Bulwark Guard, Siege Mech).',
		baseCost: { biomass: 180, alloy: 150, ore: 80, timeSeconds: 180 },
		maxLevel: 20,
		unlock: 'Command Core Lv2',
		milestones: [
			{ level: 4, requires: ['Biomass Farm Lv2'] },
			{ level: 6, requires: ['Ore Extractor Lv4'] },
			{ level: 10, requires: ['Life Support Lv5'] }
		],
		impact: [
			'Required to train any armor-class unit.',
			'Cuts armor-class training time -9% per level through Lv15, then -5% per level for Lv16-20 (compounding). Worked example: Lv1 = 9% faster, Lv10 = 61% faster (2.6×), Lv15 = 76% faster (4.1×), Lv20 = 81% faster (5.3×).',
			'⚡ Unlock gates: Lv1 unlocks Assault Trooper, Lv5 unlocks Bulwark Guard, Lv10 unlocks Siege Mech, Lv13 unlocks Siege Colossus (with Targeting Core Lv5).'
		]
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
		impact: [
			'Each level multiplies population cap by 1.202× (compounding): floor(100 × 1.202^level).',
			'Worked example: Lv1 = 120, Lv10 = 629 (+106 over Lv9), Lv20 = 3,963 (+666 over Lv19), Lv25 (max) = 9,945 (+1,672 over Lv24). The last few levels add the most housing — population is the real ceiling on army size, so these are high-value late upgrades.',
			'⚡ Lv8 unlocks deeper population scaling (requires Storage Vault Lv4).'
		]
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
		impact: [
			'Each level multiplies cap by 1.48× (compounding): floor(1500 × 1.48^level) per resource.',
			'Worked example: Lv1 = 2,220, Lv10 = 75,632 (+24,529 over Lv9), Lv20 = 3,813,515 (+1,236,816 over Lv19).',
			'Storage deliberately grows a touch faster than production, so a full vault is always partly raid-fed — but the gap is bounded (a vault fills from empty in ~3–16h across all levels). Upgrade to widen your raid buffer and avoid overflow waste.'
		]
	},
	{
		key: 'biomassFarm',
		name: 'Biomass Farm',
		role: 'Biomass production',
		description: 'Generates biomass resource over time.',
		baseCost: { biomass: 50, alloy: 60, ore: 60, timeSeconds: 120 },
		maxLevel: 20,
		unlock: 'Life Support Lv1',
		milestones: [{ level: 10, requires: ['Life Support Lv5'] }],
		impact: [
			'Each level multiplies output by 1.35× (compounding): floor(800 × 1.35^(level-1)) per hour.',
			'Worked example: Lv1 = 800/h, Lv10 = 11,914/h (+3,089/h over Lv9), Lv20 = 239,570/h (+62,111/h over Lv19). The jump per level grows as you climb, so late levels are the biggest single production gains in the game.',
			'⚡ Lv10 unlocks deeper production scaling (requires Life Support Lv5).'
		]
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
		impact: [
			'Each level multiplies output by 1.35× (compounding): floor(800 × 1.35^(level-1)) per hour.',
			'Worked example: Lv1 = 800/h, Lv10 = 11,914/h (+3,089/h over Lv9), Lv20 = 239,570/h (+62,111/h over Lv19). The jump per level grows as you climb, so late levels are the biggest single production gains in the game.'
		]
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
		impact: [
			'Each level multiplies output by 1.35× (compounding): floor(800 × 1.35^(level-1)) per hour.',
			'Worked example: Lv1 = 800/h, Lv10 = 11,914/h (+3,089/h over Lv9), Lv20 = 239,570/h (+62,111/h over Lv19). The jump per level grows as you climb, so late levels are the biggest single production gains in the game.'
		]
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
		key: 'targetingCore',
		name: 'Targeting Core',
		role: 'Counter amplifier + advanced unit unlocks',
		description:
			'Amplifies the class-counter damage triangle, and gates training of the Void Stalker and Plasma Turret.',
		baseCost: { biomass: 120, alloy: 180, ore: 140, timeSeconds: 210 },
		maxLevel: 20,
		unlock: 'Command Core Lv5',
		milestones: [
			{ level: 3, requires: ['Hangar Bay Lv5'] },
			{ level: 5, requires: ['Plasma Forge Lv7', 'Shield Grid Lv3'] },
			{ level: 10, requires: ['Command Core Lv10', 'Armor Foundry Lv10'] }
		],
		impact: [
			'Each level adds +1.5% amplification to your ATTACK class-counter bonuses (cap +30% at Lv20). Worked example: a ×1.35 counter becomes ×1.50 at Lv10 and ×1.65 at Lv20 — a major force multiplier for well-composed, scouted attacks. (Offensive only: it does not boost a defender\'s counter on the wall.)',
			'⚡ Lv3 unlocks Void Stalker; Lv5 unlocks Plasma Turret AND Siege Colossus.'
		]
	},
	{
		key: 'stealthArray',
		name: 'Stealth Array',
		role: 'Defensive concealment',
		description:
			'Two effects: (1) a hidden vault that protects the first N units of each resource from raids and scout reports; (2) a low chance to intercept incoming scout missions outright, costing the attacker their operatives and returning no intel.',
		baseCost: { biomass: 100, alloy: 150, ore: 180, timeSeconds: 210 },
		maxLevel: 15,
		unlock: 'Command Core Lv7',
		milestones: [
			{ level: 3, requires: ['Targeting Core Lv3'] },
			{ level: 7, requires: ['Shield Grid Lv5', 'Command Core Lv10'] },
			{ level: 12, requires: ['Targeting Core Lv10', 'Command Core Lv15'] }
		],
		impact: [
			'Hidden vault: floor(550 * 1.35^L) units per resource (biomass, alloy, ore each get their own hidden pool). Roughly 1,500 at Lv3, 11,000 at Lv10, 49,000 at Lv15.',
			'Hidden resources are not lootable in raids and are not visible to scout reports - the defender keeps the full balance, but raiders see only the surplus above the vault.',
			'Auto-fill: the first units accumulated each tick are placed in the vault until full; anything above the cap sits in normal storage and is fully exposed.',
			'Scout-fail chance: 1.5% per level, capped at 22.5% at Lv15. Failed scouts lose all operatives sent and return no intel.'
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

/* ─────────────────────────────────────────────── RESOURCE TRANSFERS ===== */
export const RESOURCE_TRANSFER_DOC = {
	empireTransfer: {
		description: 'Move resources between your own nexuses instantly. Open the Logistics tab on any nexus to see every base you own with fill bars. Hit Send on any row for a pre-suggested top-up, or use the Send Resources button to open a blank dialog. Transfers within your own empire are lossless and arrive immediately.',
	},
	factionTransfer: {
		description: 'Send resources to a faction member\'s nexus from the same Send Resources dialog. Switch to the Faction tab, pick any of your faction-mates\' available bases as the destination, and enter amounts. A 10% transit tax applies: the recipient receives 90% of what you send. The dialog shows the tax breakdown before you confirm, and Max buttons account for the tax so the recipient never overflows.',
		taxRate: 0.1,
		restrictions: [
			'Sender must own the source nexus.',
			'Recipient must be in the same faction as the sender.',
			'Newbie-protected players cannot receive faction transfers.',
		],
	},
};

/* ─────────────────────────────────────────────────────── SCOUTING ===== */
// The espionage system (Embed / Sabotage missions) was retired in the
// Military Restructure (Stage 2a). Recon Operative is now Vexara's
// Tribal-Wars-style scout: dispatched as a one-shot attack that returns an
// intel report instead of fighting. Stealth Array remains the defensive
// counter (see its building entry above for the hidden vault + scout-fail
// chance mechanics). No separate doc block here - the scout flow is just an
// attack type and lives under the combat docs / how-to-play page.
