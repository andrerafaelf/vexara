import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import prisma from './lib/prisma.js';
import { updateAllResources } from './models/Node.js';
import adminRoutes from './routes/admin.js';
import attackRoutes from './routes/attack.js';
import authRoutes from './routes/auth.js';
import buildingRoutes from './routes/building.js';
import mapRoutes from './routes/map.js';
import nodeRoutes from './routes/node.js';
import reportRoutes from './routes/report.js';
import troopRoutes from './routes/troop.js';
import { processArrivedAttacks } from './utils/combat.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting (disabled in development)
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    // 15 minutes
    windowMs: 15 * 60 * 1000,
    // limit each IP to 100 requests per windowMs
    max: 100,
  });
  app.use('/api/', limiter);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/village', nodeRoutes);
app.use('/api/building', buildingRoutes);
app.use('/api/troop', troopRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/attack', attackRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/admin', adminRoutes);

// PostgreSQL connection check via Prisma
prisma
  .$connect()
  .then(() => console.log('✅ PostgreSQL connected successfully'))
  .catch((err) => {
    console.error('❌ PostgreSQL connection error:', err.message);
    console.log('\n💡 To fix this:');
    console.log('   1. Start PostgreSQL or run: docker compose -f ../util/docker-compose.yml up -d');
    console.log('   2. Set DATABASE_URL in .env (e.g. postgresql://user:pass@localhost:5432/neon_dominion)');
    console.log('   3. Run: npm run db:migrate\n');
  });

// Start resource production interval (every minute)
setInterval(() => {
  updateAllResources();
}, 60000);

// Start combat resolution interval (every 10 seconds)
setInterval(() => {
  processArrivedAttacks();
}, 10000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
