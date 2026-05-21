'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationBadges } from '@/services/api';
import { useGameSocket } from './useGameSocket';

export const NOTIFICATION_BADGES_KEY = ['notificationBadges'] as const;

interface NotificationBadges {
  tokensAvailable: number;
  factionAttention: number;
}

/**
 * Returns flags for the top-nav dots that aren't covered by the existing
 * combat-logs/friends badges: tokens awaiting redemption, and faction actions
 * (invites you've received, treaty proposals directed at a faction you lead).
 */
export function useNotificationBadges() {
  const qc = useQueryClient();

  useGameSocket({
    onBadgeRefresh: () => qc.invalidateQueries({ queryKey: NOTIFICATION_BADGES_KEY }),
  });

  const { data } = useQuery<NotificationBadges>({
    queryKey: NOTIFICATION_BADGES_KEY,
    queryFn: () => getNotificationBadges().then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    hasTokens: (data?.tokensAvailable ?? 0) > 0,
    hasFactionAttention: (data?.factionAttention ?? 0) > 0,
  };
}
