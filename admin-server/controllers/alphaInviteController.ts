import type { Request, Response } from 'express';
import prisma from '../../server/lib/prisma.js';

export async function getAlphaInviteStatus(_req: Request, res: Response): Promise<void> {
  try {
    const [total, invited, unsubscribed, eligible] = await Promise.all([
      prisma.alphaSignup.count(),
      prisma.alphaSignup.count({ where: { invitedAt: { not: null } } }),
      prisma.alphaSignup.count({ where: { unsubscribedAt: { not: null } } }),
      prisma.alphaSignup.count({ where: { invitedAt: null, unsubscribedAt: null } }),
    ]);
    res.json({ total, invited, unsubscribed, eligible });
  } catch (error) {
    console.error('[alphaInviteController] getAlphaInviteStatus error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
