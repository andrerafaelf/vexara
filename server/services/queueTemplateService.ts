import prisma from '../lib/prisma.js';
import { MAX_QUEUE_TEMPLATES_PER_USER } from '../utils/gameConstants.js';
import { TROOP_COSTS } from '../utils/gameConstants.js';
import { logError } from '../utils/logger.js';

const MAX_TEMPLATE_NAME_LENGTH = 40;
const MAX_TRAIN_PER_BATCH = 1000;

export interface SaveQueueTemplateInput {
	userId: number;
	galaxyId: number;
	name: unknown;
	troopType: unknown;
	amount: unknown;
}

export type SaveQueueTemplateResult =
	| { ok: true; template: Awaited<ReturnType<typeof prisma.queueTemplate.create>> }
	| { ok: false; status: number; error: string };

/**
 * Save a named {troopType, amount} preset. Replaying it (client-side) just
 * re-submits the same payload to the existing POST /api/troop/train endpoint,
 * so this service does not duplicate any cost/population/queue validation —
 * it only needs to validate what it itself persists.
 */
export async function saveQueueTemplate(
	input: SaveQueueTemplateInput
): Promise<SaveQueueTemplateResult> {
	const { userId, galaxyId } = input;
	const name = typeof input.name === 'string' ? input.name.trim() : '';
	if (!name || name.length > MAX_TEMPLATE_NAME_LENGTH) {
		return {
			ok: false,
			status: 400,
			error: `Name must be 1-${MAX_TEMPLATE_NAME_LENGTH} characters`
		};
	}
	const troopType = typeof input.troopType === 'string' ? input.troopType : '';
	if (!TROOP_COSTS[troopType]) {
		return { ok: false, status: 400, error: 'Invalid troop type' };
	}
	const amount = Number(input.amount);
	if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TRAIN_PER_BATCH) {
		return {
			ok: false,
			status: 400,
			error: `Amount must be an integer between 1 and ${MAX_TRAIN_PER_BATCH}`
		};
	}

	const existingCount = await prisma.queueTemplate.count({ where: { userId } });
	if (existingCount >= MAX_QUEUE_TEMPLATES_PER_USER) {
		return {
			ok: false,
			status: 409,
			error: `Limit of ${MAX_QUEUE_TEMPLATES_PER_USER} saved templates reached`
		};
	}

	try {
		const template = await prisma.queueTemplate.create({
			data: { userId, galaxyId, name, troopType, amount }
		});
		return { ok: true, template };
	} catch (err) {
		logError('queue_template_create_failed', { message: (err as Error).message, userId });
		return { ok: false, status: 500, error: 'Failed to save template' };
	}
}

export function listQueueTemplates(userId: number, galaxyId: number) {
	return prisma.queueTemplate.findMany({
		where: { userId, galaxyId },
		orderBy: { createdAt: 'desc' }
	});
}

export async function deleteQueueTemplate(id: number, userId: number): Promise<boolean> {
	const deleted = await prisma.queueTemplate.deleteMany({ where: { id, userId } });
	return deleted.count > 0;
}
