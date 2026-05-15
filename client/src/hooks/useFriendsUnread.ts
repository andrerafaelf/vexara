'use client';

import { useQuery } from '@tanstack/react-query';
import { getFriendsBadges } from '@/services/api';

export function useFriendsUnread() {
  const { data } = useQuery({
    queryKey: ['friendsBadges'],
    queryFn: () => getFriendsBadges().then((r) => r.data),
    refetchInterval: 30000,
  });

  const { unreadChat = 0, incomingRequests = 0 } = data || {};
  return unreadChat > 0 || incomingRequests > 0;
}
