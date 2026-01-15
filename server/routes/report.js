const express = require('express');
const auth = require('../middleware/auth');
const Attack = require('../models/Attack');
const Node = require('../models/Node');
const User = require('../models/User');

const router = express.Router();

// Get attack reports
router.get('/reports/:villageId', auth, async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const reports = await Attack.find({
      $or: [{ 'attacker.village': req.params.villageId }, { 'defender.village': req.params.villageId }],
      status: 'completed',
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('attacker.village', 'name x y')
      .populate('defender.village', 'name x y')
      .populate('attacker.user', 'username')
      .populate('defender.user', 'username');

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
