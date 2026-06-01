import type { NextConfig } from 'next';

// Next.js's dev server uses inline + eval for HMR; prod ships static bundles
// from 'self'. We forbid 'unsafe-inline' / 'unsafe-eval' for scripts in prod so
// any XSS payload can't execute. If you add a 3rd-party script later, extend
// script-src explicitly rather than relaxing to 'unsafe-inline'.
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'";

const CSP_DIRECTIVES = [
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

const SECURITY_HEADERS = [
	{ key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'Referrer-Policy', value: 'no-referrer' },
	{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
	{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
	{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }
];

const nextConfig: NextConfig = {
	output: 'standalone',
	reactStrictMode: true,
	async rewrites() {
		const adminApiUrl = process.env.INTERNAL_ADMIN_API_URL ?? 'http://localhost:3002';
		return [
			{
				source: '/api/:path*',
				destination: `${adminApiUrl}/api/:path*`
			}
		];
	},
	async headers() {
		return [{ source: '/:path*', headers: SECURITY_HEADERS }];
	}
};

export default nextConfig;
