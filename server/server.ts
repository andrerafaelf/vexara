// Faction system fully integrated with database migrations and API routes
import cors from 'cors';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import prisma from './lib/prisma.js';
import { initWarRoomSocket, initGameSocket } from './services/warRoomSocket.js';
import {
	processCompletedQueuesAndNotify,
	recoverControlLevels,
	updateAllResources
} from './models/Nexus.js';
import attackRoutes from './routes/attack.js';
import standingOrderRoutes from './routes/standingOrder.js';
import queueTemplateRoutes from './routes/queueTemplate.js';
import autoRequeueRoutes from './routes/autoRequeue.js';
import authRoutes from './routes/auth.js';
import { unsubscribe } from './controllers/unsubscribeController.js';
import { handleKofiWebhook } from './controllers/kofiWebhookController.js';
import buildingRoutes from './routes/building.js';
import chatRoutes from './routes/chat.js';
import factionRoutes from './routes/faction.js';
import warRoomRoutes from './routes/warRoom.js';
import friendsRoutes from './routes/friends.js';
import referralRoutes from './routes/referral.js';
import galaxyRoutes from './routes/galaxy.js';
import mapRoutes from './routes/map.js';
import marketRoutes from './routes/market.js';
import nexusRoutes from './routes/nexus.js';
import notificationRoutes from './routes/notifications.js';
import replayRoutes from './routes/replay.js';
import reportRoutes from './routes/report.js';
import statsRoutes from './routes/stats.js';
import troopRoutes from './routes/troop.js';
import troopTransferRoutes from './routes/troopTransfer.js';
import usersRoutes from './routes/users.js';
import battlePassRoutes from './routes/battlePass.js';
import shopRoutes from './routes/shop.js';
import { processArrivedAttacks, processArrivedTransfers } from './utils/combat.js';
import { processScheduledAttacks } from './services/attackService.js';
import { processDominanceVictories, processSeasonExpiry } from './utils/dominance.js';
import { logError, logInfo, logWarn } from './utils/logger.js';
import {
	ensureNeutralNexusPool,
	levelUpNeutralNexuses,
	dailyNexusGrowth
} from './utils/neutralNexuses.js';
import { processGalaxyEvents } from './utils/galaxyEvents.js';
import {
	envInt,
	ipKey,
	loginAccountIpLimiter,
	loginAccountLimiter,
	loginIpLimiter
} from './middleware/authLimiters.js';
import { warnIfEmailNotConfigured } from './services/emailService.js';
import { sendProtectionExpiringWarnings } from './utils/protectionWarnings.js';
import { processRogueAiRaids } from './utils/rogueAiRaider.js';
import { processRogueAiGrowth } from './utils/rogueAiGrowth.js';

dotenv.config();
warnIfEmailNotConfigured();

if (!process.env.JWT_SECRET) {
	throw new Error('JWT_SECRET is required');
}

const allowedCorsOrigins = (process.env.CORS_ORIGINS || '')
	.split(',')
	.map((v) => v.trim())
	.filter(Boolean);

function normalizeOriginValue(value: string) {
	return String(value).trim().replace(/\/+$/, '').toLowerCase();
}

function matchesCorsOrigin(origin: string, rule: string) {
	if (rule === '*') return true;
	const normalizedOrigin = normalizeOriginValue(origin);
	const normalizedRule = normalizeOriginValue(rule);
	const escaped = normalizedRule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
	return new RegExp(`^${escaped}$`).test(normalizedOrigin);
}

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
	(req as express.Request & { requestId?: string }).requestId = randomUUID();
	res.setHeader('X-Request-Id', (req as express.Request & { requestId?: string }).requestId!);
	const start = Date.now();
	res.on('finish', () => {
		logInfo('http_request', {
			requestId: (req as express.Request & { requestId?: string }).requestId,
			method: req.method,
			path: req.originalUrl,
			status: res.statusCode,
			durationMs: Date.now() - start
		});
	});
	next();
});

