import type { Response } from 'express';
import * as autoRequeueService from '../services/autoRequeueService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { parsePositiveInt } from '../utils/validation.js';

function serializeAutoRequeueRule(row: {
	id: number;
	nexusId: number;
	kind: string;
	troopType: string | null;
	amount: number | null;
	building: string | null;
	isActive: boolean;
	pausedReason: string | null;
	lastFiredAt: Date | null;
	createdAt: Date;
}) {
	return {
		id: row.id,
		nexusId: row.nexusId,
		kind: row.kind,
		troopType: row.troopType,
		amount: row.amount,
		building: row.building,
		isActive: row.isActive,
		pausedReason: row.pausedReason,
		lastFiredAt: row.lastFiredAt ? row.lastFiredAt.toISOString() : null,
		createdAt: row.createdAt.toISOString()
	};
}

// POST /auto-requeue — create a rule.
export async function createAutoRequeueRule(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, kind, troopType, amount, building } = req.body as {
			nexusId?: unknown;
			kind?: unknown;
			troopType?: unknown;
			amount?: unknown;
			building?: unknown;
		};
		const result = await autoRequeueService.createAutoRequeueRule({
			userId: req.userId!,
			galaxyId: req.galaxyId!,
			nexusId,
			kind,
			troopType,
			amount,
			building
		});
		if (!result.ok) {
			res.status(result.status).json({ error: result.error });
			return;
		}
		res.json({ success: true, rule: serializeAutoRequeueRule(result.rule) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'autoRequeueController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// GET /auto-requeue — list the caller's rules.
export async function getAutoRequeueRules(req: AuthRequest, res: Response): Promise<void> {
	try {
		const rows = await autoRequeueService.listAutoRequeueRules(req.userId!, req.galaxyId!);
		res.json({ rules: rows.map(serializeAutoRequeueRule) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'autoRequeueController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// PATCH /auto-requeue/:id — toggle isActive (re-enabling clears pausedReason).
export async function setAutoRequeueRuleActive(req: AuthRequest, res: Response): Promise<void> {
	try {
		const id = parsePositiveInt(req.params.id);
		const { isActive } = req.body as { isActive?: unknown };
		if (!id || typeof isActive !== 'boolean') {
			res.status(400).json({ error: 'Invalid request' });
			return;
		}
		const ok = await autoRequeueService.setAutoRequeueRuleActive(id, req.userId!, isActive);
		if (!ok) {
			res.status(404).json({ error: 'Auto-requeue rule not found' });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'autoRequeueController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// DELETE /auto-requeue/:id
export async function deleteAutoRequeueRule(req: AuthRequest, res: Response): Promise<void> {
	try {
		const id = parsePositiveInt(req.params.id);
		if (!id) {
			res.status(400).json({ error: 'Invalid id' });
			return;
		}
		const ok = await autoRequeueService.deleteAutoRequeueRule(id, req.userId!);
		if (!ok) {
			res.status(404).json({ error: 'Auto-requeue rule not found' });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'autoRequeueController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
