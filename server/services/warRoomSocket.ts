import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { CorsOptions } from 'cors';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { logInfo, logWarn } from '../utils/logger.js';

// ────────────────────────────────────────────────────────────────────────────
// Shared Socket.IO server instance, created once, reused by all namespaces.
// ────────────────────────────────────────────────────────────────────────────

let _io: SocketIOServer | null = null;

function getOrCreateIo(httpServer: HttpServer, opts: { cors: CorsOptions }): SocketIOServer {
  if (_io) return _io;
  _io = new SocketIOServer(httpServer, {
    cors: opts.cors as Record<string, unknown>,
    path: '/ws',
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  return _io;
}

// ────────────────────────────────────────────────────────────────────────────
// /game namespace, per-user and per-faction push events
// ────────────────────────────────────────────────────────────────────────────

export function initGameSocket(httpServer: HttpServer, opts: { cors: CorsOptions }) {
  const io = getOrCreateIo(httpServer, opts);
  const ns = io.of('/game');

  ns.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? '';
      if (!token) return next(new Error('no_token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, activeGalaxyId: true },
      });
      if (!user) return next(new Error('no_user'));

      (socket.data as Record<string, unknown>).userId = user.id;

      // Resolve faction membership so we can join the faction room for chat pushes.
      if (user.activeGalaxyId) {
        const member = await prisma.factionMember.findUnique({
          where: { userId_galaxyId: { userId: user.id, galaxyId: user.activeGalaxyId } },
          select: { factionId: true },
        });
        if (member) (socket.data as Record<string, unknown>).factionId = member.factionId;
      }

      next();
    } catch (err) {
      next(err as Error);
    }
  });

  ns.on('connection', (socket) => {
    const userId = socket.data.userId as number;
    socket.join(`user:${userId}`);

    const factionId = socket.data.factionId as number | undefined;
    if (factionId) socket.join(`faction:${factionId}`);

    logInfo('game_socket_connect', { userId, factionId });
    socket.on('disconnect', () => logInfo('game_socket_disconnect', { userId }));
  });

  return ns;
}

// ── Public push helpers, called by server-side jobs and controllers ──────────

function emitToUser(userId: number, event: string, payload: unknown) {
  if (!_io) return;
  _io.of('/game').to(`user:${userId}`).emit(event, payload);
}

/**
 * Returns true if at least one socket is currently joined to user:{userId}.
 * Used by bulk jobs to skip building per-user payloads for offline users.
 * Returns false in environments where the io instance hasn't been created
 * yet (e.g. some tests), so callers can skip emits safely either way.
 */
export function isUserOnline(userId: number): boolean {
  if (!_io) return false;
  const room = _io.of('/game').adapter.rooms.get(`user:${userId}`);
  return !!room && room.size > 0;
}

function emitToFaction(factionId: number, event: string, payload: unknown) {
  if (!_io) return;
  _io.of('/game').to(`faction:${factionId}`).emit(event, payload);
}

/** Tell affected users to refresh their incoming/outgoing attack lists. */
export function notifyAttackUpdate(attackerUserId: number | null, defenderUserId: number | null, nexusId: number) {
  const payload = { nexusId, at: Date.now() };
  if (attackerUserId) emitToUser(attackerUserId, 'attacks:refresh', payload);
  if (defenderUserId) emitToUser(defenderUserId, 'attacks:refresh', payload);
}

/** Tell a user to refresh their troop transfer list. */
export function notifyTransferUpdate(ownerUserId: number, nexusId: number) {
  emitToUser(ownerUserId, 'transfers:refresh', { nexusId, at: Date.now() });
}

/** Push a new faction chat message to all online faction members. */
export function notifyFactionChat(factionId: number, message: unknown) {
  emitToFaction(factionId, 'faction:chat', { message, at: Date.now() });
}

/** Push a new diplomacy chat message to both faction rooms sharing the treaty. */
export function notifyDiplomacyChat(proposerFactionId: number, targetFactionId: number, treatyId: number, message: unknown) {
  const payload = { treatyId, message, at: Date.now() };
  emitToFaction(proposerFactionId, 'diplomacy:chat', payload);
  emitToFaction(targetFactionId, 'diplomacy:chat', payload);
}

/** Tell a user their badge counts may have changed (friend requests / DMs). */
export function notifyBadgeUpdate(userId: number) {
  emitToUser(userId, 'badges:refresh', { at: Date.now() });
}

/** Tell a user they have a new unread combat report. */
export function notifyReportUpdate(userId: number) {
  emitToUser(userId, 'reports:refresh', { at: Date.now() });
}

/**
 * Push a fresh resource snapshot to the nexus owner so the client can replace
 * its locally-interpolated baseline. Payload mirrors the client ResourceSnapshot
 * shape (see client/src/realtime/store.ts) intentionally: keeping these in sync
 * is enforced by code review, not types, since they live in separate TS projects.
 */
