import React from 'react';

type VexaraIconProps = React.SVGProps<SVGSVGElement> & {
	size?: number | string;
};

function VexaraIcon({ size = 16, children, ...props }: VexaraIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			{...props}
		>
			{children}
		</svg>
	);
}

// Hammer: head at top-left, diagonal handle to bottom-right. Reads cleanly
// at 12px because the head is a chunky parallelogram and the handle is a
// single uninterrupted stroke.
export function ConstructionIcon(props: VexaraIconProps) {
	return (
		<VexaraIcon {...props}>
			<path d="M2.5 5.5l3-3 4.5 4.5-3 3z" />
			<path d="M6.5 7.5l6 6" />
		</VexaraIcon>
	);
}

// Nexus: a hexagonal command node with a small central core and three short
// link stubs reaching toward the cell edges — reads as "a base / node in a
// network", matching the game's tactical-grid language. Replaces the generic
// lucide building icon on the mobile "Your Nexuses" toggle, which looked like a
// city-builder skyscraper rather than a sci-fi command node.
export function NexusIcon(props: VexaraIconProps) {
	return (
		<VexaraIcon {...props}>
			<path d="M8 1.5l5.5 3.25v6.5L8 14.5l-5.5-3.25v-6.5z" />
			<circle cx="8" cy="8" r="1.9" />
			<path d="M8 6.1V3.2" />
			<path d="M9.65 8.95l2.5 1.45" />
			<path d="M6.35 8.95l-2.5 1.45" />
		</VexaraIcon>
	);
}

// Crossed swords: two diagonal blades forming an X with small cross-guards
// near each tip and short pommels past the lower intersections. Symmetric
// so it stays balanced when scaled down to a sidebar badge.
export function CombatIcon(props: VexaraIconProps) {
	return (
		<VexaraIcon {...props}>
			<path d="M3.25 3.25l8.5 8.5" />
			<path d="M2 4.5l3-3" />
			<path d="M11.75 11.75l1.5 1.5" />
			<path d="M12.75 3.25l-8.5 8.5" />
			<path d="M14 4.5l-3-3" />
			<path d="M4.25 11.75l-1.5 1.5" />
		</VexaraIcon>
	);
}
