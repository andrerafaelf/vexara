import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara Codex — field manual';

export default async function Image() {
	return await renderOgCard({
		eyebrow: 'Field Manual',
		kicker: 'Every building. Every unit.',
		title: 'The Codex',
		subtitle: 'Full stats, costs, unlocks, and scaling for all buildings and units in Vexara.',
		footer: 'vexara.world // codex'
	});
}
