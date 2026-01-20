// Script to populate the map with random nodes
// Run with: node create test nodes.js

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Node from './models/Node.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/neon-dominion';

// Configuration
// 100x100 map
const MAP_SIZE = 100;
// Number of nodes to create
const NUM_NODES = 50;

// Node types with different bonuses and characteristics
const NODE_TYPES = [
  { name: 'Neutral Settlement', weight: 40 },
  { name: 'Resource Depot', weight: 20, resourceBonus: true },
  { name: 'Military Outpost', weight: 15, troopBonus: true },
  { name: 'Supply Cache', weight: 15, highResources: true },
  { name: 'Abandoned Base', weight: 10, lowDefense: true },
];

function selectNodeType() {
  const totalWeight = NODE_TYPES.reduce((sum, type) => sum + type.weight, 0);
  let random = Math.random() * totalWeight;

  for (const type of NODE_TYPES) {
    random -= type.weight;
    if (random <= 0) return type;
  }
  return NODE_TYPES[0];
}

async function createTestNodes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    let nodesCreated = 0;
    let attempts = 0;
    // Prevent infinite loop
    const maxAttempts = NUM_NODES * 3;

    while (nodesCreated < NUM_NODES && attempts < maxAttempts) {
      attempts++;

      // Generate random position
      const x = Math.floor(Math.random() * MAP_SIZE);
      const y = Math.floor(Math.random() * MAP_SIZE);

      // Check if node already exists at this position
      const existingNode = await Node.findOne({ x, y });
      if (existingNode) {
        // Skip this position
        continue;
      }

      // Select node type
      const nodeType = selectNodeType();

      // Base resources
      let biomass = Math.floor(Math.random() * 4000) + 1000;
      let alloy = Math.floor(Math.random() * 4000) + 1000;
      let ore = Math.floor(Math.random() * 2000) + 500;

      // Resource bonus villages have 2x resources
      if (nodeType.resourceBonus || nodeType.highResources) {
        const multiplier = nodeType.highResources ? 1.5 : 2;
        biomass *= multiplier;
        alloy *= multiplier;
        ore *= multiplier;
      }

      // Base troop counts
      let troopMultiplier = 1;
      if (nodeType.troopBonus) troopMultiplier = 1.5;
      if (nodeType.lowDefense) troopMultiplier = 0.3;

      // Create neutral node with type specific attributes
      const node = await Node.create({
        name: nodeType.name,
        x,
        y,
        resources: {
          biomass: Math.floor(biomass),
          alloy: Math.floor(alloy),
          ore: Math.floor(ore),
        },
        buildings: {
          commandCore: Math.floor(Math.random() * 4) + 1,
          troopFabricator: Math.floor(Math.random() * 3),
          lifeSupport: Math.floor(Math.random() * 4) + 2,
          storageVault: Math.floor(Math.random() * 4) + 1,
          biomassFarm: Math.floor(Math.random() * 4) + 1,
          alloyForge: Math.floor(Math.random() * 4) + 1,
          oreExtractor: Math.floor(Math.random() * 4) + 1,
          shieldGrid: Math.floor(Math.random() * 2),
        },
        troops: {
          lancerDrone: Math.floor((Math.random() * 40 + 5) * troopMultiplier),
          assaultTrooper: Math.floor((Math.random() * 30 + 5) * troopMultiplier),
          breakerUnit: Math.floor((Math.random() * 25 + 5) * troopMultiplier),
          reconOperative: Math.floor(Math.random() * 10 * troopMultiplier),
          skimmerBike: Math.floor(Math.random() * 15 * troopMultiplier),
          siegeMech: Math.floor(Math.random() * 8 * troopMultiplier),
          bulwarkGuard: Math.floor(Math.random() * 10 * troopMultiplier),
          suppressorTeam: Math.floor(Math.random() * 8 * troopMultiplier),
          disruptorUnit: Math.floor(Math.random() * 8 * troopMultiplier),
          interceptorBike: Math.floor(Math.random() * 5 * troopMultiplier),
          annihilatorPlatform: Math.floor(Math.random() * 3 * troopMultiplier),
          overseer: 0,
        },
      });

      nodesCreated++;
      const typeInfo = nodeType.resourceBonus
        ? ' [Resource Bonus]'
        : nodeType.troopBonus
        ? ' [Military]'
        : nodeType.highResources
        ? ' [Rich]'
        : nodeType.lowDefense
        ? ' [Weak]'
        : '';
      console.log(`Created node ${nodesCreated}/${NUM_NODES}: ${node.name}${typeInfo} at (${x}|${y})`);
    }

    console.log(`\n✅ Created ${nodesCreated} neutral nodes across the map!`);
    console.log(`Map size: ${MAP_SIZE}x${MAP_SIZE}`);
    console.log('\nYou can now:');
    console.log('1. Navigate to the map view');
    console.log('2. Explore and find nodes to attack');
    console.log('3. Conquer neutral settlements');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

createTestNodes();
