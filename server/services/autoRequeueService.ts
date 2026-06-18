import prisma from '../lib/prisma.js';
import { attemptTrainTroops } from '../controllers/troopController.js';
import { attemptUpgradeBuilding } from '../controllers/buildingController.js';
import { applyCompletedQueues } from '../models/Nexus.js';
import { MAX_AUTO_REQUEUE_RULES_PER_USER, MAX_TRAIN_PER_BATCH } from '../utils/gameConstants.js';
import { BUILDING_COSTS } from '../utils/gameConstants.js';
import { TROOP_KEYS } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';

export interface CreateAutoRequeueRuleInput {
	userId: number;
	galaxyId: number;
	nexusId: unknown;
	kind: unknown;
	troopType?: unknown;
	amount?: unknown;
	building?: unknown;
}

export type CreateAutoRequeueRuleResult =
	| { ok: true; rule: Awaited<ReturnType<typeof prisma.autoRequeueRule.create>> }
	| { ok: false; status: number; error: string };

/**
 * Create an auto-requeue rule on a nexus: "training" repeats {troopType,
 * amount} every time the current batch drains; "building" repeats "upgrade
 * to next level" for `building` every time the current upgrade drains. Both
 * kinds always go through the same validation as the manual endpoints
 * (attemptTrainTroops / attemptUpgradeBuilding) when they actually fire —
 * this function only validates shape + ownership + the per-user limit.
 */
export async function createAutoRequeueRule(
	input: CreateAutoRequeueRuleInput
): Promise<CreateAutoRequeueRuleResult> {
	const { userId, galaxyId } = input;
	const nexusId = Number(input.nexusId);
	if (!Number.isInteger(nexusId) || nexusId <= 0) {
		return { ok: false, status: 400, error: 'Invalid nexus id' };
	}
	if (input.kind !== 'training' && input.kind !== 'building') {
		return { ok: false, status: 400, error: 'kind must be "training" or "building"' };
	}
	const kind = input.kind;

	let troopType: string | null = null;
	let amount: number | null = null;
	let building: string | null = null;

	if (kind === 'training') {
		troopType = typeof input.troopType === 'string' ? input.troopType : '';
		if (!TROOP_KEYS.includes(troopType as TroopKeyLike)) {
			return { ok: false, status: 400, error: 'Invalid troop type' };
		}
		amount = Number(input.amount);
		if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_TRAIN_PER_BATCH) {
			return { ok: false, status: 400, error: `Amount must be an integer between 1 and ${MAX_TRAIN_PER_BATCH}` };
		}
	} else {
		building = typeof input.building === 'string' ? input.building : '';
		if (!BUILDING_COSTS[building]) {
			return { ok: false, status: 400, error: 'Invalid building' };
		}
	}

	const [nexus, existingCount] = await Promise.all([
		prisma.nexus.findUnique({ where: { id: nexusId } }),
		prisma.autoRequeueRule.count({ where: { userId } })
	]);
	if (!nexus || nexus.ownerId !== userId || nexus.galaxyId !== galaxyId) {
		return { ok: false, status: 403, error: 'Not authorized for nexus' };
	}
	if (existingCount >= MAX_AUTO_REQUEUE_RULES_PER_USER) {
		return {
			ok: false,
			status: 409,
			error: `Limit of ${MAX_AUTO_REQUEUE_RULES_PER_USER} auto-requeue rules reached`
		};
	}

	try {
		const rule = await prisma.autoRequeueRule.create({
			data: {
				userId,
				galaxyId,
				nexusId,
				kind,
				troopType,
				amount,
				building,
				isActive: true,
				pausedReason: null
			}
		});
		return { ok: true, rule };
	} catch (err) {
		logError('auto_requeue_rule_create_failed', { message: (err as Error).message, userId });
		return { ok: false, status: 500, error: 'Failed to create auto-requeue rule' };
	}
}

type TroopKeyLike = (typeof TROOP_KEYS)[number];

export function listAutoRequeueRules(userId: number, galaxyId: number) {
	return prisma.autoRequeueRule.findMany({
		where: { userId, galaxyId },
		orderBy: { createdAt: 'desc' }
	});
}

export async function setAutoRequeueRuleActive(
	id: number,
	userId: number,
	isActive: boolean
): Promise<boolean> {
	const updated = await prisma.autoRequeueRule.updateMany({
		where: { id, userId },
		// Re-enabling a paused rule clears the reason — give it a fresh attempt.
		data: { isActive, pausedReason: isActive ? null : undefined }
	});
	return updated.count > 0;
}

export async function deleteAutoRequeueRule(id: number, userId: number): Promise<boolean> {
	const deleted = await prisma.autoRequeueRule.deleteMany({ where: { id, userId } });
	return deleted.count > 0;
}

/**
 * Fired from processCompletedQueuesAndNotify (Nexus.ts) right after a build or
 * training batch drains on `nexusId`, once per active rule matching that
 * nexus + kind. Re-validates and re-queues through the exact same core used
 * by the manual endpoints. On validation failure, pauses the rule and
 * notifies the player instead of erroring silently or retrying forever.
 * Never throws — a misconfigured rule should not block the rest of the drain
 * job, matching standingOrderService's triggerStandingOrders philosophy.
 */
export async function attemptAutoRequeue(rule: {
	id: number;
	userId: number;
	galaxyId: number;
	nexusId: number;
	kind: string;
	troopType: string | null;
	amount: number | null;
	building: string | null;
}): Promise<void> {
	try {
		const rawNexus = await prisma.nexus.findUnique({ where: { id: rule.nexusId } });
		if (!rawNexus || rawNexus.ownerId !== rule.userId || rawNexus.galaxyId !== rule.galaxyId) {
			// Ownership changed since the rule was created — nothing safe to do.
			// Leave it for the owning player to notice and delete themselves.
			return;
		}
		const nexus = await applyCompletedQueues(rawNexus);

		const result =
			rule.kind === 'training'
				? await attemptTrainTroops(nexus, rule.troopType ?? undefined, rule.amount ?? 0, rule.userId, rule.galaxyId)
				: await attemptUpgradeBuilding(nexus, rule.building ?? undefined, rule.userId, rule.galaxyId);

		if (result.ok) {
			await prisma.autoRequeueRule.update({
				where: { id: rule.id },
				data: { lastFiredAt: new Date() }
			});
			return;
		}

		await prisma.autoRequeueRule.update({
			where: { id: rule.id },
			data: { isActive: false, pausedReason: result.error, lastFiredAt: new Date() }
		});
		const label =
			rule.kind === 'training' ? rule.troopType ?? 'training' : rule.building ?? 'building';
		void sendPushToUser(rule.userId, NOTIF.AUTO_REQUEUE_PAUSED, {
			title: 'Auto-Requeue Paused',
			body: `Auto-requeue for ${label} at ${nexus.name} stopped: ${result.error}`,
			tag: `auto-requeue-paused-${rule.id}`,
			data: { url: `/nexus/${nexus.id}` }
		});
	} catch (err) {
		logError('auto_requeue_attempt_error', { message: (err as Error).message, ruleId: rule.id });
	}
}
