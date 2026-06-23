import { Box, Users } from 'lucide-react';
import React from 'react';
import { objectIcon } from '../data/gameIcons';

type ResourceKind = 'biomass' | 'alloy' | 'ore' | 'population' | 'storage';

interface ResourceIconProps {
	kind: ResourceKind;
	size?: number;
	className?: string;
	/**
	 * Whether hovering shows the resource name (native title tooltip) and the
	 * name is exposed to screen readers. Defaults to true so icons are never
	 * label-less. Pass false where an adjacent visible text label already names
	 * the resource (avoids a redundant tooltip / double announcement).
	 */
	labelled?: boolean;
}

// Display names for the title tooltip / alt text.
const LABELS: Record<ResourceKind, string> = {
	biomass: 'Biomass',
	alloy: 'Alloy',
	ore: 'Ore',
	population: 'Population',
	storage: 'Storage'
};

// The three economy resources now use bespoke artwork served from the CDN
// (see gameIcons.ts) instead of line icons. Population/storage have no art, so
// they keep their lucide glyphs.
const ART: Partial<Record<ResourceKind, string>> = {
	biomass: objectIcon('biomass'),
	alloy: objectIcon('alloy'),
	ore: objectIcon('ore')
};

const GLYPH: Partial<Record<ResourceKind, React.ComponentType<{ size?: number }>>> = {
	population: Users,
	storage: Box
};

const ResourceIcon: React.FC<ResourceIconProps> = ({
	kind,
	size = 14,
	className,
	labelled = true
}) => {
	const label = LABELS[kind];
	const artSrc = ART[kind];

	if (artSrc) {
		// Artwork resources. When labelled, the title drives the hover tooltip and
		// alt carries the name for assistive tech; otherwise the image is decorative.
		return (
			<img
				src={artSrc}
				alt={labelled ? label : ''}
				title={labelled ? label : undefined}
				aria-hidden={labelled ? undefined : true}
				width={size}
				height={size}
				draggable={false}
				className={`resource-icon resource-icon--${kind}${className ? ` ${className}` : ''}`}
				style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain' }}
			/>
		);
	}

	const Glyph = GLYPH[kind]!;
	return (
		<span
			className={className}
			title={labelled ? label : undefined}
			aria-label={labelled ? label : undefined}
			aria-hidden={labelled ? undefined : true}
			style={{ display: 'inline-flex', verticalAlign: 'middle' }}
		>
			<Glyph size={size} />
		</span>
	);
};

export default ResourceIcon;