app.use(
	cors({
		origin(origin, callback) {
			if (!origin) return callback(null, true);
			const normalizedOrigin = normalizeOriginValue(origin);
			const normalizedAllowed = allowedCorsOrigins.map((v) => normalizeOriginValue(v));
			if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production')
				return callback(null, true);
			if (normalizedAllowed.includes(normalizedOrigin)) return callback(null, true);
			if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule)))
				return callback(null, true);
			return callback(new Error('Not allowed by CORS'));
		},
		credentials: true
	})
);
app.use(express.json());

app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/readyz', async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ status: 'ready' });
	} catch {
		res.status(503).json({ status: 'not-ready' });
	}
});

if (process.env.NODE_ENV === 'production') {
	// Login and register use SEPARATE limiter instances (separate buckets) so a
	// burst of sign-ups behind one shared IP (CGNAT, school, Discord raid) cannot
	// lock existing players out of logging in, and vice versa. Limits are per subnet
	// (IPv6 collapsed to /64, see ipKey). Login limiters live in middleware/authLimiters.ts.
	const registerLimiter = rateLimit({
		windowMs: 60 * 60 * 1000,
		max: envInt('AUTH_REGISTER_RATE_LIMIT_MAX', 30),
		standardHeaders: true,
		legacyHeaders: false,
		skip: (req) => req.method === 'OPTIONS',
		keyGenerator: (req) => ipKey(req),
		message: { error: 'Too many sign-up attempts from this address. Please try again later.' }
	});
	const alphaSignupLimiter = rateLimit({
		windowMs: 60 * 60 * 1000,
		max: envInt('ALPHA_SIGNUP_RATE_LIMIT_MAX', 25),
		standardHeaders: true,
		legacyHeaders: false,
		skip: (req) => req.method === 'OPTIONS',
		keyGenerator: (req) => ipKey(req),
		message: { error: 'Too many sign-up attempts from this address. Please try again later.' }
	});
	const apiLimiter = rateLimit({
		windowMs: 60 * 1000,
		max: envInt('API_RATE_LIMIT_MAX', 24000),
		standardHeaders: true,
		legacyHeaders: false,
		skip: (req) => req.method === 'OPTIONS',
		keyGenerator: (req) => {
			const token = req.header('Authorization')?.replace('Bearer ', '');
			if (token) {
				try {
					const decoded = jwt.decode(token) as { userId?: number } | null;
					if (decoded?.userId) return `u:${decoded.userId}`;
				} catch {}
			}
			// Mobile carriers NAT many users behind one IP. To avoid a whole
			// carrier sharing one bucket when JWT decode fails (expired token,
			// PWA waking up, pre-login flows), prefix with the User-Agent hash
			// so different devices on the same NAT get separate buckets.
			const ua = req.header('User-Agent') ?? 'unknown';
			let h = 0;
			for (let i = 0; i < ua.length; i++) h = ((h << 5) - h + ua.charCodeAt(i)) | 0;
			return `ip:${ipKey(req)}:${h}`;
		},
		message: { error: 'Too many requests. Please try again in a minute.' }
	});
	// Tight limiter for email-sending endpoints: 5 requests per hour, keyed by
	// IP AND normalized email address. Dual-key prevents a single attacker from
	// cycling email addresses to bypass the per-IP cap, and prevents a shared
	// IP (e.g. office NAT) from locking out all users when one abuses the endpoint.
	const emailActionLimiter = rateLimit({
		windowMs: 60 * 60 * 1000,
		max: 5,
		standardHeaders: true,
		legacyHeaders: false,
		skip: (req) => req.method === 'OPTIONS',
		keyGenerator: (req) => {
			const ip = ipKey(req);
			const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
			const email = rawEmail.trim().toLowerCase().slice(0, 254);
			return `email-action:${ip}:${email}`;
		},
		message: { error: 'Too many requests. Please try again in an hour.' }
	});
	app.use('/api/auth/login', loginIpLimiter, loginAccountIpLimiter, loginAccountLimiter);
	app.use('/api/auth/register', registerLimiter);
	app.use('/api/auth/alpha-signup', alphaSignupLimiter);
	app.use('/api/auth/request-password-reset', emailActionLimiter);
	app.use('/api/auth/resend-verification', emailActionLimiter);
	app.use('/api/', apiLimiter);
}

