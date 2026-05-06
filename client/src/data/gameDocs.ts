export type TroopDoc = {
  key: string;
  icon: string;
  name: string;
  role: string;
  description: string;
  stats: { attack: number; defense: number; speed: number; carry: number };
  cost: { biomass: number; alloy: number; ore: number; population: number; time: string };
  requirements: string[];
  notes?: string[];
};

export type BuildingDoc = {
  key: string;
  icon: string;
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
    icon: '⚔️',
    name: 'Assault Trooper',
    role: 'Defensive frontline infantry',
    description: 'Solid all-rounder that holds the line and absorbs sustained pressure from attackers.',
    stats: { attack: 30, defense: 40, speed: 18, carry: 15 },
    cost: { biomass: 30, alloy: 30, ore: 70, population: 1, time: '1m 19s' },
    requirements: ['Recruitment Core Lv1'],
  },
  {
    key: 'lancerDrone',
    icon: '🛡️',
    name: 'Lancer Drone',
    role: 'Early defensive interceptor',
    description: 'Cheap anti-vehicle style defender used to absorb early pressure.',
    stats: { attack: 15, defense: 25, speed: 20, carry: 20 },
    cost: { biomass: 50, alloy: 30, ore: 10, population: 1, time: '53s' },
    requirements: ['Recruitment Core Lv2'],
  },
  {
    key: 'breakerUnit',
    icon: '🔨',
    name: 'Breaker Unit',
    role: 'Heavy breacher',
    description: 'Higher attack unit meant to crack weaker defensive lines quickly.',
    stats: { attack: 50, defense: 15, speed: 16, carry: 10 },
    cost: { biomass: 60, alloy: 30, ore: 40, population: 1, time: '1m 14s' },
    requirements: ['Recruitment Core Lv3', 'Ore Extractor Lv3'],
  },
  {
    key: 'reconOperative',
    icon: '🔍',
    name: 'Recon Operative',
    role: 'Scout / support unit',
    description:
      'Lightly armed intel gatherer that reveals enemy nexus resources, troops, and defenses. Not a frontline fighter.',
    stats: { attack: 5, defense: 20, speed: 25, carry: 10 },
    cost: { biomass: 100, alloy: 30, ore: 60, population: 1, time: '1m 24s' },
    requirements: ['Recruitment Core Lv3', 'Command Core Lv2'],
    notes: ['This is the unit used for scouting missions.'],
  },
  {
    key: 'skimmerBike',
    icon: '🏍️',
    name: 'Skimmer Bike',
    role: 'Fast raider',
    description: 'High mobility raider with strong carry for quick hit-and-run farming.',
    stats: { attack: 80, defense: 70, speed: 22, carry: 60 },
    cost: { biomass: 125, alloy: 100, ore: 150, population: 3, time: '2m 11s' },
    requirements: ['Recruitment Core Lv4', 'Alloy Forge Lv4'],
  },
  {
    key: 'siegeMech',
    icon: '🤖',
    name: 'Siege Mech',
    role: 'Heavy defensive anchor',
    description:
      'Towering defensive platform with exceptional durability. Slow but nearly immovable when holding ground.',
    stats: { attack: 150, defense: 200, speed: 10, carry: 80 },
    cost: { biomass: 125, alloy: 100, ore: 250, population: 4, time: '10m 0s' },
    requirements: ['Recruitment Core Lv5', 'Ore Extractor Lv5'],
  },
  {
    key: 'bulwarkGuard',
    icon: '🛡️',
    name: 'Bulwark Guard',
    role: 'Elite defensive infantry',
    description: 'One of the strongest dedicated defensive units in midgame.',
    stats: { attack: 20, defense: 120, speed: 12, carry: 25 },
    cost: { biomass: 80, alloy: 120, ore: 100, population: 2, time: '1m 45s' },
    requirements: ['Recruitment Core Lv4', 'Life Support Lv6'],
  },
  {
    key: 'suppressorTeam',
    icon: '🎯',
    name: 'Suppressor Team',
    role: 'Ranged assault support',
    description: 'Flexible fire-support unit that bolsters offensive pushes with sustained ranged pressure.',
    stats: { attack: 60, defense: 50, speed: 15, carry: 20 },
    cost: { biomass: 90, alloy: 80, ore: 90, population: 2, time: '1m 54s' },
    requirements: ['Recruitment Core Lv4', 'Command Core Lv4'],
  },
  {
    key: 'disruptorUnit',
    icon: '⚡',
    name: 'Disruptor Unit',
    role: 'Anti-armor assault unit',
    description: 'Aggressive specialist built to crack heavy defensive compositions on the offensive.',
    stats: { attack: 70, defense: 60, speed: 17, carry: 25 },
    cost: { biomass: 110, alloy: 150, ore: 130, population: 2, time: '2m 3s' },
    requirements: ['Recruitment Core Lv5', 'Ore Extractor Lv4'],
    notes: ['No special anti-mech multiplier is currently applied in combat code.'],
  },
  {
    key: 'interceptorBike',
    icon: '🏍️',
    name: 'Interceptor Bike',
    role: 'Rapid-response cavalry',
    description: 'Fastest unit in the game, ideal for rapid redeploy and pressure.',
    stats: { attack: 90, defense: 80, speed: 28, carry: 50 },
    cost: { biomass: 150, alloy: 120, ore: 180, population: 3, time: '2m 20s' },
    requirements: ['Recruitment Core Lv6', 'Alloy Forge Lv5'],
  },
  {
    key: 'annihilatorPlatform',
    icon: '💥',
    name: 'Annihilator Platform',
    role: 'Heavy artillery',
    description: 'Top-end damage platform for heavy assaults and sieges.',
    stats: { attack: 200, defense: 150, speed: 8, carry: 100 },
    cost: { biomass: 200, alloy: 180, ore: 300, population: 5, time: '15m 0s' },
    requirements: ['Recruitment Core Lv7', 'Command Core Lv6'],
  },
  {
    key: 'overseer',
    icon: '👁️',
    name: 'Overseer',
    role: 'Conquest / control unit',
    description: 'Conquest enabler used to reduce control and capture nexuses.',
    stats: { attack: 0, defense: 30, speed: 15, carry: 0 },
    cost: { biomass: 300, alloy: 250, ore: 200, population: 5, time: '30m 0s' },
    requirements: ['Recruitment Core Lv9', 'Command Core Lv8', 'Shield Grid Lv6'],
    notes: [
      'Maximum 3 per nexus.',
      'If every non-overseer troop dies, the overseer also dies.',
      'Successful attack with overseer alive reduces enemy control by 50.',
    ],
  },
];

