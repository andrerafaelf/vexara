import type { AttackType } from '@prisma/client';
import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import { serializeAttack } from '../models/Nexus.js';
import * as attackService from '../services/attackService.js';
import { type AuthRequest, TROOP_KEYS } from '../types/index.js';
import { logError, logGameEventOnce } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import {
	normalizeTroopPayload,
	parsePositiveInt,
	validateOverseerAttackCap
} from '../utils/validation.js';

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
			clientRequestId,
			wavePlanId,
			warOperationSlotId
		} = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			troops?: unknown;
			type?: string;
			clientRequestId?: unknown;
			wavePlanId?: unknown;
			warOperationSlotId?: unknown;
		};

		const result = await attackService.launchAttack({
			userId: req.userId!,
			galaxyId: req.galaxyId!,
			fromNexusId,
			toNexusId,
			troops,
			type,
			clientRequestId,
			// Coordinated Assault PR1 — both are mutually exclusive and validated
			// inside launchAttack against the caller's identity + target.
			wavePlanId: parsePositiveInt(wavePlanId),
			warOperationSlotId: parsePositiveInt(warOperationSlotId)
		});
		if (!result.ok) {
			const payload: Record<string, unknown> = { error: result.error };
			if (result.protectedUntil != null) payload.protectedUntil = result.protectedUntil;
			res.status(result.status).json(payload);
			return;
		}

		const { attack, reused, attackType, defenderOwnerId } = result;

		// Quest / streak progress is recorded inside launchAttack so scheduled
		// waves and send-now strikes count through the same shared path.
		// True funnel milestones: logGameEventOnce dedups on userId+event so these
		// fire only on the user's first-ever attack / scout, not every strike.
		if (!reused) {
			if (attackType === 'attack')
				logGameEventOnce('first_attack', req.userId, req.galaxyId, {
					defenderUserId: defenderOwnerId
				});
			else if (attackType === 'scout') logGameEventOnce('first_scout', req.userId, req.galaxyId);
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
		if (!nexus || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const isOwner = nexus.ownerId === req.userId;
		// Allies (active nap/trade/vassal treaty partners) can view incoming attacks
		// on allied nexuses so they can coordinate defense. Broken NAPs are excluded
		// by isAllyOfNexusOwner (status='active' check).
		const isAlly =
			!isOwner && nexus.ownerId != null
				? await attackService.isAllyOfNexusOwner(req.userId, nexus.ownerId, req.galaxyId)
				: false;
		if (!isOwner && !isAlly) {
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
	wavePlanId: number | null;
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
		createdAt: row.createdAt.toISOString(),
		wavePlanId: row.wavePlanId
	};
}

/**
 * Coordinated Assault PR1 — solo coordination grouping.
 *
 * If the caller passes a wavePlanId hint, validate it belongs to this user +
 * galaxy + target and reuse it. Returns 'invalid' if the hint is bad so the
 * caller surfaces 400 (silent fallback would hide client bugs).
 *
 * If no hint, find the user's most recent reusable plan for this target —
 * defined as "has a pending ScheduledAttack or an unresolved Attack against
 * this target." Session boundary is implicit: once all the previous plan's
 * waves are done, the next schedule starts a fresh plan.
 */
async function resolveOrCreateWavePlan(params: {
	userId: number;
	galaxyId: number;
	targetNexusId: number;
	hintWavePlanId: unknown;
}): Promise<number | 'invalid'> {
	const { userId, galaxyId, targetNexusId, hintWavePlanId } = params;
	const hint = parsePositiveInt(hintWavePlanId);
	if (hintWavePlanId != null && hintWavePlanId !== '' && !hint) return 'invalid';
	if (hint) {
		const existing = await prisma.wavePlan.findUnique({ where: { id: hint } });
		if (
			!existing ||
			existing.userId !== userId ||
			existing.galaxyId !== galaxyId ||
			existing.targetNexusId !== targetNexusId
		) {
			return 'invalid';
		}
		return existing.id;
	}

	const reusable = await prisma.wavePlan.findFirst({
		where: {
			userId,
			galaxyId,
			targetNexusId,
			OR: [
				{ scheduledAttacks: { some: { status: 'pending' } } },
				{ attacks: { some: { status: { in: ['traveling', 'returning'] } } } }
			]
		},
		orderBy: { createdAt: 'desc' },
		select: { id: true }
	});
	if (reusable) return reusable.id;

	const created = await prisma.wavePlan.create({
		data: { userId, galaxyId, targetNexusId },
		select: { id: true }
	});
	return created.id;
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
			clientRequestId,
			wavePlanId
		} = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			troops?: unknown;
			type?: string;
			launchAt?: unknown;
			clientRequestId?: unknown;
			wavePlanId?: unknown;
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

		const normalizedPayload = normalizeTroopPayload(troops, TROOP_KEYS);
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
		const overseerCheck = validateOverseerAttackCap(type, normalizedTroops);
		if (!overseerCheck.ok) {
			res.status(400).json({ error: overseerCheck.error });
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

		// Resolve coordination (Coordinated Assault PR1). Only stamped on attack
		// missions — scouts and supports are not part of the merge model (one
		// Recon mission, one support transfer per send).
		const resolvedWavePlanId =
			type === 'attack'
				? await resolveOrCreateWavePlan({
						userId: req.userId!,
						galaxyId: req.galaxyId!,
						targetNexusId: parsedToNexusId,
						hintWavePlanId: wavePlanId
					})
				: null;
		if (type === 'attack' && resolvedWavePlanId === 'invalid') {
			res.status(400).json({ error: 'Invalid wavePlanId' });
			return;
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
				clientRequestId: normalizedClientRequestId,
				wavePlanId: resolvedWavePlanId === 'invalid' ? null : resolvedWavePlanId
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

		// Resolve source/target nexus metadata in a single batched lookup so the
		// dashboard "Outgoing Strikes" card can render scheduled waves with the
		// same shape it uses for active strikes (origin name, target name + coords)
		// and a precomputed estimatedArrivesAt. Without this the client would
		// either need a second round-trip per row or its own (drift-prone) copy
		// of the travel formula.
		const nexusIds = new Set<number>();
		for (const row of rows) {
			nexusIds.add(row.fromNexusId);
			nexusIds.add(row.toNexusId);
		}
		const nexusList =
			nexusIds.size > 0
				? await prisma.nexus.findMany({
						where: { id: { in: Array.from(nexusIds) } },
						select: {
							id: true,
							name: true,
							x: true,
							y: true,
							nexusType: true,
							nexusTypeDoubled: true
						}
					})
				: [];
		const nexusById = new Map(nexusList.map((n) => [n.id, n]));

		const enriched = (rows as Parameters<typeof serializeScheduledAttack>[0][]).map((row) => {
			const base = serializeScheduledAttack(row);
			const from = nexusById.get(row.fromNexusId);
			const to = nexusById.get(row.toNexusId);
			let estimatedArrivesAt: string | null = null;
			if (from && to) {
				const minutes = attackService.computeTravelMinutes(
					from,
					to,
					base.troops,
					row.type as AttackType
				);
				estimatedArrivesAt = new Date(row.launchAt.getTime() + minutes * 60 * 1000).toISOString();
			}
			return {
				...base,
				fromNexusName: from?.name ?? null,
				toNexusName: to?.name ?? null,
				toX: to?.x ?? null,
				toY: to?.y ?? null,
				estimatedArrivesAt
			};
		});

		res.json({ scheduled: enriched });
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
