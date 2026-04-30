// Script to populate the map with random nexuses
// Run with: node create-test-nexuses.js

import dotenv from 'dotenv';
import prisma from './lib/prisma.js';
import { seedNeutralNexuses } from './utils/neutralNexuses.js';

dotenv.config();

// Number of nexuses to create
const NUM_NEXUSES = 50;

async function createTestNexuses() {
  try {
    console.log('Connected to PostgreSQL');
    const nexusesCreated = await seedNeutralNexuses(NUM_NEXUSES);

    console.log(`\n✅ Created ${nexusesCreated} neutral nexuses across the map!`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

createTestNexuses();
