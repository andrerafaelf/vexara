'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationBadges } from '@/services/api';
import { useGameSocket } from './useGameSocket';

export const NOTIFICATION_BADGES_KEY = ['notificationBadges'] as const;

export interface NotificationBadges {
	tokensAvailable: number;
	factionAttention: number;
	factionInvites: number;
	factionUnreadChat: number;
	factionPendingTreaties: number;
	factionUnseenWars: number;
	factionPendingJoinRequests: number;
	friendsIncomingRequests: number;
	friendsUnreadChat: number;
	unreadReportNexusIds: string[];
}

const EMPTY_BADGES: NotificationBadges = {
	tokensAvailable: 0,
	factionAttention: 0,
	factionInvites: 0,
	factionUnreadChat: 0,
	factionPendingTreaties: 0,
	factionUnseenWars: 0,
	factionPendingJoinRequests: 0,
	friendsIncomingRequests: 0,
	friendsUnreadChat: 0,
	unreadReportNexusIds: []
};

/**
 * Single source of truth for top-nav badges. One request per page navigation
 * covers tokens, faction action items, friends, and combat reports - instead
 * of fanning out into three separate /badges endpoints that all compete for
 * the per-user API rate-limit budget.
 */
export function useBadgesQuery() {
	const qc = useQueryClient();

	useGameSocket({
		onBadgeRefresh: () => qc.invalidateQueries({ queryKey: NOTIFICATION_BADGES_KEY })
	});

	const query = useQuery<NotificationBadges>({
		queryKey: NOTIFICATION_BADGES_KEY,
		queryFn: () => getNotificationBadges().then((r) => r.data),
		staleTime: 60_000
	});

	return query.data ?? EMPTY_BADGES;
}

/** Backwards-compatible flags for the Profile + Factions nav dots. */
export function useNotificationBadges() {
	const data = useBadgesQuery();
	return {
		hasTokens: data.tokensAvailable > 0,
		hasFactionAttention: data.factionAttention > 0
	};
}

/** Derived view used by NexusSidebar/MobileNexusDrawer for combat-log dots. */
export function useUnreadReportsFromBadges() {
	const data = useBadgesQuery();
	const unreadNexusIds = useMemo(
		() => new Set(data.unreadReportNexusIds),
		[data.unreadReportNexusIds]
	);
	return {
		hasUnreadReports: data.unreadReportNexusIds.length > 0,
		unreadNexusIds
	};
}

/** Derived view for the friends/allies nav dot. */
export function useFriendsUnreadFromBadges() {
	const data = useBadgesQuery();
	return data.friendsUnreadChat > 0 || data.friendsIncomingRequests > 0;
}
