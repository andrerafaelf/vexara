import type { Request, Response } from 'express';
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
		isLocked?: boolean;
		speedMultiplier?: number | null;
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
		isLocked: g.isLocked ?? false,
		speedMultiplier: g.speedMultiplier ?? 1.0,
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

async function getPublicStatusGalaxy() {
	const now = new Date();
	const candidates = await prisma.galaxy.findMany({
		where: {
			status: 'active',
			OR: [{ startsAt: null }, { startsAt: { lte: now } }]
		},
		select: { id: true, name: true, status: true, createdAt: true }
	});

	if (candidates.length === 0) return null;

	const galaxyIds = candidates.map((g) => g.id);
	const [playerCounts, claimedNexusCounts] = await Promise.all([
		prisma.galaxyPlayer.groupBy({
			by: ['galaxyId'],
			where: { galaxyId: { in: galaxyIds } },
			_count: { id: true }
		}),
		prisma.nexus.groupBy({
			by: ['galaxyId'],
			where: { galaxyId: { in: galaxyIds }, ownerId: { not: null } },
			_count: { id: true }
		})
	]);

	const playersByGalaxy = new Map(playerCounts.map((row) => [row.galaxyId, row._count.id]));
	const nexusesByGalaxy = new Map(claimedNexusCounts.map((row) => [row.galaxyId, row._count.id]));

	return candidates.sort((a, b) => {
		const playerDelta = (playersByGalaxy.get(b.id) ?? 0) - (playersByGalaxy.get(a.id) ?? 0);
		if (playerDelta !== 0) return playerDelta;

		const nexusDelta = (nexusesByGalaxy.get(b.id) ?? 0) - (nexusesByGalaxy.get(a.id) ?? 0);
		if (nexusDelta !== 0) return nexusDelta;

		return b.createdAt.getTime() - a.createdAt.getTime();
	})[0];
}

const PUBLIC_STATUS_CACHE_MS = 60 * 1000;
const ACTIVE_7D_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_24H_MS = 24 * 60 * 60 * 1000;
// The unauthenticated battle feed lags real time so it cannot be used as live intel.
const PUBLIC_BATTLE_DELAY_MS = 2 * 60 * 60 * 1000;

// Round to 2 significant figures (exact force sizes are tactical information).
function roundTo2Sig(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 0;
	if (n < 100) return Math.round(n);
	const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
	return Math.round(n / mag) * mag;
}

// Whole-response in-process cache for the public landing-page stats. The
// endpoint is unauthenticated and hit on every landing visit, so a wave of
// visitors must not turn into a wave of group-by queries. In-flight builds are
// shared so a cold cache under load still runs the queries once.
let publicStatusCache: { at: number; payload: Record<string, unknown> } | null = null;
let publicStatusInflight: Promise<Record<string, unknown>> | null = null;

