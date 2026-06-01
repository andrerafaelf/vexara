'use client';

import { useFriendsUnreadFromBadges } from './useNotificationBadges';

/**
 * Returns true if the allies/friends nav button should show a dot - either
 * unread chat messages or pending incoming friend requests. Reads from the
 * consolidated /notifications/badges query (no separate request).
 */
export function useFriendsUnread() {
	return useFriendsUnreadFromBadges();
}
