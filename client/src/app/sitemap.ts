import type { MetadataRoute } from 'next';
import { loadPatchNotes } from '@/lib/patchNotes';

const SITE_URL = 'https://vexara.world';

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();
	const patches = loadPatchNotes();
	return [
		{
			url: `${SITE_URL}/`,
			lastModified: now,
			changeFrequency: 'daily',
			priority: 1.0
		},
		{
			url: `${SITE_URL}/codex`,
			lastModified: now,
			changeFrequency: 'weekly',
			priority: 0.9
		},
		{
			url: `${SITE_URL}/register`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.8
		},
		{
			url: `${SITE_URL}/how-to-play`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.8
		},
		{
			url: `${SITE_URL}/state-of-galaxy`,
			lastModified: now,
			changeFrequency: 'weekly',
			priority: 0.8
		},
		{
			url: `${SITE_URL}/units`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.6
		},
		{
			url: `${SITE_URL}/buildings`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.6
		},
		{
			url: `${SITE_URL}/patch-notes`,
			lastModified: now,
			changeFrequency: 'weekly',
			priority: 0.7
		},
		...patches.map((p, i) => ({
			url: `${SITE_URL}/patch-notes/${p.slug}`,
			lastModified: now,
			changeFrequency: 'never' as const,
			priority: i === 0 ? 0.7 : 0.5
		})),
		{
			url: `${SITE_URL}/login`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.3
		},
		{
			url: `${SITE_URL}/privacy`,
			lastModified: now,
			changeFrequency: 'yearly',
			priority: 0.2
		},
		{
			url: `${SITE_URL}/terms`,
			lastModified: now,
			changeFrequency: 'yearly',
			priority: 0.2
		}
	];
}
