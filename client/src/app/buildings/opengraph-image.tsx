import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara buildings guide';

export default function Image() {
	return renderOgCard({
		eyebrow: 'Infrastructure',
		kicker: 'Command Core to Stealth Array.',
		title: 'Buildings',
		subtitle: 'All 10 core structures — costs, max levels, milestones, and production scaling.',
		footer: 'vexara.world / buildings'
	});
}
