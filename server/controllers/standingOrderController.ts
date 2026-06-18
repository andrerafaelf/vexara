import type { Response } from 'express';
import * as standingOrderService from '../services/standingOrderService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { parsePositiveInt } from '../utils/validation.js';

function serializeStandingOrder(row: {
	id: number;
	protectedNexusId: number;
	sourceNexusId: number;
	troops: unknown;
	isActive: boolean;
	lastTriggeredAt: Date | null;
	createdAt: Date;
}) {
	return {
		id: row.id,
		protectedNexusId: row.protectedNexusId,
		sourceNexusId: row.sourceNexusId,
		troops: (row.troops ?? {}) as Record<string, number>,
		isActive: row.isActive,
		lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.toISOString() : null,
		createdAt: row.createdAt.toISOString()
	};
}

// POST /standing-orders — create or update (upsert on protected+source pair).
export async function createStandingOrder(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { protectedNexusId, sourceNexusId, troops } = req.body as {
			protectedNexusId?: unknown;
			sourceNexusId?: unknown;
			troops?: unknown;
		};
		const result = await standingOrderService.createStandingOrder({
			userId: req.userId!,
			galaxyId: req.galaxyId!,
			protectedNexusId,
			sourceNexusId,
			troops
		});
		if (!result.ok) {
			res.status(result.status).json({ error: result.error });
			return;
		}
		res.json({ success: true, order: serializeStandingOrder(result.order) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'standingOrderController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// GET /standing-orders — list the caller's standing orders.
export async function getStandingOrders(req: AuthRequest, res: Response): Promise<void> {
	try {
		const rows = await standingOrderService.listStandingOrders(req.userId!, req.galaxyId!);
		res.json({ orders: rows.map(serializeStandingOrder) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'standingOrderController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// PATCH /standing-orders/:id — toggle isActive.
export async function setStandingOrderActive(req: AuthRequest, res: Response): Promise<void> {
	try {
		const id = parsePositiveInt(req.params.id);
		const { isActive } = req.body as { isActive?: unknown };
		if (!id || typeof isActive !== 'boolean') {
			res.status(400).json({ error: 'Invalid request' });
			return;
		}
		const ok = await standingOrderService.setStandingOrderActive(id, req.userId!, isActive);
		if (!ok) {
			res.status(404).json({ error: 'Standing order not found' });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'standingOrderController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// DELETE /standing-orders/:id
export async function deleteStandingOrder(req: AuthRequest, res: Response): Promise<void> {
	try {
		const id = parsePositiveInt(req.params.id);
		if (!id) {
			res.status(400).json({ error: 'Invalid id' });
			return;
		}
		const ok = await standingOrderService.deleteStandingOrder(id, req.userId!);
		if (!ok) {
			res.status(404).json({ error: 'Standing order not found' });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'standingOrderController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
