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
