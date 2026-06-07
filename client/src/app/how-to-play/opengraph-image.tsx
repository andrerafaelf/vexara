import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'How to play Vexara';

export default async function Image() {
	return await renderOgCard({
		eyebrow: 'Briefing',
		kicker: 'From first nexus to conquest.',
		title: 'How to Play',
		subtitle: 'Build, train, scout, raid, and take territory in a galaxy that never stops running.',
		footer: 'vexara.world // how-to-play'
	});
}
