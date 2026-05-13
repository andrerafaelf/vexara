import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    const adminApiUrl = process.env.INTERNAL_ADMIN_API_URL ?? 'http://localhost:3002';
    return [
      {
        source: '/api/:path*',
        destination: `${adminApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
