import type { MetadataRoute } from 'next';

const SITE_URL = 'https://vexara.world';

// Only public, indexable routes are listed. Auth-gated or redirect routes are
// intentionally omitted — listing them in `disallow` advertises them to anyone
// reading robots.txt (e.g. /admin, /api/, password-reset flows). Crawlers will
// not reach them anyway because they require auth or 3xx offsite.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: [
					'/',
					'/codex',
					'/register',
					'/login',
					'/patch-notes',
					'/how-to-play',
					'/units',
					'/buildings',
					'/privacy',
					'/terms'
				],
				disallow: ['/']
			}
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL
	};
}
