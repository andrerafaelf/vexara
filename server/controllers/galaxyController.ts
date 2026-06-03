import type { Response } from 'express';
import { invalidateAuthCache } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import * as galaxyService from '../services/galaxyService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';

function serializeGalaxy(
	g: {
		id: number;
		name: string;
		status: string;
		startsAt?: Date | null;
		endedAt?: Date | null;
		winnerUserId?: number | null;
		winnerFactionId?: number | null;
		createdAt: Date;
	},
	opts: { isJoined?: boolean } = {}
) {
	return {
		id: g.id,
		name: g.name,
		status: g.status,
		startsAt: g.startsAt ?? null,
		endedAt: g.endedAt ?? null,
		winnerUserId: g.winnerUserId ?? null,
		winnerFactionId: g.winnerFactionId ?? null,
		createdAt: g.createdAt,
		isJoined: opts.isJoined ?? false
	};
}

const GALAXY_WIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function sumRecordValues(value: unknown): number {
	if (!value || typeof value !== 'object') return 0;
	return Object.values(value as Record<string, unknown>).reduce<number>(
		(total: number, v: unknown) => total + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
		0
	);
}

export async function getPublicGalaxyStatus(_req: AuthRequest, res: Response): Promise<void> {
	try {
		const galaxy = await prisma.galaxy.findFirst({
			where: { status: 'active' },
			orderBy: { createdAt: 'desc' },
			select: { id: true, name: true, status: true, createdAt: true }
		});

		if (!galaxy) {
			res.json({
				galaxy: null,
				activePlayers: 0,
				totalRegistered: await prisma.user.count(),
				claimedNexuses: 0,
				topFactions: [],
				latestBattles: [],
				recentConquests: []
			});
			return;
		}

		const [
			activePlayers,
			totalRegistered,
			claimedNexuses,
			factions,
			players,
			nexusCounts,
			attacks
		] = await Promise.all([
			prisma.galaxyPlayer.count({ where: { galaxyId: galaxy.id } }),
			prisma.user.count(),
			prisma.nexus.count({ where: { galaxyId: galaxy.id, ownerId: { not: null } } }),
			prisma.faction.findMany({
				where: { galaxyId: galaxy.id },
				select: { id: true, name: true, tag: true, members: { select: { userId: true } } }
			}),
			prisma.galaxyPlayer.findMany({
				where: { galaxyId: galaxy.id },
				select: { userId: true, points: true }
			}),
			prisma.nexus.groupBy({
				by: ['ownerId'],
				where: { galaxyId: galaxy.id, ownerId: { not: null } },
				_count: { id: true }
			}),
			prisma.attack.findMany({
				where: { galaxyId: galaxy.id, status: 'completed', type: 'attack' },
				orderBy: { arrivesAt: 'desc' },
				take: 20,
				select: {
					id: true,
					result: true,
					arrivesAt: true,
					attackerNexus: { select: { owner: { select: { username: true } }, name: true } },
					defenderNexus: { select: { owner: { select: { username: true } }, name: true } }
				}
			})
		]);

		const pointsByUser = new Map(players.map((p) => [p.userId, p.points]));
		const nexusesByOwner = new Map(nexusCounts.map((n) => [n.ownerId!, n._count.id]));
		const topFactions = factions
			.map((f) => ({
				id: f.id,
				name: f.name,
				tag: f.tag,
				members: f.members.length,
				points: f.members.reduce((sum, m) => sum + (pointsByUser.get(m.userId) ?? 0), 0),
				nexuses: f.members.reduce((sum, m) => sum + (nexusesByOwner.get(m.userId) ?? 0), 0)
			}))
			.sort((a, b) => b.points - a.points)
			.slice(0, 3);

		const latestBattles = attacks.slice(0, 5).map((a) => {
			const result = (a.result ?? {}) as Record<string, unknown>;
			return {
				id: a.id,
				attacker: a.attackerNexus.owner?.username ?? 'Unknown',
				defender: a.defenderNexus.owner?.username ?? 'Neutral',
				attackerNexus: a.attackerNexus.name,
				defenderNexus: a.defenderNexus.name,
				victory: Boolean(result.victory),
				conquered: Boolean(result.conquered),
				totalUnits:
					sumRecordValues(result.attackerInitial) + sumRecordValues(result.defenderInitial),
				arrivesAt: a.arrivesAt
			};
		});

		res.setHeader('Cache-Control', 'public, max-age=60');
		res.json({
			galaxy,
			activePlayers,
			totalRegistered,
			claimedNexuses,
			topFactions,
			latestBattles,
			recentConquests: latestBattles.filter((b) => b.conquered).slice(0, 3)
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function listGalaxies(req: AuthRequest, res: Response): Promise<void> {
	try {
		const [galaxies, myPlayers] = await Promise.all([
			galaxyService.getAllGalaxies(),
			galaxyService.getMyGalaxyPlayers(req.userId)
		]);
		const joined = new Set(myPlayers.map((p) => p.galaxyId));
		const cutoff = new Date(Date.now() - GALAXY_WIN_WINDOW_MS);
		const visible = galaxies.filter(
			(g) => g.status === 'active' || (g.endedAt && new Date(g.endedAt) >= cutoff)
		);
		res.json(visible.map((g) => serializeGalaxy(g, { isJoined: joined.has(g.id) })));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getGalaxyWinResults(req: AuthRequest, res: Response): Promise<void> {
	try {
		const galaxyId = parseInt(req.params.id, 10);
		if (!Number.isFinite(galaxyId)) {
			res.status(400).json({ error: 'Invalid galaxy id' });
			return;
		}
		const galaxy = await galaxyService.getGalaxyById(galaxyId);
		if (!galaxy) {
			res.status(404).json({ error: 'Galaxy not found' });
			return;
		}
		if (galaxy.status !== 'ended') {
			res.status(400).json({ error: 'Galaxy has not ended' });
			return;
		}

		const [factions, players] = await Promise.all([
			prisma.faction.findMany({
				where: { galaxyId },
				select: {
					id: true,
					name: true,
					tag: true,
					members: { where: { galaxyId }, select: { userId: true } }
				}
			}),
			prisma.galaxyPlayer.findMany({
				where: { galaxyId },
				select: {
					userId: true,
					points: true,
					user: {
						select: { username: true, isSupporter: true, supporterTier: true, avatarKey: true }
					}
				},
				orderBy: { points: 'desc' }
			})
		]);

		const nexusCounts = await prisma.nexus.groupBy({
			by: ['ownerId'],
			where: { galaxyId, ownerId: { not: null } },
			_count: { id: true }
		});
		const nexusByOwner = new Map(nexusCounts.map((r) => [r.ownerId!, r._count.id]));

		const userFactionMap = new Map<number, number>();
		for (const f of factions) {
			for (const m of f.members) userFactionMap.set(m.userId, f.id);
		}

		const factionPoints = new Map<number, number>();
		const factionNexuses = new Map<number, number>();
		for (const p of players) {
			const fId = userFactionMap.get(p.userId);
			if (fId) {
				factionPoints.set(fId, (factionPoints.get(fId) || 0) + p.points);
				factionNexuses.set(fId, (factionNexuses.get(fId) || 0) + (nexusByOwner.get(p.userId) || 0));
			}
		}

		const factionLeaderboard = factions
			.map((f) => ({
				id: f.id,
				name: f.name,
				tag: f.tag,
				points: factionPoints.get(f.id) || 0,
				nexuses: factionNexuses.get(f.id) || 0,
				isWinner: f.id === galaxy.winnerFactionId
			}))
			.sort((a, b) => b.points - a.points);

		res.json({
			galaxy: serializeGalaxy(galaxy),
			factionLeaderboard,
			topPlayers: players.slice(0, 20).map((p) => ({
				userId: p.userId,
				username: p.user?.username ?? 'Unknown',
				isSupporter: p.user?.isSupporter ?? false,
				supporterTier: p.user?.supporterTier ?? null,
				avatarUrl: avatarUrl(p.userId, p.user?.avatarKey ?? null),
				avatarUrlSm: avatarUrlSm(p.userId, p.user?.avatarKey ?? null),
				points: p.points,
				nexuses: nexusByOwner.get(p.userId) || 0,
				factionId: userFactionMap.get(p.userId) ?? null
			}))
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMyGalaxy(req: AuthRequest, res: Response): Promise<void> {
	try {
		const user = await galaxyService.getUserWithGalaxy(req.userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		res.json({
			activeGalaxy: user.activeGalaxy
				? serializeGalaxy(user.activeGalaxy, { isJoined: true })
				: null
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function leaveGalaxy(req: AuthRequest, res: Response): Promise<void> {
	try {
		const galaxyId = parseInt(req.params.id, 10);
		if (!Number.isFinite(galaxyId)) {
			res.status(400).json({ error: 'Invalid galaxy id' });
			return;
		}
		const galaxy = await galaxyService.getGalaxyById(galaxyId);
		if (!galaxy) {
			res.status(404).json({ error: 'Galaxy not found' });
			return;
		}
		if (galaxy.status !== 'active') {
			res.status(400).json({ error: 'Cannot leave an ended galaxy' });
			return;
		}
		await galaxyService.leaveGalaxy(req.userId, galaxyId);
		invalidateAuthCache(req.userId);
		res.json({ success: true });
	} catch (error) {
		const status = (error as { status?: number }).status || 500;
		if (status >= 500) {
			logError('unhandled_controller_error', {
				message: (error as Error).message,
				file: 'galaxyController.ts'
			});
			res.status(status).json({ error: 'Internal server error' });
		} else {
			res.status(status).json({ error: (error as Error).message });
		}
	}
}

export async function selectGalaxy(req: AuthRequest, res: Response): Promise<void> {
	try {
		const galaxyId = parseInt(req.params.id, 10);
		if (!Number.isFinite(galaxyId)) {
			res.status(400).json({ error: 'Invalid galaxy id' });
			return;
		}
		const galaxy = await galaxyService.getGalaxyById(galaxyId);
		if (!galaxy) {
			res.status(404).json({ error: 'Galaxy not found' });
			return;
		}
		if (galaxy.status !== 'active') {
			res.status(400).json({ error: 'Cannot select an ended galaxy as active' });
			return;
		}
		if (galaxy.startsAt && new Date(galaxy.startsAt) > new Date()) {
			res.status(400).json({ error: 'This galaxy has not started yet' });
			return;
		}
		const user = await galaxyService.getUserById(req.userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const result = await galaxyService.selectGalaxy(req.userId, user.username, galaxyId);
		invalidateAuthCache(req.userId);
		res.json({
			success: true,
			joined: result.joined,
			activeGalaxy: serializeGalaxy(galaxy, { isJoined: true })
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
