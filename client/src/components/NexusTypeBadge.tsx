import React from 'react';
import { nexusTypeIcon } from '../data/gameIcons';

interface NexusTypeBadgeProps {
	type?: string | null;
	doubled?: boolean;
	size?: number;
}

const TYPE_META: Record<
	string,
	{
		Icon: React.ComponentType<{ size?: number }>;
		tooltip: string;
		tooltipDoubled: string;
	}
> = {
	'Resource Depot': {
		Icon: ResourceDepotIcon,
		tooltip: 'Resource Depot · 2x Production',
		tooltipDoubled: 'Resource Depot · 3x Production'
	},
	'Supply Cache': {
		Icon: SupplyCacheIcon,
		tooltip: 'Supply Cache · 2x Storage, 40% Loot Protection',
		tooltipDoubled: 'Supply Cache · 3x Storage, 60% Loot Protection'
	},
	'Military Outpost': {
		Icon: MilitaryOutpostIcon,
		tooltip: 'Military Outpost · +100% Shield, 2x Training Speed',
		tooltipDoubled: 'Military Outpost · +200% Shield, 4x Training Speed'
	},
	'Forward Base': {
		Icon: ForwardBaseIcon,
		tooltip: 'Forward Base · 25% Faster Travel · 20% Faster Construction',
		tooltipDoubled: 'Forward Base · ~44% Faster Travel · 36% Faster Construction'
	}
};

// CDN art for the NPC nexus types that have bespoke icons. Types without an
// entry here keep their hand-drawn SVG glyph (see TYPE_META above).
const TYPE_ART: Partial<Record<string, string>> = {
	'Resource Depot': nexusTypeIcon('resourceDepot'),
	'Military Outpost': nexusTypeIcon('militaryOutpost')
};

function NexusTypeSvg({
	size,
	children
}: {
	size: number;
	children: React.ReactNode;
}) {
	return (
		<svg
			className="nexus-type-icon"
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="square"
			strokeLinejoin="miter"
			aria-hidden="true"
			focusable="false"
		>
			{children}
		</svg>
	);
}

function ResourceDepotIcon({ size = 12 }: { size?: number }) {
	return (
		<NexusTypeSvg size={size}>
			<path d="M3 12V6h3v6" />
			<path d="M7 12V3h3v9" />
			<path d="M11 12V7h2v5" />
			<path d="M2 12h12" />
			<path d="M4.5 4.5h3" />
			<path d="M9.5 5.5h3" />
		</NexusTypeSvg>
	);
}

function SupplyCacheIcon({ size = 12 }: { size?: number }) {
	return (
		<NexusTypeSvg size={size}>
			<path d="M3 5h10v8H3z" />
			<path d="M5 5V3h6v2" />
			<path d="M5 8h6" />
			<path d="M8 8v3" />
			<path d="M6 11h4" />
		</NexusTypeSvg>
	);
}

function MilitaryOutpostIcon({ size = 12 }: { size?: number }) {
	return (
		<NexusTypeSvg size={size}>
			<path d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4z" />
			<path d="M8 4v8" />
			<path d="M5 6h6" />
			<path d="M6 9h4" />
		</NexusTypeSvg>
	);
}

function ForwardBaseIcon({ size = 12 }: { size?: number }) {
	return (
		<NexusTypeSvg size={size}>
			<path d="M3 12h5" />
			<path d="M4 9l4-4 4 4" />
			<path d="M8 5v8" />
			<path d="M10 12h3" />
			<path d="M11 3h2v2" />
		</NexusTypeSvg>
	);
}

const NexusTypeBadge: React.FC<NexusTypeBadgeProps> = ({ type, doubled = false, size = 12 }) => {
	const [artFailed, setArtFailed] = React.useState(false);
	if (!type) return null;
	const meta = TYPE_META[type];
	if (!meta) return null;
	const { Icon } = meta;
	const tooltip = doubled ? meta.tooltipDoubled : meta.tooltip;
	const artSrc = TYPE_ART[type];

	if (artSrc && !artFailed) {
		return (
			<span className="nexus-type-badge" title={tooltip} aria-label={tooltip}>
				<img
					src={artSrc}
					alt=""
					width={size}
					height={size}
					draggable={false}
					onError={() => setArtFailed(true)}
					style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain' }}
				/>
			</span>
		);
	}

	return (
		<span className="nexus-type-badge" title={tooltip} aria-label={tooltip}>
			<Icon size={size} />
		</span>
	);
};

export default NexusTypeBadge;
