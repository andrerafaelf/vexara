import { loadPatchNotes } from '@/lib/patchNotes';
import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

// Social card for the patch-notes index. Surfaces the latest version so a shared
// /patch-notes link reads as "here's what's new". Node runtime (loadPatchNotes
// uses fs).
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = 'Vexara Patch Notes';

export default async function Image() {
	const latest = loadPatchNotes()[0]?.label ?? null;
	return renderOgCard({
		eyebrow: 'Transmission Log',
		kicker: 'Every change since launch.',
		title: 'Patch Notes',
		footer: 'vexara.world / patch-notes',
		badge: latest ? `Latest · ${latest}` : undefined
	});
}
