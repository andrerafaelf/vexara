import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Vexara units guide';

export default function Image() {
	return renderOgCard({
		eyebrow: 'Roster',
		kicker: 'Composition wins fights.',
		title: 'Units',
		subtitle: 'All 16 troop types — stats, costs, unlocks, and the class counter triangle.',
		footer: 'vexara.world / units'
	});
}
