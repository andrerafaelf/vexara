'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { combatKeys } from '../features/combat/useCombat';
import { MY_NEXUSES_KEY } from './useMyNexuses';

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

interface GameSocketHandlers {
  onFactionChat?: ChatHandler;
  onDiplomacyChat?: DiplomacyChatHandler;
  onBadgeRefresh?: BadgeHandler;
  onAttacksRefresh?: AttacksRefreshHandler;
  onTransfersRefresh?: TransfersRefreshHandler;
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
    };

    socket.on('attacks:refresh', onAttacksRefresh);
    socket.on('transfers:refresh', onTransfersRefresh);
    socket.on('reports:refresh', onReportsRefresh);

    const chatHandler: ChatHandler = (msg) => handlersRef.current?.onFactionChat?.(msg);
    const diplomacyChatHandler: DiplomacyChatHandler = (treatyId, msg) => handlersRef.current?.onDiplomacyChat?.(treatyId, msg);
    const badgeHandler: BadgeHandler = () => handlersRef.current?.onBadgeRefresh?.();
    const attacksHandler: AttacksRefreshHandler = (nexusId) =>
      handlersRef.current?.onAttacksRefresh?.(nexusId);
    const transfersHandler: TransfersRefreshHandler = (nexusId) =>
      handlersRef.current?.onTransfersRefresh?.(nexusId);
    _chatHandlers.add(chatHandler);
    _diplomacyChatHandlers.add(diplomacyChatHandler);
    _badgeHandlers.add(badgeHandler);
    _attacksHandlers.add(attacksHandler);
    _transfersHandlers.add(transfersHandler);

    return () => {
      socket.off('attacks:refresh', onAttacksRefresh);
      socket.off('transfers:refresh', onTransfersRefresh);
      socket.off('reports:refresh', onReportsRefresh);
      _chatHandlers.delete(chatHandler);
      _diplomacyChatHandlers.delete(diplomacyChatHandler);
      _badgeHandlers.delete(badgeHandler);
      _attacksHandlers.delete(attacksHandler);
      _transfersHandlers.delete(transfersHandler);

      _refCount--;
      if (_refCount <= 0) {
        _refCount = 0;
        scheduleDestroy();
      }
    };
  }, [qc]);
}
