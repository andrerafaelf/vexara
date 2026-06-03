'use client';

import { useEffect, useState } from 'react';

interface UpdatedAgoProps {
	iso: string;
}

function formatAgo(diffMs: number): string {
	const seconds = Math.max(0, Math.floor(diffMs / 1000));
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Renders "Updated 2 minutes ago" relative to the timestamp the server
 * snapshot was taken at. The server emits an absolute ISO string in the
 * payload; this tiny island formats it client-side so we don't ship a
 * server-rendered relative time that goes stale the moment the page hits
 * the user (the page itself is cached for 5 minutes via revalidate).
 *
 * Re-renders every 30s while mounted so the label drifts naturally.
 */
export default function UpdatedAgo({ iso }: UpdatedAgoProps) {
	const [label, setLabel] = useState('Updated recently');

	useEffect(() => {
		const tick = () => {
			const diff = Date.now() - new Date(iso).getTime();
			setLabel(`Updated ${formatAgo(diff)}`);
		};
		tick();
		const id = setInterval(tick, 30_000);
		return () => clearInterval(id);
	}, [iso]);

	return (
		<time dateTime={iso} suppressHydrationWarning>
			{label}
		</time>
	);
}
