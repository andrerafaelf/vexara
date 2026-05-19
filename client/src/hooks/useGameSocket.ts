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
type BadgeHandler = () => void;
type AttacksRefreshHandler = (nexusId: number) => void;
type TransfersRefreshHandler = (nexusId: number) => void;

interface GameSocketHandlers {
  onFactionChat?: ChatHandler;
  onBadgeRefresh?: BadgeHandler;
  onAttacksRefresh?: AttacksRefreshHandler;
  onTransfersRefresh?: TransfersRefreshHandler;
}

// Module-level singleton so one socket is shared across all hook instances.
let _socket: Socket | null = null;
let _refCount = 0;
const _chatHandlers = new Set<ChatHandler>();
const _badgeHandlers = new Set<BadgeHandler>();
const _attacksHandlers = new Set<AttacksRefreshHandler>();
const _transfersHandlers = new Set<TransfersRefreshHandler>();

function getSocket(): Socket {
  if (_socket) return _socket;

  const apiUrl = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL)
    || 'http://localhost:3001/api';
  const origin = apiUrl.replace(/\/api\/?$/, '');
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';

  const socket = io(`${origin}/game`, {
    path: '/ws',
    transports: ['websocket'],
    auth: { token },
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
  });

  socket.on('faction:chat', (data: { message: FactionChatMessage }) => {
    for (const h of _chatHandlers) h(data.message);
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

function destroySocket() {
  _socket?.disconnect();
  _socket = null;
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

    _refCount++;
    const socket = getSocket();

    const onAttacksRefresh = (data: { nexusId: number }) => {
      const nexusId = String(data.nexusId);
      qc.invalidateQueries({ queryKey: combatKeys.incoming(nexusId) });
      qc.invalidateQueries({ queryKey: combatKeys.outgoing(nexusId) });
    };

    const onTransfersRefresh = (data: { nexusId: number }) => {
      const nexusId = String(data.nexusId);
      qc.invalidateQueries({ queryKey: combatKeys.transfers(nexusId) });
    };

    const onReportsRefresh = () => {
      qc.invalidateQueries({ queryKey: combatKeys.unreadNexusIds() });
      qc.invalidateQueries({ queryKey: ['unreadNexusIds'] });
    };

    const onNexusRefresh = () => {
      qc.invalidateQueries({ queryKey: MY_NEXUSES_KEY });
    };

    socket.on('attacks:refresh', onAttacksRefresh);
    socket.on('transfers:refresh', onTransfersRefresh);
    socket.on('reports:refresh', onReportsRefresh);
    // attacks resolving also changes nexus resources (loot returned)
    socket.on('attacks:refresh', onNexusRefresh);

    const chatHandler: ChatHandler = (msg) => handlersRef.current?.onFactionChat?.(msg);
    const badgeHandler: BadgeHandler = () => handlersRef.current?.onBadgeRefresh?.();
    const attacksHandler: AttacksRefreshHandler = (nexusId) => handlersRef.current?.onAttacksRefresh?.(nexusId);
    const transfersHandler: TransfersRefreshHandler = (nexusId) => handlersRef.current?.onTransfersRefresh?.(nexusId);
    _chatHandlers.add(chatHandler);
    _badgeHandlers.add(badgeHandler);
    _attacksHandlers.add(attacksHandler);
    _transfersHandlers.add(transfersHandler);

    return () => {
      socket.off('attacks:refresh', onAttacksRefresh);
      socket.off('transfers:refresh', onTransfersRefresh);
      socket.off('reports:refresh', onReportsRefresh);
      socket.off('attacks:refresh', onNexusRefresh);
      _chatHandlers.delete(chatHandler);
      _badgeHandlers.delete(badgeHandler);
      _attacksHandlers.delete(attacksHandler);
      _transfersHandlers.delete(transfersHandler);

      _refCount--;
      if (_refCount <= 0) {
        _refCount = 0;
        destroySocket();
      }
    };
  }, [qc]);
}
