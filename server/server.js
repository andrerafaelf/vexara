const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const nodeRoutes = require('./routes/node');
const buildingRoutes = require('./routes/building');
const troopRoutes = require('./routes/troop');
const mapRoutes = require('./routes/map');
const attackRoutes = require('./routes/attack');
const reportRoutes = require('./routes/report');
const adminRoutes = require('./routes/admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting (disabled in development)
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
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

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/not-tribos', {})
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('\n💡 To fix this:');
    console.log('   1. Start MongoDB: net start MongoDB (Windows) or brew services start mongodb-community (Mac)');
    console.log('   2. Or use MongoDB Atlas: https://www.mongodb.com/cloud/atlas/register');
    console.log('   3. Update MONGODB_URI in .env with your connection string\n');
  });

// Start resource production interval (every minute)
setInterval(() => {
  const Node = require('./models/Node');
  Node.updateAllResources();
}, 60000);

// Start combat resolution interval (every 10 seconds)
setInterval(() => {
  const { processArrivedAttacks } = require('./utils/combat');
  processArrivedAttacks();
}, 10000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
