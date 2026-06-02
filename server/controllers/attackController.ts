import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import { serializeAttack } from '../models/Nexus.js';
import * as attackService from '../services/attackService.js';
import type { AuthRequest, TroopKey } from '../types/index.js';
import { logError, logGameEvent } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import { normalizeTroopPayload, parsePositiveInt } from '../utils/validation.js';

const SCHEDULE_TROOP_KEYS: TroopKey[] = [
	'lancerDrone',
	'assaultTrooper',
	'breakerUnit',
	'reconOperative',
	'skimmerBike',
	'siegeMech',
	'bulwarkGuard',
	'suppressorTeam',
	'disruptorUnit',
	'interceptorBike',
	'annihilatorPlatform',
	'voidStalker',
	'plasmaTurret',
	'overseer'
];
// Cap how far ahead and how many waves a player can queue, to bound the table.
const MAX_SCHEDULE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_PENDING_SCHEDULED_PER_USER = 50;

// Controller for handling attack-related endpoints: sending attacks, viewing incoming/outgoing attacks, etc.
export async function sendAttack(req: AuthRequest, res: Response): Promise<void> {
	try {
		const {
			fromNexusId,
			toNexusId,
			troops,
			type = 'attack',
			clientRequestId
		} = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			troops?: unknown;
			type?: string;
			clientRequestId?: unknown;
		};

		const result = await attackService.launchAttack({
			userId: req.userId!,
			galaxyId: req.galaxyId!,
			fromNexusId,
			toNexusId,
			troops,
			type,
			clientRequestId
		});
		if (!result.ok) {
			const payload: Record<string, unknown> = { error: result.error };
			if (result.protectedUntil != null) payload.protectedUntil = result.protectedUntil;
			res.status(result.status).json(payload);
			return;
		}

		const { attack, reused, attackType, defenderOwnerId } = result;

		// Quest / streak progress + first-event telemetry are HTTP-path concerns
		// (a scheduled launch increments them through this same controller is N/A —
		// the job fires launchAttack directly, so we keep these here).
		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			if (!reused)
				void (async () => {
					if (attackType === 'attack') {
						await incrementQuestProgress(req.userId, req.galaxyId, 'attack_1', 1);
						await incrementQuestProgress(req.userId, req.galaxyId, 'attack_3', 1);
					} else if (attackType === 'support') {
						await incrementQuestProgress(req.userId, req.galaxyId, 'support_1', 1);
					}
					await incrementQuestProgress(req.userId, req.galaxyId, 'login', 1);
				})();
		} catch {}
		if (!reused) {
			if (attackType === 'attack')
				logGameEvent('first_attack', req.userId, req.galaxyId, {
					defenderUserId: defenderOwnerId
				});
			else if (attackType === 'scout') logGameEvent('first_scout', req.userId, req.galaxyId);
		}
		res.json({ success: true, attack: serializeAttack(attack) });
	} catch (error) {
		if (error instanceof attackService.InsufficientTroopsError) {
			res.status(400).json({ error: 'Insufficient troops' });
			return;
		}
		if (error instanceof attackService.DuplicateRequestIdError) {
			res.status(409).json({ error: 'Request id already used' });
			return;
		}
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getAllAttacks(req: AuthRequest, res: Response): Promise<void> {
	try {
		if (req.userId == null || req.galaxyId == null) {
			res.status(401).json({ error: 'Not authenticated' });
			return;
		}
		const nexuses = await prisma.nexus.findMany({
			where: { ownerId: req.userId, galaxyId: req.galaxyId },
			select: { id: true }
		});
		const nexusIds = nexuses.map((n) => n.id);
		const { incoming, outgoing } = await attackService.getAllAttacksForUser(nexusIds);

		const allUserIds = [
			...incoming.map((a) => a.attackerUserId),
			...outgoing.map((a) => a.defenderUserId)
		].filter((id): id is number => id != null);
		const userMap = await attackService.getUsersByIds([...new Set(allUserIds)]);

		res.json({
			incoming: incoming.map((a) => {
				const u = a.attackerUserId != null ? userMap.get(a.attackerUserId) : undefined;
				const attackerUsername = u?.username ?? (a.attackerUserId == null ? 'Rogue AI' : undefined);
				return serializeAttack({
					...a,
					attackerUsername,
					attackerIsSupporter: u?.isSupporter,
					attackerSupporterTier: u?.supporterTier,
					attackerAvatarUrl:
						a.attackerUserId != null ? avatarUrl(a.attackerUserId, u?.avatarKey ?? null) : null,
					attackerAvatarUrlSm:
						a.attackerUserId != null ? avatarUrlSm(a.attackerUserId, u?.avatarKey ?? null) : null
				});
			}),
			outgoing: outgoing.map((a) => {
				const u = a.defenderUserId != null ? userMap.get(a.defenderUserId) : undefined;
				return serializeAttack({
					...a,
					defenderUsername: u?.username,
					defenderIsSupporter: u?.isSupporter,
					defenderSupporterTier: u?.supporterTier,
					defenderAvatarUrl:
						a.defenderUserId != null ? avatarUrl(a.defenderUserId, u?.avatarKey ?? null) : null,
					defenderAvatarUrlSm:
						a.defenderUserId != null ? avatarUrlSm(a.defenderUserId, u?.avatarKey ?? null) : null
				});
			})
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getIncomingAttacks(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexus = await attackService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const attacks = await attackService.getIncomingAttacks(nexus.id);
		const attackerIds = [
			...new Set(attacks.map((a) => a.attackerUserId).filter((id): id is number => id != null))
		];
		const userMap = await attackService.getUsersByIds(attackerIds);
		res.json(
			attacks.map((a) => {
				const u = a.attackerUserId != null ? userMap.get(a.attackerUserId) : undefined;
				const attackerUsername = u?.username ?? (a.attackerUserId == null ? 'Rogue AI' : undefined);
				return serializeAttack({
					...a,
					attackerUsername,
					attackerIsSupporter: u?.isSupporter,
					attackerSupporterTier: u?.supporterTier,
					attackerAvatarUrl:
						a.attackerUserId != null ? avatarUrl(a.attackerUserId, u?.avatarKey ?? null) : null,
					attackerAvatarUrlSm:
						a.attackerUserId != null ? avatarUrlSm(a.attackerUserId, u?.avatarKey ?? null) : null
				});
			})
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getOutgoingAttacks(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexus = await attackService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const attacks = await attackService.getOutgoingAttacks(nexus.id);
		const defenderIds = [
			...new Set(attacks.map((a) => a.defenderUserId).filter((id): id is number => id != null))
		];
		const userMap = await attackService.getUsersByIds(defenderIds);
		res.json(
			attacks.map((a) => {
				const u = a.defenderUserId != null ? userMap.get(a.defenderUserId) : undefined;
				return serializeAttack({
					...a,
					defenderUsername: u?.username,
					defenderIsSupporter: u?.isSupporter,
					defenderSupporterTier: u?.supporterTier,
					defenderAvatarUrl:
						a.defenderUserId != null ? avatarUrl(a.defenderUserId, u?.avatarKey ?? null) : null,
					defenderAvatarUrlSm:
						a.defenderUserId != null ? avatarUrlSm(a.defenderUserId, u?.avatarKey ?? null) : null
				});
			})
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

function serializeScheduledAttack(row: {
	id: number;
	fromNexusId: number;
	toNexusId: number;
	troops: unknown;
	type: string;
	launchAt: Date;
	status: string;
	error: string | null;
	createdAt: Date;
}) {
	return {
		id: row.id,
		fromNexusId: row.fromNexusId,
		toNexusId: row.toNexusId,
		troops: (row.troops ?? {}) as Record<string, number>,
		type: row.type,
		launchAt: row.launchAt.toISOString(),
		status: row.status,
		error: row.error,
		createdAt: row.createdAt.toISOString()
	};
}

// POST /attack/schedule — queue a wave to launch server-side at launchAt.
// Validation here is intentionally light (cheap sanity checks); the heavy
// validation (troop availability, protection, etc.) runs at fire time in
// processScheduledAttacks via attackService.launchAttack, because those facts
// can change between scheduling and launch.
export async function scheduleAttack(req: AuthRequest, res: Response): Promise<void> {
	try {
		const {
			fromNexusId,
			toNexusId,
			troops,
			type = 'attack',
			launchAt,
			clientRequestId
		} = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			troops?: unknown;
			type?: string;
			launchAt?: unknown;
			clientRequestId?: unknown;
		};

		const parsedFromNexusId = parsePositiveInt(fromNexusId);
		const parsedToNexusId = parsePositiveInt(toNexusId);
		if (!parsedFromNexusId || !parsedToNexusId) {
			res.status(400).json({ error: 'Invalid nexus IDs' });
			return;
		}
		if (!['attack', 'scout', 'support'].includes(type)) {
			res.status(400).json({ error: 'Unsupported mission type' });
			return;
		}
		const launchMs =
			typeof launchAt === 'string' || typeof launchAt === 'number'
				? new Date(launchAt).getTime()
				: NaN;
		if (!Number.isFinite(launchMs)) {
			res.status(400).json({ error: 'Invalid launch time' });
			return;
		}
		// Allow a small grace window in the past — a launch within ~30s of now is
		// effectively "send now"; the job will fire it on its next tick.
		const now = Date.now();
		if (launchMs > now + MAX_SCHEDULE_AHEAD_MS) {
			res.status(400).json({ error: 'Cannot schedule more than 7 days ahead' });
			return;
		}
		if (launchMs < now - 30_000) {
			res.status(400).json({ error: 'Launch time is in the past' });
			return;
		}

		const normalizedPayload = normalizeTroopPayload(troops, SCHEDULE_TROOP_KEYS);
		if ('error' in normalizedPayload && normalizedPayload.error) {
			res.status(400).json({ error: normalizedPayload.error });
			return;
		}
		const normalizedTroops = (normalizedPayload as { normalized: Record<string, number> })
			.normalized;
		if (Object.values(normalizedTroops).reduce((s, n) => s + n, 0) <= 0) {
			res.status(400).json({ error: 'Select at least one troop' });
			return;
		}

		const normalizedClientRequestId =
			typeof clientRequestId === 'string' && clientRequestId.trim().length > 0
				? clientRequestId.trim()
				: null;
		if (
			normalizedClientRequestId &&
			(normalizedClientRequestId.length > 128 ||
				!/^[A-Za-z0-9:_-]+$/.test(normalizedClientRequestId))
		) {
			res.status(400).json({ error: 'Invalid request id' });
			return;
		}

		// Verify the source nexus is currently the caller's and in their galaxy.
		// (Re-checked at fire time too, but failing fast gives a clean error now.)
		const nexus = await prisma.nexus.findUnique({
			where: { id: parsedFromNexusId },
			select: { ownerId: true, galaxyId: true }
		});
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		const pendingCount = await prisma.scheduledAttack.count({
			where: { userId: req.userId!, status: 'pending' }
		});
		if (pendingCount >= MAX_PENDING_SCHEDULED_PER_USER) {
			res
				.status(409)
				.json({ error: `Limit of ${MAX_PENDING_SCHEDULED_PER_USER} scheduled waves reached` });
			return;
		}

		// Idempotent on clientRequestId so a retried request doesn't double-queue.
		if (normalizedClientRequestId) {
			const existing = await prisma.scheduledAttack.findUnique({
				where: { clientRequestId: normalizedClientRequestId }
			});
			if (existing) {
				res.json({ success: true, scheduled: serializeScheduledAttack(existing) });
				return;
			}
		}

		const row = await prisma.scheduledAttack.create({
			data: {
				galaxyId: req.galaxyId!,
				userId: req.userId!,
				fromNexusId: parsedFromNexusId,
				toNexusId: parsedToNexusId,
				troops: normalizedTroops,
				type: type as any,
				launchAt: new Date(launchMs),
				clientRequestId: normalizedClientRequestId
			}
		});
		res.json({ success: true, scheduled: serializeScheduledAttack(row) });
	} catch (error) {
		if ((error as { code?: string }).code === 'P2002') {
			res.status(409).json({ error: 'Request id already used' });
			return;
		}
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// GET /attack/scheduled — list the caller's pending scheduled waves.
export async function getScheduledAttacks(req: AuthRequest, res: Response): Promise<void> {
	try {
		const rows = await prisma.scheduledAttack.findMany({
			where: { userId: req.userId!, galaxyId: req.galaxyId!, status: 'pending' },
			orderBy: { launchAt: 'asc' }
		});
		res.json({ scheduled: rows.map(serializeScheduledAttack) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// DELETE /attack/scheduled/:id — cancel a pending scheduled wave.
export async function cancelScheduledAttack(req: AuthRequest, res: Response): Promise<void> {
	try {
		const id = parsePositiveInt(req.params.id);
		if (!id) {
			res.status(400).json({ error: 'Invalid id' });
			return;
		}
		// Only flip pending → cancelled, and only for the owner. updateMany returns a
		// count so a race with the job (which moves the row to launched) is a no-op.
		const updated = await prisma.scheduledAttack.updateMany({
			where: { id, userId: req.userId!, status: 'pending' },
			data: { status: 'cancelled', processedAt: new Date() }
		});
		if (updated.count === 0) {
			res.status(404).json({ error: 'Scheduled wave not found or already launched' });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'attackController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
