'use client';

import { getFriendsBadges } from '@/services/api';
import { useEffect, useState } from 'react';

const POLL_MS = 30000;

export function useFriendsUnread() {
  const [hasUnreadFriends, setHasUnreadFriends] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await getFriendsBadges();
        if (cancelled) return;
        const { unreadChat = 0, incomingRequests = 0 } = res.data || {};
        setHasUnreadFriends(unreadChat > 0 || incomingRequests > 0);
      } catch {
        if (!cancelled) setHasUnreadFriends(false);
      }
    };

    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return hasUnreadFriends;
}
