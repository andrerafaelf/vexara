import type { AttackType } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { applyQuestRewards } from '../models/Nexus.js';
import { incrementQuestProgress } from './dailyStreakService.js';
import { TROOP_KEYS } from '../types/index.js';
import { TROOP_STATS } from '../utils/combatMath.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import {
	canStationTroop,
	NAP_BREAK_NOTICE_MS,
	STANDING_ORDER_MIN_TRIGGER_UNITS
} from '../utils/gameConstants.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import {
	normalizeTroopPayload,
	parsePositiveInt,
	validateOverseerAttackCap
} from '../utils/validation.js';

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

const SUPPORTED_ATTACK_TYPES = new Set<AttackType>(['attack', 'scout', 'support']);

interface TravelSourceNexus {
	x: number;
	y: number;
	nexusType?: string | null;
	nexusTypeDoubled?: boolean | null;
}

interface TravelTargetNexus {
	x: number;
	y: number;
}

/**
 * Pure travel-time formula. Extracted from launchAttack so callers that need
 * a projected arrival time (e.g. listing scheduled waves) can use the exact
 * same math the server uses at fire time. Must stay in lockstep with the
 * inline calculation inside launchAttack and with client/utils/travel.ts.
 */
export function computeTravelMinutes(
	source: TravelSourceNexus,
	target: TravelTargetNexus,
	troops: Record<string, number>,
	attackType: AttackType
): number {
	const distance = Math.sqrt(
		Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2)
	);
	const baseTravel = NEXUS_TYPE_BONUSES[source.nexusType ?? '']?.travelTimeMultiplier ?? 1;
	const travelSpeedMultiplier =
		baseTravel === 1
			? 1
			: source.nexusTypeDoubled
				? Math.pow(baseTravel, 2)
				: baseTravel;
	// Scouts no longer use a flat-rate path; a scout mission is pure Recon
	// Operative (enforced by hasOnlyRecon), so the standard speed-based formula
	// naturally resolves to Recon's speed (50) — the fastest mission in the game.
	const OVERSEER_EFFECTIVE_SPEED = 6;
	const OVERSEER_TRAVEL_MULTIPLIER = 3;
	let minSpeed = Infinity;
	for (const [troopType, amount] of Object.entries(troops)) {
		if (amount > 0 && (TROOP_STATS as Record<string, { speed: number }>)[troopType]) {
			const speed =
				troopType === 'overseer'
					? OVERSEER_EFFECTIVE_SPEED
					: (TROOP_STATS as Record<string, { speed: number }>)[troopType].speed;
			if (speed < minSpeed) minSpeed = speed;
		}
	}
	if (!isFinite(minSpeed)) return 0;
	const hasOverseer = (troops.overseer || 0) > 0;
	return (
		distance *
		(4 + (28 - minSpeed) / 10) *
		(hasOverseer ? OVERSEER_TRAVEL_MULTIPLIER : 1) *
		travelSpeedMultiplier
	);
}

export interface LaunchAttackInput {
	userId: number;
	galaxyId: number;
	fromNexusId: unknown;
	toNexusId: unknown;
	troops: unknown;
	type?: string;
	clientRequestId?: unknown;
	// Coordinated Assault PR1 pointers (mutually exclusive — enforced by the DB
	// check constraint attack_one_coordination). PR2 reads these in the resolver
	// to merge same-coordination waves into one combat; PR1 only writes them.
	wavePlanId?: number | null;
	warOperationSlotId?: number | null;
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

