'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { combatKeys } from '../features/combat/useCombat';
import { MY_NEXUSES_KEY } from './useMyNexuses';
import { realtimeStore } from '../realtime/store';

export interface FactionChatMessage {
  id: number;
  content: string;
  createdAt: string;
  user: { id: number; username: string };
}

type ChatHandler = (msg: FactionChatMessage) => void;
type DiplomacyChatHandler = (treatyId: number, msg: FactionChatMessage) => void;
type BadgeHandler = () => void;
type AttacksRefreshHandler = (nexusId: number) => void;
type TransfersRefreshHandler = (nexusId: number) => void;
export interface QueueCompletionPayload {
  nexusId: string;
  builds: Array<{ building: string; targetLevel: number }>;
  trainings: Array<{ troopType: string; amount: number }>;
}
type QueueCompletedHandler = (payload: QueueCompletionPayload) => void;

interface GameSocketHandlers {
  onFactionChat?: ChatHandler;
  onDiplomacyChat?: DiplomacyChatHandler;
  onBadgeRefresh?: BadgeHandler;
  onAttacksRefresh?: AttacksRefreshHandler;
  onTransfersRefresh?: TransfersRefreshHandler;
  onQueueCompleted?: QueueCompletedHandler;
}

// Module-level singleton, one socket shared across all hook instances.
let _socket: Socket | null = null;
let _refCount = 0;
let _destroyTimer: ReturnType<typeof setTimeout> | null = null;

const _chatHandlers = new Set<ChatHandler>();
const _diplomacyChatHandlers = new Set<DiplomacyChatHandler>();
const _badgeHandlers = new Set<BadgeHandler>();
const _attacksHandlers = new Set<AttacksRefreshHandler>();
const _transfersHandlers = new Set<TransfersRefreshHandler>();
const _queueCompletedHandlers = new Set<QueueCompletedHandler>();
const _factionUpdateHandlers = new Set<() => void>();
const _factionInvitesHandlers = new Set<() => void>();
const _friendsUpdateHandlers = new Set<() => void>();
const _marketUpdateHandlers = new Set<() => void>();

// ── Connection-state pub-sub ─────────────────────────────────────────────────
// Exposed via useGameConnectionStatus() so a banner / dot in the layout can
// reflect socket health. 'connected' is the happy path, 'reconnecting' is the
// transient (most user-visible) state, 'disconnected' is the give-up state
// (after socket.io's reconnectionAttempts is exhausted). 'idle' is pre-connect
// - never shown to the user but lets the first render avoid a misleading flash.

export type GameConnectionStatus = 'idle' | 'connected' | 'reconnecting' | 'disconnected';

let _connectionStatus: GameConnectionStatus = 'idle';
const _statusListeners = new Set<() => void>();

function setConnectionStatus(next: GameConnectionStatus) {
  if (_connectionStatus === next) return;
  _connectionStatus = next;
  for (const l of _statusListeners) l();
}

function subscribeConnectionStatus(listener: () => void): () => void {
  _statusListeners.add(listener);
  return () => { _statusListeners.delete(listener); };
}

// SSR + first-render snapshot: 'idle' so the banner never flashes before the
// socket has had a chance to connect. Don't return 'connected' here - that
// would lie if the socket is mid-handshake.
const getConnectionStatusSnapshot = () => _connectionStatus;
const getConnectionStatusServerSnapshot = (): GameConnectionStatus => 'idle';

function buildOrigin(): string {
  const apiUrl =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
    'http://localhost:3001/api';
  return apiUrl.replace(/\/api\/?$/, '');
}

