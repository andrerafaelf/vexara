import type { Request, Response } from 'express';
import {
	formatLabel,
	mergeTroopsTrained,
	normalizeBuildQueue,
	serializeNexus
} from '../models/Nexus.js';
import * as adminService from '../services/internalAdminService.js';
import { processArrivedAttacks } from '../utils/combat.js';
import {
	computeNexusPopulation,
	getPopulationMax,
	loadAwayPopulation
} from '../utils/population.js';
import { TROOP_COSTS } from '../utils/gameConstants.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { logError, logInfo } from '../utils/logger.js';
import prisma from '../lib/prisma.js';

export async function getUsers(req: Request, res: Response): Promise<void> {
	try {
		const users = await adminService.getAllUsers();
		res.json(
			users.map((u) => ({
				...u,
				_id: u.id,
				points: u.galaxyPlayers.reduce((sum, player) => sum + player.points, 0),
				nexuses: u.nexuses.map((v) => serializeNexus(v))
			}))
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getStats(req: Request, res: Response): Promise<void> {
	try {
		const [
			userCount,
			villageCount,
			travelingAttackCount,
			totalAttackCount,
			newUsersThisWeek,
			zeroNexusCount,
			topUsers,
			troopAgg,
			pointsAgg,
			marketCount,
			createdNexusThisWeek,
			firstCombatThisWeek,
			joinedFactionThisWeek,
			referralSignupsThisWeek,
			utmSourcesThisWeek,
			referralClicksAgg
		] = await adminService.getAdminStats();
		const troopSum = (troopAgg as { _sum: Record<string, number | null> })._sum;
		const totalTroops = Object.values(troopSum).reduce<number>((acc, v) => acc + (v ?? 0), 0);
		res.json({
			userCount,
			villageCount,
			travelingAttackCount,
			totalAttackCount,
			attackCount: totalAttackCount,
			newUsersThisWeek,
			zeroNexusCount,
			createdNexusThisWeek,
			firstCombatThisWeek,
			joinedFactionThisWeek,
			referralSignupsThisWeek,
			totalReferralClicks: referralClicksAgg._sum.referralClickCount ?? 0,
			utmSourcesThisWeek: utmSourcesThisWeek.map((row) => ({
				source: row.utmSource ?? 'unknown',
				count: row._count.id
			})),
			totalTroops,
			avgPoints: Math.round(pointsAgg._avg.points ?? 0),
			marketCount,
			topUsers: topUsers.map((player) => ({
				id: player.user.id,
				_id: player.user.id,
				username: player.user.username,
				points: player.points
			}))
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
	try {
		const userId = parseInt(req.params.userId);
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const userVillages = await adminService.getUserNexuses(userId);
		await adminService.deleteUser(
			userId,
			userVillages.map((v) => v.id)
		);
		res.json({ success: true, message: 'User deleted' });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function giveResources(req: Request, res: Response): Promise<void> {
	try {
		const { biomass, alloy, ore } = req.body as { biomass?: number; alloy?: number; ore?: number };
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const updated = await adminService.updateNexus(nexus.id, {
			biomass: nexus.biomass + (biomass || 0),
			alloy: nexus.alloy + (alloy || 0),
			ore: nexus.ore + (ore || 0)
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function addTroops(req: Request, res: Response): Promise<void> {
	try {
		const requested = req.body as Record<string, number>;
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}

		const TROOP_FIELDS = [
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
			'voidStalker',
			'plasmaTurret',
			'annihilatorPlatform',
			'overseer'
		] as const;
		const popFree = Math.max(0, nexus.populationMax - nexus.populationCurrent);
		const updates: Record<string, number> = {};
		let popUsed = 0;
		let popRemaining = popFree;

		for (const field of TROOP_FIELDS) {
			const amount = Math.max(0, Math.floor(Number(requested[field] ?? 0)));
			if (amount === 0) continue;
			const popPerUnit = TROOP_COSTS[field]?.population ?? 1;
			const canFit = Math.floor(popRemaining / popPerUnit);
			const actual = Math.min(amount, canFit);
			if (actual === 0) continue;
			updates[field] = (nexus as unknown as Record<string, number>)[field] + actual;
			popUsed += actual * popPerUnit;
			popRemaining -= actual * popPerUnit;
		}

		if (popUsed === 0) {
			res.status(400).json({ error: 'Not enough population capacity' });
			return;
		}
		// Recompute from the post-grant troop columns rather than adding popUsed.
		const away = await loadAwayPopulation(prisma, nexus.id);
		updates['populationCurrent'] = computeNexusPopulation({
			troops: { ...(nexus as unknown as Record<string, unknown>), ...updates },
			trainingQueue: nexus.trainingQueue,
			populationMax: nexus.populationMax,
			...away
		});

		const updated = await adminService.updateNexus(nexus.id, updates);
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function addBuildings(req: Request, res: Response): Promise<void> {
	try {
		const {
			commandCore = 0,
			recruitmentCore = 0,
			lifeSupport = 0,
			storageVault = 0,
			biomassFarm = 0,
			alloyForge = 0,
			oreExtractor = 0,
			shieldGrid = 0
		} = req.body as Record<string, number>;
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const newLifeSupport = nexus.lifeSupport + lifeSupport;
		const updated = await adminService.updateNexus(nexus.id, {
			commandCore: nexus.commandCore + commandCore,
			recruitmentCore: nexus.recruitmentCore + recruitmentCore,
			lifeSupport: newLifeSupport,
			storageVault: nexus.storageVault + storageVault,
			biomassFarm: nexus.biomassFarm + biomassFarm,
			alloyForge: nexus.alloyForge + alloyForge,
			oreExtractor: nexus.oreExtractor + oreExtractor,
			shieldGrid: nexus.shieldGrid + shieldGrid,
			populationMax: getPopulationMax(newLifeSupport)
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function resetTroops(req: Request, res: Response): Promise<void> {
	try {
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const zeroedTroops = {
			lancerDrone: 0,
			assaultTrooper: 0,
			breakerUnit: 0,
			reconOperative: 0,
			skimmerBike: 0,
			siegeMech: 0,
			bulwarkGuard: 0,
			suppressorTeam: 0,
			disruptorUnit: 0,
			interceptorBike: 0,
			voidStalker: 0,
			plasmaTurret: 0,
			annihilatorPlatform: 0,
			overseer: 0
		};
		// Derive populationCurrent rather than hard-coding 0: troops still away on
		// attacks/transfers and any training queue still occupy housing.
		const away = await loadAwayPopulation(prisma, nexus.id);
		const updated = await adminService.updateNexus(nexus.id, {
			...zeroedTroops,
			populationCurrent: computeNexusPopulation({
				troops: { ...(nexus as unknown as Record<string, unknown>), ...zeroedTroops },
				trainingQueue: nexus.trainingQueue,
				populationMax: nexus.populationMax,
				...away
			})
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function resetBuildings(req: Request, res: Response): Promise<void> {
	try {
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const updated = await adminService.updateNexus(nexus.id, {
			commandCore: 0,
			recruitmentCore: 0,
			lifeSupport: 0,
			storageVault: 0,
			biomassFarm: 0,
			alloyForge: 0,
			oreExtractor: 0,
			shieldGrid: 0,
			populationMax: getPopulationMax(0)
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function completeBuild(req: Request, res: Response): Promise<void> {
	try {
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const buildQueue = normalizeBuildQueue(nexus.buildQueue);
		if (buildQueue.length === 0) {
			res.status(400).json({ error: 'No building in queue' });
			return;
		}
		const [build, ...remainingQueue] = buildQueue;
		const data: Record<string, unknown> = {
			[build.building]: build.targetLevel,
			buildQueue: remainingQueue
		};
		if (build.building === 'lifeSupport') data.populationMax = getPopulationMax(build.targetLevel);
		const updated = await adminService.updateNexus(nexus.id, data);
		if (updated.ownerId) {
			const label = formatLabel(build.building);
			void sendPushToUser(updated.ownerId, NOTIF.BUILDING_COMPLETE, {
				title: 'Construction Complete',
				body: `${label} upgraded to level ${build.targetLevel} at ${updated.name}.`,
				tag: `build-${updated.id}-${build.building}-${build.targetLevel}`,
				data: { url: '/' }
			});
		}
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function completeTraining(req: Request, res: Response): Promise<void> {
	try {
		const nexus = await adminService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const trainingQueue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
		if (trainingQueue.length === 0) {
			res.status(400).json({ error: 'No troops in training' });
			return;
		}
		const [training, ...remainingQueue] = trainingQueue as Array<{
			troopType: string;
			amount: number;
		}>;
		const nexusRecord = nexus as unknown as Record<string, number>;
		// Population was already charged when the player queued training — no adjustment needed here.
		const updated = await adminService.updateNexus(nexus.id, {
			[training.troopType]: (nexusRecord[training.troopType] || 0) + training.amount,
			trainingQueue: remainingQueue,
			troopsTrained: mergeTroopsTrained(
				(nexus as unknown as Record<string, unknown>).troopsTrained,
				{ [training.troopType]: training.amount }
			)
		});
		if (updated.ownerId) {
			const label = formatLabel(training.troopType);
			void sendPushToUser(updated.ownerId, NOTIF.TROOP_COMPLETE, {
				title: 'Training Complete',
				body: `${training.amount}x ${label} ready at ${updated.name}.`,
				tag: `troop-${updated.id}-${training.troopType}-${Date.now()}`,
				data: { url: '/' }
			});
		}
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function deleteNexus(req: Request, res: Response): Promise<void> {
	try {
		const nexusId = parseInt(req.params.nexusId);
		const nexus = await adminService.getNexusById(nexusId);
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const { default: prisma } = await import('../lib/prisma.js');
		await prisma.attack.deleteMany({
			where: { OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }] }
		});
		await prisma.nexus.delete({ where: { id: nexusId } });
		res.json({ success: true, message: 'Nexus deleted' });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getAttacks(req: Request, res: Response): Promise<void> {
	try {
		const attacks = await adminService.getAdminAttacks();
		res.json(attacks.map((a) => ({ ...a, _id: a.id })));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function completeAttack(req: Request, res: Response): Promise<void> {
	try {
		const attackId = parseInt(req.params.attackId);
		const attack = await adminService.getAttackById(attackId);
		if (!attack) {
			res.status(404).json({ error: 'Attack not found' });
			return;
		}
		if (attack.status !== 'traveling') {
			res.status(400).json({ error: 'Attack already completed or cancelled' });
			return;
		}
		await adminService.updateAttack(attackId, { arrivesAt: new Date() });
		await processArrivedAttacks();
		res.json({ success: true, message: 'Attack completed' });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function grantTokens(req: Request, res: Response): Promise<void> {
	try {
		const userId = parseInt(req.params.userId);
		const count = parseInt(req.body?.count);
		const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'admin_grant';
		if (!Number.isFinite(userId)) {
			res.status(400).json({ error: 'Invalid userId' });
			return;
		}
		if (!Number.isFinite(count) || count < 1 || count > 50) {
			res.status(400).json({ error: 'count must be 1–50' });
			return;
		}

		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		const now = Date.now();
		const rows = Array.from({ length: count }, (_, i) =>
			prisma.milestoneToken.create({
				data: {
					userId,
					milestone: 0,
					rewardType: 'admin',
					rewardMeta: { reason, tokenIndex: i, tokenCount: count },
					kofiTransactionId: `admin-${reason.slice(0, 20)}-${userId}-${now}-${i}`
				}
			})
		);
		await Promise.all(rows);
		logInfo('admin_tokens_granted', { userId, count, reason });
		res.json({ success: true, granted: count });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'internalAdminController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