app.get('/api/unsubscribe', unsubscribe);
app.post('/api/unsubscribe', express.urlencoded({ extended: false }), unsubscribe);
app.post(
	'/api/webhooks/kofi',
	express.urlencoded({ extended: false, limit: '64kb' }),
	handleKofiWebhook
);
app.use('/api/auth', authRoutes);
app.use('/api/nexus', nexusRoutes);
app.use('/api/building', buildingRoutes);
app.use('/api/troop', troopRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/attack', attackRoutes);
app.use('/api/standing-orders', standingOrderRoutes);
app.use('/api/queue-templates', queueTemplateRoutes);
app.use('/api/auto-requeue', autoRequeueRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/report', reportRoutes);
app.use('/api', replayRoutes);
app.use('/api/troop-transfer', troopTransferRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/galaxies', galaxyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/faction', factionRoutes);
app.use('/api/warroom', warRoomRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/battle-pass', battlePassRoutes);
app.use('/api/shop', shopRoutes);

const JOB_LOCKS = {
	updateResources: 9101,
	processCombat: 9102,
	syncNeutralPool: 9103,
	recoverControl: 9104,
	processTransfers: 9105,
	levelNeutralNexuses: 9106,
	processQueues: 9107,
	processDominance: 9108,
	dailyNexusGrowth: 9109,
	galaxyEvents: 9110,
	protectionWarnings: 9112,
	rogueAiRaids: 9113,
	rogueAiGrowth: 9114,
	purgeNexuslessMembers: 9115,
	processScheduledAttacks: 9116,
	processSeasonExpiry: 9117
};

// Job locks use a DEDICATED pg pool, separate from Prisma's. pg_try_advisory_lock is
// session-scoped, so lock and unlock must run on the SAME connection; going through
// the Prisma pool could issue them on different connections (unlock silently fails and
// the lock lingers, or a re-acquire on the same connection lets a job overlap itself).
// Each run checks out ONE client for the whole lock lifetime. The job itself still uses
// prisma normally. Max covers every JOB_LOCKS entry running at once.
let lockPool: pg.Pool | null = null;
function getLockPool(): pg.Pool {
	if (!lockPool) {
		lockPool = new pg.Pool({
			connectionString: process.env.DATABASE_URL,
			max: Object.keys(JOB_LOCKS).length + 2,
			connectionTimeoutMillis: 10_000,
			idleTimeoutMillis: 30_000
		});
		// An idle client erroring (DB restart) must not become an uncaught exception.
		lockPool.on('error', (err) => logError('job_lock_pool_error', { message: err.message }));
	}
	return lockPool;
}

// In-process guard: an overlapping tick of the same job in this process skips
// immediately instead of queueing behind (or re-entering) its own lock.
const runningJobs = new Set<number>();

async function runWithPgAdvisoryLock(
	lockId: number,
	jobName: string,
	jobHandler: () => Promise<void>
) {
	if (runningJobs.has(lockId)) {
		logWarn('job_lock_skipped', { jobName, lockId, reason: 'running_in_process' });
		return;
	}
	runningJobs.add(lockId);
	let client: pg.PoolClient | null = null;
	let discardClient = false;
	const onClientError = (err: Error) =>
		logError('job_lock_client_error', { jobName, lockId, message: err.message });
	try {
		client = await getLockPool().connect();
		// A checked-out client erroring (connection reset mid-job) must be logged, not
		// thrown as an uncaught 'error' event.
		client.on('error', onClientError);
		const lockRes = await client.query<{ locked: boolean }>(
			'SELECT pg_try_advisory_lock($1::bigint) AS locked',
			[lockId]
		);
		if (!lockRes.rows[0]?.locked) {
			logWarn('job_lock_skipped', { jobName, lockId });
			return;
		}
		try {
			const startedAt = Date.now();
			try {
				await jobHandler();
				logInfo('job_completed', { jobName, durationMs: Date.now() - startedAt });
			} finally {
				try {
					await client.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]);
				} catch (unlockErr) {
					// Destroying the connection ends the session, which drops its advisory locks.
					discardClient = true;
					logError('job_unlock_failed', { jobName, message: (unlockErr as Error).message });
				}
			}
		} catch (error) {
			logError('job_failed', { jobName, message: (error as Error).message });
		}
	} catch (error) {
		discardClient = true;
		logError('job_failed', { jobName, message: (error as Error).message });
	} finally {
		client?.off('error', onClientError);
		client?.release(discardClient ? true : undefined);
		runningJobs.delete(lockId);
	}
}

async function backfillResourceBuildingFloor() {
	// Fix legacy nexuses that were created before the level-7 floor was enforced.
	// Any nexus with biomassFarm, alloyForge, or oreExtractor at 0 gets bumped to 7.
	const RESOURCE_BUILDINGS = ['biomassFarm', 'alloyForge', 'oreExtractor'] as const;
	const updated = await prisma.nexus.updateMany({
		where: {
			OR: RESOURCE_BUILDINGS.map((b) => ({ [b]: 0 }))
		},
		data: Object.fromEntries(RESOURCE_BUILDINGS.map((b) => [b, 7]))
	});
	if (updated.count > 0) logInfo('backfill_resource_buildings', { updatedNexuses: updated.count });
}

prisma
	.$connect()
	.then(async () => {
		logInfo('postgres_connected');
		try {
			const neutralSync = await ensureNeutralNexusPool();
			if (neutralSync.created > 0)
				logInfo('neutral_nexus_spawned', {
					created: neutralSync.created,
					neutralCount: neutralSync.neutralCount,
					targetNeutralCount: neutralSync.targetNeutralCount
				});
		} catch (err) {
			logError('neutral_nexus_pool_error', { message: (err as Error).message });
		}
		try {
			await backfillResourceBuildingFloor();
		} catch (err) {
			logError('backfill_resource_buildings_error', { message: (err as Error).message });
		}
		try {
			const { trimOversizedFactions, purgeNexuslessMembers } =
				await import('./controllers/factionController.js');
			await trimOversizedFactions();
			await purgeNexuslessMembers();
		} catch (err) {
			logError('trim_oversized_factions_error', { message: (err as Error).message });
		}
		setInterval(() => {
			void runWithPgAdvisoryLock(JOB_LOCKS.updateResources, 'update_resources', () =>
				updateAllResources()
			);
		}, 60000);
		setInterval(() => {
			void runWithPgAdvisoryLock(JOB_LOCKS.processCombat, 'process_combat', () =>
				processArrivedAttacks()
			);
		}, 10000);
		setInterval(() => {
			void runWithPgAdvisoryLock(
				JOB_LOCKS.processScheduledAttacks,
				'process_scheduled_attacks',
				() => processScheduledAttacks()
			);
		}, 10000);
		setInterval(() => {
			void runWithPgAdvisoryLock(JOB_LOCKS.processTransfers, 'process_transfers', () =>
				processArrivedTransfers()
			);
		}, 10000);
		setInterval(() => {
			void runWithPgAdvisoryLock(JOB_LOCKS.processQueues, 'process_queues', () =>
				processCompletedQueuesAndNotify()
			);
		}, 15000);
		setInterval(() => {
			void runWithPgAdvisoryLock(JOB_LOCKS.syncNeutralPool, 'sync_neutral_pool', async () => {
				await ensureNeutralNexusPool();
			});
		}, 60000);
		// Control regen is now TIME-BASED (recoverControlLevels grants +10 per whole
		// hour elapsed per nexus, anchored on lastControlRecoverAt). It's idempotent
		// and only acts once an hour has actually accrued, so it's safe to run at boot
		// and on a short interval — frequency no longer affects the rate, and a
		// restart can't grant a free tick. The 5-min interval just makes regen apply
		// promptly after each hour boundary instead of waiting up to a full extra hour.
		void runWithPgAdvisoryLock(JOB_LOCKS.recoverControl, 'recover_control', () =>
			recoverControlLevels()
		);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.recoverControl, 'recover_control', () =>
					recoverControlLevels()
				);
			},
			5 * 60 * 1000
		);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.levelNeutralNexuses, 'level_neutral_nexuses', () =>
					levelUpNeutralNexuses()
				);
			},
			60 * 60 * 1000
		);
		// Hourly poll; each galaxy only grows once per 24h (persisted marker in
		// dailyNexusGrowth), so restarts and deploys neither reset nor skip the cadence.
		const runDailyNexusGrowth = () =>
			runWithPgAdvisoryLock(JOB_LOCKS.dailyNexusGrowth, 'daily_nexus_growth', async () => {
				const r = await dailyNexusGrowth();
				if (r.created > 0) logInfo('daily_nexus_growth', { created: r.created });
			});
		void runDailyNexusGrowth();
		setInterval(() => void runDailyNexusGrowth(), 60 * 60 * 1000);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.processDominance, 'process_dominance', () =>
					processDominanceVictories()
				);
			},
			10 * 60 * 1000
		);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.processSeasonExpiry, 'process_season_expiry', () =>
					processSeasonExpiry()
				);
			},
			10 * 60 * 1000
		);
		// Hourly poll so expiry always runs; the spawn roll is gated to once per 24h per
		// galaxy by a persisted marker (galaxyJobMarkers.ts). Also runs once at boot.
		const runGalaxyEvents = () =>
			runWithPgAdvisoryLock(JOB_LOCKS.galaxyEvents, 'galaxy_events', () => processGalaxyEvents());
		void runGalaxyEvents();
		setInterval(() => void runGalaxyEvents(), 60 * 60 * 1000);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.protectionWarnings, 'protection_warnings', () =>
					sendProtectionExpiringWarnings()
				);
			},
			15 * 60 * 1000
		);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.rogueAiRaids, 'rogue_ai_raids', () =>
					processRogueAiRaids()
				);
			},
			30 * 60 * 1000
		);
		setInterval(
			() => {
				void runWithPgAdvisoryLock(JOB_LOCKS.rogueAiGrowth, 'rogue_ai_growth', () =>
					processRogueAiGrowth()
				);
			},
			60 * 60 * 1000
		);
		setInterval(
			async () => {
				const { purgeNexuslessMembers } = await import('./controllers/factionController.js');
				void runWithPgAdvisoryLock(JOB_LOCKS.purgeNexuslessMembers, 'purge_nexusless_members', () =>
					purgeNexuslessMembers()
				);
			},
			60 * 60 * 1000
		);
	})
	.catch((err: Error) => logError('postgres_connection_error', { message: err.message }));