export const BUILDINGS_DOC: BuildingDoc[] = [
  {
    key: 'commandCore',
    icon: '🧠',
    name: 'Command Core',
    role: 'Strategic progression building',
    description: 'Central control structure for unlocking progression milestones.',
    baseCost: { biomass: 90, alloy: 80, ore: 70, timeSeconds: 45 },
    maxLevel: 20,
    milestones: [
      { level: 4, requires: ['Life Support Lv2'] },
      { level: 6, requires: ['Shield Grid Lv2'] },
      { level: 10, requires: ['Storage Vault Lv5'] },
    ],
    impact: ['Primary unlock gate for multiple systems and troop tiers.'],
  },
  {
    key: 'troopFabricator',
    icon: '🏭',
    name: 'Recruitment Core',
    role: 'Military production building',
    description: 'Enables troop training and unlocks higher combat tiers.',
    baseCost: { biomass: 200, alloy: 170, ore: 90, timeSeconds: 75 },
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
    icon: '🌐',
    name: 'Life Support',
    role: 'Population capacity building',
    description: 'Increases maximum population to support larger armies.',
    baseCost: { biomass: 80, alloy: 100, ore: 70, timeSeconds: 60 },
    maxLevel: 20,
    unlock: 'Command Core Lv2',
    milestones: [
      { level: 4, requires: ['Biomass Farm Lv2'] },
      { level: 8, requires: ['Storage Vault Lv4'] },
    ],
    impact: ['Population max formula: floor(100 * 1.27^level).'],
  },
  {
    key: 'storageVault',
    icon: '📦',
    name: 'Storage Vault',
    role: 'Resource cap building',
    description: 'Raises resource storage to reduce overflow waste.',
    baseCost: { biomass: 60, alloy: 50, ore: 40, timeSeconds: 45 },
    maxLevel: 20,
    unlock: 'Command Core Lv2',
    milestones: [
      { level: 4, requires: ['Ore Extractor Lv2'] },
      { level: 6, requires: ['Alloy Forge Lv2'] },
      { level: 10, requires: ['Command Core Lv8'] },
    ],
    impact: ['Storage formula: floor(1000 * 1.5^level).'],
  },
  {
    key: 'biomassFarm',
    icon: '🧬',
    name: 'Biomass Farm',
    role: 'Biomass production',
    description: 'Generates biomass resource over time.',
    baseCost: { biomass: 50, alloy: 60, ore: 40, timeSeconds: 45 },
    maxLevel: 20,
    unlock: 'Life Support Lv1',
    milestones: [
      { level: 6, requires: ['Recruitment Core Lv2'] },
      { level: 10, requires: ['Life Support Lv5'] },
    ],
    impact: ['Production scales by floor(600 * 1.35^(level-1)).'],
  },
  {
    key: 'alloyForge',
    icon: '⚙️',
    name: 'Alloy Forge',
    role: 'Alloy production',
    description: 'Generates alloy resource over time.',
    baseCost: { biomass: 65, alloy: 40, ore: 40, timeSeconds: 45 },
    maxLevel: 20,
    unlock: 'Ore Extractor Lv2',
    milestones: [
      { level: 6, requires: ['Command Core Lv4'] },
      { level: 10, requires: ['Ore Extractor Lv8'] },
    ],
    impact: ['Production scales by floor(600 * 1.35^(level-1)).'],
  },
  {
    key: 'oreExtractor',
    icon: '💎',
    name: 'Ore Extractor',
    role: 'Ore production',
    description: 'Generates ore resource over time.',
    baseCost: { biomass: 75, alloy: 65, ore: 70, timeSeconds: 60 },
    maxLevel: 20,
    unlock: 'Command Core Lv1',
    milestones: [{ level: 8, requires: ['Alloy Forge Lv4'] }],
    impact: ['Production scales by floor(600 * 1.35^(level-1)).'],
  },
  {
    key: 'shieldGrid',
    icon: '🛡️',
    name: 'Shield Grid',
    role: 'Defensive multiplier',
    description: 'Boosts total defending force power during combat.',
    baseCost: { biomass: 50, alloy: 100, ore: 20, timeSeconds: 75 },
    maxLevel: 15,
    unlock: 'Command Core Lv3',
    milestones: [
      { level: 4, requires: ['Storage Vault Lv3'] },
      { level: 8, requires: ['Alloy Forge Lv5'] },
    ],
    impact: ['Defense bonus: +2% total defense per level.'],
  },
];

export const BUILDING_SCALING_DOC = {
  costScaling: { early: 1.5, mid: 1.65, late: 1.8 },
  timeScaling: { early: 1.25, mid: 1.35, late: 1.45 },
  stages: ['Target levels 1-5: early scaling', 'Target levels 6-10: mid scaling', 'Target levels 11+: late scaling'],
};
