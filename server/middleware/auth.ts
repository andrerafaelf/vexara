import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'No authentication token' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    (req as AuthRequest).userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { activeGalaxyId: true, activeGalaxy: { select: { id: true, status: true } } },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const authReq = req as AuthRequest;

    if (authReq.activeGalaxyOptional !== true && user.activeGalaxyId == null) {
      res.status(409).json({ error: 'No active galaxy selected', code: 'no_active_galaxy' });
      return;
    }

    authReq.galaxyId = user.activeGalaxyId ?? (null as unknown as number);
    authReq.galaxyStatus = user.activeGalaxy?.status ?? null;

    if (authReq.galaxyStatus === 'ended' && !READ_METHODS.has(req.method)) {
      res.status(423).json({ error: 'This galaxy has ended and is read-only', code: 'galaxy_ended' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export default auth;
