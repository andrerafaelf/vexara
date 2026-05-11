import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No authentication token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        activeGalaxyId: true,
        activeGalaxy: { select: { id: true, status: true } },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (req.activeGalaxyOptional !== true && user.activeGalaxyId == null) {
      return res.status(409).json({ error: 'No active galaxy selected', code: 'no_active_galaxy' });
    }

    req.galaxyId = user.activeGalaxyId ?? null;
    req.galaxyStatus = user.activeGalaxy?.status ?? null;

    // Ended galaxies are read-only: block any non-GET request.
    if (req.galaxyStatus === 'ended' && !READ_METHODS.has(req.method)) {
      return res.status(423).json({ error: 'This galaxy has ended and is read-only', code: 'galaxy_ended' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export default auth;
