import { Router, type Request, type Response } from 'express';
import speakeasy from 'speakeasy';
import { createRateLimiter } from '../auth/rateLimit.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, mintSession, safeEqualStr } from '../auth/session.js';

interface AuthDeps {
	adminUser: string;
	adminPass: string;
	sessionSecret: string;
	totpSecret: string | null;
	totpEnabled: boolean;
	cookieDomain: string | undefined;
	cookieSecure: boolean;
}

// 10 attempts per minute per IP, refilling at ~1/6s. Tight enough to stop
// online brute-force; loose enough not to lock out a fat-fingering admin.
const loginLimiter = createRateLimiter(10, 1 / 6);

function clientIp(req: Request): string {
	// req.ip honours exactly one trusted proxy hop (app.set('trust proxy', 1) in server.ts).
	// The leftmost X-Forwarded-For entry is client-controlled and would let an attacker
	// rotate the limiter key at will, so it is deliberately not read here.
	return req.ip || req.socket.remoteAddress || 'unknown';
}

// Public endpoints — login + logout. No session required.
export function createPublicAuthRouter(deps: AuthDeps): Router {
	const router = Router();

	router.post('/login', (req: Request, res: Response): void => {
		const ip = clientIp(req);
		if (!loginLimiter.check(ip)) {
			res.status(429).json({ error: 'Too many attempts' });
			return;
		}

		const body = (req.body ?? {}) as { username?: unknown; password?: unknown; totp?: unknown };
		const username = typeof body.username === 'string' ? body.username : '';
		const password = typeof body.password === 'string' ? body.password : '';
		const totp = typeof body.totp === 'string' ? body.totp.replace(/\s+/g, '') : '';

		// Always run both compares to keep timing flat regardless of which field is wrong.
		const userOk = safeEqualStr(username, deps.adminUser);
		const passOk = safeEqualStr(password, deps.adminPass);
		if (!userOk || !passOk) {
			res.status(401).json({ error: 'Invalid credentials' });
			return;
		}

		if (deps.totpEnabled) {
			if (!deps.totpSecret) {
				res.status(500).json({ error: 'TOTP not configured' });
				return;
			}
			if (!totp) {
				res.status(200).json({ requiresTotp: true });
				return;
			}
			if (!/^\d{6}$/.test(totp)) {
				res.status(401).json({ error: 'Invalid 2FA code' });
				return;
			}
			const totpOk = speakeasy.totp.verify({
				secret: deps.totpSecret,
				encoding: 'base32',
				token: totp,
				window: 1
			});
			if (!totpOk) {
				res.status(401).json({ error: 'Invalid 2FA code' });
				return;
			}
		}

		const { token, expiresAt } = mintSession(deps.sessionSecret);
		res.cookie(SESSION_COOKIE, token, {
			httpOnly: true,
			secure: deps.cookieSecure,
			sameSite: 'strict',
			path: '/',
			maxAge: SESSION_TTL_SECONDS * 1000,
			domain: deps.cookieDomain
		});
		res.json({ ok: true, expiresAt: expiresAt.toISOString() });
	});

	router.post('/logout', (_req: Request, res: Response): void => {
		res.clearCookie(SESSION_COOKIE, {
			httpOnly: true,
			secure: deps.cookieSecure,
			sameSite: 'strict',
			path: '/',
			domain: deps.cookieDomain
		});
		res.json({ ok: true });
	});

	return router;
}

// Session-required endpoints — currently just /me for the client gate check.
export function createSessionAuthRouter(): Router {
	const router = Router();
	router.get('/me', (_req: Request, res: Response): void => {
		res.json({ ok: true });
	});
	return router;
}
