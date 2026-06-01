import cookieParser from 'cookie-parser';
import cors from 'cors';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { resolve } from 'path';
import { SESSION_COOKIE, verifySession } from './auth/session.js';
import adminRoutes from './routes/admin.js';
import { createPublicAuthRouter, createSessionAuthRouter } from './routes/auth.js';

dotenv.config({ path: resolve(__dirname, '.env') });
dotenv.config({ path: resolve(__dirname, '../server/.env') });

const app = express();
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET ?? null;
const ADMIN_TOTP_ENABLED = (process.env.ADMIN_TOTP_ENABLED ?? 'true').toLowerCase() !== 'false';
const ADMIN_COOKIE_DOMAIN = process.env.ADMIN_COOKIE_DOMAIN || undefined;
const ADMIN_COOKIE_SECURE = (process.env.ADMIN_COOKIE_SECURE ?? 'true').toLowerCase() !== 'false';

if (!ADMIN_USER || !ADMIN_PASS) {
	throw new Error('ADMIN_USER and ADMIN_PASS are required');
}
if (!ADMIN_SESSION_SECRET || ADMIN_SESSION_SECRET.length < 32) {
	throw new Error('ADMIN_SESSION_SECRET must be set and at least 32 chars');
}
if (ADMIN_TOTP_ENABLED && !ADMIN_TOTP_SECRET) {
	throw new Error('ADMIN_TOTP_SECRET is required when ADMIN_TOTP_ENABLED is true');
}

const allowedCorsOrigins = (process.env.ADMIN_CORS_ORIGINS || '')
	.split(',')
	.map((v) => v.trim())
	.filter(Boolean);

const requireSession = (
	req: express.Request,
	res: express.Response,
	next: express.NextFunction
): void => {
	const token = (req as express.Request & { cookies?: Record<string, string> }).cookies?.[
		SESSION_COOKIE
	];
	const payload = verifySession(ADMIN_SESSION_SECRET, token);
	if (!payload) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	next();
};

// Trust the nginx proxy so req.ip reflects the real client (used by the login rate limiter).
app.set('trust proxy', 1);

app.use((req, res, next) => {
	(req as express.Request & { requestId?: string }).requestId = randomUUID();
	res.setHeader('X-Request-Id', (req as express.Request & { requestId?: string }).requestId!);
	next();
});

app.use(
	cors({
		origin(origin, callback) {
			if (!origin || allowedCorsOrigins.length === 0) return callback(null, true);
			if (allowedCorsOrigins.includes(origin)) return callback(null, true);
			return callback(new Error('Not allowed by CORS'));
		},
		credentials: true
	})
);
app.use(express.json());
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

const publicAuthRouter = createPublicAuthRouter({
	adminUser: ADMIN_USER,
	adminPass: ADMIN_PASS,
	sessionSecret: ADMIN_SESSION_SECRET,
	totpSecret: ADMIN_TOTP_SECRET,
	totpEnabled: ADMIN_TOTP_ENABLED,
	cookieDomain: ADMIN_COOKIE_DOMAIN,
	cookieSecure: ADMIN_COOKIE_SECURE
});
const sessionAuthRouter = createSessionAuthRouter();

app.use('/api/admin/auth', publicAuthRouter);
app.use('/api/admin/auth', requireSession, sessionAuthRouter);
app.use('/api/admin', requireSession, adminRoutes);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
	if (res.headersSent) {
		next(err);
		return;
	}
	res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.ADMIN_PORT || 3002;
app.listen(PORT, () => console.log(`Admin server running on port ${PORT}`));
