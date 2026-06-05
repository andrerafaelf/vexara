'use client';

import { DISCORD_URL } from '@/constants/social';
import '@/styles/DiscordButton.css';

interface DiscordButtonProps {
	/**
	 * Visual treatment:
	 * - 'solid'  — filled Discord-blurple pill, the loudest CTA (signup / landing).
	 * - 'outline'— blurple outline, for headers/navs where a filled button is too heavy.
	 * - 'pill'   — compact icon+label chip, used in the in-game header bar.
	 */
	variant?: 'solid' | 'outline' | 'pill';
	/** Override the visible label. Defaults to "Join the Discord". */
	label?: string;
	className?: string;
	/** utm_source/campaign tag appended so we can see which surface drives joins. */
	utm?: string;
}

// The official Discord wordmark glyph, drawn so it inherits currentColor.
function DiscordGlyph({ size = 18 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			focusable="false"
		>
			<path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" />
		</svg>
	);
}

export default function DiscordButton({
	variant = 'solid',
	label = 'Join the Discord',
	className,
	utm
}: DiscordButtonProps) {
	const href = utm ? `${DISCORD_URL}?utm_source=${encodeURIComponent(utm)}` : DISCORD_URL;
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={`discord-btn discord-btn--${variant}${className ? ` ${className}` : ''}`}
		>
			<DiscordGlyph size={variant === 'pill' ? 16 : 18} />
			<span>{label}</span>
		</a>
	);
}
