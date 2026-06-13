import { Router } from 'express';
import type { Response } from 'express';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { purchasePaidPass } from '../utils/battlePass.js';
import prisma from '../lib/prisma.js';
import { logError } from '../utils/logger.js';

const router = Router();

// GET /api/battle-pass — current player's pass state for active galaxy
router.get('/', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		if (!authReq.galaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}
		const player = await prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId: authReq.userId, galaxyId: authReq.galaxyId } },
			select: { seasonXp: true, passLevel: true, hasPaidPass: true }
		});
		if (!player) {
			res.status(404).json({ error: 'Not a member of this galaxy' });
			return;
		}
		res.json(player);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'battlePass route'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/battle-pass/purchase — unlock paid pass for active galaxy
router.post('/purchase', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		if (!authReq.galaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}
		const err = await purchasePaidPass(authReq.userId, authReq.galaxyId);
		if (err) {
			res.status(400).json({ error: err });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'battlePass route'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
