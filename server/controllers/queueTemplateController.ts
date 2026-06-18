import type { Response } from 'express';
import * as queueTemplateService from '../services/queueTemplateService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { parsePositiveInt } from '../utils/validation.js';

function serializeQueueTemplate(row: {
	id: number;
	name: string;
	troopType: string;
	amount: number;
	createdAt: Date;
}) {
	return {
		id: row.id,
		name: row.name,
		troopType: row.troopType,
		amount: row.amount,
		createdAt: row.createdAt.toISOString()
	};
}

// POST /queue-templates — save a named {troopType, amount} preset.
export async function saveQueueTemplate(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { name, troopType, amount } = req.body as {
			name?: unknown;
			troopType?: unknown;
			amount?: unknown;
		};
		const result = await queueTemplateService.saveQueueTemplate({
			userId: req.userId!,
			galaxyId: req.galaxyId!,
			name,
			troopType,
			amount
		});
		if (!result.ok) {
			res.status(result.status).json({ error: result.error });
			return;
		}
		res.json({ success: true, template: serializeQueueTemplate(result.template) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'queueTemplateController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// GET /queue-templates — list the caller's saved templates.
export async function getQueueTemplates(req: AuthRequest, res: Response): Promise<void> {
	try {
		const rows = await queueTemplateService.listQueueTemplates(req.userId!, req.galaxyId!);
		res.json({ templates: rows.map(serializeQueueTemplate) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'queueTemplateController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// DELETE /queue-templates/:id
export async function deleteQueueTemplate(req: AuthRequest, res: Response): Promise<void> {
	try {
		const id = parsePositiveInt(req.params.id);
		if (!id) {
			res.status(400).json({ error: 'Invalid id' });
			return;
		}
		const ok = await queueTemplateService.deleteQueueTemplate(id, req.userId!);
		if (!ok) {
			res.status(404).json({ error: 'Template not found' });
			return;
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'queueTemplateController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
