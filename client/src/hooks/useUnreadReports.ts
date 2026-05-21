'use client';

import { useQueryClient } from '@tanstack/react-query';
import { NOTIFICATION_BADGES_KEY, useUnreadReportsFromBadges } from './useNotificationBadges';

/**
 * Combat-log unread state for nav dots + nexus row indicators.
 *
 * The list of unread-report nexus IDs is bundled into /notifications/badges
 * so this hook does NOT fire its own request. It reads from the cached badge
 * query and offers a refresh() that invalidates the same cache. The
 * `reports:refresh` socket event is wired through useGameSocket and
 * invalidates `notificationBadges`, so live updates still work.
 */
export function useUnreadReports() {
  const qc = useQueryClient();
  const { hasUnreadReports, unreadNexusIds } = useUnreadReportsFromBadges();

  const refresh = () => qc.invalidateQueries({ queryKey: NOTIFICATION_BADGES_KEY });

  return { hasUnreadReports, unreadNexusIds, refresh };
}
