import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // Compress responses — Next.js gzip by default; Cloudflare handles Brotli at edge
  compress: true,

  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      // Hashed JS/CSS bundles — immutable for 1 year, Cloudflare will cache at edge
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Images in /public
      {
        source: '/:path*.(png|jpg|jpeg|gif|webp|avif|ico|svg)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      // Fonts
      {
        source: '/:path*.(woff|woff2|ttf|otf)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Service worker — must never be cached
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // PWA manifest
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
      // HTML pages — always revalidate, but allow Cloudflare to serve stale for 1s
      {
        source: '/((?!_next/static|_next/image|api).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          // Tell Cloudflare to cache HTML at edge for 60s (CDN-Cache-Control is CF-only)
          { key: 'CDN-Cache-Control', value: 'public, max-age=60, stale-while-revalidate=30' },
        ],
      },
    ];
  },
};

export default nextConfig;
