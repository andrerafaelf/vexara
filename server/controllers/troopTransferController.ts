import type { Response } from 'express';
import { serializeNexus } from '../models/Nexus.js';
import * as transferService from '../services/troopTransferService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';
import { STATIONABLE_TROOPS, isStationableTroop } from '../utils/gameConstants.js';

// A transfer parks a garrison at another of YOUR nexuses - the same "station
// troops elsewhere" operation as a support mission to an ally, just same-owner.
// So it obeys the same rule: defensive units only. Offensive units only leave a
// nexus via an attack. Shared source of truth: STATIONABLE_TROOPS.
const TROOP_FIELDS = STATIONABLE_TROOPS;
const TRAVEL_MINUTES_PER_UNIT = 5;

function calcArrivesAt(
	fromNexus: { x: number; y: number; nexusType?: string | null; nexusTypeDoubled?: boolean },
	toNexus: { x: number; y: number }
) {
	const distance = Math.sqrt(
		Math.pow(toNexus.x - fromNexus.x, 2) + Math.pow(toNexus.y - fromNexus.y, 2)
	);
	const base = NEXUS_TYPE_BONUSES[fromNexus.nexusType ?? '']?.travelTimeMultiplier ?? 1;
	const travelMult = base === 1 ? 1 : fromNexus.nexusTypeDoubled ? Math.pow(base, 2) : base;
	return new Date(Date.now() + distance * TRAVEL_MINUTES_PER_UNIT * travelMult * 60 * 1000);
}

function serializeTransfer(t: {
	id: number;
	ownerNexusId: number;
	hostNexusId: number;
	troops: unknown;
	status: string;
	arrivesAt: Date | null;
	returnsAt: Date | null;
	createdAt: Date;
	ownerNexus?: { id: number; name: string; x: number; y: number } | null;
	hostNexus?: { id: number; name: string; x: number; y: number } | null;
}) {
	return {
		_id: String(t.id),
		ownerNexusId: String(t.ownerNexusId),
		hostNexusId: String(t.hostNexusId),
		troops: t.troops,
		status: t.status,
		arrivesAt: t.arrivesAt ?? null,
		returnsAt: t.returnsAt ?? null,
		createdAt: t.createdAt,
		ownerNexus: t.ownerNexus
			? {
					_id: String(t.ownerNexus.id),
					name: t.ownerNexus.name,
					x: t.ownerNexus.x,
					y: t.ownerNexus.y
				}
			: undefined,
		hostNexus: t.hostNexus
			? { _id: String(t.hostNexus.id), name: t.hostNexus.name, x: t.hostNexus.x, y: t.hostNexus.y }
			: undefined
	};
}

export async function sendTroops(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { fromNexusId, toNexusId, troops } = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			troops?: Record<string, unknown>;
		};
		if (!fromNexusId || !toNexusId || String(fromNexusId) === String(toNexusId)) {
			res.status(400).json({ error: 'Invalid nexus selection' });
			return;
		}
		const [from, to] = await Promise.all([
			transferService.getNexusById(parseInt(String(fromNexusId))),
			transferService.getNexusById(parseInt(String(toNexusId)))
		]);
		if (!from || !to) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		if (from.ownerId !== req.userId || to.ownerId !== req.userId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (from.galaxyId !== req.galaxyId || to.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Nexus is in a different galaxy' });
			return;
		}

		// Reject offensive/non-stationable troops outright so it's clear they can't be
		// transferred (rather than silently dropping them from the payload).
		const offending = Object.keys(troops ?? {}).find(
			(t) => Number((troops as Record<string, unknown>)[t] ?? 0) > 0 && !isStationableTroop(t)
		);
		if (offending) {
			res.status(400).json({
				error: 'Only defensive units can be stationed at another nexus (no offensive troops or Overseers).'
			});
			return;
		}

		const fromRecord = from as unknown as Record<string, number>;
		const sending: Record<string, number> = {};
		let total = 0;
		for (const field of TROOP_FIELDS) {
			const requested = Math.max(0, Math.floor(Number(troops?.[field] ?? 0)));
			const amount = Math.min(requested, fromRecord[field] ?? 0);
			sending[field] = amount;
			total += amount;
		}
		if (total === 0) {
			res.status(400).json({ error: 'No troops to send' });
			return;
		}

		const arrivesAt = calcArrivesAt(from, to);
		const deductData: Record<string, number> = {};
		for (const field of TROOP_FIELDS) {
			if (sending[field] > 0) deductData[field] = (fromRecord[field] ?? 0) - sending[field];
		}

		const [updatedFrom, transfer] = await transferService.sendTroopsTransaction(
			from.id,
			deductData,
			{
				galaxyId: req.galaxyId,
				ownerNexusId: from.id,
				hostNexusId: to.id,
				troops: sending,
				status: 'traveling',
				arrivesAt
			}
		);
		res.json({ from: serializeNexus(updatedFrom), transfer: serializeTransfer(transfer) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopTransferController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function recallTroops(req: AuthRequest, res: Response): Promise<void> {
	try {
		const transfer = await transferService.getTransferById(parseInt(req.params.transferId));
		if (!transfer) {
			res.status(404).json({ error: 'Transfer not found' });
			return;
		}
		if (transfer.ownerNexus.ownerId !== req.userId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (transfer.status === 'returning') {
			res.status(400).json({ error: 'Troops are already returning' });
			return;
		}

		if (transfer.status === 'traveling') {
			const now = Date.now();
			const totalMs = transfer.arrivesAt!.getTime() - transfer.createdAt.getTime();
			const elapsedMs = Math.min(now - transfer.createdAt.getTime(), totalMs);
			const returnsAt = new Date(now + elapsedMs);
			const updated = await transferService.updateTransfer(transfer.id, {
				status: 'returning',
				returnsAt,
				arrivesAt: null
			});
			res.json({ transfer: serializeTransfer(updated) });
			return;
		}

		const returnsAt = calcArrivesAt(transfer.hostNexus, transfer.ownerNexus);
		const updated = await transferService.updateTransfer(transfer.id, {
			status: 'returning',
			returnsAt,
			arrivesAt: null
		});
		res.json({ transfer: serializeTransfer(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopTransferController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function sendBack(req: AuthRequest, res: Response): Promise<void> {
	try {
		const transfer = await transferService.getTransferById(parseInt(req.params.transferId));
		if (!transfer) {
			res.status(404).json({ error: 'Transfer not found' });
			return;
		}
		if (transfer.hostNexus.ownerId !== req.userId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (transfer.status !== 'stationed') {
			res.status(400).json({ error: 'Troops are not currently stationed here' });
			return;
		}
		const returnsAt = calcArrivesAt(transfer.hostNexus, transfer.ownerNexus);
		const updated = await transferService.updateTransfer(transfer.id, {
			status: 'returning',
			returnsAt,
			arrivesAt: null
		});
		res.json({ transfer: serializeTransfer(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopTransferController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getTransfersForNexus(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parseInt(req.params.nexusId);
		const nexus = await transferService.getNexusById(nexusId);
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const transfers = await transferService.getTransfersForNexus(nexusId, req.galaxyId);
		res.json(transfers.map(serializeTransfer));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopTransferController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
