import type { NextConfig } from 'next';

// CSP and security headers are set per-request in src/middleware.ts so that
// each response gets a fresh nonce in script-src. Do not also set CSP here,
// or the static header would race with (and override) the middleware nonce.

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
	}
};

export default nextConfig;
