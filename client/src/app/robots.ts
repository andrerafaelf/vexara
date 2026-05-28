import type { MetadataRoute } from 'next';

const SITE_URL = 'https://vexara.world';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/codex', '/register', '/login', '/patch-notes', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/play',
          '/nexus',
          '/nexus/',
          '/market',
          '/factions',
          '/allies',
          '/profile',
          '/admin',
          '/combat-logs',
          '/starfield',
          '/replay/',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          '/palette-preview',
          '/u/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