	// NAP enforcement gate. Applies to attack missions against owned defenders only.
	// Scout and support are intentionally exempt: blocking scouts would give NAPs
	// free intel blackout (contradicts shared-vision design); blocking support would
	// prevent a player from reinforcing an allied partner.
	// Gate at launch only, never at resolution - attacks in flight before a NAP
	// was signed must still land. See DIPLOMACY_BALANCE.md section 1.
	if (attackType === 'attack' && defenderNexus.ownerId != null) {
		const [attackerMember, defenderMember] = await Promise.all([
			prisma.factionMember.findFirst({ where: { galaxyId, userId } }),
			prisma.factionMember.findFirst({ where: { galaxyId, userId: defenderNexus.ownerId } })
		]);
		// Both parties must be in factions (and different ones) for a NAP to apply.
		if (
			attackerMember &&
			defenderMember &&
			attackerMember.factionId !== defenderMember.factionId
		) {
			const now = new Date();
			const blockingTreaty = await prisma.factionTreaty.findFirst({
				where: {
					galaxyId,
					type: 'nap',
					OR: [
						// Active NAP - always blocks.
						{
							status: 'active',
							OR: [
								{
									proposerFactionId: attackerMember.factionId,
									targetFactionId: defenderMember.factionId
								},
								{
									proposerFactionId: defenderMember.factionId,
									targetFactionId: attackerMember.factionId
								}
							]
						},
						// Broken NAP still inside the betrayal window - still blocks.
						{
							status: 'broken',
							betrayalEndsAt: { gt: now },
							OR: [
								{
									proposerFactionId: attackerMember.factionId,
									targetFactionId: defenderMember.factionId
								},
								{
									proposerFactionId: defenderMember.factionId,
									targetFactionId: attackerMember.factionId
								}
							]
						}
					]
				},
				select: { id: true, status: true, betrayalEndsAt: true }
			});
			if (blockingTreaty) {
				return {
					ok: false,
					status: 403,
					error: 'A Non-Aggression Pact blocks this attack. Break the pact to declare war.',
					protectedUntil: blockingTreaty.betrayalEndsAt ?? null
				};
			}
		}
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
		// Support reinforces a defense, but ANY combat troop may be sent - offensive
		// units defend poorly yet still contribute, so we let players choose. Only
		// the non-deployables (Overseer, Plasma Turret, Recon) are rejected.
		const offending = Object.keys(normalizedTroops).find(
			(t) => (normalizedTroops[t] || 0) > 0 && !canStationTroop(t)
		);
		if (offending) {
			return {
				ok: false,
				status: 400,
				error: 'Support cannot carry Overseers, Plasma Turrets, or Recon Operatives.'
			};
		}
	}
	const overseerCheck = validateOverseerAttackCap(attackType, normalizedTroops);
	if (!overseerCheck.ok) {
		return { ok: false, status: 400, error: overseerCheck.error };
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
	// All missions (including scout) use the speed-based formula. A scout is pure
	// Recon Operative, so minSpeed resolves to 50 → the fastest mission in the game.
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
	const travelTimeMinutes =
		distance *
		(4 + (28 - minSpeed) / 10) *
		(hasOverseer ? OVERSEER_TRAVEL_MULTIPLIER : 1) *
		travelSpeedMultiplier;
	const galaxyForSpeed = await prisma.galaxy.findUnique({
		where: { id: galaxyId },
		select: { speedMultiplier: true }
	});
	const galaxySpeedMultiplier = galaxyForSpeed?.speedMultiplier ?? 1.0;
	const arrivesAt = new Date(Date.now() + (travelTimeMinutes * 60 * 1000) / galaxySpeedMultiplier);

	// Coordinated Assault PR1: resolve coordination pointers. Mutually exclusive
	// and only meaningful for attack-type missions. Validated against the
	// caller's identity and target so a stale/wrong hint can't poison the row —
	// the DB check constraint backs this up but we'd rather 400 than CHECK fail.
	const coordination = await resolveCoordinationPointers({
		attackType,
		userId,
		galaxyId,
		targetNexusId: parsedToNexusId,
		sourceNexusId: parsedFromNexusId,
		wavePlanId: input.wavePlanId ?? null,
		warOperationSlotId: input.warOperationSlotId ?? null
	});
	if (!coordination.ok) {
		return { ok: false, status: 400, error: coordination.error };
	}

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
			clientRequestId: normalizedClientRequestId,
			wavePlanId: coordination.wavePlanId,
			warOperationWaveId: coordination.warOperationWaveId
		} as Parameters<typeof prisma.attack.create>[0]['data'],
		attackerNexus.id,
		normalizedTroops
	);
	if (!reused) {
		await applyQuestRewards(updatedAttackerNexus, { hasOutgoingStrike: true });
		await recordLaunchQuestProgress(userId, galaxyId, attackType);
	}

	// Notify the defender immediately that an attack is inbound (scouts excluded).
	if (!reused && defenderNexus.ownerId && attackType === 'attack') {
		const etaMinutes = Math.round(travelTimeMinutes);
		const etaStr =
			etaMinutes < 60 ? `${etaMinutes}m` : `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;
		void sendPushToUser(defenderNexus.ownerId, NOTIF.ATTACK_INCOMING, {
			title: '⚠️ Incoming Attack',
			body: `A strike is heading for ${defenderNexus.name}. ETA: ${etaStr}.`,
			tag: `incoming-${attack.id}`,
			data: { url: `/nexus/${defenderNexus.id}` },
			actions: [{ action: 'view', title: 'View Nexus' }]
		});

		// Standing defensive orders (roadmap Phase 2). Lazy import keeps this
		// module's dependency graph shallow — standingOrderService is only ever
		// needed from this one call site.
		//
		// Gate on incoming force size: a sub-threshold poke (notably a 1-troop
		// bait) must NOT fire orders, or an attacker could strip a source nexus
		// into transit for free and then strike it. The per-order cooldown caps
		// re-firing; this caps the cheap *first* trigger. See
		// STANDING_ORDER_MIN_TRIGGER_UNITS.
		const incomingUnitCount = Object.values(normalizedTroops).reduce(
			(sum: number, n) => sum + (Number(n) || 0),
			0
		);
		if (incomingUnitCount >= STANDING_ORDER_MIN_TRIGGER_UNITS) {
			void import('./standingOrderService.js').then(({ triggerStandingOrders }) =>
				triggerStandingOrders({
					defenderUserId: defenderNexus.ownerId!,
					defenderNexusId: defenderNexus.id,
					galaxyId
				})
			);
		}
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

/**
 * Coordinated Assault PR1 — validate and resolve the at-launch coordination
 * pointers.
 *
 * - Both pointers null → returns nulls (uncoordinated wave, the common case).
 * - Both pointers set → reject. They're mutually exclusive (the DB also
 *   enforces this via attack_one_coordination, but we'd rather 400 than CHECK
 *   fail).
 * - Either pointer set with a non-attack mission → reject. Scouts and supports
 *   are not part of the merge model in the design.
 * - wavePlanId → must exist, belong to this user + galaxy + target.
 * - warOperationSlotId → must exist, belong to this user, source nexus, and
 *   target the same nexus. We resolve the slot to its waveId here so the
 *   caller never needs to know about the wave object.
 */
async function resolveCoordinationPointers(params: {
	attackType: AttackType;
	userId: number;
	galaxyId: number;
	targetNexusId: number;
	sourceNexusId: number;
	wavePlanId: number | null;
	warOperationSlotId: number | null;
}): Promise<
	| { ok: true; wavePlanId: number | null; warOperationWaveId: number | null }
	| { ok: false; error: string }
> {
	const { attackType, userId, galaxyId, targetNexusId, sourceNexusId } = params;
	const wavePlanId = params.wavePlanId && params.wavePlanId > 0 ? params.wavePlanId : null;
	const warOperationSlotId =
		params.warOperationSlotId && params.warOperationSlotId > 0 ? params.warOperationSlotId : null;

	if (!wavePlanId && !warOperationSlotId) {
		return { ok: true, wavePlanId: null, warOperationWaveId: null };
	}
	if (wavePlanId && warOperationSlotId) {
		return { ok: false, error: 'Specify at most one coordination pointer' };
	}
	if (attackType !== 'attack') {
		return { ok: false, error: 'Coordination is only allowed on attack missions' };
	}

	if (wavePlanId) {
		const plan = await prisma.wavePlan.findUnique({ where: { id: wavePlanId } });
		if (
			!plan ||
			plan.userId !== userId ||
			plan.galaxyId !== galaxyId ||
			plan.targetNexusId !== targetNexusId
		) {
			return { ok: false, error: 'Invalid wavePlanId' };
		}
		return { ok: true, wavePlanId: plan.id, warOperationWaveId: null };
	}

	// warOperationSlotId path
	const slot = await prisma.warOperationSlot.findUnique({
		where: { id: warOperationSlotId! },
		include: { wave: { include: { operation: { select: { targetNexusId: true } } } } }
	});
	if (
		!slot ||
		slot.userId !== userId ||
		slot.fromNexusId !== sourceNexusId ||
		slot.wave.operation.targetNexusId !== targetNexusId
	) {
		return { ok: false, error: 'Invalid warOperationSlotId' };
	}
	return { ok: true, wavePlanId: null, warOperationWaveId: slot.waveId };
}

async function recordLaunchQuestProgress(
	userId: number,
	galaxyId: number,
	attackType: AttackType
): Promise<void> {
	try {
		if (attackType === 'attack') {
			await incrementQuestProgress(userId, galaxyId, 'attack_1', 1);
			await incrementQuestProgress(userId, galaxyId, 'attack_3', 1);
		} else if (attackType === 'support') {
			await incrementQuestProgress(userId, galaxyId, 'support_1', 1);
		}
		await incrementQuestProgress(userId, galaxyId, 'login', 1);
	} catch {
		// Daily quest progress should never block a valid launch.
	}
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
				clientRequestId: row.clientRequestId ?? `sched:${row.id}`,
				// Coordinated Assault PR1: propagate the plan from the schedule row.
				// WarRoom slots don't use this path; they go through sendAttack with
				// warOperationSlotId on the request body.
				wavePlanId: row.wavePlanId ?? null
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
