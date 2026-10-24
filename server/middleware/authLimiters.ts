import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { isIPv6 } from 'net';

// Positive integer from env, falling back to the default on missing/typo'd values
// (Number('abc') is NaN, which would silently disable express-rate-limit).
export function envInt(name: string, fallback: number): number {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Expand an IPv6 literal to its 8 hextet groups (handles "::" and a trailing IPv4).
function expandIPv6(ip: string): string[] | null {
	let addr = ip.split('%')[0].toLowerCase();
	const v4 = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
	if (v4) {
		const o = v4[2].split('.').map(Number);
		if (o.some((x) => x > 255)) return null;
		addr = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
	}
	const halves = addr.split('::');
	if (halves.length > 2) return null;
	const head = halves[0] ? halves[0].split(':') : [];
	const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
	const missing = 8 - head.length - tail.length;
	if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
	return [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail].map(
		(g) => g.padStart(4, '0')
	);
}

// Rate-limit key for a client address. IPv4 is unchanged. IPv6 collapses to its /64:
// a single subscriber is normally handed a whole /64, so keying on the full address
// would let one attacker rotate through 2^64 keys to dodge every per-IP limiter.
// (express-rate-limit 7.5.1 ships no ipKeyGenerator helper, so this is our own.)
export function ipKey(req: Request): string {
	const ip = req.ip ?? 'unknown';
	if (!isIPv6(ip.split('%')[0])) return ip;
	const groups = expandIPv6(ip);
	if (!groups) return ip;
	// IPv4-mapped (::ffff:a.b.c.d): key on the embedded IPv4.
	if (groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff') {
		const hi = parseInt(groups[6], 16);
		const lo = parseInt(groups[7], 16);
		return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
	}
	return `${groups.slice(0, 4).join(':')}::/64`;
}

// Normalized username from a login/reset body, or null if absent / not a string.
function bodyUsername(req: Request): string | null {
	const raw = (req.body as { username?: unknown } | undefined)?.username;
	if (typeof raw !== 'string') return null;
	const u = raw.trim().toLowerCase().slice(0, 64);
	return u.length > 0 ? u : null;
}

const LOGIN_MESSAGE = { error: 'Too many login attempts, please try again in a few minutes.' };

// All login limiters count FAILED attempts only (skipSuccessfulRequests), so a school
// or CGNAT full of players who log in correctly never exhaust the shared bucket, while
// credential stuffing and brute force do. Three layers:
//  1. per subnet: any username, 30 failures / 15 min
//  2. per subnet + account: 10 failures / 15 min
//  3. per account from anywhere: 50 failures / hour (blunts distributed guessing)
export const loginIpLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: envInt('AUTH_LOGIN_RATE_LIMIT_MAX', 30),
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: true,
	skip: (req) => req.method === 'OPTIONS',
	keyGenerator: (req) => ipKey(req),
	message: LOGIN_MESSAGE
});

export const loginAccountIpLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: true,
	skip: (req) => req.method === 'OPTIONS' || bodyUsername(req) === null,
	keyGenerator: (req) => `${ipKey(req)}:${bodyUsername(req)}`,
	message: LOGIN_MESSAGE
});

export const loginAccountLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 50,
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: true,
	skip: (req) => req.method === 'OPTIONS' || bodyUsername(req) === null,
	keyGenerator: (req) => `${bodyUsername(req)}`,
	message: LOGIN_MESSAGE
});

// Called after a successful password reset (proof of inbox ownership) so the real
// owner is never locked out by someone else's failed guesses. Clears the username-keyed
// buckets for the caller's subnet and the account-wide one.
export function resetLoginLimits(req: Request, username: string): void {
	const u = username.trim().toLowerCase().slice(0, 64);
	loginAccountIpLimiter.resetKey(`${ipKey(req)}:${u}`);
	loginAccountLimiter.resetKey(u);
}
