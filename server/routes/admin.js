const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Node = require('../models/Node');
const Attack = require('../models/Attack');

const router = express.Router();

// Get all users (admin only - no auth check for dev)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).populate('villages').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const [userCount, villageCount, attackCount] = await Promise.all([
      User.countDocuments(),
      Village.countDocuments(),
      Attack.countDocuments(),
    ]);

    const topUsers = await User.find({}, { username: 1, points: 1 }).sort({ points: -1 }).limit(10);

    res.json({
      userCount,
      villageCount,
      attackCount,
      topUsers,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete all user's villages
    await Village.deleteMany({ owner: user._id });

    // Delete all attacks involving user's villages
    await Attack.deleteMany({
      $or: [{ attacker: user._id }, { defender: user._id }],
    });

    // Delete user
    await User.findByIdAndDelete(user._id);

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Give resources to village
router.post('/villages/:villageId/resources', async (req, res) => {
  try {
    const { biomass, alloy, ore } = req.body;
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    village.resources.biomass += biomass || 0;
    village.resources.alloy += alloy || 0;
    village.resources.ore += ore || 0;

    await village.save();
    res.json({ success: true, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add troops to village
router.post('/villages/:villageId/troops', async (req, res) => {
  try {
    const {
      lancerDrone,
      assaultTrooper,
      breakerUnit,
      reconOperative,
      skimmerBike,
      siegeMech,
      bulwarkGuard,
      suppressorTeam,
      disruptorUnit,
      interceptorBike,
      annihilatorPlatform,
      overseer,
    } = req.body;
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    const troopsAdded =
      (lancerDrone || 0) +
      (assaultTrooper || 0) +
      (breakerUnit || 0) +
      (reconOperative || 0) +
      (skimmerBike || 0) +
      (siegeMech || 0) +
      (bulwarkGuard || 0) +
      (suppressorTeam || 0) +
      (disruptorUnit || 0) +
      (interceptorBike || 0) +
      (annihilatorPlatform || 0) +
      (overseer || 0);

    village.troops.lancerDrone += lancerDrone || 0;
    village.troops.assaultTrooper += assaultTrooper || 0;
    village.troops.breakerUnit += breakerUnit || 0;
    village.troops.reconOperative += reconOperative || 0;
    village.troops.skimmerBike += skimmerBike || 0;
    village.troops.siegeMech += siegeMech || 0;
    village.troops.bulwarkGuard += bulwarkGuard || 0;
    village.troops.suppressorTeam += suppressorTeam || 0;
    village.troops.disruptorUnit += disruptorUnit || 0;
    village.troops.interceptorBike += interceptorBike || 0;
    village.troops.annihilatorPlatform += annihilatorPlatform || 0;
    village.troops.overseer += overseer || 0;

    // Update population
    village.population.current += troopsAdded;

    await village.save();
    res.json({ success: true, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add building levels to village
router.post('/villages/:villageId/buildings', async (req, res) => {
  try {
    const {
      commandCore,
      troopFabricator,
      lifeSupport,
      storageVault,
      biomassFarm,
      alloyForge,
      oreExtractor,
      shieldGrid,
    } = req.body;
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    // Add to existing building levels
    if (commandCore) village.buildings.commandCore += commandCore;
    if (troopFabricator) village.buildings.troopFabricator += troopFabricator;
    if (lifeSupport) village.buildings.lifeSupport += lifeSupport;
    if (storageVault) village.buildings.storageVault += storageVault;
    if (biomassFarm) village.buildings.biomassFarm += biomassFarm;
    if (alloyForge) village.buildings.alloyForge += alloyForge;
    if (oreExtractor) village.buildings.oreExtractor += oreExtractor;
    if (shieldGrid) village.buildings.shieldGrid += shieldGrid;

    // Update max population based on life support level
    village.population.max = 24 * Math.pow(1.17, village.buildings.lifeSupport);

    await village.save();
    res.json({ success: true, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete build queue instantly
router.post('/villages/:villageId/complete-build', async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    if (village.buildQueue.length === 0) {
      return res.status(400).json({ error: 'No building in queue' });
    }

    const build = village.buildQueue.shift();
    village.buildings[build.building] = build.targetLevel;

    // Update max population if life support was upgraded
    if (build.building === 'lifeSupport') {
      village.population.max = 24 * Math.pow(1.17, village.buildings.lifeSupport);
    }

    await village.save();
    res.json({ success: true, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete training queue instantly
router.post('/villages/:villageId/complete-training', async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    if (village.trainingQueue.length === 0) {
      return res.status(400).json({ error: 'No troops in training' });
    }

    const training = village.trainingQueue.shift();
    village.troops[training.troopType] += training.amount;
    village.population.current += training.amount;

    await village.save();
    res.json({ success: true, village });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete village
router.delete('/villages/:villageId', async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    // Remove village from user's villages array
    await User.findByIdAndUpdate(village.owner, {
      $pull: { villages: village._id },
    });

    // Delete all attacks involving this village
    await Attack.deleteMany({
      $or: [{ attackerVillage: village._id }, { defenderVillage: village._id }],
    });

    // Delete village
    await Node.findByIdAndDelete(village._id);

    res.json({ success: true, message: 'Village deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all traveling attacks
router.get('/attacks', async (req, res) => {
  try {
    const attacks = await Attack.find({ status: 'traveling' })
      .populate('attacker.user', 'username')
      .populate('attacker.village', 'name x y')
      .populate('defender.user', 'username')
      .populate('defender.village', 'name x y')
      .sort({ arrivesAt: 1 });

    res.json(attacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete attack instantly (make it arrive now and resolve)
router.post('/attacks/:attackId/complete', async (req, res) => {
  try {
    const attack = await Attack.findById(req.params.attackId);

    if (!attack) {
      return res.status(404).json({ error: 'Attack not found' });
    }

    if (attack.status !== 'traveling') {
      return res.status(400).json({ error: 'Attack already completed or cancelled' });
    }

    // Set arrival time to now so it will be processed immediately
    attack.arrivesAt = new Date();
    await attack.save();

    // Trigger combat resolution
    const { processArrivedAttacks } = require('../utils/combat');
    await processArrivedAttacks();

    res.json({ success: true, message: 'Attack completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
