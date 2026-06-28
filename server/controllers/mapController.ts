import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import * as mapService from '../services/mapService.js';
import type { AuthRequest } from '../types/index.js';
import { NEXUS_ACTIVE_WINDOW_MS } from '../utils/gameConstants.js';
import { logError } from '../utils/logger.js';
import { getNexusIntelForUser, type FriendlyRelation } from '../utils/scouting.js';

export async function getArea(req: AuthRequest, res: Response): Promise<void> {
	try {
		const x = parseInt(req.params.x);
		const y = parseInt(req.params.y);
		// Must stay >= the client's SERVER_FETCH_RANGE (client Map.tsx). The fetched
		// box is larger than the rendered window so there's a pan buffer the client
		// can scroll into before the next fetch lands.
		const range = 20;
		const nexuses = await mapService.getNexusesInArea(req.galaxyId, x, y, range);
		const ownerIds = [
			...new Set(nexuses.map((v) => v.ownerId).filter((id): id is number => id != null))
		];
		const ownerPlayers = await mapService.getGalaxyPlayerPoints(req.galaxyId, ownerIds);
		const pointsByOwnerId = new Map(ownerPlayers.map((p) => [p.userId, p.points]));

		// Determine the viewer's faction (if any) and which owners are in the
		// same faction or on the viewer's friends list, so the map can colour
		// shared-faction nexuses differently from individual allies.
		const factionMembers = ownerIds.length
			? await prisma.factionMember.findMany({
					where: { galaxyId: req.galaxyId, userId: { in: [...ownerIds, req.userId] } },
					select: { userId: true, factionId: true }
				})
			: [];
		const myFactionId = factionMembers.find((m) => m.userId === req.userId)?.factionId ?? null;
		const factionByUserId = new Map(factionMembers.map((m) => [m.userId, m.factionId]));

		const friendships = ownerIds.length
			? await prisma.friendship.findMany({
					where: {
						OR: [
							{ userAId: req.userId, userBId: { in: ownerIds } },
							{ userBId: req.userId, userAId: { in: ownerIds } }
						]
					},
					select: { userAId: true, userBId: true }
				})
			: [];
		const friendIds = new Set<number>();
		for (const f of friendships) {
			friendIds.add(f.userAId === req.userId ? f.userBId : f.userAId);
		}

		// Ally vision: factions with an active nap, trade, or vassal treaty with the
		// viewer's faction get the 'ally' relation. We batch this across all foreign
		// factionIds visible in the current viewport so it stays a single query per
		// map fetch. A broken NAP is excluded (status='active') - it does not grant
		// vision, which prevents x-ray-defenses-then-betray.
		const alliedFactionIds = new Set<number>();
		if (myFactionId && ownerIds.length) {
			const foreignFactionIds = [
				...new Set(
					[...factionByUserId.entries()]
						.filter(([uid, fid]) => uid !== req.userId && fid !== myFactionId)
						.map(([, fid]) => fid)
				)
			];
			if (foreignFactionIds.length > 0) {
				const treaties = await prisma.factionTreaty.findMany({
					where: {
						galaxyId: req.galaxyId,
						status: 'active',
						type: { in: ['nap', 'trade', 'vassal'] },
						OR: [
							{
								proposerFactionId: myFactionId,
								targetFactionId: { in: foreignFactionIds }
							},
							{
								targetFactionId: myFactionId,
								proposerFactionId: { in: foreignFactionIds }
							}
						]
					},
					select: { proposerFactionId: true, targetFactionId: true }
				});
				for (const t of treaties) {
					alliedFactionIds.add(
						t.proposerFactionId === myFactionId ? t.targetFactionId : t.proposerFactionId
					);
				}
			}
		}

		const relationFor = (ownerId: number | null): FriendlyRelation => {
			if (ownerId == null || ownerId === req.userId) return null;
			if (myFactionId && factionByUserId.get(ownerId) === myFactionId) return 'faction';
			if (friendIds.has(ownerId)) return 'friend';
			// Ally: the owner's faction has an active treaty with the viewer's faction.
			const ownerFactionId = factionByUserId.get(ownerId);
			if (ownerFactionId && alliedFactionIds.has(ownerFactionId)) return 'ally';
			return null;
		};

		// Load faction targets so we can flag targeted nexuses for the viewer's faction.
		const nexusIds = nexuses.map((v) => v.id);
		const factionTargetSet = new Set<number>();
		if (myFactionId && nexusIds.length) {
			const targets = await prisma.factionTarget.findMany({
				where: { factionId: myFactionId, nexusId: { in: nexusIds } },
				select: { nexusId: true }
			});
			for (const t of targets) factionTargetSet.add(t.nexusId);
		}

		const now = new Date();
		const activeCutoff = now.getTime() - NEXUS_ACTIVE_WINDOW_MS;
		const result = nexuses.map((v) => {
			const relation = relationFor(v.ownerId ?? null);
			// Presence signal for other players: an owned, recently-acted-on nexus
			// reads as "active". Neutral nexuses (no owner) are never active.
			const active =
				v.ownerId != null && v.lastActivityAt != null && v.lastActivityAt.getTime() >= activeCutoff;
			return {
				_id: String(v.id),
				id: String(v.id),
				name: v.name,
				x: v.x,
				y: v.y,
				points: v.points,
				// nexusType is public identity - visible to all, including allies
				// without a scout report. Garrison and buildings remain scout-gated.
				nexusType: v.nexusType ?? null,
				owner: v.owner
					? {
							_id: String(v.owner.id),
							id: String(v.owner.id),
							username: v.owner.username,
							isSupporter: v.owner.isSupporter,
							supporterTier: v.owner.supporterTier,
							avatarUrl: avatarUrl(v.owner.id, v.owner.avatarKey),
							avatarUrlSm: avatarUrlSm(v.owner.id, v.owner.avatarKey),
							points: pointsByOwnerId.get(v.owner.id) ?? 0
						}
					: null,
				intelLevel: v.ownerId === req.userId ? 'owned' : 'public',
				newbieProtectionEndsAt:
					v.newbieProtectionEndsAt && v.newbieProtectionEndsAt > now
						? v.newbieProtectionEndsAt
						: null,
				isFriendly: relation !== null,
				relation,
				isFactionTarget: factionTargetSet.has(v.id),
				active
			};
		});
		res.json(result);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'mapController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getNexusIntel(req: AuthRequest, res: Response): Promise<void> {
	try {
		const nexus = await getNexusIntelForUser(
			req.userId,
			parseInt(req.params.nexusId),
			req.galaxyId
		);
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		res.json(nexus);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'mapController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getGalaxyEvents(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { getActiveGalaxyEvents } = await import('../utils/galaxyEvents.js');
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}
		const { events, eventsStartAt } = await getActiveGalaxyEvents(user.activeGalaxyId);
		res.json({ events, eventsStartAt });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'mapController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
