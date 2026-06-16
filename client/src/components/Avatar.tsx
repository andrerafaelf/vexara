'use client';

import React from 'react';

type Size = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps {
	username: string;
	/** Large 256×256 webp URL. */
	avatarUrl?: string | null;
	/** Small 64×64 webp URL, used for sizes < md when present. */
	avatarUrlSm?: string | null;
	size?: Size;
	/** Extra className applied to the wrapping element. */
	className?: string;
	/** Extra className applied to the vx-avatar-bordered wrapper when borderKey is set. Falls back to className when no borderKey. */
	wrapperClassName?: string;
	/** Inline override for square dimension (px). Useful for one-off sizes. */
	px?: number;
	/** Hide from screen readers (use when adjacent text already names the user). */
	ariaHidden?: boolean;
	/** Shop border key (e.g. "border_plasma_arc"). Wraps avatar in a bordered div. */
	borderKey?: string | null;
	/** Supporter tier ("officer" | "vanguard" | "commander"). Adds a tier-coloured glow. */
	supporterTier?: string | null;
}

/** Maps a supporter tier to its glow class. Cyan = commander, amber = vanguard, slate = officer. */
function supporterGlowClass(tier?: string | null): string | null {
	if (tier === 'officer') return 'supporter-border supporter-border-officer';
	if (tier === 'vanguard') return 'supporter-border supporter-border-vanguard';
	if (tier === 'commander') return 'supporter-border supporter-border-commander';
	return null;
}

const SIZE_PX: Record<Size, number> = {
	xs: 20,
	sm: 28,
	md: 36,
	lg: 56
};

function initialFor(username: string): string {
	return (username ?? '?').slice(0, 1).toUpperCase();
}

/**
 * Renders a user's avatar. Falls back to the username-initial tile when no
 * custom avatar is set. Small renders (< md) prefer the 64×64 variant to save
 * bandwidth; larger renders use the 256×256 variant.
 */
const Avatar: React.FC<AvatarProps> = ({
	username,
	avatarUrl,
	avatarUrlSm,
	size = 'md',
	className,
	wrapperClassName,
	px,
	ariaHidden,
	borderKey,
	supporterTier,
}) => {
	const dim = px ?? SIZE_PX[size];
	const isSmall = (px ?? SIZE_PX[size]) <= SIZE_PX.sm;
	const src = isSmall ? (avatarUrlSm ?? avatarUrl ?? null) : (avatarUrl ?? avatarUrlSm ?? null);

	const style: React.CSSProperties = {
		width: dim,
		height: dim
	};

	const borderCssClass = borderKey
		? borderKey.replace('border_', '').replace(/_/g, '-')
		: null;

	// The supporter glow lands on the same element wrapperClassName targets: the
	// bordered wrapper when a frame is fitted, otherwise the inner avatar element.
	const glowClass = supporterGlowClass(supporterTier);
	const wrapperCombined = [wrapperClassName, glowClass].filter(Boolean).join(' ') || undefined;

	// When no border wrapper exists, wrapperCombined falls through to the inner element.
	const innerExtra = borderCssClass ? className : [className, wrapperCombined].filter(Boolean).join(' ') || undefined;
	const cls = ['vx-avatar', innerExtra].filter(Boolean).join(' ');

	const inner = src ? (
		<img
			src={src}
			alt={ariaHidden ? '' : `${username}'s avatar`}
			width={dim}
			height={dim}
			loading="lazy"
			decoding="async"
			draggable={false}
			className={cls}
			style={style}
			aria-hidden={ariaHidden || undefined}
		/>
	) : (
		<div
			className={cls}
			style={style}
			aria-hidden={ariaHidden || undefined}
			aria-label={ariaHidden ? undefined : `${username}'s avatar`}
		>
			{initialFor(username)}
		</div>
	);

	if (!borderCssClass) return inner;

	// Image-based borders are PNG frames overlaid via ::before at inset:0, so the
	// border is exactly the same box as the avatar — no padding, no extra size.
	return (
		<div
			className={['vx-avatar-bordered', `border-${borderCssClass}`, wrapperCombined].filter(Boolean).join(' ')}
			style={{
				width: dim,
				height: dim,
				flexShrink: 0
			}}
		>
			<div className="vx-avatar-clip" style={{ width: dim, height: dim }}>
				{inner}
			</div>
		</div>
	);
};

export default Avatar;
