import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Session token format: base64url(payload).base64url(hmac)
// payload = JSON { sub: 'admin', iat, exp, jti }
// Cookie is HttpOnly + Secure + SameSite=Strict; we verify the HMAC on every request.

export const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface SessionPayload {
	sub: string;
	iat: number;
	exp: number;
	jti: string;
}

function b64url(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
	const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
	return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function mintSession(secret: string, sub = 'admin'): { token: string; expiresAt: Date } {
	const now = Date.now();
	const payload: SessionPayload = {
		sub,
		iat: now,
		exp: now + SESSION_TTL_MS,
		jti: randomBytes(16).toString('hex')
	};
	const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
	const sig = b64url(createHmac('sha256', secret).update(payloadB64).digest());
	return { token: `${payloadB64}.${sig}`, expiresAt: new Date(payload.exp) };
}

export function verifySession(secret: string, token: string | undefined): SessionPayload | null {
	if (!token || typeof token !== 'string') return null;
	const dot = token.indexOf('.');
	if (dot < 0) return null;
	const payloadB64 = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = createHmac('sha256', secret).update(payloadB64).digest();
	const provided = b64urlDecode(sig);
	if (provided.length !== expected.length) return null;
	if (!timingSafeEqual(provided, expected)) return null;
	let payload: SessionPayload;
	try {
		payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
	} catch {
		return null;
	}
	if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
	return payload;
}

export function safeEqualStr(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return timingSafeEqual(aBuf, bBuf);
}

export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
