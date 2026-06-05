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
			strokeLinecap="square"
			strokeLinejoin="miter"
			aria-hidden="true"
			focusable="false"
			{...props}
		>
			{children}
		</svg>
	);
}

export function ConstructionIcon(props: VexaraIconProps) {
	return (
		<VexaraIcon {...props}>
			<path d="M3 13h10" />
			<path d="M5 13V8" />
			<path d="M11 13V6" />
			<path d="M4 8h8" />
			<path d="M6 5h7" />
			<path d="M8 3l-2 2 2 2" />
			<path d="M12 5v3" />
		</VexaraIcon>
	);
}

export function CombatIcon(props: VexaraIconProps) {
	return (
		<VexaraIcon {...props}>
			<path d="M2 8h9" />
			<path d="M8 5l3 3-3 3" />
			<path d="M4 4l8 8" />
			<path d="M12 4L4 12" />
			<path d="M13 3h1v1" />
			<path d="M13 12h1v1" />
		</VexaraIcon>
	);
}
