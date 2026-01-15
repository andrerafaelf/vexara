const express = require('express');
const auth = require('../middleware/auth');
const Node = require('../models/Node');
const User = require('../models/User');

const router = express.Router();

// Create a new village
router.post('/create', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    // Create new village at random coordinates
    const village = new Node({
      name: req.body.name || `${user.username}'s Village`,
      owner: user._id,
      x: Math.floor(Math.random() * 100),
      y: Math.floor(Math.random() * 100),
    });
    await village.save();

    user.villages.push(village._id);
    await user.save();

    res.json(village);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's villages
router.get('/my-villages', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('villages');

    // Update resources and points for all villages
    for (const village of user.villages) {
      village.updateResources();
      await village.save();
    }

    // Update user's total points
    await user.calculateTotalPoints();
    await user.save();

    res.json(user.villages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific village
router.get('/:villageId', auth, async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    if (village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    village.updateResources();
    await village.save();

    res.json(village);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