app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
	logError('unhandled_http_error', {
		requestId: (req as express.Request & { requestId?: string }).requestId,
		method: req.method,
		path: req.originalUrl,
		message: error.message
	});
	if (res.headersSent) {
		next(error);
		return;
	}
	res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
	logError('process_unhandled_rejection', {
		reason: reason instanceof Error ? reason.message : String(reason)
	});
});
process.on('uncaughtException', (error) => {
	logError('process_uncaught_exception', { message: error.message });
});

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);
// initGameSocket must be called before initWarRoomSocket so the shared io instance is created first.
initGameSocket(httpServer, {
	cors: {
		origin(origin, callback) {
			if (!origin) return callback(null, true);
			const normalizedOrigin = normalizeOriginValue(origin);
			const normalizedAllowed = allowedCorsOrigins.map((v) => normalizeOriginValue(v));
			if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production')
				return callback(null, true);
			if (normalizedAllowed.includes(normalizedOrigin)) return callback(null, true);
			if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule)))
				return callback(null, true);
			return callback(new Error('Not allowed by CORS'));
		},
		credentials: true
	}
});
initWarRoomSocket(httpServer, {
	cors: {
		origin(origin, callback) {
			if (!origin) return callback(null, true);
			const normalizedOrigin = normalizeOriginValue(origin);
			const normalizedAllowed = allowedCorsOrigins.map((v) => normalizeOriginValue(v));
			if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production')
				return callback(null, true);
			if (normalizedAllowed.includes(normalizedOrigin)) return callback(null, true);
			if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule)))
				return callback(null, true);
			return callback(new Error('Not allowed by CORS'));
		},
		credentials: true
	}
});
httpServer.listen(PORT, () => logInfo('server_started', { port: PORT }));
