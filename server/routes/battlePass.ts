import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { notifyNexusResources } from '../services/warRoomSocket.js';
import type { AuthRequest } from '../types/index.js';
import { giftPaidPass, purchasePaidPass } from '../utils/battlePass.js';
import { getMaxStorage, getResourceProduction } from '../utils/economy.js';
import { logError, logInfo } from '../utils/logger.js';
import { claimPassReward, getPassState, type ClaimResult, type ClaimTarget } from '../utils/passClaim.js';

const router = Router();

// The Vex Pass is account-wide, so these routes work without an active galaxy.
// Claim routes use plain `auth` because a claim delivers into a galaxy nexus.
function authNoGalaxy(req: Request, res: Response, next: NextFunction): void {
	(req as AuthRequest).activeGalaxyOptional = true;
	void auth(req, res, next);
}

// GET /api/battle-pass - account-level pass state (works without an active galaxy)
router.get('/', authNoGalaxy, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const state = await getPassState(authReq.userId, authReq.galaxyId ?? null, authReq.galaxyStatus);
		if (!state) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		res.json(state);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'battlePass route'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Shared by the level and cache claim routes: run the claim, push the new nexus
// resources to the client, and shape the response.
async function runClaim(
	req: Request,
	res: Response,
	target: ClaimTarget,
	file: string
): Promise<void> {
	const authReq = req as AuthRequest;
	try {
		const nexusId = req.body?.nexusId;
		if (typeof nexusId !== 'number' || !Number.isInteger(nexusId) || nexusId <= 0) {
			res.status(400).json({ error: 'nexusId is required' });
			return;
		}
		const result: ClaimResult = await claimPassReward(
			{
				userId: authReq.userId,
				galaxyId: authReq.galaxyId ?? null,
				galaxyStatus: authReq.galaxyStatus,
				nexusId
			},
			target
		);
		if (!result.ok) {
			const { ok: _ok, status, ...body } = result;
			res.status(status).json(body);
			return;
		}
		if (result.nexus) {
			try {
				notifyNexusResources(authReq.userId, {
					nexusId: result.nexus.id,
					base: {
						biomass: result.nexus.biomass,
						alloy: result.nexus.alloy,
						ore: result.nexus.ore
					},
					production: getResourceProduction(result.nexus),
					storageMax: getMaxStorage(result.nexus),
					lastResourceUpdate: result.nexus.lastResourceUpdate
				});
			} catch (emitErr) {
				logError('nexus_resources_emit_failed', {
					message: (emitErr as Error).message,
					file
				});
			}
		}
		logInfo('vex_pass_claim', {
			userId: authReq.userId,
			level: result.level,
			tracks: result.tracks,
			nexusId,
			delivered: result.delivered,
			wasted: result.wasted
		});
		res.json({
			success: true,
			level: result.level,
			tracks: result.tracks,
			delivered: result.delivered,
			wasted: result.wasted
		});
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file });
		res.status(500).json({ error: 'Internal server error' });
	}
}

// POST /api/battle-pass/claim/:level - claim every track still available for a level
// Body: { nexusId: number }
router.post('/claim/:level', auth, async (req, res: Response) => {
	const raw = req.params.level ?? '';
	const level = /^\d{1,3}$/.test(raw) ? parseInt(raw, 10) : NaN;
	if (!Number.isFinite(level) || level < 1 || level > 50) {
		res.status(400).json({ error: 'Invalid level' });
		return;
	}
	await runClaim(req, res, { kind: 'level', level }, 'battlePass route /claim/:level');
});

// POST /api/battle-pass/claim-cache - claim the next repeatable post-L50 cache
// Body: { nexusId: number }
router.post('/claim-cache', auth, async (req, res: Response) => {
	await runClaim(req, res, { kind: 'cache' }, 'battlePass route /claim-cache');
});

// PATCH /api/battle-pass/title - set active display title
// Body: { title: string | null }
router.patch('/title', authNoGalaxy, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const { title } = req.body as { title?: string | null };

		if (title === null || title === undefined || title === '') {
			// Clear active title
			await prisma.user.update({
				where: { id: authReq.userId },
				data: { activeTitle: null }
			});
			res.json({ success: true, activeTitle: null });
			return;
		}

		if (typeof title !== 'string' || title.length > 32) {
			res.status(400).json({ error: 'Invalid title' });
			return;
		}

		// Verify the player has actually earned this title
		const user = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { earnedTitles: true }
		});
		const earned = (user?.earnedTitles as string[]) ?? [];
		if (!earned.includes(title)) {
			res.status(403).json({ error: 'Title not earned' });
			return;
		}

		await prisma.user.update({
			where: { id: authReq.userId },
			data: { activeTitle: title }
		});
		res.json({ success: true, activeTitle: title });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'battlePass route /title'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/battle-pass/purchase - unlock the paid track for the whole account
router.post('/purchase', authNoGalaxy, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const err = await purchasePaidPass(authReq.userId);
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

// POST /api/battle-pass/gift - spend 1,000 VP to unlock the paid track for another
// player. Account-wide, so no shared galaxy is needed. Body: { username: string }
router.post('/gift', authNoGalaxy, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const { username } = req.body as { username?: string };
		if (!username || typeof username !== 'string') {
			res.status(400).json({ error: 'Username is required' });
			return;
		}
		const result = await giftPaidPass(authReq.userId, username, 'battle_pass');
		if (!result.ok) {
			res.status(result.status).json({ error: result.error });
			return;
		}
		res.json({ success: true, recipientUsername: result.recipientUsername });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'battlePass route /gift'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
