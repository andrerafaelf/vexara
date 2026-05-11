import cors from 'cors';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import prisma from './lib/prisma.js';
import { recoverControlLevels, updateAllResources } from './models/Nexus.js';
import attackRoutes from './routes/attack.js';
import authRoutes from './routes/auth.js';
import buildingRoutes from './routes/building.js';
import chatRoutes from './routes/chat.js';
import friendsRoutes from './routes/friends.js';
import mapRoutes from './routes/map.js';
import marketRoutes from './routes/market.js';
import nexusRoutes from './routes/nexus.js';
import reportRoutes from './routes/report.js';
import troopRoutes from './routes/troop.js';
import troopTransferRoutes from './routes/troopTransfer.js';
import { processArrivedAttacks, processArrivedTransfers } from './utils/combat.js';
import { logError, logInfo, logWarn } from './utils/logger.js';
import { ensureNeutralNexusPool, levelUpNeutralNexuses } from './utils/neutralNexuses.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const allowedCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

function normalizeOriginValue(value) {
  return String(value).trim().replace(/\/+$/, '').toLowerCase();
}

function matchesCorsOrigin(origin, rule) {
  if (rule === '*') {
    return true;
  }

  const normalizedOrigin = normalizeOriginValue(origin);
  const normalizedRule = normalizeOriginValue(rule);
  const escaped = normalizedRule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(normalizedOrigin);
}

const app = express();
app.set('trust proxy', 1);

// Middleware
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const start = Date.now();
  res.on('finish', () => {
    logInfo('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOriginValue(origin);
      const normalizedAllowedOrigins = allowedCorsOrigins.map((v) => normalizeOriginValue(v));

      if (allowedCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      if (allowedCorsOrigins.some((rule) => matchesCorsOrigin(normalizedOrigin, rule))) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/readyz', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not-ready' });
  }
});

// Rate limiting (disabled in development)
if (process.env.NODE_ENV === 'production') {
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: { error: 'Too many login attempts, please try again in a few minutes.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX || 4800),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
  });

  app.use('/api/auth/login', loginLimiter);
  app.use('/api/', apiLimiter);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/nexus', nexusRoutes);
app.use('/api/building', buildingRoutes);
app.use('/api/troop', troopRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/attack', attackRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/troop-transfer', troopTransferRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/chat', chatRoutes);

const JOB_LOCKS = {
  updateResources: 9101,
  processCombat: 9102,
  syncNeutralPool: 9103,
  recoverControl: 9104,
  processTransfers: 9105,
  levelNeutralNexuses: 9106,
};

async function runWithPgAdvisoryLock(lockId, jobName, jobHandler) {
  try {
    const lockRows = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${lockId}) AS locked`;
    const locked = Array.isArray(lockRows) && lockRows[0]?.locked;

    if (!locked) {
      logWarn('job_lock_skipped', { jobName, lockId });
      return;
    }

    const startedAt = Date.now();
    try {
      await jobHandler();
      logInfo('job_completed', { jobName, durationMs: Date.now() - startedAt });
    } finally {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
    }
  } catch (error) {
    logError('job_failed', { jobName, message: error.message });
  }
}

// Connect to PostgreSQL then start all background jobs
prisma
  .$connect()
  .then(async () => {
    logInfo('postgres_connected');

    try {
      const neutralSync = await ensureNeutralNexusPool();
      if (neutralSync.created > 0) {
        logInfo('neutral_nexus_spawned', {
          created: neutralSync.created,
          neutralCount: neutralSync.neutralCount,
          targetNeutralCount: neutralSync.targetNeutralCount,
        });
      }
    } catch (err) {
      logError('neutral_nexus_pool_error', { message: err.message });
    }

    // Start resource production interval (every minute)
    setInterval(() => {
      void runWithPgAdvisoryLock(JOB_LOCKS.updateResources, 'update_resources', () => updateAllResources());
    }, 60000);

    // Start combat resolution interval (every 10 seconds)
    setInterval(() => {
      void runWithPgAdvisoryLock(JOB_LOCKS.processCombat, 'process_combat', () => processArrivedAttacks());
    }, 10000);

    // Resolve arrived/returning troop transfers (every 10 seconds)
    setInterval(() => {
      void runWithPgAdvisoryLock(JOB_LOCKS.processTransfers, 'process_transfers', () => processArrivedTransfers());
    }, 10000);

    // Keep neutral nexus pool filled as the world gets conquered
    setInterval(() => {
      void runWithPgAdvisoryLock(JOB_LOCKS.syncNeutralPool, 'sync_neutral_pool', async () => {
        await ensureNeutralNexusPool();
      });
    }, 60000);

    // Gradually recover control level for conquered nexuses (+10 every 30 min)
    setInterval(
      () => {
        void runWithPgAdvisoryLock(JOB_LOCKS.recoverControl, 'recover_control', () => recoverControlLevels());
      },
      30 * 60 * 1000,
    );

    // Level up NPC nexus buildings over time so they stay a challenge (every 6 hours)
    setInterval(
      () => {
        void runWithPgAdvisoryLock(JOB_LOCKS.levelNeutralNexuses, 'level_neutral_nexuses', () =>
          levelUpNeutralNexuses(),
        );
      },
      6 * 60 * 60 * 1000,
    );
  })
  .catch((err) => {
    logError('postgres_connection_error', { message: err.message });
  });

app.use((error, req, res, next) => {
  logError('unhandled_http_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    message: error.message,
  });
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  logError('process_unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logError('process_uncaught_exception', { message: error.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logInfo('server_started', { port: PORT });
});
