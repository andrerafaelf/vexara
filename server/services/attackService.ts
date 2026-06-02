import type { AttackType } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { applyQuestRewards } from '../models/Nexus.js';
import type { TroopKey } from '../types/index.js';
import { TROOP_STATS } from '../utils/combatMath.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { isStationableTroop } from '../utils/gameConstants.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { normalizeTroopPayload, parsePositiveInt } from '../utils/validation.js';

export class InsufficientTroopsError extends Error {
	constructor() {
		super('Insufficient troops');
	}
}

export class DuplicateRequestIdError extends Error {
	constructor() {
		super('Request id already used');
	}
}

const TROOP_KEYS: TroopKey[] = [
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
const SUPPORTED_ATTACK_TYPES = new Set<AttackType>(['attack', 'scout', 'support']);

export interface LaunchAttackInput {
	userId: number;
	galaxyId: number;
	fromNexusId: unknown;
	toNexusId: unknown;
	troops: unknown;
	type?: string;
	clientRequestId?: unknown;
}

export interface LaunchAttackError {
	ok: false;
	status: number;
	error: string;
	protectedUntil?: Date | string | null;
}

export interface LaunchAttackSuccess {
	ok: true;
	attack: Awaited<ReturnType<typeof prisma.attack.create>>;
	reused: boolean;
	attackType: AttackType;
	travelTimeMinutes: number;
	defenderOwnerId: number | null;
	defenderName: string;
}

export type LaunchAttackResult = LaunchAttackError | LaunchAttackSuccess;

/**
 * Single source of truth for launching an attack/scout/support. Performs ALL
 * validation (ownership, galaxy, newbie protection, troop availability, mission
 * rules), computes travel time, and atomically creates the Attack while
 * deducting troops. Used both by the synchronous HTTP handler
 * (attackController.sendAttack) and the background scheduled-wave processor
 * (processScheduledAttacks). Validation deliberately runs at call time, not at
 * schedule time, because troop counts / ownership / protection can change before
 * a scheduled launch fires.
 *
 * Returns a discriminated result rather than throwing for expected validation
 * failures; only unexpected errors (DB, etc.) propagate.
 */
export async function launchAttack(input: LaunchAttackInput): Promise<LaunchAttackResult> {
	const { userId, galaxyId } = input;
	const parsedFromNexusId = parsePositiveInt(input.fromNexusId);
	const parsedToNexusId = parsePositiveInt(input.toNexusId);
	if (!parsedFromNexusId || !parsedToNexusId) {
		return { ok: false, status: 400, error: 'Invalid nexus IDs' };
	}
	const rawType = input.type ?? 'attack';
	if (!SUPPORTED_ATTACK_TYPES.has(rawType as AttackType)) {
		return { ok: false, status: 400, error: 'Unsupported mission type' };
	}
	const attackType = rawType as AttackType;

	const normalizedClientRequestId =
		typeof input.clientRequestId === 'string' && input.clientRequestId.trim().length > 0
			? input.clientRequestId.trim()
			: null;
	if (
		normalizedClientRequestId &&
		(normalizedClientRequestId.length > 128 ||
			!/^[A-Za-z0-9:_-]+$/.test(normalizedClientRequestId))
	) {
		return { ok: false, status: 400, error: 'Invalid request id' };
	}

	const normalizedPayload = normalizeTroopPayload(input.troops, TROOP_KEYS);
	if ('error' in normalizedPayload && normalizedPayload.error) {
		return { ok: false, status: 400, error: normalizedPayload.error };
	}
	const normalizedTroops = (normalizedPayload as { normalized: Record<string, number> }).normalized;

	const [attackerNexus, defenderNexus] = await Promise.all([
		getNexusById(parsedFromNexusId),
		getNexusById(parsedToNexusId)
	]);
	if (!attackerNexus || attackerNexus.ownerId !== userId || attackerNexus.galaxyId !== galaxyId) {
		return { ok: false, status: 403, error: 'Not authorized' };
	}
	if (!defenderNexus) {
		return { ok: false, status: 404, error: 'Target nexus not found' };
	}
	if (defenderNexus.galaxyId !== galaxyId) {
		return { ok: false, status: 400, error: 'Cannot attack a nexus in a different galaxy' };
	}
	if (defenderNexus.ownerId && defenderNexus.ownerId === userId) {
		return { ok: false, status: 400, error: 'Cannot attack your own nexus' };
	}
	if (
		defenderNexus.newbieProtectionEndsAt &&
		new Date(defenderNexus.newbieProtectionEndsAt) > new Date()
	) {
		return {
			ok: false,
			status: 403,
			error: 'This nexus is under newbie protection and cannot be attacked yet',
			protectedUntil: defenderNexus.newbieProtectionEndsAt
		};
	}

	// A still-protected attacker may only act offensively against NPC / unowned
	// nexuses — they cannot attack or scout other PLAYERS while sheltered.
	if (
		(attackType === 'attack' || attackType === 'scout') &&
		defenderNexus.ownerId != null &&
		attackerNexus.newbieProtectionEndsAt &&
		new Date(attackerNexus.newbieProtectionEndsAt) > new Date()
	) {
		return {
			ok: false,
			status: 403,
			error: 'While under newbie protection you can only attack NPC nexuses, not other players.',
			protectedUntil: attackerNexus.newbieProtectionEndsAt
		};
	}

	const totalTroopsRequested = Object.values(normalizedTroops).reduce((sum, a) => sum + a, 0);
	if (totalTroopsRequested <= 0) {
		return { ok: false, status: 400, error: 'Select at least one troop' };
	}
	if ((normalizedTroops.plasmaTurret || 0) > 0) {
		return {
			ok: false,
			status: 400,
			error:
				'Plasma Turrets are stationary emplacements — they only defend the nexus that built them and cannot be sent on attacks, scouts, or support.'
		};
	}

	if (attackType === 'scout') {
		const reconOperatives = normalizedTroops.reconOperative || 0;
		const nonScout = TROOP_KEYS.filter((t) => t !== 'reconOperative').some(
			(t) => normalizedTroops[t] > 0
		);
		if (reconOperatives <= 0 || nonScout) {
			return { ok: false, status: 400, error: 'Scout missions require Recon Operatives only' };
		}
	}
	if (attackType === 'support') {
		if (defenderNexus.ownerId === userId) {
			return {
				ok: false,
				status: 400,
				error: 'Use troop transfer to move troops between your own nexuses'
			};
		}
		if (defenderNexus.ownerId) {
			const [sameFaction, areFriends] = await Promise.all([
				prisma.factionMember
					.findFirst({
						where: { galaxyId, userId: { in: [userId, defenderNexus.ownerId] } }
					})
					.then(async (m1) => {
						if (!m1) return false;
						const m2 = await prisma.factionMember.findFirst({
							where: {
								galaxyId,
								userId: m1.userId === userId ? defenderNexus.ownerId! : userId
							}
						});
						return !!(m1 && m2 && m1.factionId === (m2 as any)?.factionId);
					}),
				prisma.friendship
					.findFirst({
						where: {
							OR: [
								{ userAId: userId, userBId: defenderNexus.ownerId! },
								{ userAId: defenderNexus.ownerId!, userBId: userId }
							]
						}
					})
					.then(Boolean)
			]);
			if (!sameFaction && !areFriends) {
				return {
					ok: false,
					status: 403,
					error: 'Support missions can only be sent to faction members or friends'
				};
			}
		} else {
			return { ok: false, status: 400, error: 'Cannot send support to an unowned nexus' };
		}
		// Support reinforces a defense, so only defensive (stationable) units are
		// allowed. Reject any offensive/overseer/recon/turret troop in the payload.
		const offending = Object.keys(normalizedTroops).find(
			(t) => (normalizedTroops[t] || 0) > 0 && !isStationableTroop(t)
		);
		if (offending) {
			return {
				ok: false,
				status: 400,
				error: 'Support missions can only carry defensive units (no offensive troops or Overseers).'
			};
		}
	}
	if (attackType !== 'support' && (normalizedTroops.overseer || 0) > 1) {
		return { ok: false, status: 400, error: 'Maximum 1 Overseer per strike' };
	}

	const attackerRecord = attackerNexus as unknown as Record<string, number>;
	for (const [troopType, amount] of Object.entries(normalizedTroops)) {
		if ((attackerRecord[troopType] || 0) < amount) {
			return { ok: false, status: 400, error: `Insufficient ${troopType}` };
		}
	}

	const distance = Math.sqrt(
		Math.pow(defenderNexus.x - attackerNexus.x, 2) +
			Math.pow(defenderNexus.y - attackerNexus.y, 2)
	);
	const baseTravel =
		NEXUS_TYPE_BONUSES[(attackerNexus as unknown as { nexusType?: string | null }).nexusType ?? '']
			?.travelTimeMultiplier ?? 1;
	const nexusDoubledForTravel =
		(attackerNexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
	const travelSpeedMultiplier =
		baseTravel === 1 ? 1 : nexusDoubledForTravel ? Math.pow(baseTravel, 2) : baseTravel;
	let travelTimeMinutes: number;
	if (attackType === 'scout') {
		travelTimeMinutes = distance * 4 * travelSpeedMultiplier;
	} else {
		const OVERSEER_EFFECTIVE_SPEED = 6;
		const OVERSEER_TRAVEL_MULTIPLIER = 3;
		let minSpeed = Infinity;
		for (const [troopType, amount] of Object.entries(normalizedTroops)) {
			if (amount > 0 && (TROOP_STATS as Record<string, { speed: number }>)[troopType]) {
				const speed =
					troopType === 'overseer'
						? OVERSEER_EFFECTIVE_SPEED
						: (TROOP_STATS as Record<string, { speed: number }>)[troopType].speed;
				if (speed < minSpeed) minSpeed = speed;
			}
		}
		const hasOverseer = (normalizedTroops.overseer || 0) > 0;
		travelTimeMinutes =
			distance *
			(4 + (28 - minSpeed) / 10) *
			(hasOverseer ? OVERSEER_TRAVEL_MULTIPLIER : 1) *
			travelSpeedMultiplier;
	}
	const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

	const { attack, updatedAttackerNexus, reused } = await createAttackAndDeductTroops(
		{
			galaxyId,
			attackerUserId: userId,
			attackerNexusId: parsedFromNexusId,
			defenderUserId: defenderNexus.ownerId ?? null,
			defenderNexusId: parsedToNexusId,
			troops: normalizedTroops,
			arrivesAt,
			type: attackType,
			clientRequestId: normalizedClientRequestId
		} as Parameters<typeof prisma.attack.create>[0]['data'],
		attackerNexus.id,
		normalizedTroops
	);
	if (!reused) await applyQuestRewards(updatedAttackerNexus, { hasOutgoingStrike: true });

	// Notify the defender immediately that an attack is inbound (scouts excluded).
	if (!reused && defenderNexus.ownerId && attackType === 'attack') {
		const etaMinutes = Math.round(travelTimeMinutes);
		const etaStr =
			etaMinutes < 60 ? `${etaMinutes}m` : `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;
		void sendPushToUser(defenderNexus.ownerId, NOTIF.ATTACK_INCOMING, {
			title: '⚠️ Incoming Attack',
			body: `A strike is heading for ${defenderNexus.name}. ETA: ${etaStr}.`,
			tag: `incoming-${attack.id}`,
			data: { url: '/' }
		});
	}

	return {
		ok: true,
		attack,
		reused,
		attackType,
		travelTimeMinutes,
		defenderOwnerId: defenderNexus.ownerId ?? null,
		defenderName: defenderNexus.name
	};
}

function isSameAttackRequest(
	existing: { attackerUserId: number | null; attackerNexusId: number; defenderNexusId: number },
	attackData: {
		attackerUserId?: number | null;
		attackerNexusId?: number;
		defenderNexusId?: number;
	}
) {
	return (
		existing.attackerUserId === attackData.attackerUserId &&
		existing.attackerNexusId === attackData.attackerNexusId &&
		existing.defenderNexusId === attackData.defenderNexusId
	);
}

export function getNexusById(id: number) {
	return prisma.nexus.findUnique({ where: { id } });
}

export function getUserById(id: number) {
	return prisma.user.findUnique({
		where: { id },
		select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true }
	});
}

export async function getUsersByIds(
	ids: number[]
): Promise<
	Map<
		number,
		{
			username: string;
			isSupporter: boolean;
			supporterTier: string | null;
			avatarKey: string | null;
		}
	>
> {
	if (ids.length === 0) return new Map();
	const users = await prisma.user.findMany({
		where: { id: { in: ids } },
		select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true }
	});
	return new Map(
		users.map((u) => [
			u.id,
			{
				username: u.username,
				isSupporter: u.isSupporter,
				supporterTier: u.supporterTier,
				avatarKey: u.avatarKey
			}
		])
	);
}

export async function createAttackAndDeductTroops(
	attackData: Parameters<typeof prisma.attack.create>[0]['data'],
	nexusId: number,
	requestedTroops: Record<string, number>
) {
	try {
		return await prisma.$transaction(async (tx) => {
			const clientRequestId = (attackData as { clientRequestId?: string | null }).clientRequestId;
			if (clientRequestId) {
				const existing = await tx.attack.findUnique({ where: { clientRequestId } as any });
				if (existing) {
					if (!isSameAttackRequest(existing, attackData as any))
						throw new DuplicateRequestIdError();
					const nexus = await tx.nexus.findUnique({ where: { id: nexusId } });
					if (!nexus) throw new InsufficientTroopsError();
					return { attack: existing, updatedAttackerNexus: nexus, reused: true };
				}
			}

			const decrementData: Record<string, { decrement: number }> = {};
			const availabilityWhere: Record<string, { gte: number }> = {};
			for (const [troopType, amount] of Object.entries(requestedTroops)) {
				if (amount <= 0) continue;
				decrementData[troopType] = { decrement: amount };
				availabilityWhere[troopType] = { gte: amount };
			}

			const attack = await tx.attack.create({ data: attackData });
			const updated = await tx.nexus.updateMany({
				where: { id: nexusId, ...availabilityWhere },
				data: decrementData
			});
			if (updated.count !== 1) throw new InsufficientTroopsError();

			const updatedAttackerNexus = await tx.nexus.findUnique({ where: { id: nexusId } });
			if (!updatedAttackerNexus) throw new InsufficientTroopsError();
			return { attack, updatedAttackerNexus, reused: false };
		});
	} catch (err) {
		const clientRequestId = (attackData as { clientRequestId?: string | null }).clientRequestId;
		if ((err as { code?: string }).code === 'P2002' && clientRequestId) {
			const [existing, nexus] = await Promise.all([
				prisma.attack.findUnique({ where: { clientRequestId } as any }),
				prisma.nexus.findUnique({ where: { id: nexusId } })
			]);
			if (existing && nexus) {
				if (!isSameAttackRequest(existing, attackData as any)) throw new DuplicateRequestIdError();
				return { attack: existing, updatedAttackerNexus: nexus, reused: true };
			}
		}
		throw err;
	}
}

export function getIncomingAttacks(nexusId: number) {
	return prisma.attack.findMany({
		where: { defenderNexusId: nexusId, status: 'traveling' },
		include: { attackerNexus: { select: { id: true, name: true, x: true, y: true } } }
	});
}

export function getOutgoingAttacks(nexusId: number) {
	return prisma.attack.findMany({
		where: { attackerNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
		include: { defenderNexus: { select: { id: true, name: true, x: true, y: true } } }
	});
}

export function getAllAttacksForUser(nexusIds: number[]) {
	if (nexusIds.length === 0) return Promise.resolve({ incoming: [], outgoing: [] });
	return Promise.all([
		prisma.attack.findMany({
			where: {
				defenderNexusId: { in: nexusIds },
				status: 'traveling',
				type: { in: ['attack', 'scout'] }
			},
			include: {
				attackerNexus: { select: { id: true, name: true, x: true, y: true } },
				defenderNexus: { select: { id: true, name: true, x: true, y: true } }
			}
		}),
		prisma.attack.findMany({
			where: { attackerNexusId: { in: nexusIds }, status: { in: ['traveling', 'returning'] } },
			include: {
				attackerNexus: { select: { id: true, name: true, x: true, y: true } },
				defenderNexus: { select: { id: true, name: true, x: true, y: true } }
			}
		})
	]).then(([incoming, outgoing]) => ({ incoming, outgoing }));
}

/**
 * Background job: launch any scheduled waves whose launchAt has passed.
 * Wired in server.ts under JOB_LOCKS.processScheduledAttacks (10s interval).
 *
 * The advisory lock already serializes this across replicas, but we still claim
 * each row (stamp processedAt) before launching so a row is never launched twice,
 * and we forward the row's clientRequestId to launchAttack so the created Attack
 * itself is idempotent. A failed launch (e.g. troops were spent, target now
 * protected, nexus lost) marks the row `failed` with the reason rather than
 * retrying forever.
 */
export async function processScheduledAttacks(): Promise<void> {
	const due = await prisma.scheduledAttack.findMany({
		where: { status: 'pending', launchAt: { lte: new Date() } },
		orderBy: { launchAt: 'asc' },
		take: 100
	});
	if (due.length === 0) return;

	for (const row of due) {
		// Claim this row so a concurrent pass (or the cancel endpoint) can't also act
		// on it. If the claim updates 0 rows it was already handled/cancelled — skip.
		const claim = await prisma.scheduledAttack.updateMany({
			where: { id: row.id, status: 'pending' },
			data: { processedAt: new Date() }
		});
		if (claim.count === 0) continue;

		try {
			const result = await launchAttack({
				userId: row.userId,
				galaxyId: row.galaxyId,
				fromNexusId: row.fromNexusId,
				toNexusId: row.toNexusId,
				troops: row.troops,
				type: row.type,
				// Reuse the schedule's requestId so a crash mid-launch can't double-send.
				clientRequestId: row.clientRequestId ?? `sched:${row.id}`
			});
			if (result.ok) {
				await prisma.scheduledAttack.update({
					where: { id: row.id },
					data: { status: 'launched', processedAt: new Date() }
				});
			} else {
				await prisma.scheduledAttack.update({
					where: { id: row.id },
					data: { status: 'failed', error: result.error.slice(0, 256), processedAt: new Date() }
				});
			}
		} catch (err) {
			const message =
				err instanceof InsufficientTroopsError
					? 'Insufficient troops at launch time'
					: err instanceof DuplicateRequestIdError
						? 'Already launched'
						: (err as Error).message || 'Launch failed';
			await prisma.scheduledAttack.update({
				where: { id: row.id },
				data: { status: 'failed', error: message.slice(0, 256), processedAt: new Date() }
			});
		}
	}
}
