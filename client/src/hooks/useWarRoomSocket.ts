'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface Peer {
  userId: number;
  username: string;
  joinedAt: number;
  focusOpId: number | null;
}

export interface PeerCursor {
  userId: number;
  username: string;
  operationId: number | null;
  x: number;
  y: number;
  updatedAt: number;
}

export interface PeerTyping {
  userId: number;
  username: string;
  operationId: number;
  until: number;
}

export type WarRoomEvent =
  | { type: 'op:update'; operationId: number; change: string; actorUserId: number | null; at: number }
  | { type: 'op:deleted'; operationId: number; actorUserId: number | null; at: number }
  | { type: 'thread:message'; operationId: number; message: unknown; at: number };

interface UseWarRoomSocketResult {
  connected: boolean;
  peers: Peer[];
  peerCursors: Map<number, PeerCursor>;
  peerTyping: PeerTyping[];
  setFocus: (operationId: number | null) => void;
  sendCursor: (x: number, y: number, operationId: number | null) => void;
  setTyping: (operationId: number, typing: boolean) => void;
  subscribe: (handler: (e: WarRoomEvent) => void) => () => void;
}

const TYPING_TTL_MS = 4000;
const CURSOR_TTL_MS = 5000;

export function useWarRoomSocket(enabled: boolean): UseWarRoomSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(new Set<(e: WarRoomEvent) => void>());
  const cursorThrottleRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peerCursors, setPeerCursors] = useState<Map<number, PeerCursor>>(new Map());
  const [peerTyping, setPeerTyping] = useState<PeerTyping[]>([]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const origin = apiUrl.replace(/\/api\/?$/, '');

    const socket = io(`${origin}/warroom`, {
      path: '/ws',
      transports: ['websocket'],
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('presence:update', (data: { peers: Peer[]; count: number }) => {
      setPeers(data?.peers ?? []);
    });

    socket.on('peer:cursor', (data: { userId: number; username: string; operationId: number | null; x: number; y: number }) => {
      setPeerCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, { ...data, updatedAt: Date.now() });
        return next;
      });
    });

    socket.on('peer:typing', (data: { userId: number; username: string; operationId: number; typing: boolean }) => {
      setPeerTyping((prev) => {
        const filtered = prev.filter((p) => !(p.userId === data.userId && p.operationId === data.operationId));
        if (!data.typing) return filtered;
        return [...filtered, { ...data, until: Date.now() + TYPING_TTL_MS }];
      });
    });

    socket.on('op:update', (payload: { operationId: number; change: string; actorUserId: number | null; at: number }) => {
      for (const h of handlersRef.current) h({ type: 'op:update', ...payload });
    });
    socket.on('op:deleted', (payload: { operationId: number; actorUserId: number | null; at: number }) => {
      for (const h of handlersRef.current) h({ type: 'op:deleted', ...payload });
    });
    socket.on('thread:message', (payload: { operationId: number; message: unknown; at: number }) => {
      for (const h of handlersRef.current) h({ type: 'thread:message', ...payload });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setPeers([]);
      setPeerCursors(new Map());
      setPeerTyping([]);
    };
  }, [enabled]);

  // Garbage-collect stale cursors + typing indicators
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setPeerCursors((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [k, v] of prev) {
          if (now - v.updatedAt > CURSOR_TTL_MS) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setPeerTyping((prev) => {
        const fresh = prev.filter((p) => p.until > now);
        return fresh.length === prev.length ? prev : fresh;
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const setFocus = useCallback((operationId: number | null) => {
    socketRef.current?.emit('presence:focus', { operationId });
  }, []);

  const sendCursor = useCallback((x: number, y: number, operationId: number | null) => {
    const now = Date.now();
    if (now - cursorThrottleRef.current < 50) return;
    cursorThrottleRef.current = now;
    socketRef.current?.emit('presence:cursor', { x, y, operationId });
  }, []);

  const setTyping = useCallback((operationId: number, typing: boolean) => {
    socketRef.current?.emit('typing:thread', { operationId, typing });
  }, []);

  const subscribe = useCallback((handler: (e: WarRoomEvent) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { connected, peers, peerCursors, peerTyping, setFocus, sendCursor, setTyping, subscribe };
}
