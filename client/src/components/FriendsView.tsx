'use client';

import { useAuth } from '@/context/AuthContext';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  getChatMessages,
  getConversations,
  getFriendRequests,
  getFriends,
  markChatRead,
  removeFriend,
  sendChatMessage,
  sendFriendRequest,
} from '@/services/api';
import '@/styles/FriendsView.css';
import { formatDate, formatTimeOfDay } from '@/utils/date';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TabId = 'friends' | 'requests' | 'chat';

interface Friend {
  id: string;
  username: string;
  points: number;
  friendsSince: string;
}

interface FriendRequestItem {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
}

interface Conversation {
  friendId: string;
  username: string;
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

interface FriendsViewProps {
  initialTab?: TabId;
  initialFriendId?: string | null;
}

const POLL_MS = 5000;

const formatTime = formatTimeOfDay;

export default function FriendsView({ initialTab = 'friends', initialFriendId = null }: FriendsViewProps) {
  const { user } = useAuth();
  const myId = user?.id != null ? String(user.id) : '';

  const [tab, setTab] = useState<TabId>(initialTab);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeFriendId, setActiveFriendId] = useState<string | null>(initialFriendId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [requestUsername, setRequestUsername] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const loadFriends = useCallback(async () => {
    try {
      const res = await getFriends();
      setFriends(res.data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load friends';
      setError(message);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await getFriendRequests();
      setIncoming(res.data.incoming);
      setOutgoing(res.data.outgoing);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load requests';
      setError(message);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await getConversations();
      setConversations(res.data);
    } catch {
      // non-critical
    }
  }, []);

  const loadMessages = useCallback(
    async (friendId: string) => {
      try {
        const res = await getChatMessages(friendId);
        setMessages(res.data);
        const latest = res.data.length ? res.data[res.data.length - 1].id : null;
        lastMessageIdRef.current = latest;
        await markChatRead(friendId);
        loadConversations();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load chat';
        setError(message);
      }
    },
    [loadConversations],
  );

  useEffect(() => {
    loadFriends();
    loadRequests();
    loadConversations();
  }, [loadFriends, loadRequests, loadConversations]);

  // Poll requests + conversations across the view
  useEffect(() => {
    const id = setInterval(() => {
      loadRequests();
      loadConversations();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadRequests, loadConversations]);

  // Poll the open conversation for new messages
  useEffect(() => {
    if (!activeFriendId || tab !== 'chat') return;
    const id = setInterval(async () => {
      try {
        const res = await getChatMessages(activeFriendId);
        const incomingMsgs: ChatMessage[] = res.data;
        const latest = incomingMsgs.length ? incomingMsgs[incomingMsgs.length - 1].id : null;
        if (latest !== lastMessageIdRef.current) {
          setMessages(incomingMsgs);
          lastMessageIdRef.current = latest;
          await markChatRead(activeFriendId);
          loadConversations();
        }
      } catch {
        // non-critical
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [activeFriendId, tab, loadConversations]);

  // Auto-scroll on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // If a friend id is provided, switch to chat tab
  useEffect(() => {
    if (initialFriendId) {
      setTab('chat');
      setActiveFriendId(initialFriendId);
    }
  }, [initialFriendId]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const username = requestUsername.trim();
    if (!username) return;
    try {
      const res = await sendFriendRequest(username);
      setRequestUsername('');
      if (res.data?.autoAccepted) {
        setInfo(`You and ${username} are now allies.`);
        await loadFriends();
      } else {
        setInfo(`Alliance request sent to ${username}.`);
      }
      await loadRequests();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send request';
      setError(message);
    }
  };

  const handleAccept = async (id: string) => {
    setError('');
    try {
      await acceptFriendRequest(id);
      await Promise.all([loadFriends(), loadRequests(), loadConversations()]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to accept';
      setError(message);
    }
  };

  const handleDecline = async (id: string) => {
    setError('');
    try {
      await declineFriendRequest(id);
      await loadRequests();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to decline';
      setError(message);
    }
  };

  const handleCancel = async (id: string) => {
    setError('');
    try {
      await cancelFriendRequest(id);
      await loadRequests();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to cancel';
      setError(message);
    }
  };

  const handleUnfriend = async (id: string) => {
    if (!confirm('Remove this ally?')) return;
    setError('');
    try {
      await removeFriend(id);
      await Promise.all([loadFriends(), loadConversations()]);
      if (activeFriendId === id) {
        setActiveFriendId(null);
        setMessages([]);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to remove ally';
      setError(message);
    }
  };

  const handleOpenChat = async (friendId: string) => {
    setActiveFriendId(friendId);
    setTab('chat');
    setMessages([]);
    await loadMessages(friendId);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFriendId) return;
    const content = messageDraft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await sendChatMessage(activeFriendId, content);
      setMessageDraft('');
      setMessages((prev) => [...prev, res.data]);
      lastMessageIdRef.current = res.data.id;
      loadConversations();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send';
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const activeFriend = useMemo(() => {
    if (!activeFriendId) return null;
    return (
      friends.find((f) => f.id === activeFriendId) ||
      conversations.find((c) => c.friendId === activeFriendId) ||
      null
    );
  }, [activeFriendId, friends, conversations]);

  const incomingCount = incoming.length;

  return (
    <div className="friends-view">
      <div className="friends-tabs">
        <button
          className={`friends-tab ${tab === 'friends' ? 'active' : ''}`}
          onClick={() => setTab('friends')}
        >
          🤝 Allies ({friends.length})
        </button>
        <button
          className={`friends-tab ${tab === 'requests' ? 'active' : ''}`}
          onClick={() => setTab('requests')}
        >
          ✉️ Requests
          {incomingCount > 0 && <span className="friends-badge">{incomingCount}</span>}
        </button>
        <button
          className={`friends-tab ${tab === 'chat' ? 'active' : ''}`}
          onClick={() => setTab('chat')}
        >
          💬 Chat
        </button>
      </div>

      {error && <div className="friends-banner error">{error}</div>}
      {info && <div className="friends-banner info">{info}</div>}

      {tab === 'friends' && (
        <div className="friends-panel">
          <form className="friends-add-form" onSubmit={handleSendRequest}>
            <input
              type="text"
              placeholder="Username to add"
              value={requestUsername}
              onChange={(e) => setRequestUsername(e.target.value)}
              maxLength={20}
            />
            <button type="submit" className="friends-btn primary">
              Send Request
            </button>
          </form>

          {friends.length === 0 ? (
            <p className="friends-empty">No allies yet. Send a request to get started.</p>
          ) : (
            <ul className="friends-list">
              {friends.map((f) => (
                <li key={f.id} className="friends-list-item" onClick={() => handleOpenChat(f.id)} style={{ cursor: 'pointer' }}>
                  <div className="friends-list-info">
                    <span className="friends-name">{f.username}</span>
                    <span className="friends-meta">
                      {f.points} pts · since {formatDate(f.friendsSince)}
                    </span>
                  </div>
                  <div className="friends-list-actions">
                    <button className="friends-btn" onClick={(e) => { e.stopPropagation(); handleOpenChat(f.id); }}>
                      💬 Chat
                    </button>
                    <button className="friends-btn danger" onClick={(e) => { e.stopPropagation(); handleUnfriend(f.id); }}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="friends-panel">
          <h3 className="friends-section-title">Incoming ({incoming.length})</h3>
          {incoming.length === 0 ? (
            <p className="friends-empty">No pending requests.</p>
          ) : (
            <ul className="friends-list">
              {incoming.map((r) => (
                <li key={r.id} className="friends-list-item">
                  <div className="friends-list-info">
                    <span className="friends-name">{r.username}</span>
                    <span className="friends-meta">{formatDate(r.createdAt)}</span>
                  </div>
                  <div className="friends-list-actions">
                    <button className="friends-btn primary" onClick={() => handleAccept(r.id)}>
                      Accept
                    </button>
                    <button className="friends-btn" onClick={() => handleDecline(r.id)}>
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="friends-section-title">Sent ({outgoing.length})</h3>
          {outgoing.length === 0 ? (
            <p className="friends-empty">No outgoing requests.</p>
          ) : (
            <ul className="friends-list">
              {outgoing.map((r) => (
                <li key={r.id} className="friends-list-item">
                  <div className="friends-list-info">
                    <span className="friends-name">{r.username}</span>
                    <span className="friends-meta">{formatDate(r.createdAt)}</span>
                  </div>
                  <div className="friends-list-actions">
                    <button className="friends-btn" onClick={() => handleCancel(r.id)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="friends-chat">
          <aside className="friends-chat-sidebar">
            {conversations.length === 0 ? (
              <p className="friends-empty">No conversations yet.</p>
            ) : (
              <ul className="friends-conversation-list">
                {conversations.map((c) => (
                  <li key={c.friendId}>
                    <button
                      className={`friends-conversation-item ${activeFriendId === c.friendId ? 'active' : ''}`}
                      onClick={() => handleOpenChat(c.friendId)}
                    >
                      <span className="friends-conversation-name">
                        {c.username}
                        {c.unreadCount > 0 && <span className="friends-badge">{c.unreadCount}</span>}
                      </span>
                      {c.lastMessage && (
                        <span className="friends-conversation-preview">
                          {c.lastMessage.senderId === myId ? 'You: ' : ''}
                          {c.lastMessage.content.slice(0, 60)}
                          {c.lastMessage.content.length > 60 ? '…' : ''}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="friends-chat-thread">
            {!activeFriend ? (
              <p className="friends-empty">Select an ally to start chatting.</p>
            ) : (
              <>
                <header className="friends-chat-header">
                  <span className="friends-name">{activeFriend.username}</span>
                  <button
                    className="friends-btn danger"
                    onClick={() => activeFriendId && handleUnfriend(activeFriendId)}
                    title="Remove ally"
                  >
                    Remove
                  </button>
                </header>
                <div className="friends-chat-messages">
                  {messages.length === 0 ? (
                    <p className="friends-empty">Say hi 👋</p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === myId;
                      const senderName = mine ? (user?.username ?? 'You') : (activeFriend?.username ?? '');
                      return (
                        <div
                          key={m.id}
                          className={`friends-chat-bubble ${mine ? 'mine' : 'theirs'}`}
                        >
                          <div className="friends-chat-bubble-sender">{senderName}</div>
                          <div className="friends-chat-bubble-content">{m.content}</div>
                          <div className="friends-chat-bubble-time">{formatTime(m.createdAt)}</div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form className="friends-chat-form" onSubmit={handleSendMessage}>
                  <input
                    type="text"
                    placeholder="Type a message"
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    maxLength={2000}
                  />
                  <button type="submit" className="friends-btn primary" disabled={sending}>
                    Send
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
