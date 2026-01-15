const express = require('express');
const auth = require('../middleware/auth');
const Attack = require('../models/Attack');
const Node = require('../models/Node');

const router = express.Router();

// Send attack
router.post('/send', auth, async (req, res) => {
  try {
    const { fromVillageId, toVillageId, troops, type = 'attack' } = req.body;

    const attackerVillage = await Node.findById(fromVillageId);
    const defenderVillage = await Node.findById(toVillageId);

    if (!attackerVillage || attackerVillage.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!defenderVillage) {
      return res.status(404).json({ error: 'Target village not found' });
    }

    // Check if has troops
    for (const [troopType, amount] of Object.entries(troops)) {
      if (amount > attackerVillage.troops[troopType]) {
        return res.status(400).json({ error: `Insufficient ${troopType}` });
      }
    }

    // Remove troops from village
    let totalTroopsSent = 0;
    for (const [troopType, amount] of Object.entries(troops)) {
      attackerVillage.troops[troopType] -= amount;
      totalTroopsSent += amount;
    }

    // Decrease population for sent troops
    attackerVillage.population.current = Math.max(0, attackerVillage.population.current - totalTroopsSent);

    // Calculate travel time (based on distance and slowest unit)
    const distance = Math.sqrt(
      Math.pow(defenderVillage.x - attackerVillage.x, 2) + Math.pow(defenderVillage.y - attackerVillage.y, 2)
    );
    const travelTimeMinutes = distance * 5; // 5 minutes per tile
    const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

    const attack = new Attack({
      attacker: {
        user: req.userId,
        village: fromVillageId,
      },
      defender: {
        user: defenderVillage.owner,
        village: toVillageId,
      },
      troops,
      arrivesAt,
      type,
    });

    await attack.save();
    await attackerVillage.save();

    res.json({ success: true, attack });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get incoming attacks
router.get('/incoming/:villageId', auth, async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await Attack.find({
      'defender.village': req.params.villageId,
      status: 'traveling',
    })
      .populate('attacker.village', 'name x y')
      .populate('attacker.user', 'username');

    res.json(attacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get outgoing attacks
router.get('/outgoing/:villageId', auth, async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId);
    if (!village || village.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attacks = await Attack.find({
      'attacker.village': req.params.villageId,
      status: 'traveling',
    })
      .populate('defender.village', 'name x y')
      .populate('defender.user', 'username');

    res.json(attacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
