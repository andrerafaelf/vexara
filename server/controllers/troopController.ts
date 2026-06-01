import type { Response } from 'express';
import {
	applyCompletedQueues,
	applyQuestRewards,
	computeResourceUpdate,
	mergeTroopsTrained,
	normalizeTrainingQueue,
	queueToJson,
	serializeNexus
} from '../models/Nexus.js';
import * as troopService from '../services/troopService.js';
import { atomicUpdateNexusResources, ResourceConflictError } from '../services/nexusService.js';
import type { AuthRequest } from '../types/index.js';
import { getMaxStorage, getResourceProduction } from '../utils/economy.js';
import {
	TROOP_COSTS,
	getCommandTrainingQueueBonus,
	getEffectiveTrainTimeSeconds,
	getOverseerCost,
	getTrainTimeSeconds
} from '../utils/gameConstants.js';
import { parsePositiveInt } from '../utils/validation.js';
import { computeNexusPopulation } from '../utils/population.js';
import { logError, logGameEvent } from '../utils/logger.js';
import { notifyNexusResources } from '../services/warRoomSocket.js';

// Pushes a fresh resource snapshot to the nexus owner. Best-effort: a failed
// emit must never break the HTTP response, so all callers wrap in try/catch.
// Accepts a Prisma row shape (nexusTypeDoubled may be null in the DB) and
// normalizes to the economy module's `boolean | undefined` expectation.
function emitResourceSnapshot(
	userId: number,
	nexus: {
		id: number;
		biomass: number;
		alloy: number;
		ore: number;
		lastResourceUpdate: Date;
		nexusType?: string | null;
		nexusTypeDoubled?: boolean | null;
		isDerelict?: boolean | null;
		commandCore?: number;
		biomassFarm: number;
		alloyForge: number;
		oreExtractor: number;
		storageVault: number;
	}
) {
	const economyInput = {
		nexusType: nexus.nexusType ?? null,
		nexusTypeDoubled: nexus.nexusTypeDoubled ?? false,
		isDerelict: nexus.isDerelict ?? false,
		commandCore: nexus.commandCore,
		biomassFarm: nexus.biomassFarm,
		alloyForge: nexus.alloyForge,
		oreExtractor: nexus.oreExtractor,
		storageVault: nexus.storageVault,
		// computeResourceUpdate isn't called here, but the interface requires
		// these to be present, so pass through the current values.
		biomass: nexus.biomass,
		alloy: nexus.alloy,
		ore: nexus.ore,
		lastResourceUpdate: nexus.lastResourceUpdate
	};
	notifyNexusResources(userId, {
		nexusId: nexus.id,
		base: { biomass: nexus.biomass, alloy: nexus.alloy, ore: nexus.ore },
		production: getResourceProduction(economyInput),
		storageMax: getMaxStorage(economyInput),
		lastResourceUpdate: nexus.lastResourceUpdate
	});
}

const BASE_MAX_TRAINING_QUEUE = 5;

// CC Veteran tier (Lv18-19) adds +1 training queue slot each, capped at +2 (7 total).
// Applied to both the regular and overseer sub-chains independently.
function getMaxTrainingQueue(commandCore: number): number {
	return BASE_MAX_TRAINING_QUEUE + getCommandTrainingQueueBonus(commandCore);
}

const TROOP_REQUIREMENTS: Record<
	string,
	{ buildings: Record<string, number>; maxPerNexus?: number }
