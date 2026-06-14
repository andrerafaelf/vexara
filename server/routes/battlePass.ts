import { Router } from 'express';
import type { Response } from 'express';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { purchasePaidPass, grantVexPoints, PASS_COST_VP } from '../utils/battlePass.js';
import prisma from '../lib/prisma.js';
import { logError, logInfo } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';

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
			select: { seasonXp: true, passLevel: true, hasPaidPass: true, passTitle: true }
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

// POST /api/battle-pass/gift — spend 1,000 VP to activate the pass for another player
// in the same active galaxy. Body: { username: string }
router.post('/gift', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		if (!authReq.galaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}

		const { username } = req.body as { username?: string };
		if (!username || typeof username !== 'string') {
			res.status(400).json({ error: 'Username is required' });
			return;
		}

		// Gifter must have enough VP
		const gifter = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { id: true, username: true, vexPoints: true }
		});
		if (!gifter) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		if (gifter.vexPoints < PASS_COST_VP) {
			res.status(400).json({ error: `Not enough Vex Points (need ${PASS_COST_VP}, have ${gifter.vexPoints})` });
			return;
		}
		if (gifter.username.toLowerCase() === username.toLowerCase()) {
			res.status(400).json({ error: 'You cannot gift a pass to yourself' });
			return;
		}

		// Recipient must exist and be in the same galaxy
		const recipient = await prisma.user.findFirst({
			where: { username: { equals: username, mode: 'insensitive' } },
			select: { id: true, username: true }
		});
		if (!recipient) {
			res.status(404).json({ error: 'Player not found' });
			return;
		}
		const recipientPlayer = await prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId: recipient.id, galaxyId: authReq.galaxyId } },
			select: { hasPaidPass: true }
		});
		if (!recipientPlayer) {
			res.status(400).json({ error: 'That player is not in your active galaxy' });
			return;
		}
		if (recipientPlayer.hasPaidPass) {
			res.status(400).json({ error: 'That player already has the pass this season' });
			return;
		}

		// Deduct VP from gifter, then activate pass for recipient (which internally
		// grants and immediately spends PASS_COST_VP on the recipient side).
		await prisma.user.update({
			where: { id: gifter.id },
			data: { vexPoints: { decrement: PASS_COST_VP } }
		});

		// Grant VP to recipient so purchasePaidPass can spend them
		await grantVexPoints(recipient.id, PASS_COST_VP);
		const passErr = await purchasePaidPass(recipient.id, authReq.galaxyId);
		if (passErr) {
			// Roll back gifter's VP and recipient's VP on failure
			await prisma.user.update({
				where: { id: gifter.id },
				data: { vexPoints: { increment: PASS_COST_VP } }
			});
			await prisma.user.update({
				where: { id: recipient.id },
				data: { vexPoints: { decrement: PASS_COST_VP } }
			});
			res.status(400).json({ error: passErr });
			return;
		}

		logInfo('vex_pass_gifted', {
			gifterId: gifter.id,
			gifterUsername: gifter.username,
			recipientId: recipient.id,
			recipientUsername: recipient.username,
			galaxyId: authReq.galaxyId
		});

		void sendPushToUser(recipient.id, NOTIF.TOKEN_GRANTED, {
			title: 'Vex Pass gifted!',
			body: `Commander ${gifter.username} gifted you the Vex Protocol battle pass. The paid track is now unlocked.`,
			tag: `vex-pass-gift-${recipient.id}`,
			data: { url: '/pass' }
		});

		res.json({ success: true, recipientUsername: recipient.username });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'battlePass route /gift'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
