import type { MetadataRoute } from 'next';

const SITE_URL = 'https://vexara.world';

// Everything is allowed and nothing is disallowed on purpose. Auth-gated or
// redirect routes are intentionally not listed in `disallow`: that would advertise
// them to anyone reading robots.txt (e.g. /admin, /api/, password-reset flows).
// Crawlers will not reach them anyway because they require auth or 3xx offsite.
// The public routes worth indexing are listed in sitemap.ts.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/'
			}
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL
	};
}
