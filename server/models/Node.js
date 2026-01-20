import mongoose from 'mongoose';

const villageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  x: {
    type: Number,
    required: true,
  },
  y: {
    type: Number,
    required: true,
  },
  resources: {
    biomass: { type: Number, default: 500 },
    alloy: { type: Number, default: 500 },
    ore: { type: Number, default: 500 },
  },
  buildings: {
    commandCore: { type: Number, default: 1 },
    troopFabricator: { type: Number, default: 0 },
    lifeSupport: { type: Number, default: 1 },
    storageVault: { type: Number, default: 1 },
    biomassFarm: { type: Number, default: 1 },
    alloyForge: { type: Number, default: 1 },
    oreExtractor: { type: Number, default: 1 },
    shieldGrid: { type: Number, default: 0 },
  },
  troops: {
    lancerDrone: { type: Number, default: 0 },
    assaultTrooper: { type: Number, default: 0 },
    breakerUnit: { type: Number, default: 0 },
    reconOperative: { type: Number, default: 0 },
    skimmerBike: { type: Number, default: 0 },
    siegeMech: { type: Number, default: 0 },
    bulwarkGuard: { type: Number, default: 0 },
    suppressorTeam: { type: Number, default: 0 },
    disruptorUnit: { type: Number, default: 0 },
    interceptorBike: { type: Number, default: 0 },
    annihilatorPlatform: { type: Number, default: 0 },
    overseer: { type: Number, default: 0 },
  },
  population: {
    current: { type: Number, default: 5 },
    max: { type: Number, default: 24 },
  },
  buildQueue: [
    {
      building: String,
      targetLevel: Number,
      completesAt: Date,
    },
  ],
  trainingQueue: [
    {
      troopType: String,
      amount: Number,
      completesAt: Date,
    },
  ],
  lastResourceUpdate: {
    type: Date,
    default: Date.now,
  },
  points: {
    type: Number,
    default: 5,
  },
  controlLevel: {
    type: Number,
    default: 100,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Calculate resource production per hour
villageSchema.methods.getResourceProduction = function () {
  const baseProduction = 30;
  return {
    biomass: baseProduction * Math.pow(1.2, this.buildings.biomassFarm - 1),
    alloy: baseProduction * Math.pow(1.2, this.buildings.alloyForge - 1),
    ore: baseProduction * Math.pow(1.2, this.buildings.oreExtractor - 1),
  };
};

// Update resources based on time elapsed
villageSchema.methods.updateResources = function () {
  const now = new Date();
  const hoursSinceLastUpdate = (now - this.lastResourceUpdate) / (1000 * 60 * 60);

  const production = this.getResourceProduction();
  const maxStorage = this.getMaxStorage();

  this.resources.biomass = Math.min(this.resources.biomass + production.biomass * hoursSinceLastUpdate, maxStorage);
  this.resources.alloy = Math.min(this.resources.alloy + production.alloy * hoursSinceLastUpdate, maxStorage);
  this.resources.ore = Math.min(this.resources.ore + production.ore * hoursSinceLastUpdate, maxStorage);

  this.lastResourceUpdate = now;
};

// Get max storage capacity
villageSchema.methods.getMaxStorage = function () {
  return 1000 * Math.pow(1.3, this.buildings.storageVault);
};

// Calculate village points based on buildings, troops, and resources
villageSchema.methods.calculatePoints = function () {
  let points = 0;

  // Building points (each level adds points based on building type)
  const buildingPoints = {
    commandCore: 10,
    troopFabricator: 16,
    lifeSupport: 5,
    storageVault: 6,
    biomassFarm: 6,
    alloyForge: 6,
    oreExtractor: 6,
    shieldGrid: 8,
  };

  for (const [building, level] of Object.entries(this.buildings)) {
    points += buildingPoints[building] * level;
  }

  // Troop points (each troop type has different value)
  const troopPoints = {
    lancerDrone: 1,
    assaultTrooper: 2,
    breakerUnit: 1,
    reconDrone: 2,
    skimmerBike: 3,
    siegeMech: 4,
  };

  for (const [troopType, count] of Object.entries(this.troops)) {
    points += troopPoints[troopType] * count;
  }

  return Math.floor(points);
};

// Update points whenever village is saved
villageSchema.pre('save', function (next) {
  this.points = this.calculatePoints();
  next();
});

// Static method to update all villages
villageSchema.statics.updateAllResources = async function () {
  const villages = await this.find({});
  for (const village of villages) {
    village.updateResources();
    await village.save();
  }
};

export default mongoose.model('Village', villageSchema);