> = {
	assaultTrooper: { buildings: { recruitmentCore: 1 } },
	lancerDrone: { buildings: { recruitmentCore: 2 } },
	breakerUnit: { buildings: { recruitmentCore: 3, oreExtractor: 3 } },
	reconOperative: { buildings: { recruitmentCore: 4, commandCore: 3 } },
	skimmerBike: { buildings: { recruitmentCore: 5, alloyForge: 4 } },
	bulwarkGuard: { buildings: { recruitmentCore: 5, lifeSupport: 5 } },
	suppressorTeam: { buildings: { recruitmentCore: 7, commandCore: 6 } },
	disruptorUnit: { buildings: { recruitmentCore: 7, oreExtractor: 6 } },
	interceptorBike: { buildings: { recruitmentCore: 8, alloyForge: 7 } },
	siegeMech: { buildings: { recruitmentCore: 10, oreExtractor: 9, commandCore: 8 } },
	annihilatorPlatform: { buildings: { recruitmentCore: 12, commandCore: 10, shieldGrid: 10 } },
	voidStalker: { buildings: { recruitmentCore: 9, alloyForge: 8, armory: 3 } },
	plasmaTurret: { buildings: { recruitmentCore: 11, commandCore: 9, armory: 5 } },
	overseer: { buildings: { recruitmentCore: 14, commandCore: 14, shieldGrid: 13 }, maxPerNexus: 3 }
};

const BUILDING_NAMES: Record<string, string> = {
	commandCore: 'Command Core',
	recruitmentCore: 'Recruitment Core',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid',
	armory: 'Armory'
};

const TROOP_NAMES: Record<string, string> = {
	lancerDrone: 'Lancer Drone',
	assaultTrooper: 'Assault Trooper',
	breakerUnit: 'Breaker Unit',
	reconOperative: 'Recon Operative',
	skimmerBike: 'Skimmer Bike',
	siegeMech: 'Siege Mech',
	bulwarkGuard: 'Bulwark Guard',
	suppressorTeam: 'Suppressor Team',
	disruptorUnit: 'Disruptor Unit',
	interceptorBike: 'Interceptor Bike',
	annihilatorPlatform: 'Annihilator Platform',
	voidStalker: 'Void Stalker',
	plasmaTurret: 'Plasma Turret',
	overseer: 'Overseer'
};

function troopPopulation(troops: unknown): number {
	if (!troops || typeof troops !== 'object') return 0;
	return Object.entries(troops as Record<string, unknown>).reduce((sum, [type, amount]) => {
		const count = Math.max(0, Math.floor(Number(amount) || 0));
		return sum + count * (TROOP_COSTS[type]?.population ?? 0);
	}, 0);
}

function trainingQueuePopulation(queue: unknown): number {
	return normalizeTrainingQueue(queue).reduce(
		(sum: number, entry: { troopType: string; amount: number }) =>
			sum + (Number(entry.amount) || 0) * (TROOP_COSTS[entry.troopType]?.population ?? 0),
		0
	);
}

