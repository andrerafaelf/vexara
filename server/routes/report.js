import express from 'express';
import auth from '../middleware/auth.js';
import Attack from '../models/Attack.js';
import Node from '../models/Node.js';

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

export default router;