function getSocket(): Socket {
  if (_socket) return _socket;

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';

  const socket = io(`${buildOrigin()}/game`, {
    path: '/ws',
    transports: ['websocket'],
    auth: { token },
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
    // Socket.IO will give up after this many attempts, prevents infinite storm.
    reconnectionAttempts: 10,
  });

  // Drive the public connection-status pub-sub from socket.io's lifecycle.
  // 'reconnecting' is the user-visible failure state - set it on disconnect
  // immediately rather than waiting for the first failed reconnection_attempt,
  // so the banner appears within ~1s of a network drop, not 2s+ in.
  socket.on('connect', () => setConnectionStatus('connected'));
  socket.on('disconnect', (reason) => {
    // 'io client disconnect' = we called disconnect() ourselves (component
    // teardown). Don't show a "reconnecting" banner for an intentional close.
    if (reason === 'io client disconnect') {
      setConnectionStatus('idle');
    } else {
      setConnectionStatus('reconnecting');
    }
  });
  socket.io.on('reconnect_failed', () => setConnectionStatus('disconnected'));

  socket.on('faction:chat', (data: { message: FactionChatMessage }) => {
    for (const h of _chatHandlers) h(data.message);
  });

  socket.on('diplomacy:chat', (data: { treatyId: number; message: FactionChatMessage }) => {
    for (const h of _diplomacyChatHandlers) h(data.treatyId, data.message);
  });

  socket.on('badges:refresh', () => {
    for (const h of _badgeHandlers) h();
  });

  socket.on('attacks:refresh', (data: { nexusId: number }) => {
    for (const h of _attacksHandlers) h(data.nexusId);
  });

  socket.on('transfers:refresh', (data: { nexusId: number }) => {
    for (const h of _transfersHandlers) h(data.nexusId);
  });

  // Realtime resource snapshot. Server pushes one of these after any mutation
  // that touched resources (currently: building upgrade). The store update
  // re-anchors local interpolation against the fresh server baseline.
  socket.on('nexus:resources', (data: {
    nexusId: string;
    base: { biomass: number; alloy: number; ore: number };
    production: { biomass: number; alloy: number; ore: number };
    storageMax: number;
    lastResourceUpdateMs: number;
  }) => {
    realtimeStore.set({
      nexusId: data.nexusId,
      base: data.base,
      production: data.production,
      storageMax: data.storageMax,
      // Anchor against the *server* timestamp rather than Date.now(): the server
      // computed `base` as the snapshot at lastResourceUpdate, so interpolating
      // from a client-side "now" would double-count any latency on the way down.
      anchorMs: data.lastResourceUpdateMs,
    });
  });

  // Queue-completion event: server batches all builds/trainings that drained
  // in a single 15s job tick into one emit. Module-scope fan-out, per-hook
  // listeners decide whether to act (toast, refetch, etc.).
  socket.on('nexus:queue:completed', (data: QueueCompletionPayload) => {
    for (const h of _queueCompletedHandlers) h(data);
  });

  // Faction / friends / market refresh signals. No payload data - handlers
  // invalidate the relevant React Query keys and let normal refetch handle it.
  socket.on('faction:updated', () => { for (const h of _factionUpdateHandlers) h(); });
  socket.on('faction:invites:updated', () => { for (const h of _factionInvitesHandlers) h(); });
  socket.on('friends:updated', () => { for (const h of _friendsUpdateHandlers) h(); });
  socket.on('market:updated', () => { for (const h of _marketUpdateHandlers) h(); });

  _socket = socket;
  return socket;
}

function scheduleDestroy() {
  // Defer by 200 ms so that React StrictMode's double-mount (unmount → remount)
  // doesn't tear the socket down between the two mounts.
  _destroyTimer = setTimeout(() => {
    if (_refCount <= 0) {
      _socket?.disconnect();
      _socket = null;
      _refCount = 0;
    }
    _destroyTimer = null;
  }, 200);
}

/**
 * Connects to the /game Socket.IO namespace and:
 * - Invalidates React Query caches on attacks:refresh and transfers:refresh events.
 * - Calls onFactionChat when the server pushes a new faction chat message.
 * - Calls onBadgeRefresh when the server pushes a badge count change.
 * - Invalidates unread-report query on reports:refresh events.
 */
