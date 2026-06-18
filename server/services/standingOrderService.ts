import prisma from '../lib/prisma.js';
import { TROOP_KEYS } from '../types/index.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { canStationTroop } from '../utils/gameConstants.js';
import { MAX_STANDING_ORDERS_PER_USER, STANDING_ORDER_COOLDOWN_MS } from '../utils/gameConstants.js';
import { logError, logWarn } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { normalizeTroopPayload } from '../utils/validation.js';
import { sendTroopsTransaction } from './troopTransferService.js';

// Mirrors troopTransferController.ts's calcArrivesAt exactly — a standing
// order is a same-owner troop transfer (the existing "station troops at
// another of YOUR nexuses" mechanic), not a support mission, so it must use
// the transfer travel formula, not the attack one.
const TRAVEL_MINUTES_PER_UNIT = 5;
function calcTransferArrivesAt(
	fromNexus: { x: number; y: number; nexusType?: string | null; nexusTypeDoubled?: boolean | null },
	toNexus: { x: number; y: number }
): Date {
	const distance = Math.sqrt(
		Math.pow(toNexus.x - fromNexus.x, 2) + Math.pow(toNexus.y - fromNexus.y, 2)
	);
	const base = NEXUS_TYPE_BONUSES[fromNexus.nexusType ?? '']?.travelTimeMultiplier ?? 1;
	const travelMult = base === 1 ? 1 : fromNexus.nexusTypeDoubled ? Math.pow(base, 2) : base;
	return new Date(Date.now() + distance * TRAVEL_MINUTES_PER_UNIT * travelMult * 60 * 1000);
}

export interface CreateStandingOrderInput {
	userId: number;
	galaxyId: number;
	protectedNexusId: unknown;
	sourceNexusId: unknown;
	troops: unknown;
}

export type CreateStandingOrderResult =
	| { ok: true; order: Awaited<ReturnType<typeof prisma.standingOrder.create>> }
	| { ok: false; status: number; error: string };

/**
 * Create a standing order: "if protectedNexusId comes under attack, auto-send
 * `troops` from sourceNexusId via troop transfer." Both nexuses must belong to
 * the caller in this galaxy — a standing order only ever moves the owner's
 * own troops between their own nexuses, the same authorization a manual troop
 * transfer already requires.
 */
export async function createStandingOrder(
	input: CreateStandingOrderInput
): Promise<CreateStandingOrderResult> {
	const { userId, galaxyId } = input;
	const protectedNexusId = Number(input.protectedNexusId);
	const sourceNexusId = Number(input.sourceNexusId);
	if (!Number.isInteger(protectedNexusId) || protectedNexusId <= 0) {
		return { ok: false, status: 400, error: 'Invalid protected nexus id' };
	}
	if (!Number.isInteger(sourceNexusId) || sourceNexusId <= 0) {
		return { ok: false, status: 400, error: 'Invalid source nexus id' };
	}
	if (protectedNexusId === sourceNexusId) {
		return { ok: false, status: 400, error: 'Protected and source nexus must be different' };
	}

	const normalizedPayload = normalizeTroopPayload(input.troops, TROOP_KEYS);
	if ('error' in normalizedPayload && normalizedPayload.error) {
		return { ok: false, status: 400, error: normalizedPayload.error };
	}
	const normalizedTroops = (normalizedPayload as { normalized: Record<string, number> }).normalized;
	const total = Object.values(normalizedTroops).reduce((sum, n) => sum + n, 0);
	if (total <= 0) {
		return { ok: false, status: 400, error: 'Select at least one troop' };
	}
	// Same restriction a manual support send already enforces (no Overseer,
	// Plasma Turret, or Recon Operative carried as support).
	const offending = Object.keys(normalizedTroops).find(
		(t) => (normalizedTroops[t] || 0) > 0 && !canStationTroop(t)
	);
	if (offending) {
		return {
			ok: false,
			status: 400,
			error: 'Standing orders cannot carry Overseers, Plasma Turrets, or Recon Operatives.'
		};
	}

	const [protectedNexus, sourceNexus, existingCount] = await Promise.all([
		prisma.nexus.findUnique({ where: { id: protectedNexusId } }),
		prisma.nexus.findUnique({ where: { id: sourceNexusId } }),
		prisma.standingOrder.count({ where: { userId } })
	]);
	if (!protectedNexus || protectedNexus.ownerId !== userId || protectedNexus.galaxyId !== galaxyId) {
		return { ok: false, status: 403, error: 'Not authorized for protected nexus' };
	}
	if (!sourceNexus || sourceNexus.ownerId !== userId || sourceNexus.galaxyId !== galaxyId) {
		return { ok: false, status: 403, error: 'Not authorized for source nexus' };
	}
	if (existingCount >= MAX_STANDING_ORDERS_PER_USER) {
		return {
			ok: false,
			status: 409,
			error: `Limit of ${MAX_STANDING_ORDERS_PER_USER} standing orders reached`
		};
	}

	try {
		const order = await prisma.standingOrder.upsert({
			where: { protectedNexusId_sourceNexusId: { protectedNexusId, sourceNexusId } },
			create: {
				userId,
				galaxyId,
				protectedNexusId,
				sourceNexusId,
				troops: normalizedTroops,
				isActive: true
			},
			update: {
				troops: normalizedTroops,
				isActive: true
			}
		});
		return { ok: true, order };
	} catch (err) {
		logError('standing_order_create_failed', { message: (err as Error).message, userId });
		return { ok: false, status: 500, error: 'Failed to create standing order' };
	}
}

