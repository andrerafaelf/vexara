// Faction system fully integrated with database migrations and API routes
import cors from 'cors';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import prisma from './lib/prisma.js';
import { initWarRoomSocket, initGameSocket } from './services/warRoomSocket.js';
import { processCompletedQueuesAndNotify, recoverControlLevels, updateAllResources } from './models/Nexus.js';
import attackRoutes from './routes/attack.js';
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
import { processArrivedAttacks, processArrivedTransfers } from './utils/combat.js';
import { processArrivedSpyMissions } from './controllers/spyController.js';
import { processDominanceVictories } from './utils/dominance.js';
import { logError, logInfo, logWarn } from './utils/logger.js';
import { ensureNeutralNexusPool, levelUpNeutralNexuses, dailyNexusGrowth } from './utils/neutralNexuses.js';
import { processGalaxyEvents } from './utils/galaxyEvents.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const allowedCorsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);

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
    logInfo('http_request', { requestId: (req as express.Request & { requestId?: string }).requestId, method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - start });
  });
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = normalizeOriginValue(origin);
    const normalizedAllowed = allowedCorsOrigins.map((v) => normalizeOriginValue(v));
    if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (normalizedAllowed.includes(normalizedOrigin)) return callback(null, true);
    if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule))) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
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
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT_MAX || 150), standardHeaders: true, legacyHeaders: false, skip: (req) => req.method === 'OPTIONS', message: { error: 'Too many login attempts, please try again in a few minutes.' } });
  const alphaSignupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: Number(process.env.ALPHA_SIGNUP_RATE_LIMIT_MAX || 25), standardHeaders: true, legacyHeaders: false, skip: (req) => req.method === 'OPTIONS', message: { error: 'Too many sign-up attempts from this address. Please try again later.' } });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX || 24000),
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
      let h = 0; for (let i = 0; i < ua.length; i++) h = ((h << 5) - h + ua.charCodeAt(i)) | 0;
      return `ip:${req.ip ?? 'unknown'}:${h}`;
    },
    message: { error: 'Too many requests. Please try again in a minute.' },
  });
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/alpha-signup', alphaSignupLimiter);
  app.use('/api/', apiLimiter);
}

app.get('/api/unsubscribe', unsubscribe);
app.post('/api/unsubscribe', express.urlencoded({ extended: false }), unsubscribe);
app.post('/api/webhooks/kofi', express.urlencoded({ extended: false, limit: '64kb' }), handleKofiWebhook);
app.use('/api/auth', authRoutes);
app.use('/api/nexus', nexusRoutes);
app.use('/api/building', buildingRoutes);
app.use('/api/troop', troopRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/attack', attackRoutes);
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

const JOB_LOCKS = { updateResources: 9101, processCombat: 9102, syncNeutralPool: 9103, recoverControl: 9104, processTransfers: 9105, levelNeutralNexuses: 9106, processQueues: 9107, processDominance: 9108, dailyNexusGrowth: 9109, galaxyEvents: 9110, processSpyMissions: 9111 };

async function runWithPgAdvisoryLock(lockId: number, jobName: string, jobHandler: () => Promise<void>) {
  try {
    const lockRows = await prisma.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_lock(${lockId}) AS locked`;
    const locked = Array.isArray(lockRows) && lockRows[0]?.locked;
    if (!locked) { logWarn('job_lock_skipped', { jobName, lockId }); return; }
    const startedAt = Date.now();
    try {
      await jobHandler();
      logInfo('job_completed', { jobName, durationMs: Date.now() - startedAt });
    } finally {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
    }
  } catch (error) {
    logError('job_failed', { jobName, message: (error as Error).message });
  }
}

prisma.$connect()
  .then(async () => {
    logInfo('postgres_connected');
    try {
      const neutralSync = await ensureNeutralNexusPool();
      if (neutralSync.created > 0) logInfo('neutral_nexus_spawned', { created: neutralSync.created, neutralCount: neutralSync.neutralCount, targetNeutralCount: neutralSync.targetNeutralCount });
    } catch (err) {
      logError('neutral_nexus_pool_error', { message: (err as Error).message });
    }
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.updateResources, 'update_resources', () => updateAllResources()); }, 60000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.processCombat, 'process_combat', () => processArrivedAttacks()); }, 10000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.processSpyMissions, 'process_spy_missions', () => processArrivedSpyMissions()); }, 10000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.processTransfers, 'process_transfers', () => processArrivedTransfers()); }, 10000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.processQueues, 'process_queues', () => processCompletedQueuesAndNotify()); }, 15000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.syncNeutralPool, 'sync_neutral_pool', async () => { await ensureNeutralNexusPool(); }); }, 60000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.recoverControl, 'recover_control', () => recoverControlLevels()); }, 30 * 60 * 1000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.levelNeutralNexuses, 'level_neutral_nexuses', () => levelUpNeutralNexuses()); }, 6 * 60 * 60 * 1000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.dailyNexusGrowth, 'daily_nexus_growth', async () => { const r = await dailyNexusGrowth(); if (r.created > 0) logInfo('daily_nexus_growth', { created: r.created }); }); }, 24 * 60 * 60 * 1000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.processDominance, 'process_dominance', () => processDominanceVictories()); }, 10 * 60 * 1000);
    setInterval(() => { void runWithPgAdvisoryLock(JOB_LOCKS.galaxyEvents, 'galaxy_events', () => processGalaxyEvents()); }, 4 * 60 * 60 * 1000);
  })
  .catch((err: Error) => logError('postgres_connection_error', { message: err.message }));

app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logError('unhandled_http_error', { requestId: (req as express.Request & { requestId?: string }).requestId, method: req.method, path: req.originalUrl, message: error.message });
  if (res.headersSent) { next(error); return; }
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  logError('process_unhandled_rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
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
      if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production') return callback(null, true);
      if (normalizedAllowed.includes(normalizedOrigin)) return callback(null, true);
      if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule))) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});
initWarRoomSocket(httpServer, {
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOriginValue(origin);
      const normalizedAllowed = allowedCorsOrigins.map((v) => normalizeOriginValue(v));
      if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production') return callback(null, true);
      if (normalizedAllowed.includes(normalizedOrigin)) return callback(null, true);
      if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule))) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});
httpServer.listen(PORT, () => logInfo('server_started', { port: PORT }));
