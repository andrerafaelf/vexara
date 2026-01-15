const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 20,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  villages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Village',
    },
  ],
  tribe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tribe',
  },
  points: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Calculate total user points from all villages
userSchema.methods.calculateTotalPoints = async function () {
  await this.populate('villages');
  const totalPoints = this.villages.reduce((sum, village) => sum + village.points, 0);
  this.points = totalPoints;
  return totalPoints;
};

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
