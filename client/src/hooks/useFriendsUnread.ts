'use client';

import { getChatUnreadCount, getFriendRequests } from '@/services/api';
import { useEffect, useState } from 'react';

const POLL_MS = 15000;

export function useFriendsUnread() {
  const [hasUnreadFriends, setHasUnreadFriends] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [chatRes, reqRes] = await Promise.allSettled([getChatUnreadCount(), getFriendRequests()]);
        if (cancelled) return;
        const unreadChat = chatRes.status === 'fulfilled' ? chatRes.value.data?.count || 0 : 0;
        const incomingReq = reqRes.status === 'fulfilled' ? reqRes.value.data?.incoming?.length || 0 : 0;
        setHasUnreadFriends(unreadChat > 0 || incomingReq > 0);
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