export function listStandingOrders(userId: number, galaxyId: number) {
	return prisma.standingOrder.findMany({
		where: { userId, galaxyId },
		orderBy: { createdAt: 'desc' }
	});
}

export async function setStandingOrderActive(
	id: number,
	userId: number,
	isActive: boolean
): Promise<boolean> {
	const updated = await prisma.standingOrder.updateMany({
		where: { id, userId },
		data: { isActive }
	});
	return updated.count > 0;
}

export async function deleteStandingOrder(id: number, userId: number): Promise<boolean> {
	const deleted = await prisma.standingOrder.deleteMany({ where: { id, userId } });
	return deleted.count > 0;
}

/**
 * Fired from attackService.launchAttack at the same point the ATTACK_INCOMING
 * push is sent, for every active standing order guarding the nexus just
 * attacked. Each eligible order moves troops from its source nexus to the
 * protected nexus via the existing same-owner TroopTransfer mechanic — the
 * same operation troopTransferController.sendTroops performs manually — not
 * a support mission (support is same-owner-blocked by design; see
 * attackService.launchAttack's "Use troop transfer..." rejection). Never
 * throws — a misconfigured or exhausted standing order should not block the
 * attack that triggered it.
 */
export async function triggerStandingOrders(params: {
	defenderUserId: number;
	defenderNexusId: number;
	galaxyId: number;
}): Promise<void> {
	const { defenderUserId, defenderNexusId, galaxyId } = params;
	try {
		const orders = await prisma.standingOrder.findMany({
			where: { protectedNexusId: defenderNexusId, userId: defenderUserId, isActive: true }
		});
		if (orders.length === 0) return;

		const now = Date.now();
		for (const order of orders) {
			if (order.lastTriggeredAt && now - order.lastTriggeredAt.getTime() < STANDING_ORDER_COOLDOWN_MS) {
				continue;
			}

			// Claim the trigger first (stamp lastTriggeredAt) so a concurrent
			// resolution pass / retry can't fire the same order twice for one wave.
			const claim = await prisma.standingOrder.updateMany({
				where: {
					id: order.id,
					OR: [{ lastTriggeredAt: null }, { lastTriggeredAt: order.lastTriggeredAt as Date }]
				},
				data: { lastTriggeredAt: new Date(now) }
			});
			if (claim.count === 0) continue;

			const [sourceNexus, protectedNexus] = await Promise.all([
				prisma.nexus.findUnique({ where: { id: order.sourceNexusId } }),
				prisma.nexus.findUnique({ where: { id: order.protectedNexusId } })
			]);
			if (
				!sourceNexus ||
				!protectedNexus ||
				sourceNexus.ownerId !== order.userId ||
				protectedNexus.ownerId !== order.userId ||
				sourceNexus.galaxyId !== galaxyId ||
				protectedNexus.galaxyId !== galaxyId
			) {
				// Ownership changed (nexus lost/conquered) since the order was
				// created — nothing safe to do. Leave the order in place; the
				// owning player can delete it themselves once they notice.
				logWarn('standing_order_trigger_skipped_ownership', {
					standingOrderId: order.id,
					userId: order.userId
				});
				continue;
			}

			const requestedTroops = order.troops as Record<string, number>;
			const sourceRecord = sourceNexus as unknown as Record<string, number>;
			const sending: Record<string, number> = {};
			let total = 0;
			for (const [troopType, requested] of Object.entries(requestedTroops)) {
				if (!canStationTroop(troopType)) continue;
				const amount = Math.min(Math.max(0, Math.floor(requested)), sourceRecord[troopType] ?? 0);
				if (amount > 0) sending[troopType] = amount;
				total += amount;
			}
			if (total === 0) {
				// Reserve depleted right now — not an error, just nothing to send
				// this time. The order stays active for the next trigger.
				continue;
			}

			const deductData: Record<string, number> = {};
			for (const [troopType, amount] of Object.entries(sending)) {
				deductData[troopType] = (sourceRecord[troopType] ?? 0) - amount;
			}
			const arrivesAt = calcTransferArrivesAt(sourceNexus, protectedNexus);

			const [, transfer] = await sendTroopsTransaction(sourceNexus.id, deductData, {
				galaxyId,
				ownerNexusId: sourceNexus.id,
				hostNexusId: protectedNexus.id,
				troops: sending,
				status: 'traveling',
				arrivesAt
			} as Parameters<typeof sendTroopsTransaction>[2]);

			void sendPushToUser(order.userId, NOTIF.TROOP_TRANSFER, {
				title: 'Standing Order Triggered',
				body: `Reserve troops are auto-deploying to defend ${protectedNexus.name}.`,
				tag: `standing-order-${order.id}-${transfer.id}`,
				data: { url: '/' }
			});
		}
	} catch (err) {
		logError('standing_order_trigger_error', { message: (err as Error).message, defenderNexusId });
	}
}
