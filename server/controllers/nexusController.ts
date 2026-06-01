import type { Response } from 'express';
import {
	applyCompletedQueues,
	applyQuestRewards,
	claimQuestBatchReward,
	refreshResources,
	serializeNexus
} from '../models/Nexus.js';
import prisma from '../lib/prisma.js';
import * as nexusService from '../services/nexusService.js';
import type { AuthRequest } from '../types/index.js';
import { getPopulationMax } from '../utils/population.js';
import { NEWBIE_PROTECTION_DURATION_MS, buildRespawnNexusConfig } from '../utils/starterNexus.js';
import { calculateTroopInfluence, getMaxStorage, getResourceProduction } from '../utils/economy.js';
import { notifyNexusResources } from '../services/warRoomSocket.js';
import { logError, logGameEvent } from '../utils/logger.js';

const MAX_NEXUSES_PER_USER = 10;

export async function getMyNexuses(req: AuthRequest, res: Response): Promise<void> {
	try {
		if (req.galaxyId == null) {
			res.json([]);
			return;
		}
		// Fetch nexuses and the galaxy player record in parallel, two DB calls total
		const [nexusesRaw, player] = await Promise.all([
			nexusService.getNexusByOwner(req.userId, req.galaxyId),
			prisma.galaxyPlayer.findUnique({
				where: { userId_galaxyId: { userId: req.userId, galaxyId: req.galaxyId } },
				select: { id: true, questRewardClaims: true, completedQuestIds: true }
			})
		]);

		const nexuses = nexusesRaw;

		const attacks = await nexusService.getOutgoingAttacks(nexuses.map((n) => n.id));
		const nexusesWithOutgoingAttacks = new Set(attacks.map((a) => a.attackerNexusId));

		// applyCompletedQueues and refreshResources still need individual updates
		// (each nexus has different state), but applyQuestRewards now reuses the
		// single pre-fetched player record instead of querying once per nexus.
		const updated = await Promise.all(
			nexuses.map(async (v) => {
				const queueApplied = await applyCompletedQueues(v);
				const refreshed = await refreshResources(queueApplied);
				return applyQuestRewards(refreshed, {
					hasOutgoingStrike: nexusesWithOutgoingAttacks.has(v.id),
					player: player ?? undefined
				});
			})
		);

		// Include troops currently in flight on outgoing strikes so sending an
		// attack doesn't immediately drop the player's influence. Survivors (or
		// the initial roster while traveling) still count; losses on a completed
		// 'returning' attack are excluded so influence drops only on combat end.
		// The bump is attributed back to the originating nexus so the per-nexus
		// .points field - which the client sums for the header influence - also
		// reflects in-flight troops, not just the GalaxyPlayer total.
		const [inFlightAttacks, outboundTransfers] = await Promise.all([
			prisma.attack.findMany({
				where: {
					attackerUserId: req.userId,
					galaxyId: req.galaxyId,
					status: { in: ['traveling', 'returning'] }
				},
				select: { attackerNexusId: true, troops: true, result: true, status: true }
			}),
			prisma.troopTransfer.findMany({
				where: {
					ownerNexus: { ownerId: req.userId, galaxyId: req.galaxyId },
					status: { in: ['traveling', 'stationed', 'returning'] }
				},
				select: { ownerNexusId: true, troops: true }
			})
		]);
		const inFlightByNexus = new Map<number, number>();
		for (const a of inFlightAttacks) {
			if (a.attackerNexusId == null) continue;
			const sent = (a.troops as Record<string, number> | null) || {};
			const result = a.result as { attackerLosses?: Record<string, number> } | null;
			const losses = result?.attackerLosses || {};
			const live: Record<string, number> = {};
			for (const [k, v] of Object.entries(sent)) {
				const sentN = Number(v) || 0;
				const lostN = a.status === 'returning' ? Number(losses[k]) || 0 : 0;
				live[k] = Math.max(0, sentN - lostN);
			}
			const inf = calculateTroopInfluence(live);
			inFlightByNexus.set(a.attackerNexusId, (inFlightByNexus.get(a.attackerNexusId) ?? 0) + inf);
		}
		for (const t of outboundTransfers) {
			const troops = (t.troops as Record<string, number> | null) || {};
			const inf = calculateTroopInfluence(troops);
			inFlightByNexus.set(t.ownerNexusId, (inFlightByNexus.get(t.ownerNexusId) ?? 0) + inf);
		}

		const withInFlight = updated.map((v) => {
			const bump = inFlightByNexus.get(v.id) ?? 0;
			if (bump <= 0) return v;
			return { ...v, points: v.points + Math.floor(bump) };
		});

		const totalPoints = withInFlight.reduce((sum, v) => sum + v.points, 0);
		await nexusService.updateGalaxyPlayerPoints(req.userId, req.galaxyId, totalPoints);

		res.json(withInFlight.map((v) => serializeNexus(v)));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getNexus(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexus = await nexusService.getNexusById(parseInt(req.params.nexusId));
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		if (nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const refreshed = await refreshResources(await applyCompletedQueues(nexus));
		const updated = await applyQuestRewards(refreshed);
		res.json(serializeNexus(updated));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// Eliminated players get a 1.5-day shield - half the 3-day fresh-signup
// window. The respawn comes with mid-tier+ buildings and a real garrison
// (scaled to their former peak influence), so a full 3 days would be longer
// than they need to find their footing and would let a respawned player sit
// untouchable while continuing to interact with the rest of the galaxy.
const ELIMINATED_RESPAWN_PROTECTION_MS = 36 * 60 * 60 * 1000;

export async function createNexus(req: AuthRequest, res: Response): Promise<void> {
	try {
		const existingCount = await nexusService.countNexusesByOwner(req.userId, req.galaxyId);
		if (existingCount >= MAX_NEXUSES_PER_USER) {
			res
				.status(400)
				.json({ error: `Maximum of ${MAX_NEXUSES_PER_USER} nexuses allowed per player` });
			return;
		}

		const bodyName = typeof req.body?.name === 'string' ? req.body.name : null;

		const { default: prisma } = await import('../lib/prisma.js');
		const [userRecord, galaxyPlayer] = await Promise.all([
			prisma.user.findUnique({ where: { id: req.userId } }),
			prisma.galaxyPlayer.findUnique({
				where: { userId_galaxyId: { userId: req.userId, galaxyId: req.galaxyId } },
				select: { id: true, peakPoints: true, points: true }
			})
		]);

		// A player with an existing GalaxyPlayer row but zero nexuses is being eliminated-respawned.
		// Their nexus is scaled to a fraction of the peak influence they held before
		// elimination (see buildRespawnNexusConfig), with a mid-tier floor and the
		// shortened respawn protection window.
		const isEliminatedRespawn = existingCount === 0 && galaxyPlayer !== null;

		const protectionEndsAt = new Date(
			Date.now() +
				(isEliminatedRespawn ? ELIMINATED_RESPAWN_PROTECTION_MS : NEWBIE_PROTECTION_DURATION_MS)
		);

		if (isEliminatedRespawn) {
			// Prefer the recorded peak; fall back to current points if peak hasn't
			// been backfilled/ratcheted yet for this row.
			const peak = Math.max(galaxyPlayer.peakPoints ?? 0, galaxyPlayer.points ?? 0);
			const config = buildRespawnNexusConfig(peak);
			const nexus = await nexusService.createNexus({
				name: bodyName || `${userRecord?.username ?? 'Player'}'s Nexus`,
				ownerId: req.userId,
				galaxyId: req.galaxyId,
				x: Math.floor(Math.random() * 35),
				y: Math.floor(Math.random() * 35),
				...config.buildings,
				...config.troops,
				biomass: config.resources.biomass,
				alloy: config.resources.alloy,
				ore: config.resources.ore,
				populationCurrent: config.populationCurrent,
				populationMax: config.populationMax,
				newbieProtectionEndsAt: protectionEndsAt
			});
			res.json({ ...serializeNexus(nexus), eliminatedRespawn: true });
			return;
		}

		// Fresh signup: bare day-one starter. populationCurrent left unset so the
		// schema default (5) applies, preserving prior behaviour.
		const nexus = await nexusService.createNexus({
			name: bodyName || `${userRecord?.username ?? 'Player'}'s Nexus`,
			ownerId: req.userId,
			galaxyId: req.galaxyId,
			x: Math.floor(Math.random() * 35),
			y: Math.floor(Math.random() * 35),
			commandCore: 0,
			recruitmentCore: 0,
			lifeSupport: 1,
			storageVault: 1,
			biomassFarm: 1,
			alloyForge: 1,
			oreExtractor: 1,
			shieldGrid: 0,
			biomass: 1500,
			alloy: 1500,
			ore: 1500,
			populationMax: getPopulationMax(1),
			newbieProtectionEndsAt: protectionEndsAt
		});

		logGameEvent('first_nexus_created', req.userId, req.galaxyId, { nexusId: nexus.id });
		res.json({ ...serializeNexus(nexus), eliminatedRespawn: false });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function renameNexus(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parseInt(req.params.nexusId);
		const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
		if (name.length < 3 || name.length > 32) {
			res.status(400).json({ error: 'Nexus name must be between 3 and 32 characters' });
			return;
		}
		const nexus = await nexusService.getNexusById(nexusId);
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		if (nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const updated = await nexusService.updateNexus(nexus.id, { name });
		res.json(serializeNexus(updated));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getGroups(req: AuthRequest, res: Response): Promise<void> {
	try {
		const player = await nexusService.getPlayerGroups(req.userId, req.galaxyId);
		res.json(Array.isArray(player?.nexusGroups) ? player.nexusGroups : []);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function createGroup(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { name } = req.body as { name?: unknown };
		if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 32) {
			res.status(400).json({ error: 'Group name must be between 1 and 32 characters' });
			return;
		}
		const player = await nexusService.getPlayerGroups(req.userId, req.galaxyId);
		const groups = (Array.isArray(player?.nexusGroups) ? player.nexusGroups : []) as Array<{
			id: string;
			name: string;
			nexusIds: string[];
		}>;
		if (groups.length >= 10) {
			res.status(400).json({ error: 'Maximum of 10 groups allowed' });
			return;
		}
		const newGroup = { id: Date.now().toString(), name: name.trim(), nexusIds: [] };
		const updated = await nexusService.updatePlayerGroups(req.userId, req.galaxyId, [
			...groups,
			newGroup
		]);
		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function renameGroup(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { groupId } = req.params;
		const { name } = req.body as { name?: unknown };
		if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 32) {
			res.status(400).json({ error: 'Group name must be between 1 and 32 characters' });
			return;
		}
		const player = await nexusService.getPlayerGroups(req.userId, req.galaxyId);
		const groups = (Array.isArray(player?.nexusGroups) ? [...player.nexusGroups] : []) as Array<{
			id: string;
			name: string;
			nexusIds: string[];
		}>;
		const groupIndex = groups.findIndex((g) => g.id === groupId);
		if (groupIndex === -1) {
			res.status(404).json({ error: 'Group not found' });
			return;
		}
		groups[groupIndex] = { ...groups[groupIndex], name: name.trim() };
		const updated = await nexusService.updatePlayerGroups(req.userId, req.galaxyId, groups);
		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function deleteGroup(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { groupId } = req.params;
		const player = await nexusService.getPlayerGroups(req.userId, req.galaxyId);
		const groups = (Array.isArray(player?.nexusGroups) ? player.nexusGroups : []) as Array<{
			id: string;
			name: string;
			nexusIds: string[];
		}>;
		const filtered = groups.filter((g) => g.id !== groupId);
		if (filtered.length === groups.length) {
			res.status(404).json({ error: 'Group not found' });
			return;
		}
		const updated = await nexusService.updatePlayerGroups(req.userId, req.galaxyId, filtered);
		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function setGroupNexuses(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { groupId } = req.params;
		const { nexusIds } = req.body as { nexusIds?: unknown };
		if (!Array.isArray(nexusIds)) {
			res.status(400).json({ error: 'nexusIds must be an array' });
			return;
		}
		const player = await nexusService.getPlayerGroups(req.userId, req.galaxyId);
		const groups = (Array.isArray(player?.nexusGroups) ? [...player.nexusGroups] : []) as Array<{
			id: string;
			name: string;
			nexusIds: string[];
		}>;
		const groupIndex = groups.findIndex((g) => g.id === groupId);
		if (groupIndex === -1) {
			res.status(404).json({ error: 'Group not found' });
			return;
		}
		const ownedNexuses = await nexusService.getOwnedNexusIds(req.userId, req.galaxyId);
		const ownedIds = new Set(ownedNexuses.map((n) => String(n.id)));
		const validIds = (nexusIds as unknown[]).filter((id) => ownedIds.has(String(id)));
		groups[groupIndex] = { ...groups[groupIndex], nexusIds: validIds.map(String) };
		const updated = await nexusService.updatePlayerGroups(req.userId, req.galaxyId, groups);
		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function transferResources(req: AuthRequest, res: Response): Promise<void> {
	try {
		const {
			fromNexusId,
			toNexusId,
			biomass = 0,
			alloy = 0,
			ore = 0
		} = req.body as {
			fromNexusId?: unknown;
			toNexusId?: unknown;
			biomass?: number;
			alloy?: number;
			ore?: number;
		};

		if (!fromNexusId || !toNexusId || String(fromNexusId) === String(toNexusId)) {
			res.status(400).json({ error: 'Invalid nexus selection' });
			return;
		}

		let [from, to] = await Promise.all([
			nexusService.getNexusById(parseInt(String(fromNexusId))),
			nexusService.getNexusById(parseInt(String(toNexusId)))
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

		// Accumulate pending production before reading resource values so the
		// stale DB baseline doesn't cause resources to vanish on transfer.
		[from, to] = await Promise.all([refreshResources(from), refreshResources(to)]);

		// Cap each resource by what the SENDER actually has...
		let sendBiomass = Math.min(Math.max(0, Math.floor(Number(biomass))), Math.floor(from.biomass));
		let sendAlloy = Math.min(Math.max(0, Math.floor(Number(alloy))), Math.floor(from.alloy));
		let sendOre = Math.min(Math.max(0, Math.floor(Number(ore))), Math.floor(from.ore));

		// ...and by how much storage headroom the RECEIVER has left. Without this,
		// a transfer would push the destination over its cap and the overflow would
		// be silently destroyed on the next production tick (computeResourceUpdate
		// clamps to maxStorage). Clamp here so we only move what fits.
		const toMaxStorage = getMaxStorage(to as Parameters<typeof getMaxStorage>[0]);
		const headroom = {
			biomass: Math.max(0, Math.floor(toMaxStorage - to.biomass)),
			alloy: Math.max(0, Math.floor(toMaxStorage - to.alloy)),
			ore: Math.max(0, Math.floor(toMaxStorage - to.ore))
		};
		const requestedTotal = sendBiomass + sendAlloy + sendOre;
		sendBiomass = Math.min(sendBiomass, headroom.biomass);
		sendAlloy = Math.min(sendAlloy, headroom.alloy);
		sendOre = Math.min(sendOre, headroom.ore);
		const clampedTotal = sendBiomass + sendAlloy + sendOre;

		if (requestedTotal === 0) {
			res.status(400).json({ error: 'Nothing to transfer' });
			return;
		}
		if (clampedTotal === 0) {
			res.status(400).json({
				error: `${to.name} has no storage capacity left for these resources. Upgrade its Storage Vault or send less.`
			});
			return;
		}

		const [updatedFrom, updatedTo] = await nexusService.transferResources(
			from.id,
			to.id,
			{
				biomass: from.biomass - sendBiomass,
				alloy: from.alloy - sendAlloy,
				ore: from.ore - sendOre
			},
			{ biomass: to.biomass + sendBiomass, alloy: to.alloy + sendAlloy, ore: to.ore + sendOre }
		);
		const partiallyClamped = clampedTotal < requestedTotal;

		// Both nexuses belong to the same owner (verified above), so a single user
		// gets two snapshots. Failures here must not break the HTTP response.
		try {
			for (const n of [updatedFrom, updatedTo]) {
				notifyNexusResources(req.userId!, {
					nexusId: n.id,
					base: { biomass: n.biomass, alloy: n.alloy, ore: n.ore },
					production: getResourceProduction(n),
					storageMax: getMaxStorage(n),
					lastResourceUpdate: n.lastResourceUpdate
				});
			}
		} catch (emitErr) {
			logError('nexus_resources_emit_failed', {
				message: (emitErr as Error).message,
				file: 'nexusController.ts',
				op: 'transferResources'
			});
		}

		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			void incrementQuestProgress(req.userId, req.galaxyId, 'transfer_1', 1);
		} catch {}
		res.json({
			from: serializeNexus(updatedFrom),
			to: serializeNexus(updatedTo),
			// Tells the client some resources were held back because the destination
			// would have overflowed its storage cap.
			clamped: partiallyClamped,
			sent: { biomass: sendBiomass, alloy: sendAlloy, ore: sendOre }
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

const VALID_SPEC_TYPES = [
	'Resource Depot',
	'Supply Cache',
	'Military Outpost',
	'Forward Base'
] as const;
const COMMAND_CORE_SPECIALIZE_LEVEL = 15;

export async function claimQuestReward(req: AuthRequest, res: Response): Promise<void> {
	try {
		const sourceNexusId = parseInt(req.params.nexusId, 10);
		const { batchId } = req.params;
		const { rewardNexusId: rawRewardNexusId } = req.body as { rewardNexusId?: unknown };

		if (!Number.isFinite(sourceNexusId) || !batchId) {
			res.status(400).json({ error: 'Invalid parameters' });
			return;
		}

		const rewardNexusId =
			rawRewardNexusId != null ? parseInt(String(rawRewardNexusId), 10) : sourceNexusId;
		if (!Number.isFinite(rewardNexusId)) {
			res.status(400).json({ error: 'Invalid rewardNexusId' });
			return;
		}

		const sourceNexus = await nexusService.getNexusById(sourceNexusId);
		if (
			!sourceNexus ||
			sourceNexus.ownerId !== req.userId ||
			sourceNexus.galaxyId !== req.galaxyId
		) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		// Verify reward nexus also belongs to the player (claimQuestBatchReward does the same
		// check, but we want to give a clean 403 rather than a 500 on ownership mismatch).
		if (rewardNexusId !== sourceNexusId) {
			const rn = await nexusService.getNexusById(rewardNexusId);
			if (!rn || rn.ownerId !== req.userId || rn.galaxyId !== req.galaxyId) {
				res.status(403).json({ error: 'Target nexus not authorized' });
				return;
			}
		}

		const { rewardNexus, sourceNexus: updatedSource } = await claimQuestBatchReward(
			sourceNexus,
			batchId,
			rewardNexusId
		);

		try {
			notifyNexusResources(req.userId!, {
				nexusId: rewardNexus.id,
				base: { biomass: rewardNexus.biomass, alloy: rewardNexus.alloy, ore: rewardNexus.ore },
				production: getResourceProduction(rewardNexus),
				storageMax: getMaxStorage(rewardNexus),
				lastResourceUpdate: rewardNexus.lastResourceUpdate
			});
		} catch (e) {
			logError('nexus_resources_emit_failed', {
				message: (e as Error).message,
				file: 'nexusController.ts',
				op: 'claimQuestReward'
			});
		}

		res.json({
			rewardNexus: serializeNexus(rewardNexus),
			sourceNexus: serializeNexus(updatedSource)
		});
	} catch (error) {
		const msg = (error as Error).message;
		if (
			[
				'Reward already claimed',
				'Quest batch not completed',
				'Quest batch not unlocked',
				'Unknown quest batch'
			].includes(msg)
		) {
			res.status(400).json({ error: msg });
			return;
		}
		logError('unhandled_controller_error', { message: msg, file: 'nexusController.ts' });
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function specializeNexus(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexusId = parseInt(req.params.nexusId, 10);
		const { nexusType } = req.body as { nexusType?: string };

		if (!Number.isFinite(nexusId)) {
			res.status(400).json({ error: 'Invalid nexus id' });
			return;
		}
		if (!nexusType || !(VALID_SPEC_TYPES as readonly string[]).includes(nexusType)) {
			res.status(400).json({ error: 'Invalid specialization type' });
			return;
		}

		const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (nexus.commandCore < COMMAND_CORE_SPECIALIZE_LEVEL) {
			res
				.status(400)
				.json({
					error: `Command Core must be level ${COMMAND_CORE_SPECIALIZE_LEVEL} or higher to specialize`
				});
			return;
		}
		if ((nexus as unknown as { nexusTypeLockedAt?: Date | null }).nexusTypeLockedAt) {
			res.status(400).json({ error: 'This nexus is already specialized' });
			return;
		}
		if (nexus.nexusType && nexus.nexusType !== 'Neutral Settlement') {
			res.status(400).json({ error: 'This nexus already has a type assigned' });
			return;
		}

		const updated = await prisma.nexus.update({
			where: { id: nexusId },
			data: { nexusType, nexusTypeLockedAt: new Date(), nexusTypeDoubled: false }
		});

		res.json({
			success: true,
			nexus: serializeNexus(updated as Parameters<typeof serializeNexus>[0])
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'nexusController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
