export type TroopClass = 'light' | 'heavy' | 'ranged' | 'special';

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
// (Pulled from server/utils/combatMath.ts; if you change one, change the other.)
export const CLASS_COUNTERS: Array<{ attacker: TroopClass; beats: TroopClass; multiplier: number }> = [
  { attacker: 'light',  beats: 'heavy',   multiplier: 1.35 },
  { attacker: 'heavy',  beats: 'special', multiplier: 1.35 },
  { attacker: 'ranged', beats: 'light',   multiplier: 1.35 },
];

export const CLASS_COUNTERED_BY: Record<TroopClass, TroopClass | null> = {
  heavy:   'light',
  special: 'heavy',
  light:   'ranged',
  ranged:  null, // special class deals neutral damage to ranged
};

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
    key: 'assaultTrooper',
    name: 'Assault Trooper',
    role: 'Heavy frontline infantry — counters Special',
    description: 'Solid all-rounder that holds the line and absorbs sustained pressure from attackers.',
    unitClass: 'heavy',
    stats: { attack: 30, defense: 45, speed: 18, carry: 60 },
    cost: { biomass: 150, alloy: 150, ore: 350, population: 1, time: '1m 19s' },
    requirements: ['Recruitment Core Lv1'],
  },
  {
    key: 'lancerDrone',
    name: 'Lancer Drone',
    role: 'Ranged interceptor — counters Light',
    description: 'Cheap suppression drone that pins down early light raiders.',
    unitClass: 'ranged',
    stats: { attack: 15, defense: 28, speed: 20, carry: 30 },
    cost: { biomass: 150, alloy: 150, ore: 200, population: 1, time: '53s' },
    requirements: ['Recruitment Core Lv2'],
  },
  {
    key: 'breakerUnit',
    name: 'Breaker Unit',
    role: 'Light assault breacher — counters Heavy',
    description: 'High attack unit that exploits armor gaps and cracks heavy defensive lines.',
    unitClass: 'light',
    stats: { attack: 55, defense: 15, speed: 16, carry: 50 },
    cost: { biomass: 250, alloy: 150, ore: 300, population: 1, time: '1m 14s' },
    requirements: ['Recruitment Core Lv3', 'Ore Extractor Lv3'],
  },
  {
    key: 'reconOperative',
    name: 'Recon Operative',
    role: 'Scout / intel gatherer (Special, no counter)',
    description:
      'Lightly armed intel gatherer that reveals enemy nexus resources, troops, and defenses. Not a frontline fighter.',
    unitClass: 'special',
    stats: { attack: 5, defense: 20, speed: 25, carry: 10 },
    cost: { biomass: 400, alloy: 150, ore: 400, population: 1, time: '3m 0s' },
    requirements: ['Recruitment Core Lv4', 'Command Core Lv3'],
    notes: ['This is the unit used for scouting and espionage missions.'],
  },
  {
    key: 'skimmerBike',
    name: 'Skimmer Bike',
    role: 'Fast light raider — counters Heavy',
    description: 'High mobility raider with strong carry for quick hit-and-run farming.',
    unitClass: 'light',
    stats: { attack: 80, defense: 65, speed: 22, carry: 60 },
    cost: { biomass: 625, alloy: 500, ore: 750, population: 3, time: '10m 0s' },
    requirements: ['Recruitment Core Lv5', 'Alloy Forge Lv4'],
  },
  {
    key: 'bulwarkGuard',
    name: 'Bulwark Guard',
    role: 'Elite heavy defender — counters Special',
    description: 'One of the strongest dedicated defensive units in midgame. Anchors a defending stack.',
    unitClass: 'heavy',
    stats: { attack: 20, defense: 130, speed: 12, carry: 25 },
    cost: { biomass: 400, alloy: 600, ore: 500, population: 2, time: '8m 0s' },
    requirements: ['Recruitment Core Lv5', 'Life Support Lv5'],
  },
  {
    key: 'suppressorTeam',
    name: 'Suppressor Team',
    role: 'Ranged fire support — counters Light',
    description: 'Flexible ranged support that pins down light cavalry pushing your line.',
    unitClass: 'ranged',
    stats: { attack: 65, defense: 45, speed: 15, carry: 20 },
    cost: { biomass: 450, alloy: 400, ore: 450, population: 2, time: '8m 0s' },
    requirements: ['Recruitment Core Lv7', 'Command Core Lv6'],
  },
  {
    key: 'disruptorUnit',
    name: 'Disruptor Unit',
    role: 'Ranged EMP specialist — counters Light',
    description: 'Aggressive ranged specialist that suppresses light skirmishers on the offensive.',
    unitClass: 'ranged',
    stats: { attack: 75, defense: 55, speed: 17, carry: 25 },
    cost: { biomass: 550, alloy: 750, ore: 650, population: 2, time: '11m 0s' },
    requirements: ['Recruitment Core Lv7', 'Ore Extractor Lv6'],
    notes: ['No special anti-mech multiplier is currently applied in combat code.'],
  },
  {
    key: 'interceptorBike',
    name: 'Interceptor Bike',
    role: 'Light rapid-response cavalry — counters Heavy',
    description: 'Very fast light raider, ideal for rapid redeploy and cracking heavy defenders.',
    unitClass: 'light',
    stats: { attack: 95, defense: 75, speed: 28, carry: 50 },
    cost: { biomass: 750, alloy: 600, ore: 900, population: 3, time: '15m 0s' },
    requirements: ['Recruitment Core Lv8', 'Alloy Forge Lv7'],
  },
  {
    key: 'voidStalker',
    name: 'Void Stalker',
    role: 'Light stealth cavalry — counters Heavy',
    description:
      'Fastest unit in the game. A light raider that excels at cracking heavy defensive lines — but is itself suppressed by ranged emplacements.',
    unitClass: 'light',
    stats: { attack: 110, defense: 50, speed: 32, carry: 40 },
    cost: { biomass: 900, alloy: 700, ore: 1100, population: 3, time: '20m 0s' },
    requirements: ['Recruitment Core Lv9', 'Alloy Forge Lv8', 'Armory Lv3'],
    notes: [
      'Speed 32 — the fastest unit in the roster.',
      'Light class is countered BY Ranged (Suppressor / Lancer / Disruptor / Annihilator / Plasma Turret), not the reverse.',
    ],
  },
  {
    key: 'siegeMech',
    name: 'Siege Mech',
    role: 'Heavy siege anchor — counters Special',
    description:
      'Towering heavy platform with exceptional durability and crushing attack. Slow but nearly immovable when holding ground.',
    unitClass: 'heavy',
    stats: { attack: 150, defense: 210, speed: 10, carry: 80 },
    cost: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: '1h 0m' },
    requirements: ['Recruitment Core Lv10', 'Ore Extractor Lv9', 'Command Core Lv8'],
  },
  {
    key: 'plasmaTurret',
    name: 'Plasma Turret',
    role: 'Static ranged emplacement — counters Light',
    description:
      'Immobile defensive emplacement. Cannot be sent on attacks, transfers, or raids — it always defends the nexus that built it. Decimates light cavalry that tries to rush you.',
    unitClass: 'ranged',
    stats: { attack: 180, defense: 90, speed: 0, carry: 0 },
    cost: { biomass: 1500, alloy: 1200, ore: 2500, population: 2, time: '1h 30m' },
    requirements: ['Recruitment Core Lv11', 'Command Core Lv9', 'Armory Lv5'],
    notes: [
      'Speed 0 — stripped from any outgoing strike or transfer.',
      'Hard counters Void Stalker, Skimmer Bike, Interceptor Bike, and Breaker Unit.',
    ],
  },
  {
    key: 'annihilatorPlatform',
    name: 'Annihilator Platform',
    role: 'Heavy ranged artillery — counters Light',
    description: 'Top-end ranged platform for heavy assaults and sieges. Suppresses light raiders at range.',
    unitClass: 'ranged',
    stats: { attack: 210, defense: 140, speed: 8, carry: 100 },
    cost: { biomass: 2000, alloy: 1750, ore: 3000, population: 5, time: '2h 0m' },
    requirements: ['Recruitment Core Lv12', 'Command Core Lv10', 'Shield Grid Lv10'],
  },
  {
    key: 'overseer',
    name: 'Overseer',
    role: 'Conquest / control unit (Special, no counter)',
    description:
      'The Overseer is a high-value command unit that enables nexus conquest. It does not fight — it administers. Sending an Overseer on a successful strike reduces the target\'s Control Level by 50. Control starts at 100; once it reaches 0, the nexus is conquered and changes ownership to you. Two successful strikes with an Overseer will conquer any nexus. The Overseer is only useful if the attack wins — if the attack fails, the Overseer is not used and survives the defeat alongside its escort. If every non-Overseer troop in the strike is killed, the Overseer dies too. On conquest, the Overseer is consumed — it does not return home. The conquered nexus keeps its type (Resource Depot, Military Outpost, etc.) and retains its current building levels, but its name resets to "Conquered Nexus." If you conquer a special NPC nexus (any type except Neutral Settlement), all type bonuses on that nexus are permanently doubled.',
    unitClass: 'special',
    stats: { attack: 0, defense: 30, speed: 15, carry: 0 },
    cost: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: '4h 0m' },
    requirements: ['Recruitment Core Lv14', 'Command Core Lv14', 'Shield Grid Lv13'],
    notes: [
      'Maximum 3 per nexus at any time; maximum 1 per strike.',
      'Trains in an independent queue — does not block other troop training.',
      'Control reduction: –50 per successful strike with a surviving Overseer. Two strikes conquer any nexus.',
      'Overseer survives a failed attack (as long as its escort is not completely wiped).',
      'On conquest: the Overseer is consumed and does NOT return home.',
      'The conquered nexus retains its type, building levels, and any stationed support troops.',
      'Conquering a special NPC nexus (non-Neutral Settlement) permanently doubles its type bonuses.',
    ],
  },
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
      { level: 10, requires: ['Storage Vault Lv5'] },
    ],
    impact: ['Primary unlock gate for multiple systems and troop tiers.'],
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
      { level: 10, requires: ['Life Support Lv5'] },
    ],
    impact: ['Required to train troops at all.', 'Higher levels unlock stronger troop classes.'],
  },
  {
    key: 'lifeSupport',
    name: 'Life Support',
    role: 'Population capacity building',
    description: 'Increases maximum population to support larger armies.',
    baseCost: { biomass: 80, alloy: 100, ore: 70, timeSeconds: 150 },
    maxLevel: 20,
    unlock: 'Command Core Lv2',
    milestones: [
      { level: 4, requires: ['Biomass Farm Lv2'] },
      { level: 8, requires: ['Storage Vault Lv4'] },
    ],
    impact: ['Population max formula: floor(100 * 1.28^level).'],
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
      { level: 10, requires: ['Command Core Lv8'] },
    ],
    impact: ['Storage formula: floor(1500 * 1.5^level).'],
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
      { level: 10, requires: ['Life Support Lv5'] },
    ],
    impact: ['Production scales by floor(800 * 1.35^(level-1)).'],
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
      { level: 10, requires: ['Ore Extractor Lv8'] },
    ],
    impact: ['Production scales by floor(800 * 1.35^(level-1)).'],
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
    impact: ['Production scales by floor(800 * 1.35^(level-1)).'],
  },
  {
    key: 'shieldGrid',
    name: 'Shield Grid',
    role: 'Defensive multiplier',
    description:
      'How defense works: when an enemy attack arrives, every defending troop contributes its Defense stat to the total defending force power. That power is then multiplied by (1 + shieldGrid × 0.02) — so each Shield Grid level is worth +2% of your entire garrison\'s HP-equivalent. The defending power is then compared against the attacker\'s class-weighted attack power. The side with higher power wins. Losers take heavy losses (~50–90% depending on the power gap); winners take light losses (~0–18% depending on how close the fight was). Your Shield Grid bonus stacks with allied support troops stationed at your nexus and with the class-counter system. Military Outpost nexus type adds an additional 25% shield efficiency on top (50% if doubled).',
    baseCost: { biomass: 50, alloy: 100, ore: 60, timeSeconds: 180 },
    maxLevel: 15,
    unlock: 'Command Core Lv3',
    milestones: [
      { level: 4, requires: ['Storage Vault Lv3'] },
      { level: 8, requires: ['Alloy Forge Lv5'] },
    ],
    impact: [
      'Defense bonus: +2% total defending force power per level (multiplicative with troop defense stats).',
      'At Lv15 (max): +30% to your entire garrison\'s effective defense.',
      'Military Outpost nexuses gain an extra 25% shield efficiency (50% if the bonus is doubled).',
      'Stacks additively with allied support troops stationed at your nexus.',
    ],
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
      { level: 10, requires: ['Command Core Lv10', 'Recruitment Core Lv10'] },
    ],
    impact: [
      'Each level adds +1.5% amplification to class-counter bonuses (cap +30% at Lv20).',
      'Lv3 unlocks Void Stalker training.',
      'Lv5 unlocks Plasma Turret training.',
    ],
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
      { level: 12, requires: ['Armory Lv10', 'Command Core Lv15'] },
    ],
    impact: [
      'Embed detection: 5% base + 2% per level (cap 15%).',
      'Refresh-intel discovery chance scales the same way.',
    ],
  },
];

export const BUILDING_SCALING_DOC = {
  costScaling: { early: 1.5, mid: 1.65, late: 1.8 },
  timeScaling: { early: 1.25, mid: 1.35, late: 1.45 },
  stages: ['Target levels 1-5: early scaling', 'Target levels 6-10: mid scaling', 'Target levels 11+: late scaling'],
};
