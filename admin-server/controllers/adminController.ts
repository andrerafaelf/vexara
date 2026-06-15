// List alpha signups who haven't created an account yet
export async function listPendingAlphaSignups(_req: Request, res: Response): Promise<void> {
	try {
		const pending = await adminService.getPendingAlphaSignups();
		res.json(pending);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Resend registration email to a pending alpha signup
export async function resendAlphaRegistrationEmail(req: Request, res: Response): Promise<void> {
	try {
		const { email } = req.body as { email?: string };
		if (!email) {
			res.status(400).json({ error: 'Email is required' });
			return;
		}
		const { sendAlphaInviteAnnouncement } = await import('../../server/services/emailService.js');
		await sendAlphaInviteAnnouncement(email);
		res.json({ success: true, message: `Registration email resent to ${email}` });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Preview the recipient list for the galaxy-live launch broadcast (no emails sent)
export async function previewGalaxyLiveBroadcast(_req: Request, res: Response): Promise<void> {
	try {
		const { collectGalaxyLiveRecipients } =
			await import('../../server/services/broadcastService.js');
		const recipients = await collectGalaxyLiveRecipients();
		const fromUsers = recipients.filter((r) => r.source === 'user').length;
		const fromSignups = recipients.filter((r) => r.source === 'alphaSignup').length;
		res.json({
			total: recipients.length,
			fromUsers,
			fromSignups,
			sample: recipients
				.slice(0, 10)
				.map((r) => ({ email: r.email, displayName: r.displayName, source: r.source }))
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Send a single test copy of the galaxy-live email to a hardcoded address (for previewing the template)
export async function sendGalaxyLiveTest(_req: Request, res: Response): Promise<void> {
	try {
		const testEmail = 'andrerafaelff@gmail.com';
		const { sendGalaxyLive } = await import('../../server/services/emailService.js');
		await sendGalaxyLive(testEmail);
		res.json({ success: true, message: `Test launch email sent to ${testEmail}` });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Send the galaxy-live launch broadcast to every recipient
export async function sendGalaxyLiveBroadcast(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as { dryRun?: boolean; ratePerSecond?: number };
		const { broadcastGalaxyLive } = await import('../../server/services/broadcastService.js');
		const result = await broadcastGalaxyLive({
			dryRun: body.dryRun === true,
			ratePerSecond: typeof body.ratePerSecond === 'number' ? body.ratePerSecond : undefined
		});
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Preview opt-in alert list for a pending galaxy (no emails sent)
export async function previewGalaxyAlertBroadcast(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = parseInt((req.params as { id?: string }).id ?? '', 10);
		if (!Number.isFinite(galaxyId)) {
			res.status(400).json({ error: 'Invalid galaxy id' });
			return;
		}
		const alerts = await prisma.galaxyAlert.findMany({
			where: { galaxyId, sentAt: null },
			select: { email: true, createdAt: true }
		});
		res.json({ total: alerts.length, sample: alerts.slice(0, 10) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Send launch-alert emails to all opt-in subscribers for a pending galaxy
export async function sendGalaxyAlertBroadcast(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = parseInt((req.params as { id?: string }).id ?? '', 10);
		if (!Number.isFinite(galaxyId)) {
			res.status(400).json({ error: 'Invalid galaxy id' });
			return;
		}
		const body = (req.body ?? {}) as { dryRun?: boolean; ratePerSecond?: number };
		const { broadcastGalaxyAlert } = await import('../../server/services/broadcastService.js');
		const result = await broadcastGalaxyAlert(galaxyId, {
			dryRun: body.dryRun === true,
			ratePerSecond: typeof body.ratePerSecond === 'number' ? body.ratePerSecond : undefined
		});
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}
import type { Request, Response } from 'express';
import prisma from '../../server/lib/prisma.js';
import { serializeNexus } from '../../server/models/Nexus.js';
import { processArrivedAttacks, processArrivedTransfers } from '../../server/utils/combat.js';
import {
	computeNexusPopulation,
	getPopulationMax,
	loadAwayPopulation,
	recountAllPopulation
} from '../../server/utils/population.js';
import { NOTIF, sendPushToUser } from '../../server/utils/push.js';
import * as adminService from '../services/adminService.js';

const TROOP_KEYS = [
	'sentinelLancer',
	'assaultTrooper',
	'vanguardBreaker',
	'reconOperative',
	'wraithSkimmer',
	'siegeMech',
	'bulwarkGuard',
	'aegisSkirmisher',
	'pyreSuppressor',
	'arcDisruptor',
	'phantomLance',
	'voidStalker',
	'plasmaTurret',
	'annihilatorPlatform',
	'siegeColossus',
	'overseer'
] as const;
const BUILDING_KEYS = [
	'commandCore',
	'hangarBay',
	'plasmaForge',
	'armorFoundry',
	'lifeSupport',
	'storageVault',
	'biomassFarm',
	'alloyForge',
	'oreExtractor',
	'shieldGrid',
	'targetingCore',
	'stealthArray'
] as const;

function getGalaxyId(req: Request): number | null {
	const raw = (req.query.galaxyId ?? req.body?.galaxyId) as unknown;
	const parsed = Number.parseInt(String(raw ?? ''), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requireGalaxyId(req: Request, res: Response): number | null {
	const id = getGalaxyId(req);
	if (id == null) {
		res.status(400).json({ error: 'galaxyId is required' });
		return null;
	}
	return id;
}

// Admin-only controllers for managing galaxies, users, and performing actions on behalf of users
export async function getOverview(_req: Request, res: Response): Promise<void> {
	try {
		const data = await adminService.getOverviewStats();
		res.json(data);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function getGalaxyHealth(_req: Request, res: Response): Promise<void> {
	try {
		const data = await adminService.getGalaxyHealth();
		res.json(data);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function listGalaxies(_req: Request, res: Response): Promise<void> {
	try {
		const galaxies = await adminService.getAllGalaxies();
		res.json(
			galaxies.map((g) => ({
				_id: g.id,
				id: g.id,
				name: g.name,
				status: g.status,
				startsAt: g.startsAt,
				endedAt: g.endedAt,
				winnerUserId: g.winnerUserId,
				createdAt: g.createdAt,
				playerCount: g._count.players,
				nexusCount: g._count.nexuses,
				isLocked: g.isLocked,
				winShare: g.winShare,
				winSustainHours: g.winSustainHours,
				winMinPlayers: g.winMinPlayers,
				winMinFactions: g.winMinFactions,
				speedMultiplier: g.speedMultiplier,
					seasonEndsAt: g.seasonEndsAt
			}))
		);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function createGalaxy(req: Request, res: Response): Promise<void> {
	try {
		// Basic validation for galaxy name and start date, more can be added as needed
		const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
		if (rawName.length < 3 || rawName.length > 40) {
			res.status(400).json({ error: 'Galaxy name must be between 3 and 40 characters' });
			return;
		}
		const existing = await adminService.getGalaxyByName(rawName);
		if (existing) {
			res.status(400).json({ error: 'A galaxy with that name already exists' });
			return;
		}
		const rawStartsAt = req.body?.startsAt;
		const startsAt = rawStartsAt ? new Date(rawStartsAt) : null;
		if (startsAt && isNaN(startsAt.getTime())) {
			res.status(400).json({ error: 'Invalid startsAt date' });
			return;
		}
		const galaxy = await adminService.createGalaxy(rawName, startsAt ?? undefined);
		res.json({
			success: true,
			galaxy: {
				_id: galaxy.id,
				id: galaxy.id,
				name: galaxy.name,
				status: galaxy.status,
				startsAt: galaxy.startsAt,
				endedAt: galaxy.endedAt,
				winnerUserId: galaxy.winnerUserId,
				createdAt: galaxy.createdAt,
				playerCount: 0,
				nexusCount: 0,
				isLocked: galaxy.isLocked,
				winShare: galaxy.winShare,
				winSustainHours: galaxy.winSustainHours,
				winMinPlayers: galaxy.winMinPlayers,
				winMinFactions: galaxy.winMinFactions,
				speedMultiplier: galaxy.speedMultiplier
			}
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function deleteGalaxy(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = adminService.toInt(req.params.galaxyId);
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const galaxy = await prisma.galaxy.findUnique({ where: { id: galaxyId } });
		if (!galaxy) {
			res.status(404).json({ error: 'Galaxy not found' });
			return;
		}
		await prisma.galaxy.delete({ where: { id: galaxyId } });
		res.json({ success: true, message: 'Galaxy deleted' });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Update a galaxy's lock state and/or per-galaxy win config. Each field is optional;
// only provided keys are written. Win* fields accept a number to override or null to
// clear the override (falling back to the engine default in server/utils/dominance.ts).
export async function updateGalaxy(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = adminService.toInt(req.params.galaxyId);
		const galaxy = await adminService.getGalaxyById(galaxyId);
		if (!galaxy) {
			res.status(404).json({ error: 'Galaxy not found' });
			return;
		}

		const body = (req.body ?? {}) as Record<string, unknown>;
		const data: {
			isLocked?: boolean;
			winShare?: number | null;
			winSustainHours?: number | null;
			winMinPlayers?: number | null;
			winMinFactions?: number | null;
			speedMultiplier?: number;
		} = {};

		if ('isLocked' in body) data.isLocked = Boolean(body.isLocked);

		// A win* key may be omitted (leave as-is), null (clear override), or a number.
		// Numbers are clamped to the same bounds dominance.ts enforces so the stored
		// value and the live behaviour always agree.
		const parseWin = (
			key: 'winShare' | 'winSustainHours' | 'winMinPlayers' | 'winMinFactions',
			clamp: (n: number) => number
		): { ok: true; value: number | null } | { ok: false } | { skip: true } => {
			if (!(key in body)) return { skip: true };
			const raw = body[key];
			if (raw === null || raw === '') return { ok: true, value: null };
			const n = Number(raw);
			if (!Number.isFinite(n)) return { ok: false };
			return { ok: true, value: clamp(n) };
		};

		const wins = {
			winShare: parseWin('winShare', (n) => Math.min(0.95, Math.max(0.3, n))),
			winSustainHours: parseWin('winSustainHours', (n) =>
				Math.min(720, Math.max(0, Math.round(n)))
			),
			winMinPlayers: parseWin('winMinPlayers', (n) => Math.max(1, Math.round(n))),
			winMinFactions: parseWin('winMinFactions', (n) => Math.max(1, Math.round(n)))
		} as const;

		for (const [key, result] of Object.entries(wins)) {
			if ('skip' in result) continue;
			if (!('ok' in result) || !result.ok) {
				res.status(400).json({ error: `Invalid ${key}` });
				return;
			}
			(data as Record<string, number | null>)[key] = result.value;
		}

		if ('speedMultiplier' in body) {
			const sp = Number(body.speedMultiplier);
			if (!Number.isFinite(sp) || sp <= 0 || sp > 100) {
				res.status(400).json({ error: 'speedMultiplier must be > 0 and ≤ 100' });
				return;
			}
			data.speedMultiplier = sp;
		}

		if (Object.keys(data).length === 0) {
			res.status(400).json({ error: 'No updatable fields provided' });
			return;
		}

		const updated = await adminService.updateGalaxy(galaxyId, data);
		res.json({
			success: true,
			galaxy: {
				_id: updated.id,
				id: updated.id,
				name: updated.name,
				status: updated.status,
				startsAt: updated.startsAt,
				endedAt: updated.endedAt,
				winnerUserId: updated.winnerUserId,
				createdAt: updated.createdAt,
				isLocked: updated.isLocked,
				winShare: updated.winShare,
				winSustainHours: updated.winSustainHours,
				winMinPlayers: updated.winMinPlayers,
				winMinFactions: updated.winMinFactions,
				speedMultiplier: updated.speedMultiplier,

			}
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function getAppConfig(_req: Request, res: Response): Promise<void> {
	try {
		const config = await adminService.getAppConfig();
		res.json({ seasonEndsAt: config?.seasonEndsAt ?? null });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function updateAppConfig(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as Record<string, unknown>;
		const data: { seasonEndsAt?: Date | null } = {};
		if ('seasonEndsAt' in body) {
			const raw = body.seasonEndsAt;
			if (raw === null || raw === '') {
				data.seasonEndsAt = null;
			} else {
				const d = new Date(raw as string);
				if (isNaN(d.getTime())) {
					res.status(400).json({ error: 'seasonEndsAt must be a valid ISO date or null' });
					return;
				}
				data.seasonEndsAt = d;
			}
		}
		const config = await adminService.setAppConfig(data);
		res.json({ seasonEndsAt: config.seasonEndsAt ?? null });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function listAllUsers(_req: Request, res: Response): Promise<void> {
	try {
		const users = await adminService.getAllUsers();
		res.json(
			users.map((u) => ({
				_id: u.id,
				id: u.id,
				username: u.username,
				email: u.email,
				createdAt: u.createdAt,
				emailVerified: !!u.emailVerifiedAt,
				hasPendingToken: !!u.emailVerificationToken,
				galaxyCount: u._count.galaxyPlayers,
				isFlagged: u.isFlagged ?? false,
				flagReason: u.flagReason ?? null,
				flaggedAt: u.flaggedAt ?? null,
				registrationIp: u.registrationIp ?? null
			}))
		);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function listUsers(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const users = await adminService.getUsersInGalaxy(galaxyId);
		res.json(
			users.map((u) => ({
				...u,
				_id: u.id,
				points: u.galaxyPlayers.reduce((sum, gp) => sum + (gp.points || 0), 0),
				nexuses: u.nexuses.map((v) => ({ ...v, _id: v.id, id: v.id }))
			}))
		);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function getStats(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const [
			userCount,
			villageCount,
			travelingAttackCount,
			totalAttackCount,
			newUsersThisWeek,
			pointsAgg,
			marketCount,
			ownedNexuses,
			usersWithNexusCount,
			topUsers,
			factionCount
		] = await adminService.getAdminStatsForGalaxy(galaxyId);
		const totalTroops = (ownedNexuses as unknown as Array<Record<string, number>>).reduce(
			(sum, nexus) => {
				let nexusSum = 0;
				for (const key of TROOP_KEYS) nexusSum += nexus[key] || 0;
				return sum + nexusSum;
			},
			0
		);
		const avgPoints = Math.round(
			(pointsAgg as { _avg: { points: number | null } })._avg.points || 0
		);
		const zeroNexusCount = Math.max(0, (userCount as number) - (usersWithNexusCount as number));
		res.json({
			userCount,
			villageCount,
			travelingAttackCount,
			totalAttackCount,
			newUsersThisWeek,
			zeroNexusCount,
			totalTroops,
			avgPoints,
			marketCount,
			factionCount,
			topUsers: (
				topUsers as Array<{
					userId: number;
					points: number;
					user: { id: number; username: string };
				}>
			).map((gp) => ({
				_id: gp.user.id,
				id: gp.user.id,
				username: gp.user.username,
				points: gp.points
			}))
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function createUser(req: Request, res: Response): Promise<void> {
	try {
		const { username, email, password } = req.body as {
			username?: string;
			email?: string;
			password?: string;
		};
		if (!username || !email || !password) {
			res.status(400).json({ error: 'username, email, and password are required' });
			return;
		}
		const existing = await adminService.getUserByField('username', username);
		if (existing) {
			res.status(400).json({ error: 'User already exists with that username or email' });
			return;
		}
		const { user } = (await adminService.createUser(username, email, password)) as {
			user: { id: number; username: string; email: string };
		};
		res.json({
			success: true,
			user: { _id: user.id, id: user.id, username: user.username, email: user.email }
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function updateUser(req: Request, res: Response): Promise<void> {
	try {
		const userId = adminService.toInt(req.params.userId);
		const { username, email, password } = req.body as {
			username?: string;
			email?: string;
			password?: string;
		};
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const updated = await adminService.updateUserCredentials(userId, username, email, password);
		res.json({
			success: true,
			user: { _id: updated.id, id: updated.id, username: updated.username, email: updated.email }
		});
	} catch (error) {
		res
			.status((error as { status?: number }).status || 500)
			.json({ error: (error as Error).message });
	}
}

export async function addResourcesToUser(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		const nexus = await adminService.findTargetNexus(userId, galaxyId, req.body.nexusId);
		if (!nexus) {
			res.status(404).json({ error: 'No nexus found for this user in this galaxy' });
			return;
		}
		const biomassDelta = adminService.toInt(req.body.biomass);
		const alloyDelta = adminService.toInt(req.body.alloy);
		const oreDelta = adminService.toInt(req.body.ore);
		if (biomassDelta === 0 && alloyDelta === 0 && oreDelta === 0) {
			res.status(400).json({ error: 'Provide a non-zero resource amount' });
			return;
		}
		const updated = await adminService.updateNexus(nexus.id, {
			biomass: Math.max(0, nexus.biomass + biomassDelta),
			alloy: Math.max(0, nexus.alloy + alloyDelta),
			ore: Math.max(0, nexus.ore + oreDelta)
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function addTroopsToUser(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		const nexus = await adminService.findTargetNexus(userId, galaxyId, req.body.nexusId);
		if (!nexus) {
			res.status(404).json({ error: 'No nexus found for this user in this galaxy' });
			return;
		}
		const troopType = req.body.troopType as string;
		const amount = adminService.toInt(req.body.amount);
		if (!TROOP_KEYS.includes(troopType as (typeof TROOP_KEYS)[number])) {
			res.status(400).json({ error: 'Invalid troop type' });
			return;
		}
		if (amount === 0) {
			res.status(400).json({ error: 'Amount must be non-zero' });
			return;
		}
		const nexusRecord = nexus as unknown as Record<string, number>;
		const current = nexusRecord[troopType] || 0;
		const next = Math.max(0, current + amount);
		// Recompute housing from the post-change troop columns rather than nudging
		// by the delta - also self-heals the row if it was already drifted.
		const away = await loadAwayPopulation(prisma, nexus.id);
		const updated = await adminService.updateNexus(nexus.id, {
			[troopType]: next,
			populationCurrent: computeNexusPopulation({
				troops: { ...nexusRecord, [troopType]: next },
				trainingQueue: nexus.trainingQueue,
				populationMax: nexus.populationMax,
				...away
			})
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function setBuildingForUser(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		const nexus = await adminService.findTargetNexus(userId, galaxyId, req.body.nexusId);
		if (!nexus) {
			res.status(404).json({ error: 'No nexus found for this user in this galaxy' });
			return;
		}
		const building = req.body.building as string;
		const level = Math.max(0, adminService.toInt(req.body.level));
		if (!BUILDING_KEYS.includes(building as (typeof BUILDING_KEYS)[number])) {
			res.status(400).json({ error: 'Invalid building' });
			return;
		}
		const data: Record<string, unknown> = { [building]: level };
		if (building === 'lifeSupport') {
			const popMax = getPopulationMax(level);
			data.populationMax = popMax;
			data.populationCurrent = Math.min(nexus.populationCurrent, popMax);
		}
		const updated = await adminService.updateNexus(nexus.id, data);
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

// Recompute populationCurrent for every nexus across all galaxies from first
// principles (stationed + queued + in-flight + transfers). Heals nexuses whose
// stored count drifted - e.g. after a training queue was cleared out of band.
export async function recountPopulation(_req: Request, res: Response): Promise<void> {
	try {
		const result = await recountAllPopulation(prisma);
		res.json({
			success: true,
			message: `Recounted ${result.scanned} nexuses, corrected ${result.corrected}.`,
			...result
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function completeStrikeForUser(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		const attack = await adminService.getAttack(userId, galaxyId);
		if (!attack) {
			res.status(404).json({ error: 'No active outgoing strike for this user in this galaxy' });
			return;
		}
		await adminService.updateAttack(attack.id, { arrivesAt: new Date() });
		await processArrivedAttacks();
		res.json({ success: true, message: 'User active strike completed' });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function completeBuildForUser(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		let nexus = await adminService.findTargetNexus(userId, galaxyId, req.body.nexusId);
		if (nexus) {
			const queue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
			if (queue.length === 0)
				nexus = await adminService.findUserNexusWithQueue(userId, galaxyId, 'buildQueue');
		} else {
			nexus = await adminService.findUserNexusWithQueue(userId, galaxyId, 'buildQueue');
		}
		if (!nexus) {
			res.status(404).json({ error: 'No nexus found for this user in this galaxy' });
			return;
		}
		const buildQueue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
		if (buildQueue.length === 0) {
			res.status(400).json({ error: 'No building in queue' });
			return;
		}
		const [build, ...remainingQueue] = buildQueue as Array<{
			building: string;
			targetLevel: number;
		}>;
		const data: Record<string, unknown> = {
			[build.building]: build.targetLevel,
			buildQueue: remainingQueue
		};
		if (build.building === 'lifeSupport') {
			const popMax = getPopulationMax(build.targetLevel);
			data.populationMax = popMax;
			data.populationCurrent = Math.min(nexus.populationCurrent, popMax);
		}
		const updated = await adminService.updateNexus(nexus.id, data);
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function completeTrainingForUser(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		let nexus = await adminService.findTargetNexus(userId, galaxyId, req.body.nexusId);
		if (nexus) {
			const queue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
			if (queue.length === 0)
				nexus = await adminService.findUserNexusWithQueue(userId, galaxyId, 'trainingQueue');
		} else {
			nexus = await adminService.findUserNexusWithQueue(userId, galaxyId, 'trainingQueue');
		}
		if (!nexus) {
			res.status(404).json({ error: 'No nexus found for this user in this galaxy' });
			return;
		}
		const queue = Array.isArray(nexus.trainingQueue)
			? (nexus.trainingQueue as Array<{ troopType: string; amount: number }>)
			: [];
		if (queue.length === 0) {
			res.status(400).json({ error: 'No troops in training' });
			return;
		}
		const nexusRecord = nexus as unknown as Record<string, number>;
		const troopUpdates: Record<string, number> = {};
		for (const t of queue) {
			const amount = adminService.toInt(t.amount);
			if (amount <= 0) continue;
			troopUpdates[t.troopType] =
				(troopUpdates[t.troopType] || nexusRecord[t.troopType] || 0) + amount;
		}
		// Move queued troops onto the columns and clear the queue, then recompute.
		// The queued troops were already committed to populationCurrent, so the old
		// "+ totalPop" delta double-counted (and mis-weighted multi-pop units); the
		// recompute from the post-state troops + empty queue is exactly right.
		const away = await loadAwayPopulation(prisma, nexus.id);
		const updated = await adminService.updateNexus(nexus.id, {
			...troopUpdates,
			populationCurrent: computeNexusPopulation({
				troops: { ...nexusRecord, ...troopUpdates },
				trainingQueue: [],
				populationMax: nexus.populationMax,
				...away
			}),
			trainingQueue: []
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function resetAccount(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const userId = adminService.toInt(req.params.userId);
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const nexus = await adminService.resetUserAccount(userId, user.username, galaxyId);
		res.json({
			success: true,
			message: 'Account reset to starter state',
			nexus: serializeNexus(nexus)
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
	try {
		const userId = adminService.toInt(req.params.userId);
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		await adminService.deleteUser(userId);
		res.json({ success: true, message: 'User deleted' });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function giveResourcesToNexus(req: Request, res: Response): Promise<void> {
	try {
		const { biomass, alloy, ore } = req.body as { biomass?: number; alloy?: number; ore?: number };
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
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
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function addTroopsToNexus(req: Request, res: Response): Promise<void> {
	try {
		const {
			sentinelLancer = 0,
			assaultTrooper = 0,
			vanguardBreaker = 0,
			reconOperative = 0,
			wraithSkimmer = 0,
			siegeMech = 0,
			bulwarkGuard = 0,
			aegisSkirmisher = 0,
			pyreSuppressor = 0,
			arcDisruptor = 0,
			phantomLance = 0,
			voidStalker = 0,
			plasmaTurret = 0,
			annihilatorPlatform = 0,
			siegeColossus = 0,
			overseer = 0
		} = req.body as Record<string, number>;
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const troopUpdates = {
			sentinelLancer: nexus.sentinelLancer + sentinelLancer,
			assaultTrooper: nexus.assaultTrooper + assaultTrooper,
			vanguardBreaker: nexus.vanguardBreaker + vanguardBreaker,
			reconOperative: nexus.reconOperative + reconOperative,
			wraithSkimmer: nexus.wraithSkimmer + wraithSkimmer,
			siegeMech: nexus.siegeMech + siegeMech,
			bulwarkGuard: nexus.bulwarkGuard + bulwarkGuard,
			aegisSkirmisher: nexus.aegisSkirmisher + aegisSkirmisher,
			pyreSuppressor: nexus.pyreSuppressor + pyreSuppressor,
			arcDisruptor: nexus.arcDisruptor + arcDisruptor,
			phantomLance: nexus.phantomLance + phantomLance,
			voidStalker: nexus.voidStalker + voidStalker,
			plasmaTurret: nexus.plasmaTurret + plasmaTurret,
			annihilatorPlatform: nexus.annihilatorPlatform + annihilatorPlatform,
			siegeColossus: nexus.siegeColossus + siegeColossus,
			overseer: nexus.overseer + overseer
		};
		// Recompute from the post-add troop columns rather than "+ troopsAdded"
		// (which assumed 1 pop/unit and mis-weighted multi-pop units).
		const away = await loadAwayPopulation(prisma, nexus.id);
		const updated = await adminService.updateNexus(nexus.id, {
			...troopUpdates,
			populationCurrent: computeNexusPopulation({
				troops: { ...(nexus as unknown as Record<string, unknown>), ...troopUpdates },
				trainingQueue: nexus.trainingQueue,
				populationMax: nexus.populationMax,
				...away
			})
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function addBuildingsToNexus(req: Request, res: Response): Promise<void> {
	try {
		const {
			commandCore = 0,
			hangarBay = 0,
			plasmaForge = 0,
			armorFoundry = 0,
			lifeSupport = 0,
			storageVault = 0,
			biomassFarm = 0,
			alloyForge = 0,
			oreExtractor = 0,
			shieldGrid = 0
		} = req.body as Record<string, number>;
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const newLS = nexus.lifeSupport + lifeSupport;
		const n = nexus as unknown as Record<string, number>;
		const updated = await adminService.updateNexus(nexus.id, {
			commandCore: nexus.commandCore + commandCore,
			hangarBay: (n.hangarBay ?? 0) + hangarBay,
			plasmaForge: (n.plasmaForge ?? 0) + plasmaForge,
			armorFoundry: (n.armorFoundry ?? 0) + armorFoundry,
			lifeSupport: newLS,
			storageVault: nexus.storageVault + storageVault,
			biomassFarm: nexus.biomassFarm + biomassFarm,
			alloyForge: nexus.alloyForge + alloyForge,
			oreExtractor: nexus.oreExtractor + oreExtractor,
			shieldGrid: nexus.shieldGrid + shieldGrid,
			populationMax: getPopulationMax(newLS)
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function completeBuildForNexus(req: Request, res: Response): Promise<void> {
	try {
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const buildQueue = Array.isArray(nexus.buildQueue)
			? (nexus.buildQueue as Array<{ building: string; targetLevel: number }>)
			: [];
		if (buildQueue.length === 0) {
			res.status(400).json({ error: 'No building in queue' });
			return;
		}
		const [build, ...remaining] = buildQueue;
		const data: Record<string, unknown> = {
			[build.building]: build.targetLevel,
			buildQueue: remaining
		};
		if (build.building === 'lifeSupport') data.populationMax = getPopulationMax(build.targetLevel);
		const updated = await adminService.updateNexus(nexus.id, data);
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function completeTrainingForNexus(req: Request, res: Response): Promise<void> {
	try {
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const nexus = await prisma.nexus.findUnique({ where: { id: parseInt(req.params.nexusId) } });
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		const queue = Array.isArray(nexus.trainingQueue)
			? (nexus.trainingQueue as Array<{ troopType: string; amount: number }>)
			: [];
		if (queue.length === 0) {
			res.status(400).json({ error: 'No troops in training' });
			return;
		}
		const nexusRecord = nexus as unknown as Record<string, number>;
		const troopUpdates: Record<string, number> = {};
		for (const t of queue) {
			const amount = adminService.toInt(t.amount);
			if (amount <= 0) continue;
			troopUpdates[t.troopType] =
				(troopUpdates[t.troopType] || nexusRecord[t.troopType] || 0) + amount;
		}
		// Move queued troops onto the columns and clear the queue, then recompute.
		// The queued troops were already committed to populationCurrent, so the old
		// "+ totalPop" delta double-counted (and mis-weighted multi-pop units); the
		// recompute from the post-state troops + empty queue is exactly right.
		const away = await loadAwayPopulation(prisma, nexus.id);
		const updated = await adminService.updateNexus(nexus.id, {
			...troopUpdates,
			populationCurrent: computeNexusPopulation({
				troops: { ...nexusRecord, ...troopUpdates },
				trainingQueue: [],
				populationMax: nexus.populationMax,
				...away
			}),
			trainingQueue: []
		});
		res.json({ success: true, nexus: serializeNexus(updated) });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function deleteNexus(req: Request, res: Response): Promise<void> {
	try {
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const nexusId = parseInt(req.params.nexusId);
		const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
		if (!nexus) {
			res.status(404).json({ error: 'Nexus not found' });
			return;
		}
		await adminService.deleteNexus(nexusId);
		res.json({ success: true, message: 'Nexus deleted' });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function listAttacks(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const [attacks, transfers] = await Promise.all([
			adminService.getAdminAttacks(galaxyId),
			adminService.getAdminTroopTransfers(galaxyId)
		]);
		const allIds = [
			...new Set(
				[
					...attacks.flatMap((a) => [a.attackerUserId, a.defenderUserId]),
					...transfers.map((t) => t.ownerNexus?.ownerId ?? null)
				].filter((id): id is number => id != null)
			)
		];
		const users = await (
			await import('../../server/lib/prisma.js')
		).default.user.findMany({
			where: { id: { in: allIds } },
			select: { id: true, username: true }
		});
		const byId = new Map(users.map((u) => [u.id, u.username]));
		const attackRows = attacks.map((a) => ({
			...a,
			_id: a.id,
			type: a.type,
			attacker: {
				user: {
					username: (a.attackerUserId != null ? byId.get(a.attackerUserId) : null) || 'Unknown'
				}
			},
			defender: {
				user: {
					username: (a.defenderUserId != null ? byId.get(a.defenderUserId) : null) || 'Neutral'
				}
			}
		}));
		// Troop transfers move between two nexuses owned by the same player, so both
		// "attacker" and "defender" resolve to that owner. Surface them as type
		// 'transfer' rows so the admin strikes table renders them inline.
		const transferRows = transfers.map((t) => {
			const owner = (t.ownerNexus?.ownerId != null ? byId.get(t.ownerNexus.ownerId) : null) || 'Unknown';
			const arrivesAt = t.status === 'returning' ? t.returnsAt : t.arrivesAt;
			return {
				_id: `transfer-${t.id}`,
				id: t.id,
				type: 'transfer' as const,
				status: t.status,
				troops: t.troops,
				arrivesAt,
				attackerNexus: t.ownerNexus,
				defenderNexus: t.hostNexus,
				attacker: { user: { username: owner } },
				defender: { user: { username: owner } }
			};
		});
		res.json([...attackRows, ...transferRows]);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
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
		res.status(500).json({ error: (error as Error).message });
	}
}

// Force an in-motion troop transfer to land now. Mirrors completeAttack: backdate
// the relevant timestamp (arrivesAt for outbound, returnsAt for a recall) and run
// the same processor the game loop uses, so arrival side effects stay consistent.
export async function completeTransfer(req: Request, res: Response): Promise<void> {
	try {
		const transferId = parseInt(req.params.transferId);
		const transfer = await adminService.getTransferById(transferId);
		if (!transfer) {
			res.status(404).json({ error: 'Transfer not found' });
			return;
		}
		if (transfer.status === 'traveling') {
			await adminService.updateTransfer(transferId, { arrivesAt: new Date() });
		} else if (transfer.status === 'returning') {
			await adminService.updateTransfer(transferId, { returnsAt: new Date() });
		} else {
			res.status(400).json({ error: 'Transfer is not in motion' });
			return;
		}
		await processArrivedTransfers();
		res.json({ success: true, message: 'Transfer completed' });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function resendVerificationEmail(req: Request, res: Response): Promise<void> {
	try {
		const userId = adminService.toInt(req.params.userId);
		const { email } = req.body as { email?: string };
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		if (!user.emailVerificationToken) {
			res.status(400).json({ error: 'User has no pending verification token' });
			return;
		}
		const { sendVerifyEmail } = await import('../../server/services/emailService.js');
		const targetEmail =
			typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : user.email;
		await sendVerifyEmail(targetEmail, user.username, user.emailVerificationToken);
		res.json({ success: true, message: `Verification email sent to ${targetEmail}` });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function grantTokens(req: Request, res: Response): Promise<void> {
	try {
		const userId = adminService.toInt(req.params.userId);
		const count = adminService.toInt(req.body?.count);
		const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'admin_grant';
		if (!Number.isFinite(userId) || userId <= 0) {
			res.status(400).json({ error: 'Invalid userId' });
			return;
		}
		if (!Number.isFinite(count) || count < 1 || count > 50) {
			res.status(400).json({ error: 'count must be 1-50' });
			return;
		}
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const { default: prisma } = await import('../../server/lib/prisma.js');
		const now = Date.now();
		const safeReason = reason.slice(0, 20);
		await Promise.all(
			Array.from({ length: count }, (_, i) =>
				prisma.milestoneToken.create({
					data: {
						userId,
						milestone: 0,
						rewardType: 'admin',
						rewardMeta: { reason, tokenIndex: i, tokenCount: count },
						kofiTransactionId: `admin-${safeReason}-${userId}-${now}-${i}`
					}
				})
			)
		);
		res.json({ success: true, granted: count });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function flagUser(req: Request, res: Response): Promise<void> {
	try {
		const userId = adminService.toInt(req.params.userId);
		const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
		if (!reason) {
			res.status(400).json({ error: 'A reason is required to flag an account' });
			return;
		}
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const updated = await adminService.flagUser(userId, reason);
		res.json({
			success: true,
			user: {
				id: updated.id,
				username: updated.username,
				isFlagged: updated.isFlagged,
				flagReason: updated.flagReason
			}
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function unflagUser(req: Request, res: Response): Promise<void> {
	try {
		const userId = adminService.toInt(req.params.userId);
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const updated = await adminService.unflagUser(userId);
		res.json({
			success: true,
			user: { id: updated.id, username: updated.username, isFlagged: updated.isFlagged }
		});
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function listFlaggedUsers(_req: Request, res: Response): Promise<void> {
	try {
		const users = await adminService.getFlaggedUsers();
		res.json(
			users.map((u) => ({
				_id: u.id,
				id: u.id,
				username: u.username,
				email: u.email,
				createdAt: u.createdAt,
				emailVerified: !!u.emailVerifiedAt,
				hasPendingToken: !!u.emailVerificationToken,
				galaxyCount: u._count.galaxyPlayers,
				isFlagged: u.isFlagged,
				flagReason: u.flagReason,
				flaggedAt: u.flaggedAt,
				registrationIp: u.registrationIp
			}))
		);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function testNotification(req: Request, res: Response): Promise<void> {
	const userId = adminService.toInt(req.params.userId);
	try {
		if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
			res.status(503).json({ error: 'Push notifications not configured (missing VAPID keys)' });
			return;
		}
		const user = await adminService.getUserById(userId);
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		const subCount = await adminService.sendTestNotification(userId);
		if (subCount === 0) {
			res.status(400).json({ error: 'User has no push subscriptions' });
			return;
		}
		await sendPushToUser(userId, NOTIF.ATTACK_INCOMING, {
			title: 'Test Notification',
			body: `This is a test push notification for ${user.username}.`,
			tag: `admin-test-${Date.now()}`,
			data: { url: '/' }
		});
		res.json({ success: true, message: `Test notification sent to ${user.username}` });
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function listFactions(req: Request, res: Response): Promise<void> {
	try {
		const galaxyId = requireGalaxyId(req, res);
		if (galaxyId == null) return;
		const factions = await adminService.getFactionsInGalaxy(galaxyId);
		res.json(factions);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function setFactionMemberRole(req: Request, res: Response): Promise<void> {
	try {
		const factionId = adminService.toInt(req.params.factionId);
		const memberId = adminService.toInt(req.params.memberId);
		const role = req.body?.role as 'leader' | 'officer' | 'member' | undefined;
		if (!['leader', 'officer', 'member'].includes(String(role))) {
			res.status(400).json({ error: 'Invalid faction role' });
			return;
		}
		const member = await adminService.updateFactionMemberRole(
			factionId,
			memberId,
			role as 'leader' | 'officer' | 'member'
		);
		res.json({ success: true, member });
	} catch (error) {
		res
			.status((error as { status?: number }).status || 500)
			.json({ error: (error as Error).message });
	}
}

export async function kickFactionMember(req: Request, res: Response): Promise<void> {
	try {
		const factionId = adminService.toInt(req.params.factionId);
		const memberId = adminService.toInt(req.params.memberId);
		const result = await adminService.kickFactionMember(factionId, memberId);
		res.json({
			success: true,
			...result,
			message: result.disbanded
				? `${result.username} was the last member; faction disbanded`
				: `${result.username} removed from faction`
		});
	} catch (error) {
		res
			.status((error as { status?: number }).status || 500)
			.json({ error: (error as Error).message });
	}
}

export async function disbandFaction(req: Request, res: Response): Promise<void> {
	try {
		const factionId = adminService.toInt(req.params.factionId);
		const faction = await adminService.disbandFaction(factionId);
		res.json({
			success: true,
			faction,
			message: `Faction [${faction.tag}] ${faction.name} disbanded`
		});
	} catch (error) {
		res
			.status((error as { status?: number }).status || 500)
			.json({ error: (error as Error).message });
	}
}

export async function getActivationAnalytics(_req: Request, res: Response): Promise<void> {
	try {
		const data = await adminService.getActivationFunnel();
		res.json(data);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function getEngagementAnalytics(_req: Request, res: Response): Promise<void> {
	try {
		const data = await adminService.getEngagementStats();
		res.json(data);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}

export async function getReferralAnalytics(_req: Request, res: Response): Promise<void> {
	try {
		const data = await adminService.getReferralAnalytics();
		res.json(data);
	} catch (error) {
		res.status(500).json({ error: (error as Error).message });
	}
}
