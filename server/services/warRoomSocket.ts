import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { CorsOptions } from 'cors';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { logInfo, logWarn } from '../utils/logger.js';

interface PresenceEntry {
  userId: number;
  username: string;
  socketId: string;
  joinedAt: number;
  lastSeen: number;
  cursor?: { x: number; y: number } | null;
  focusOpId?: number | null;
}

// Faction id -> map of socketId -> presence
const presenceByFaction = new Map<number, Map<string, PresenceEntry>>();

let ioRef: SocketIOServer | null = null;

export function initWarRoomSocket(httpServer: HttpServer, opts: { cors: CorsOptions }) {
  const io = new SocketIOServer(httpServer, {
    cors: opts.cors as Record<string, unknown>,
    path: '/ws',
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  ioRef = io;

  const ns = io.of('/warroom');

  // Auth handshake — clients pass { token } via auth payload
  ns.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? '';
      if (!token) return next(new Error('no_token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          activeGalaxyId: true,
        },
      });
      if (!user || !user.activeGalaxyId) return next(new Error('no_galaxy'));

      const member = await prisma.factionMember.findUnique({
        where: { userId_galaxyId: { userId: user.id, galaxyId: user.activeGalaxyId } },
        select: { factionId: true, role: true },
      });
      if (!member) return next(new Error('no_faction'));

      (socket.data as Record<string, unknown>).userId = user.id;
      (socket.data as Record<string, unknown>).username = user.username;
      (socket.data as Record<string, unknown>).factionId = member.factionId;
      (socket.data as Record<string, unknown>).role = member.role;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  ns.on('connection', (socket) => {
    const factionId = socket.data.factionId as number;
    const userId = socket.data.userId as number;
    const username = socket.data.username as string;

    const room = `faction:${factionId}`;
    socket.join(room);

    const entry: PresenceEntry = {
      userId,
      username,
      socketId: socket.id,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      cursor: null,
      focusOpId: null,
    };
    let bucket = presenceByFaction.get(factionId);
    if (!bucket) {
      bucket = new Map();
      presenceByFaction.set(factionId, bucket);
    }
    bucket.set(socket.id, entry);

    emitPresence(factionId);

    socket.emit('warroom:hello', { ok: true, factionId, userId });

    socket.on('presence:focus', (payload: { operationId: number | null }) => {
      const e = bucket!.get(socket.id);
      if (!e) return;
      e.focusOpId = payload?.operationId ?? null;
      e.lastSeen = Date.now();
      emitPresence(factionId);
    });

    socket.on('presence:cursor', (payload: { x: number; y: number; operationId: number | null }) => {
      const e = bucket!.get(socket.id);
      if (!e) return;
      e.cursor = { x: Math.round(payload?.x ?? 0), y: Math.round(payload?.y ?? 0) };
      e.focusOpId = payload?.operationId ?? e.focusOpId ?? null;
      e.lastSeen = Date.now();
      // Cursor moves are broadcast to room peers, not via the presence list (volume).
      socket.to(room).volatile.emit('peer:cursor', {
        userId,
        username,
        operationId: e.focusOpId,
        x: e.cursor.x,
        y: e.cursor.y,
      });
    });

    socket.on('typing:thread', (payload: { operationId: number; typing: boolean }) => {
      socket.to(room).volatile.emit('peer:typing', {
        userId,
        username,
        operationId: payload?.operationId,
        typing: !!payload?.typing,
      });
    });

    socket.on('disconnect', () => {
      const b = presenceByFaction.get(factionId);
      if (b) {
        b.delete(socket.id);
        if (b.size === 0) presenceByFaction.delete(factionId);
      }
      emitPresence(factionId);
      logInfo('warroom_socket_disconnect', { userId, factionId });
    });

    logInfo('warroom_socket_connect', { userId, factionId });
  });

  // Reaping: clear stale presence entries every 60s.
  setInterval(() => {
    const now = Date.now();
    for (const [factionId, bucket] of presenceByFaction) {
      let changed = false;
      for (const [sid, e] of bucket) {
        if (now - e.lastSeen > 90_000 && !ns.sockets.has(sid)) {
          bucket.delete(sid);
          changed = true;
        }
      }
      if (bucket.size === 0) presenceByFaction.delete(factionId);
      else if (changed) emitPresence(factionId);
    }
  }, 60_000).unref();

  ns.on('error', (err) => logWarn('warroom_namespace_error', { message: (err as Error).message }));

  return ns;
}

function emitPresence(factionId: number) {
  if (!ioRef) return;
  const bucket = presenceByFaction.get(factionId);
  const peers = bucket
    ? Array.from(bucket.values()).map((e) => ({
        userId: e.userId,
        username: e.username,
        joinedAt: e.joinedAt,
        focusOpId: e.focusOpId ?? null,
      }))
    : [];
  // Deduplicate by userId (one user may have multiple tabs)
  const seen = new Set<number>();
  const unique = peers.filter((p) => {
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });
  ioRef.of('/warroom').to(`faction:${factionId}`).emit('presence:update', {
    peers: unique,
    count: unique.length,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Public helpers — called by the REST controller after mutations so all
// connected clients in the faction see the change immediately.
// ────────────────────────────────────────────────────────────────────────────

export function broadcastOperationUpdate(factionId: number, operationId: number, change: string, actorUserId?: number) {
  if (!ioRef) return;
  ioRef.of('/warroom').to(`faction:${factionId}`).emit('op:update', {
    operationId,
    change,
    actorUserId: actorUserId ?? null,
    at: Date.now(),
  });
}

export function broadcastOperationDeleted(factionId: number, operationId: number, actorUserId?: number) {
  if (!ioRef) return;
  ioRef.of('/warroom').to(`faction:${factionId}`).emit('op:deleted', {
    operationId,
    actorUserId: actorUserId ?? null,
    at: Date.now(),
  });
}

export function broadcastThreadMessage(factionId: number, operationId: number, message: unknown) {
  if (!ioRef) return;
  ioRef.of('/warroom').to(`faction:${factionId}`).emit('thread:message', {
    operationId,
    message,
    at: Date.now(),
  });
}