export async function trainTroops(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, troopType, amount } = req.body as {
			nexusId?: unknown;
			troopType?: string;
			amount?: unknown;
		};
		const parsedNexusId = parsePositiveInt(nexusId);
		const parsedAmount = parsePositiveInt(amount);
		if (!parsedNexusId) {
			res.status(400).json({ error: 'Invalid nexus ID' });
			return;
		}
		if (!parsedAmount || parsedAmount > 1000) {
			res.status(400).json({ error: 'Amount must be an integer between 1 and 1000' });
			return;
		}

		const rawNexus = await troopService.getNexusById(parsedNexusId);
		if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const nexus = await applyCompletedQueues(rawNexus);
		if (!troopType || !TROOP_COSTS[troopType]) {
			res.status(400).json({ error: 'Invalid troop type' });
			return;
		}
		if (nexus.recruitmentCore === 0) {
			res.status(400).json({ error: 'Recruitment Core required' });
			return;
		}

		const requirements = TROOP_REQUIREMENTS[troopType] || {};
		if (requirements.buildings) {
			for (const [building, requiredLevel] of Object.entries(requirements.buildings)) {
				if (((nexus as unknown as Record<string, number>)[building] || 0) < requiredLevel) {
					res.status(400).json({
						error: `Requires ${BUILDING_NAMES[building] || building} Level ${requiredLevel}`
					});
					return;
				}
			}
		}

		const [inFlight, outboundTransfers] = await Promise.all([
			troopService.getInFlightTroops(nexus.id),
			troopService.getOutboundTransferTroops(nexus.id)
		]);

		if (requirements.maxPerNexus) {
			const queuedAmount = normalizeTrainingQueue(nexus.trainingQueue)
				.filter((e: { troopType: string }) => e.troopType === troopType)
				.reduce((sum: number, e: { amount: number }) => sum + (Number(e.amount) || 0), 0);
			const inFlightAmount = inFlight.reduce(
				(sum, a) => sum + ((a.troops as Record<string, number>)?.[troopType] || 0),
				0
			);
			const transferAmount = outboundTransfers.reduce(
				(sum, t) => sum + ((t.troops as Record<string, number>)?.[troopType] || 0),
				0
			);
			const current =
				((nexus as unknown as Record<string, number>)[troopType] || 0) +
				queuedAmount +
				inFlightAmount +
				transferAmount;
			if (current + parsedAmount > requirements.maxPerNexus) {
				res.status(400).json({
					error: `Maximum ${requirements.maxPerNexus} ${TROOP_NAMES[troopType] || troopType} per nexus`
				});
				return;
			}
		}

		const resourceUpdate = computeResourceUpdate(nexus);
		const current = { ...nexus, ...resourceUpdate } as unknown as Record<string, number>;
		const baseCost = TROOP_COSTS[troopType];
		const cost =
			troopType === 'overseer'
				? {
						...baseCost,
						...getOverseerCost(await troopService.countOwnedNexuses(req.userId!, req.galaxyId!))
					}
				: baseCost;
		const totalCost = {
			biomass: cost.biomass * parsedAmount,
			alloy: cost.alloy * parsedAmount,
			ore: cost.ore * parsedAmount,
			population: cost.population * parsedAmount
		};
		if (
			current.biomass < totalCost.biomass ||
			current.alloy < totalCost.alloy ||
			current.ore < totalCost.ore
		) {
			res.status(400).json({ error: 'Insufficient resources' });
			return;
		}
		const nexusTroopPopulation = troopPopulation(nexus);
		const inFlightPopulation = inFlight.reduce(
			(sum, attack) => sum + troopPopulation(attack.troops),
			0
		);
		const transferPopulation = outboundTransfers.reduce(
			(sum, transfer) => sum + troopPopulation(transfer.troops),
			0
		);
		const queuedPopulation = trainingQueuePopulation(nexus.trainingQueue);
		const committedPopulation =
			nexusTroopPopulation + inFlightPopulation + transferPopulation + queuedPopulation;

		if (committedPopulation + totalCost.population > nexus.populationMax) {
			res.status(400).json({ error: 'Insufficient population capacity' });
			return;
		}

		const trainingQueue = normalizeTrainingQueue(nexus.trainingQueue);
		const isOverseer = troopType === 'overseer';
		const sameChainQueue = trainingQueue.filter((e: { troopType: string }) =>
			isOverseer ? e.troopType === 'overseer' : e.troopType !== 'overseer'
		);
		const maxTrainingQueue = getMaxTrainingQueue(nexus.commandCore);
		if (sameChainQueue.length >= maxTrainingQueue) {
			res
				.status(400)
				.json({ error: `Training queue is full (${maxTrainingQueue}/${maxTrainingQueue})` });
			return;
		}

		const doubled = (nexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
		const perUnitSeconds = getEffectiveTrainTimeSeconds(
			troopType,
			nexus.recruitmentCore,
			nexus.nexusType,
			doubled
		);
		const queueStart =
			sameChainQueue.length > 0
				? new Date(sameChainQueue[sameChainQueue.length - 1].completesAt as string).getTime()
				: Date.now();
		const completesAt = new Date(queueStart + perUnitSeconds * parsedAmount * 1000);
		const perUnitCost =
			troopType === 'overseer'
				? { biomass: cost.biomass, alloy: cost.alloy, ore: cost.ore }
				: undefined;
		const newQueue = [
			...trainingQueue,
			{ troopType, amount: parsedAmount, completesAt, perUnitSeconds, perUnitCost }
		];

		let updated;
		try {
			updated = await atomicUpdateNexusResources(nexus.id, nexus.lastResourceUpdate, {
				...resourceUpdate,
				biomass: current.biomass - totalCost.biomass,
				alloy: current.alloy - totalCost.alloy,
				ore: current.ore - totalCost.ore,
				// newQueue already includes the batch being trained, so the recompute
				// captures the new commitment without re-adding totalCost by hand.
				populationCurrent: computeNexusPopulation({
					troops: nexus as unknown as Record<string, unknown>,
					trainingQueue: newQueue,
					populationMax: nexus.populationMax,
					inFlightPopulation,
					transferPopulation
				}),
				trainingQueue: queueToJson(newQueue)
			});
		} catch (e) {
			if (e instanceof ResourceConflictError) {
				res.status(409).json({ error: 'Resources updated simultaneously - please retry' });
				return;
			}
			throw e;
		}
		const rewardApplied = await applyQuestRewards(updated);
		try {
			emitResourceSnapshot(req.userId!, rewardApplied);
		} catch (e) {
			logError('nexus_resources_emit_failed', {
				message: (e as Error).message,
				file: 'troopController.ts',
				op: 'trainTroops'
			});
		}
		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			void (async () => {
				await incrementQuestProgress(req.userId, req.galaxyId, 'train_5', parsedAmount);
				await incrementQuestProgress(req.userId, req.galaxyId, 'train_15', parsedAmount);
				await incrementQuestProgress(req.userId, req.galaxyId, 'train_30', parsedAmount);
			})();
		} catch {}
		// Emit first_train only when the training queue was previously empty.
		if (trainingQueue.length === 0) {
			logGameEvent('first_train', req.userId, req.galaxyId, { troopType, amount: parsedAmount });
		}
		res.json({ success: true, completesAt, nexus: serializeNexus(rewardApplied) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function cancelTrainingQueue(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, index } = req.body as { nexusId?: unknown; index?: unknown };
		const parsedIndex = parseInt(String(index), 10);
		const nexus = await troopService.getNexusById(parseInt(String(nexusId)));
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const trainingQueue = normalizeTrainingQueue(nexus.trainingQueue);
		if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= trainingQueue.length) {
			res.status(400).json({ error: 'Invalid queue index' });
			return;
		}

		// Snapshot the queue entry the client targeted before any mutation, so
		// post-partial-credit we can re-resolve it by (troopType, completesAt).
		const originalTargetEntry = trainingQueue[parsedIndex] as {
			troopType: string;
			amount: number;
			completesAt: string | Date;
		};

		// Credit any units already trained in the entry being cancelled (and any
		// entries ahead of it in the same chain whose timer has elapsed) before
		// computing the refund. Without this, a cancel on a long-running entry
		// would silently delete units that the training timer has already produced
		// but that haven't been flushed to the nexus row yet.
		const nowMs = Date.now();
		const trainedDelta: Record<string, number> = {};
		const advanceChain = (predicate: (e: { troopType: string }) => boolean) => {
			while (true) {
				const idx = trainingQueue.findIndex(predicate as (e: unknown) => boolean);
				if (idx === -1) break;
				const entry = trainingQueue[idx] as {
					troopType: string;
					amount: number;
					completesAt: string | Date;
					perUnitSeconds?: number;
				};
				const tc = TROOP_COSTS[entry.troopType];
				if (!tc) {
					trainingQueue.splice(idx, 1);
					continue;
				}
				const completesAtMs = new Date(entry.completesAt).getTime();
				const perUnitSeconds =
					entry.perUnitSeconds || getTrainTimeSeconds(entry.troopType, nexus.recruitmentCore);
				const perUnitMs = perUnitSeconds * 1000;
				const startedAtMs = completesAtMs - entry.amount * perUnitMs;
				const elapsedMs = nowMs - startedAtMs;
				if (elapsedMs < perUnitMs) break;
				const unitsCompleted = Math.min(entry.amount, Math.floor(elapsedMs / perUnitMs));
				trainedDelta[entry.troopType] = (trainedDelta[entry.troopType] || 0) + unitsCompleted;
				if (unitsCompleted >= entry.amount) {
					trainingQueue.splice(idx, 1);
				} else {
					trainingQueue[idx] = { ...entry, amount: entry.amount - unitsCompleted };
					break;
				}
			}
		};
		const isOverseerItem =
			(trainingQueue[parsedIndex] as { troopType: string } | undefined)?.troopType === 'overseer';
		advanceChain((e: { troopType: string }) =>
			isOverseerItem ? e.troopType === 'overseer' : e.troopType !== 'overseer'
		);

		// The index the client sent referred to the queue before partial-credit;
		// re-resolve it by finding the first remaining entry in the same chain that
		// matches the cancelled troopType + completesAt. If partial-credit already
		// drained the entry entirely, there's nothing left to refund.
		const targetTroopType = originalTargetEntry.troopType;
		const targetCompletesAt = new Date(originalTargetEntry.completesAt).getTime();
		const refundedIdx = trainingQueue.findIndex(
			(e) =>
				e.troopType === targetTroopType && new Date(e.completesAt).getTime() === targetCompletesAt
		);

		let refund = { biomass: 0, alloy: 0, ore: 0 };
		let newQueue = trainingQueue.slice() as Array<{
			troopType: string;
			amount: number;
			completesAt: string | Date;
			perUnitSeconds?: number;
		}>;
		if (refundedIdx !== -1) {
			const item = trainingQueue[refundedIdx] as {
				troopType: string;
				amount: number;
				completesAt: string | Date;
				perUnitCost?: { biomass: number; alloy: number; ore: number };
			};
			const baseTroopCost = TROOP_COSTS[item.troopType];
			if (!baseTroopCost) {
				res.status(400).json({ error: 'Invalid troop type in queue' });
				return;
			}
			const refundCost = item.perUnitCost ?? baseTroopCost;
			const totalCost = {
				biomass: refundCost.biomass * item.amount,
				alloy: refundCost.alloy * item.amount,
				ore: refundCost.ore * item.amount
			};
			refund = {
				biomass: Math.floor(totalCost.biomass * 0.85),
				alloy: Math.floor(totalCost.alloy * 0.85),
				ore: Math.floor(totalCost.ore * 0.85)
			};
			const itemCompletesAt = new Date(item.completesAt).getTime();
			const sameChainPredicate = (entry: { troopType: string }) =>
				isOverseerItem ? entry.troopType === 'overseer' : entry.troopType !== 'overseer';
			newQueue = trainingQueue.filter((_, i) => i !== refundedIdx) as Array<{
				troopType: string;
				amount: number;
				completesAt: string | Date;
				perUnitSeconds?: number;
			}>;
			const sameChainPrevEntry = (() => {
				for (let i = refundedIdx - 1; i >= 0; i--) {
					if (sameChainPredicate(trainingQueue[i] as { troopType: string }))
						return trainingQueue[i] as { completesAt: string | Date };
				}
				return null;
			})();
			const isHeadOfChain = sameChainPrevEntry === null;
			const shiftAmount = isHeadOfChain
				? Math.max(0, itemCompletesAt - nowMs)
				: itemCompletesAt - new Date(sameChainPrevEntry!.completesAt).getTime();
			if (shiftAmount > 0) {
				for (let i = 0; i < newQueue.length; i++) {
					const entry = newQueue[i];
					if (!sameChainPredicate(entry)) continue;
					const entryOldAt = new Date(entry.completesAt).getTime();
					const wasAfter =
						entryOldAt > itemCompletesAt || (isHeadOfChain && entryOldAt >= itemCompletesAt);
					if (!wasAfter) continue;
					newQueue[i] = { ...entry, completesAt: new Date(entryOldAt - shiftAmount) };
				}
			}
		}

		// Apply trained delta to the nexus troop counts so partial-credit units
		// actually appear on the row before the refund/dequeue write lands.
		const troopUpdates: Record<string, number> = {};
		const nexusRecord = nexus as unknown as Record<string, number>;
		for (const [troopType, qty] of Object.entries(trainedDelta)) {
			if (qty > 0) troopUpdates[troopType] = (nexusRecord[troopType] || 0) + qty;
		}

		const resourceUpdate = computeResourceUpdate(nexus);
		const current = { ...nexus, ...resourceUpdate } as unknown as Record<string, number>;
		// Recompute populationCurrent from the post-mutation state (troops with the
		// trained-credit delta applied + the trimmed queue + troops still away on
		// attacks/transfers) rather than nudging by refundedPopulation. Keeps the
		// stored value structurally in sync - see computeNexusPopulation.
		const [refundInFlight, refundTransfers] = await Promise.all([
			troopService.getInFlightTroops(nexus.id),
			troopService.getOutboundTransferTroops(nexus.id)
		]);
		const dataUpdate: Record<string, unknown> = {
			...resourceUpdate,
			...troopUpdates,
			biomass: current.biomass + refund.biomass,
			alloy: current.alloy + refund.alloy,
			ore: current.ore + refund.ore,
			populationCurrent: computeNexusPopulation({
				troops: { ...nexusRecord, ...troopUpdates },
				trainingQueue: newQueue,
				populationMax: nexus.populationMax,
				inFlightPopulation: refundInFlight.reduce((s, a) => s + troopPopulation(a.troops), 0),
				transferPopulation: refundTransfers.reduce((s, t) => s + troopPopulation(t.troops), 0)
			}),
			trainingQueue: queueToJson(newQueue)
		};
		if (Object.keys(trainedDelta).length > 0) {
			dataUpdate.troopsTrained = mergeTroopsTrained(
				(nexus as unknown as Record<string, unknown>)['troopsTrained'],
				trainedDelta
			);
		}
		let updated;
		try {
			updated = await atomicUpdateNexusResources(nexus.id, nexus.lastResourceUpdate, dataUpdate);
		} catch (e) {
			if (e instanceof ResourceConflictError) {
				res.status(409).json({ error: 'Resources updated simultaneously - please retry' });
				return;
			}
			throw e;
		}
		try {
			emitResourceSnapshot(req.userId!, updated);
		} catch (e) {
			logError('nexus_resources_emit_failed', {
				message: (e as Error).message,
				file: 'troopController.ts',
				op: 'cancelTrainingQueue'
			});
		}
		res.json({ success: true, refund, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function checkTrainingQueue(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId } = req.body as { nexusId?: unknown };
		const nexus = await troopService.getNexusById(parseInt(String(nexusId)));
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const now = new Date();
		const trainingQueue = normalizeTrainingQueue(nexus.trainingQueue);
		const troopUpdates: Record<string, number> = {};
		const trainedDelta: Record<string, number> = {};
		let completed = false;
		const nexusRecord = nexus as unknown as Record<string, number>;
		const advanceChain = (predicate: (e: { troopType: string }) => boolean) => {
			while (true) {
				const idx = trainingQueue.findIndex(predicate as (e: unknown) => boolean);
				if (idx === -1) break;
				const entry = trainingQueue[idx] as {
					troopType: string;
					amount: number;
					completesAt: string | Date;
					perUnitSeconds?: number;
				};
				const cost = TROOP_COSTS[entry.troopType];
				if (!cost) {
					trainingQueue.splice(idx, 1);
					continue;
				}
				const completesAtMs = new Date(entry.completesAt).getTime();
				const perUnitSeconds =
					entry.perUnitSeconds || getTrainTimeSeconds(entry.troopType, nexus.recruitmentCore);
				const perUnitMs = perUnitSeconds * 1000;
				const startedAtMs = completesAtMs - entry.amount * perUnitMs;
				const elapsedMs = now.getTime() - startedAtMs;
				if (elapsedMs < perUnitMs) break;
				const unitsCompleted = Math.min(entry.amount, Math.floor(elapsedMs / perUnitMs));
				troopUpdates[entry.troopType] =
					(troopUpdates[entry.troopType] || nexusRecord[entry.troopType] || 0) + unitsCompleted;
				trainedDelta[entry.troopType] = (trainedDelta[entry.troopType] || 0) + unitsCompleted;
				completed = true;
				if (unitsCompleted >= entry.amount) {
					trainingQueue.splice(idx, 1);
				} else {
					trainingQueue[idx] = { ...entry, amount: entry.amount - unitsCompleted };
					break;
				}
			}
		};
		advanceChain((e: { troopType: string }) => e.troopType !== 'overseer');
		advanceChain((e: { troopType: string }) => e.troopType === 'overseer');
		const resourceUpdate = computeResourceUpdate(nexus);
		const nexusUpdate: Record<string, unknown> = {
			...resourceUpdate,
			...troopUpdates,
			trainingQueue: queueToJson(trainingQueue)
		};
		if (Object.keys(trainedDelta).length > 0) {
			nexusUpdate['troopsTrained'] = mergeTroopsTrained(
				(nexus as unknown as Record<string, unknown>)['troopsTrained'],
				trainedDelta
			);
		}
		const updated = await troopService.updateNexus(nexus.id, nexusUpdate);
		const rewardApplied = await applyQuestRewards(updated);
		try {
			emitResourceSnapshot(req.userId!, rewardApplied);
		} catch (e) {
			logError('nexus_resources_emit_failed', {
				message: (e as Error).message,
				file: 'troopController.ts',
				op: 'checkTrainingQueue'
			});
		}
		res.json({ completed, nexus: serializeNexus(rewardApplied) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// 10% of training cost is refunded per troop destroyed (all resources).
const DESTROY_REFUND_RATE = 0.1;

export async function destroyTroops(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, troopType, amount } = req.body as {
			nexusId?: unknown;
			troopType?: string;
			amount?: unknown;
		};
		const parsedNexusId = parsePositiveInt(nexusId);
		const parsedAmount = parsePositiveInt(amount);
		if (!parsedNexusId) {
			res.status(400).json({ error: 'Invalid nexus ID' });
			return;
		}
		if (!parsedAmount) {
			res.status(400).json({ error: 'Amount must be a positive integer' });
			return;
		}
		if (!troopType || !TROOP_COSTS[troopType]) {
			res.status(400).json({ error: 'Invalid troop type' });
			return;
		}

		const rawNexus = await troopService.getNexusById(parsedNexusId);
		if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const nexus = await applyCompletedQueues(rawNexus);

		const stationed = ((nexus as unknown as Record<string, number>)[troopType] ?? 0);
		if (parsedAmount > stationed) {
			res.status(400).json({ error: 'Not enough stationed troops' });
			return;
		}

		const baseCost = TROOP_COSTS[troopType];
		const refund = {
			biomass: Math.floor(baseCost.biomass * DESTROY_REFUND_RATE * parsedAmount),
			alloy:   Math.floor(baseCost.alloy   * DESTROY_REFUND_RATE * parsedAmount),
			ore:     Math.floor(baseCost.ore      * DESTROY_REFUND_RATE * parsedAmount),
		};
		const populationFreed = baseCost.population * parsedAmount;

		const resourceUpdate = computeResourceUpdate(nexus);
		const current = { ...nexus, ...resourceUpdate } as unknown as Record<string, number>;

		let updated;
		try {
			updated = await atomicUpdateNexusResources(nexus.id, nexus.lastResourceUpdate, {
				...resourceUpdate,
				biomass: current.biomass + refund.biomass,
				alloy:   current.alloy   + refund.alloy,
				ore:     current.ore     + refund.ore,
				populationCurrent: Math.max(0, current.populationCurrent - populationFreed),
				[troopType]: stationed - parsedAmount,
			});
		} catch (e) {
			if (e instanceof ResourceConflictError) {
				res.status(409).json({ error: 'Resources updated simultaneously - please retry' });
				return;
			}
			throw e;
		}

		try {
			emitResourceSnapshot(req.userId!, updated);
		} catch (e) {
			logError('nexus_resources_emit_failed', {
				message: (e as Error).message,
				file: 'troopController.ts',
				op: 'destroyTroops'
			});
		}

		logGameEvent('destroy_troops', req.userId, req.galaxyId, {
			nexusId: nexus.id,
			troopType,
			amount: parsedAmount,
			refund,
		});

		res.json({ success: true, refund, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'troopController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
