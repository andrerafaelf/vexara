'use client';

import React from 'react';
import { useNow } from '@/hooks/useNow';

function formatDurationSeconds(totalSeconds: number): string {
	const safe = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const seconds = safe % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

export interface QueueCountdownResult {
	label: string;
	isWaiting: boolean;
}

/**
 * Computes the live label for a queue entry that depends on when the previous entry finishes.
 * Pure, exported for callers that already render their own time-aware UI (e.g. shortcut cards).
 */
export function computeQueueCountdown(
	endAt: string | number | Date | undefined,
	prevEndAt: string | number | Date | undefined,
	now: number
): QueueCountdownResult {
	if (endAt === undefined) return { label: '', isWaiting: false };
	const endMs = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();

	if (prevEndAt !== undefined) {
		const startsAt =
			prevEndAt instanceof Date ? prevEndAt.getTime() : new Date(prevEndAt).getTime();
		const ownDurationSeconds = Math.floor((endMs - startsAt) / 1000);
		if (now < startsAt) {
			return {
				label: `Queued • ${formatDurationSeconds(ownDurationSeconds)}`,
				isWaiting: true
			};
		}
	}

	const remainingSeconds = Math.floor((endMs - now) / 1000);
	// The server applies completed queues automatically the next time the
	// nexus is touched (and the client polls every few seconds), so there is
	// no "ready to apply" state to surface - the upgrade is on its way in.
	if (remainingSeconds <= 0) return { label: 'Finishing…', isWaiting: false };
	return { label: formatDurationSeconds(remainingSeconds), isWaiting: false };
}

interface QueueCountdownProps {
	endAt: string | number | Date;
	/** completesAt of the previous entry in the same queue chain, if any. */
	prevEndAt?: string | number | Date;
	/** Optional render override to wrap label+state in custom markup. */
	children?: (result: QueueCountdownResult) => React.ReactNode;
	/** Class applied when `children` is omitted. */
	waitingClassName?: string;
	runningClassName?: string;
}

/**
 * Leaf countdown for build/training queue items. Subscribes only itself to the shared clock,
 * so the surrounding tab subtree never re-renders just because a queue countdown advanced.
 */
function QueueCountdownInner({
	endAt,
	prevEndAt,
	children,
	waitingClassName = 'queue-time-queued',
	runningClassName = 'queue-time'
}: QueueCountdownProps) {
	const now = useNow();
	const result = computeQueueCountdown(endAt, prevEndAt, now);
	if (children) return <>{children(result)}</>;
	return (
		<span className={result.isWaiting ? waitingClassName : runningClassName}>{result.label}</span>
	);
}

export const QueueCountdown = React.memo(QueueCountdownInner);
