// Participant-only replay endpoint. Authentication is required and the
// requesting user must be either the attacker or the defender in the battle.
// activeGalaxyOptional is set so users who have since changed active galaxy
// (or whose galaxy has ended) can still view their own historical replays.
// Non-participants receive 404 so existence of the record is not confirmed.

import { Router, type Request, type Response, type NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

function authNoGalaxy(req: Request, res: Response, next: NextFunction): void {
	(req as AuthRequest).activeGalaxyOptional = true;
	void auth(req, res, next);
}

router.get('/replay/:attackId', authNoGalaxy, async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const attackId = parseInt(req.params.attackId);
		if (!Number.isFinite(attackId) || attackId <= 0) {
			res.status(400).json({ error: 'Invalid attack id' });
			return;
		}

		const attack = await prisma.attack.findUnique({
			where: { id: attackId },
			select: {
				id: true,
				type: true,
				status: true,
				troops: true,
				result: true,
				attackerUserId: true,
				defenderUserId: true,
				attackerNexus: {
					select: { name: true, x: true, y: true, owner: { select: { username: true } } }
				},
				defenderNexus: {
					select: { name: true, x: true, y: true, owner: { select: { username: true } } }
				},
				createdAt: true,
				arrivesAt: true
			}
		});

		if (!attack) {
			res.status(404).json({ error: 'Replay not found' });
			return;
		}

		// Participant gate: only the attacker or defender may view the replay.
		// Non-participants get 404 so they cannot confirm the record exists.
		const isParticipant =
			(attack.attackerUserId !== null && attack.attackerUserId === authReq.userId) ||
			(attack.defenderUserId !== null && attack.defenderUserId === authReq.userId);

		if (!isParticipant) {
			res.status(404).json({ error: 'Replay not found' });
			return;
		}

		if (attack.status === 'traveling') {
			res.status(425).json({ error: 'Battle not yet resolved' });
			return;
		}
		if (attack.type === 'support') {
			res.status(404).json({ error: 'No replay for support missions' });
			return;
		}

		const result = (attack.result || {}) as Record<string, unknown>;
		const payload = {
			id: String(attack.id),
			type: attack.type,
			attacker: {
				username: attack.attackerNexus?.owner?.username ?? null,
				nexusName: attack.attackerNexus?.name ?? null,
				x: attack.attackerNexus?.x ?? null,
				y: attack.attackerNexus?.y ?? null
			},
			defender: {
				username: attack.defenderNexus?.owner?.username ?? null,
				nexusName: attack.defenderNexus?.name ?? null,
				x: attack.defenderNexus?.x ?? null,
				y: attack.defenderNexus?.y ?? null
			},
			attackerInitial: (result.attackerInitial as object) ?? attack.troops,
			defenderInitial: (result.defenderInitial as object) ?? {},
			attackerLosses: result.attackerLosses ?? {},
			defenderLosses: result.defenderLosses ?? {},
			attackerPower: result.attackerPower ?? null,
			defenderPower: result.defenderPower ?? null,
			victory: !!result.victory,
			conquered: !!result.conquered,
			resourcesStolen: result.resourcesStolen ?? { biomass: 0, alloy: 0, ore: 0 },
			buildingDamage: result.buildingDamage ?? null,
			mission: result.mission ?? null,
			intel: result.intel ?? null,
			combatSeed:
				typeof result.combatSeed === 'number' ? result.combatSeed : attack.id * 2654435761,
			createdAt: attack.createdAt.toISOString(),
			arrivesAt: attack.arrivesAt?.toISOString() ?? null
		};

		// Replays are immutable once resolved. Cache privately so the browser
		// avoids redundant fetches but CDNs/proxies cannot serve one user's
		// authenticated response to another user.
		res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
		res.json(payload);
	} catch {
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
