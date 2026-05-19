'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFriendsBadges } from '@/services/api';
import { useGameSocket } from './useGameSocket';

export const FRIENDS_BADGES_KEY = ['friendsBadges'] as const;

export function useFriendsUnread() {
  const qc = useQueryClient();

  useGameSocket({
    onBadgeRefresh: () => qc.invalidateQueries({ queryKey: FRIENDS_BADGES_KEY }),
  });

  const { data } = useQuery({
    queryKey: FRIENDS_BADGES_KEY,
    queryFn: () => getFriendsBadges().then((r) => r.data),
    // No refetchInterval — socket push handles freshness.
    staleTime: 60_000,
  });

  const { unreadChat = 0, incomingRequests = 0 } = data || {};
  return unreadChat > 0 || incomingRequests > 0;
}
