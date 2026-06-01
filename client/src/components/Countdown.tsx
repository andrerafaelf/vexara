'use client';

import React from 'react';
import { useNow } from '@/hooks/useNow';

interface CountdownProps {
	/** Target time the countdown is counting toward (Date, ISO string, or epoch ms). */
	endAt: string | number | Date;
	/** Optional render override. Receives ms remaining (clamped at 0). */
	render?: (msRemaining: number) => React.ReactNode;
	/** Override the "completed" label. Defaults to "Finishing…". */
	completedLabel?: string;
	className?: string;
	style?: React.CSSProperties;
}

function formatDefault(msRemaining: number, completedLabel: string): string {
	if (msRemaining <= 0) return completedLabel;
	const totalSeconds = Math.floor(msRemaining / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

/**
 * Renders a 1Hz-updating time-remaining label. Subscribes only itself to the shared clock .
 * does not force re-renders in ancestors. Drop it wherever you would have written
 * `formatTime(currentTime, endAt)` to keep the parent stable.
 */
function CountdownInner({
	endAt,
	render,
	completedLabel = 'Finishing…',
	className,
	style
}: CountdownProps) {
	const now = useNow();
	const endMs = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
	const msRemaining = Math.max(0, endMs - now);
	return (
		<span className={className} style={style}>
			{render ? render(msRemaining) : formatDefault(msRemaining, completedLabel)}
		</span>
	);
}

export const Countdown = React.memo(CountdownInner);
