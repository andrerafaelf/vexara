import { NextRequest, NextResponse } from 'next/server';

// Per-request CSP nonce. Next.js App Router emits a handful of small inline
// bootstrap scripts (RSC payload, hydration, error boundaries) that we can't
// avoid. We mint a random nonce per request, hand it to Next via the
// `x-nonce` request header (Next auto-attaches it to its own inline scripts),
// and put the same nonce in the script-src directive so only those scripts run.
//
// Dev mode also uses 'unsafe-eval' for HMR; we relax CSP there.

const isDev = process.env.NODE_ENV !== 'production';

function generateNonce(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest): NextResponse {
	const nonce = generateNonce();

	const scriptSrc = isDev
		? `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
		: `'self' 'nonce-${nonce}' 'strict-dynamic'`;

	const csp = [
		"default-src 'self'",
		`script-src ${scriptSrc}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"connect-src 'self'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"object-src 'none'"
	].join('; ');

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set('x-nonce', nonce);
	requestHeaders.set('content-security-policy', csp);

	const response = NextResponse.next({ request: { headers: requestHeaders } });
	response.headers.set('content-security-policy', csp);
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'no-referrer');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	response.headers.set('x-robots-tag', 'noindex, nofollow');
	return response;
}

// Skip static assets and the Next image optimizer — they don't render HTML and
// the CSP header is irrelevant to them.
export const config = {
	matcher: [
		{
			source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)',
			missing: [
				{ type: 'header', key: 'next-router-prefetch' },
				{ type: 'header', key: 'purpose', value: 'prefetch' }
			]
		}
	]
};
