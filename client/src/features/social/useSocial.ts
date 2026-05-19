import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getFriends,
  getFriendsBadges,
  getConversations,
  getChatMessages,
  getChatUnreadCount,
  getUserStats,
  getStatsTimeline,
  markChatRead,
  removeFriend,
  sendChatMessage,
  sendFriendRequest,
} from '../../services/api';

export const socialKeys = {
  friends: () => ['friends'] as const,
  friendBadges: () => ['friends', 'badges'] as const,
  friendRequests: () => ['friends', 'requests'] as const,
  conversations: () => ['chat', 'conversations'] as const,
  chatUnread: () => ['chat', 'unread'] as const,
  messages: (friendId: string) => ['chat', friendId, 'messages'] as const,
  stats: () => ['stats', 'me'] as const,
  timeline: (days: number) => ['stats', 'timeline', days] as const,
};

export function useFriends() {
  return useQuery({
    queryKey: socialKeys.friends(),
    queryFn: () => getFriends().then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useFriendBadges() {
  return useQuery({
    queryKey: socialKeys.friendBadges(),
    queryFn: () => getFriendsBadges().then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: socialKeys.friendRequests(),
    queryFn: () => getFriendRequests().then((r) => r.data),
    staleTime: 30_000,
  });
}

const stopOn429 = (query: { state: { error: unknown } }) =>
  (query.state.error as any)?.response?.status === 429 ? false : undefined;

export function useConversations() {
  return useQuery({
    queryKey: socialKeys.conversations(),
    queryFn: () => getConversations().then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: (query) => stopOn429(query) ?? 30_000,
  });
}

export function useChatUnread() {
  return useQuery({
    queryKey: socialKeys.chatUnread(),
    queryFn: () => getChatUnreadCount().then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: (query) => stopOn429(query) ?? 30_000,
  });
}

export function useChatMessages(friendId: string) {
  return useQuery({
    queryKey: socialKeys.messages(friendId),
    queryFn: () => getChatMessages(friendId).then((r) => r.data),
    staleTime: 10_000,
    refetchInterval: (query) => stopOn429(query) ?? 15_000,
    enabled: !!friendId,
  });
}

export function useUserStats() {
  return useQuery({
    queryKey: socialKeys.stats(),
    queryFn: () => getUserStats().then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useStatsTimeline(days: number) {
  return useQuery({
    queryKey: socialKeys.timeline(days),
    queryFn: () => getStatsTimeline(days).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useSendFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => sendFriendRequest(username),
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.friendRequests() }),
  });
}

export function useAcceptFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => acceptFriendRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: socialKeys.friends() });
      qc.invalidateQueries({ queryKey: socialKeys.friendRequests() });
    },
  });
}

export function useDeclineFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => declineFriendRequest(requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.friendRequests() }),
  });
}

export function useCancelFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelFriendRequest(requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.friendRequests() }),
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (friendId: string) => removeFriend(friendId),
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.friends() }),
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ friendId, content }: { friendId: string; content: string }) =>
      sendChatMessage(friendId, content),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: socialKeys.messages(vars.friendId) }),
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (friendId: string) => markChatRead(friendId),
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.chatUnread() }),
  });
}