async function buildPublicGalaxyStatus(): Promise<Record<string, unknown>> {
	const galaxy = await getPublicStatusGalaxy();
	const now = Date.now();
	// Real, verified, non-flagged accounts only (unverified/flagged signups are not players).
	const totalRegistered = await prisma.user.count({
		where: { emailVerifiedAt: { not: null }, isFlagged: false }
	});

	if (!galaxy) {
		return {
			galaxy: null,
			activePlayers: 0,
			activePlayers24h: 0,
			joinedPlayers: 0,
			totalRegistered,
			claimedNexuses: 0,
			topFactions: [],
			latestBattles: [],
			recentConquests: []
		};
	}

	const [
		joinedPlayers,
		activePlayers,
		activePlayers24h,
		claimedNexuses,
		factions,
		players,
		nexusCounts,
		attacks
	] = await Promise.all([
		prisma.galaxyPlayer.count({ where: { galaxyId: galaxy.id } }),
		prisma.galaxyPlayer.count({
			where: { galaxyId: galaxy.id, user: { lastPlayedAt: { gte: new Date(now - ACTIVE_7D_MS) } } }
		}),
		prisma.galaxyPlayer.count({
			where: { galaxyId: galaxy.id, user: { lastPlayedAt: { gte: new Date(now - ACTIVE_24H_MS) } } }
		}),
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
		// Player-initiated battles only: NPC (Rogue AI) raids have a null attackerUserId.
		prisma.attack.findMany({
			where: {
				galaxyId: galaxy.id,
				status: 'completed',
				type: 'attack',
				attackerUserId: { not: null },
				arrivesAt: { lt: new Date(now - PUBLIC_BATTLE_DELAY_MS) }
			},
			orderBy: { arrivesAt: 'desc' },
			take: 10,
			select: {
				id: true,
				result: true,
				arrivesAt: true,
				attackerUserId: true,
				defenderUserId: true,
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

	// Resolve names from the ids stored on the attack, not the nexus's CURRENT owner:
	// after a conquest the defender nexus belongs to the attacker.
	const battleRows = attacks.slice(0, 5);
	const battleUserIds = [
		...new Set(
			battleRows
				.flatMap((a) => [a.attackerUserId, a.defenderUserId])
				.filter((id): id is number => id != null)
		)
	];
	const battleUsers =
		battleUserIds.length > 0
			? await prisma.user.findMany({
					where: { id: { in: battleUserIds } },
					select: { id: true, username: true }
				})
			: [];
	const usernameById = new Map(battleUsers.map((u) => [u.id, u.username]));

	const latestBattles = battleRows.map((a) => {
		const result = (a.result ?? {}) as Record<string, unknown>;
		return {
			id: a.id,
			attacker:
				(a.attackerUserId != null ? usernameById.get(a.attackerUserId) : undefined) ??
				a.attackerNexus.owner?.username ??
				'Unknown',
			defender:
				a.defenderUserId == null
					? a.defenderNexus.name || 'Neutral'
					: (usernameById.get(a.defenderUserId) ?? a.defenderNexus.owner?.username ?? 'Unknown'),
			attackerNexus: a.attackerNexus.name,
			defenderNexus: a.defenderNexus.name,
			victory: Boolean(result.victory),
			conquered: Boolean(result.conquered),
			totalUnits: roundTo2Sig(
				sumRecordValues(result.attackerInitial) + sumRecordValues(result.defenderInitial)
			),
			arrivesAt: a.arrivesAt
		};
	});

	return {
		galaxy,
		activePlayers,
		activePlayers24h,
		joinedPlayers,
		totalRegistered,
		claimedNexuses,
		topFactions,
		latestBattles,
		recentConquests: latestBattles.filter((b) => b.conquered).slice(0, 3)
	};
}

export async function getPublicGalaxyStatus(_req: AuthRequest, res: Response): Promise<void> {
	try {
		const now = Date.now();
		let payload: Record<string, unknown>;
		if (publicStatusCache && now - publicStatusCache.at < PUBLIC_STATUS_CACHE_MS) {
			payload = publicStatusCache.payload;
		} else {
			publicStatusInflight ??= buildPublicGalaxyStatus().finally(() => {
				publicStatusInflight = null;
			});
			payload = await publicStatusInflight;
			publicStatusCache = { at: Date.now(), payload };
		}
		res.setHeader('Cache-Control', 'public, max-age=60');
		res.json(payload);
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

// Public — no auth required. Returns the 20 most recent ended galaxies, each
// with their winning faction and top 3 commanders by points.
export async function getHallOfFame(_req: Request, res: Response): Promise<void> {
	try {
		const ended = await prisma.galaxy.findMany({
			where: { status: 'ended' },
			orderBy: { endedAt: 'desc' },
			take: 20,
			select: {
				id: true,
				name: true,
				endedAt: true,
				winnerFactionId: true
			}
		});

		const galaxyIds = ended.map((g) => g.id);

		const [factions, records] = await Promise.all([
			prisma.faction.findMany({
				where: { id: { in: ended.map((g) => g.winnerFactionId).filter(Boolean) as number[] } },
				select: { id: true, name: true, tag: true }
			}),
			prisma.seasonRecord.findMany({
				where: { galaxyId: { in: galaxyIds } },
				orderBy: [{ galaxyId: 'asc' }, { points: 'desc' }],
				select: {
					galaxyId: true,
					points: true,
					won: true,
					factionName: true,
					factionTag: true,
					user: { select: { id: true, username: true, avatarKey: true } }
				}
			})
		]);

		const factionById = new Map(factions.map((f) => [f.id, f]));

		// Group records by galaxy, keep top 3 per galaxy
		const recordsByGalaxy = new Map<number, typeof records>();
		for (const r of records) {
			const list = recordsByGalaxy.get(r.galaxyId) ?? [];
			if (list.length < 3) list.push(r);
			recordsByGalaxy.set(r.galaxyId, list);
		}

		const seasons = ended.map((g) => ({
			id: g.id,
			name: g.name,
			endedAt: g.endedAt,
			winnerFaction: g.winnerFactionId ? (factionById.get(g.winnerFactionId) ?? null) : null,
			topCommanders: (recordsByGalaxy.get(g.id) ?? []).map((r, i) => ({
				rank: i + 1,
				userId: r.user.id,
				username: r.user.username,
				avatarUrl: avatarUrl(r.user.id, r.user.avatarKey),
				points: r.points,
				won: r.won,
				factionName: r.factionName,
				factionTag: r.factionTag
			}))
		}));

		res.setHeader('Cache-Control', 'public, max-age=300');
		res.json({ seasons });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
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
		// A locked galaxy accepts no new players, but already-joined members may still
		// enter and play. Only block when the caller isn't already a member.
		if (galaxy.isLocked && !(await galaxyService.isGalaxyMember(req.userId, galaxyId))) {
			res.status(403).json({ error: 'This galaxy is locked and not accepting new players' });
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

// POST /api/galaxies/:id/alert
// Register an email to be notified when a pending galaxy goes live.
// Works for both authenticated users (email auto-filled) and guests (email in body).
export async function registerGalaxyAlert(req: AuthRequest, res: Response): Promise<void> {
	try {
		const galaxyId = parseInt(req.params.id, 10);
		if (!Number.isFinite(galaxyId)) {
			res.status(400).json({ error: 'Invalid galaxy id' });
			return;
		}

		// Resolve email: from auth token if logged in, else from request body
		let email: string | undefined;
		if (req.userId) {
			const user = await prisma.user.findUnique({
				where: { id: req.userId },
				select: { email: true }
			});
			email = user?.email;
		}
		if (!email) {
			const body = req.body as { email?: string };
			email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
		}
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			res.status(400).json({ error: 'A valid email address is required' });
			return;
		}

		const galaxy = await prisma.galaxy.findUnique({ where: { id: galaxyId } });
		if (!galaxy) {
			res.status(404).json({ error: 'Galaxy not found' });
			return;
		}
		if (!galaxy.startsAt || new Date(galaxy.startsAt) <= new Date()) {
			res.status(400).json({ error: 'This galaxy is already live' });
			return;
		}

		await prisma.galaxyAlert.upsert({
			where: { galaxyId_email: { galaxyId, email } },
			create: { galaxyId, email },
			update: {}
		});

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'galaxyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