export function useGameSocket(handlers?: GameSocketHandlers) {
  const qc = useQueryClient();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) return;

    // Cancel any pending destroy from a previous unmount.
    if (_destroyTimer !== null) {
      clearTimeout(_destroyTimer);
      _destroyTimer = null;
    }

    _refCount++;
    const socket = getSocket();

    const onAttacksRefresh = (data: { nexusId: number }) => {
      const nexusId = String(data.nexusId);
      qc.invalidateQueries({ queryKey: combatKeys.incoming(nexusId) });
      qc.invalidateQueries({ queryKey: combatKeys.outgoing(nexusId) });
      qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
    };

    const onTransfersRefresh = (data: { nexusId: number }) => {
      const nexusId = String(data.nexusId);
      qc.invalidateQueries({ queryKey: combatKeys.transfers(nexusId) });
    };

    const onReportsRefresh = () => {
      qc.invalidateQueries({ queryKey: combatKeys.unreadNexusIds() });
      qc.invalidateQueries({ queryKey: ['unreadNexusIds'] });
      // The unread-nexus list is now baked into /notifications/badges, so the
      // consolidated query must also refresh when reports change.
      qc.invalidateQueries({ queryKey: ['notificationBadges'] });
    };

    socket.on('attacks:refresh', onAttacksRefresh);
    socket.on('transfers:refresh', onTransfersRefresh);
    socket.on('reports:refresh', onReportsRefresh);

    // Reconnect handler: on the *second and later* connect events for this
    // subscription, refetch the queries that the server may have pushed updates
    // to while the socket was offline. The first connect is the initial one
    // and the component is already fetching - invalidating then would trigger
    // a redundant duplicate request.
    let sawFirstConnect = socket.connected;
    const onReconnect = () => {
      if (!sawFirstConnect) {
        sawFirstConnect = true;
        return;
      }
      qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
      qc.invalidateQueries({ queryKey: ['notificationBadges'] });
    };
    socket.on('connect', onReconnect);

    // PWA / tab resume: when the user opens the installed app after it was
    // backgrounded, the OS may have killed the socket and any events sent
    // while hidden were dropped. Force-reconnect if needed and refetch the
    // queries that drive what the user sees first (nexus list + badges).
    // Mobile Safari kills sockets after ~30s hidden; this is what makes
    // re-opening the PWA feel instant instead of "stale, then snaps".
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
      qc.invalidateQueries({ queryKey: ['notificationBadges'] });
    };
    document.addEventListener('visibilitychange', onResume);

    const chatHandler: ChatHandler = (msg) => handlersRef.current?.onFactionChat?.(msg);
    const diplomacyChatHandler: DiplomacyChatHandler = (treatyId, msg) => handlersRef.current?.onDiplomacyChat?.(treatyId, msg);
    const badgeHandler: BadgeHandler = () => handlersRef.current?.onBadgeRefresh?.();
    const attacksHandler: AttacksRefreshHandler = (nexusId) =>
      handlersRef.current?.onAttacksRefresh?.(nexusId);
    const transfersHandler: TransfersRefreshHandler = (nexusId) =>
      handlersRef.current?.onTransfersRefresh?.(nexusId);
    const queueCompletedHandler: QueueCompletedHandler = (payload) => {
      // Always invalidate the nexus list so the new building level / troop
      // count surfaces immediately; consumers get a chance to show their own
      // toast/sound via the optional onQueueCompleted handler.
      qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
      handlersRef.current?.onQueueCompleted?.(payload);
    };

    // Faction / friends / market handlers invalidate their respective React
    // Query keys. Using the loose top-level key (e.g. ['faction']) is fine
    // because TanStack Query matches by prefix.
    const onFactionUpdate = () => {
      qc.invalidateQueries({ queryKey: ['faction'] });
    };
    const onFactionInvites = () => {
      qc.invalidateQueries({ queryKey: ['faction', 'invites'] });
      qc.invalidateQueries({ queryKey: ['notificationBadges'] });
    };
    const onFriendsUpdate = () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['notificationBadges'] });
    };
    const onMarketUpdate = () => {
      qc.invalidateQueries({ queryKey: ['market'] });
      // Buy/sell move resources between the player's nexuses, so refresh
      // the nexus list too. Cheap (cached, 30s stale) for everyone else.
      qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
    };

    _chatHandlers.add(chatHandler);
    _diplomacyChatHandlers.add(diplomacyChatHandler);
    _badgeHandlers.add(badgeHandler);
    _attacksHandlers.add(attacksHandler);
    _transfersHandlers.add(transfersHandler);
    _queueCompletedHandlers.add(queueCompletedHandler);
    _factionUpdateHandlers.add(onFactionUpdate);
    _factionInvitesHandlers.add(onFactionInvites);
    _friendsUpdateHandlers.add(onFriendsUpdate);
    _marketUpdateHandlers.add(onMarketUpdate);

    return () => {
      socket.off('attacks:refresh', onAttacksRefresh);
      socket.off('transfers:refresh', onTransfersRefresh);
      socket.off('reports:refresh', onReportsRefresh);
      socket.off('connect', onReconnect);
      document.removeEventListener('visibilitychange', onResume);
      _chatHandlers.delete(chatHandler);
      _diplomacyChatHandlers.delete(diplomacyChatHandler);
      _badgeHandlers.delete(badgeHandler);
      _attacksHandlers.delete(attacksHandler);
      _transfersHandlers.delete(transfersHandler);
      _queueCompletedHandlers.delete(queueCompletedHandler);
      _factionUpdateHandlers.delete(onFactionUpdate);
      _factionInvitesHandlers.delete(onFactionInvites);
      _friendsUpdateHandlers.delete(onFriendsUpdate);
      _marketUpdateHandlers.delete(onMarketUpdate);

      _refCount--;
      if (_refCount <= 0) {
        _refCount = 0;
        scheduleDestroy();
      }
    };
  }, [qc]);
}

/**
 * Read the current game-socket connection state. Re-renders on transitions.
 * Calling this hook does *not* open a connection - use useGameSocket() for
 * that. This is for layout-level indicators (banner, status dot) that should
 * reflect the socket health regardless of which page is mounted.
 */
export function useGameConnectionStatus(): GameConnectionStatus {
  return useSyncExternalStore(
    subscribeConnectionStatus,
    getConnectionStatusSnapshot,
    getConnectionStatusServerSnapshot,
  );
}
