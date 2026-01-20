import express from 'express';
import auth from '../middleware/auth.js';
import Node from '../models/Node.js';

const router = express.Router();

// Get map data (villages in range)
router.get('/area/:x/:y', auth, async (req, res) => {
  try {
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);
    // 10x10 grid
    const range = 10;

    const villages = await Node.find({
      x: { $gte: x - range, $lte: x + range },
      y: { $gte: y - range, $lte: y + range },
    }).populate('owner', 'username points');

    res.json(villages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get village details (for other players)
router.get('/village/:villageId', auth, async (req, res) => {
  try {
    const village = await Node.findById(req.params.villageId).populate('owner', 'username points tribe');

    if (!village) {
      return res.status(404).json({ error: 'Village not found' });
    }

    // Only return limited info for other players' villages
    const publicData = {
      _id: village._id,
      name: village.name,
      x: village.x,
      y: village.y,
      owner: village.owner,
      points: village.points,
      buildings: {
        wall: village.buildings.wall,
      },
    };

    res.json(publicData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
