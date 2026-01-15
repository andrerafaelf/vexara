const mongoose = require('mongoose');

const attackSchema = new mongoose.Schema({
  attacker: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    village: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Village',
      required: true,
    },
  },
  defender: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    village: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Village',
      required: true,
    },
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
  arrivesAt: {
    type: Date,
    required: true,
  },
  type: {
    type: String,
    enum: ['attack', 'support', 'scout'],
    default: 'attack',
  },
  status: {
    type: String,
    enum: ['traveling', 'completed', 'cancelled'],
    default: 'traveling',
  },
  result: {
    attackerLosses: mongoose.Schema.Types.Mixed,
    defenderLosses: mongoose.Schema.Types.Mixed,
    resourcesStolen: mongoose.Schema.Types.Mixed,
    victory: Boolean,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Attack', attackSchema);
