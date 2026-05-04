import cors from 'cors';
import { randomUUID, timingSafeEqual } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });
dotenv.config({ path: resolve(__dirname, '../server/.env') });

const app = express();
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
  throw new Error('ADMIN_USER and ADMIN_PASS are required');
}

const allowedCorsOrigins = (process.env.ADMIN_CORS_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Console"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

  if (!safeEqual(username, ADMIN_USER) || !safeEqual(password, ADMIN_PASS)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Console"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedCorsOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedCorsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/admin', requireAdminAuth, adminRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.ADMIN_PORT || 3002;
app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});
