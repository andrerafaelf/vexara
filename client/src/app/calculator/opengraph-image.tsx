import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara combat calculator';

export default async function Image() {
	return await renderOgCard({
		eyebrow: 'Combat Sim',
		kicker: 'Know the outcome before you commit.',
		title: 'Battle Calculator',
		subtitle:
			'Model any attack: losses, survivors, loot capacity, and Overseer control drain, before you send.',
		footer: 'vexara.world // calculator'
	});
}