export interface NexusResourceSnapshotPayload {
  nexusId: number;
  base: { biomass: number; alloy: number; ore: number };
  production: { biomass: number; alloy: number; ore: number };
  storageMax: number;
  lastResourceUpdate: Date;
}

export function notifyNexusResources(userId: number, snap: NexusResourceSnapshotPayload) {
  emitToUser(userId, 'nexus:resources', {
    nexusId: String(snap.nexusId),
    base: snap.base,
    production: snap.production,
    storageMax: snap.storageMax,
    lastResourceUpdateMs: snap.lastResourceUpdate.getTime(),
  });
}

/**
 * One-shot completion event used to drive toasts / sounds without polling.
 * Servers can batch multiple completions per emit if many drained at once
 * (e.g. several troop training entries finishing in the same job tick).
 */
export interface NexusQueueCompletionPayload {
  nexusId: number;
  builds: Array<{ building: string; targetLevel: number }>;
  trainings: Array<{ troopType: string; amount: number }>;
}

export function notifyNexusQueueCompleted(userId: number, payload: NexusQueueCompletionPayload) {
  if (payload.builds.length === 0 && payload.trainings.length === 0) return;
  emitToUser(userId, 'nexus:queue:completed', {
    nexusId: String(payload.nexusId),
    builds: payload.builds,
    trainings: payload.trainings,
  });
}

// ── Faction / friends / market refresh signals ────────────────────────────────
// These intentionally carry no payload data. The client treats them as cache-
// invalidation pings: receive event → invalidate the relevant React Query key
// → next render refetches. Keeps the client and server decoupled from each
// other's response shapes, which is what kept turning into the brittle bit.

/** Faction membership / roster / motd / leadership changed. */
export function notifyFactionUpdated(factionId: number) {
  emitToFaction(factionId, 'faction:updated', { factionId, at: Date.now() });
}

/** A specific user has a new pending faction invite (or one was withdrawn). */
export function notifyFactionInviteUpdate(userId: number) {
  emitToUser(userId, 'faction:invites:updated', { at: Date.now() });
}

/** A user's friend list or friend-request inbox changed. */
export function notifyFriendsUpdate(userId: number) {
  emitToUser(userId, 'friends:updated', { at: Date.now() });
}

/** Notify defender that their nexus was conquered. */
export function notifyNexusConquered(userId: number, nexusName: string, attackerName: string) {
  emitToUser(userId, 'nexus:conquered', { nexusName, attackerName, at: Date.now() });
}

/** Market listings changed (new listing, buy, cancel). Broadcast to all sockets in /game. */
export function notifyMarketUpdated() {
  if (!_io) return;
  _io.of('/game').emit('market:updated', { at: Date.now() });
}

// ────────────────────────────────────────────────────────────────────────────
// /warroom namespace, faction war room collaboration (presence, cursors, ops)
// ────────────────────────────────────────────────────────────────────────────

interface PresenceEntry {
  userId: number;
  username: string;
  socketId: string;
  joinedAt: number;
  lastSeen: number;
  cursor?: { x: number; y: number } | null;
  focusOpId?: number | null;
}

const presenceByFaction = new Map<number, Map<string, PresenceEntry>>();

export function initWarRoomSocket(httpServer: HttpServer, opts: { cors: CorsOptions }) {
  const io = getOrCreateIo(httpServer, opts);

  const ns = io.of('/warroom');

  // Auth handshake, clients pass { token } via auth payload
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
  if (!_io) return;
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
  _io.of('/warroom').to(`faction:${factionId}`).emit('presence:update', {
    peers: unique,
    count: unique.length,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Public helpers, called by the REST controller after mutations so all
// connected clients in the faction see the change immediately.
// ────────────────────────────────────────────────────────────────────────────

export function broadcastOperationUpdate(factionId: number, operationId: number, change: string, actorUserId?: number) {
  if (!_io) return;
  _io.of('/warroom').to(`faction:${factionId}`).emit('op:update', {
    operationId,
    change,
    actorUserId: actorUserId ?? null,
    at: Date.now(),
  });
}

export function broadcastOperationDeleted(factionId: number, operationId: number, actorUserId?: number) {
  if (!_io) return;
  _io.of('/warroom').to(`faction:${factionId}`).emit('op:deleted', {
    operationId,
    actorUserId: actorUserId ?? null,
    at: Date.now(),
  });
}

export function broadcastThreadMessage(factionId: number, operationId: number, message: unknown) {
  if (!_io) return;
  _io.of('/warroom').to(`faction:${factionId}`).emit('thread:message', {
    operationId,
    message,
    at: Date.now(),
  });
}
