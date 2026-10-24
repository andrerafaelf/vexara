import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara — free browser MMO RTS';

export default async function Image() {
	return await renderOgCard({
		eyebrow: 'Live Galaxy',
		kicker: 'Seasonal galaxies. Permanent legacy.',
		title: 'Real opponents.',
		subtitle: 'Free browser MMO-RTS. Galaxies run to a winner. Your record carries forever. Free to play.',
		footer: 'vexara.world'
	});
}
