import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara — free browser MMO RTS';

export default function Image() {
	return renderOgCard({
		eyebrow: 'Live Galaxy',
		kicker: 'A persistent galaxy.',
		title: 'Real opponents.',
		subtitle: 'Free browser MMO-RTS. One living galaxy, 24/7. No resets. No pay-to-win.',
		footer: 'vexara.world'
	});
}
