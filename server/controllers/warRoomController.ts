import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest, TroopCounts } from '../types/index.js';
import { logError } from '../utils/logger.js';
import {
  broadcastOperationDeleted,
  broadcastOperationUpdate,
  broadcastThreadMessage,
} from '../services/warRoomSocket.js';

const NAME_MAX = 64;
const MESSAGE_MAX = 1000;
const MESSAGES_PAGE = 80;
const MAX_WAVES_PER_OP = 20;
const MAX_ACTIVE_OPS_PER_FACTION = 12;

const TROOP_KEYS: ReadonlyArray<keyof TroopCounts> = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative', 'skimmerBike',
  'siegeMech', 'bulwarkGuard', 'suppressorTeam', 'disruptorUnit', 'interceptorBike',
  'annihilatorPlatform', 'voidStalker', 'plasmaTurret', 'overseer',
];

function sanitizeTroopMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, number> = {};
  for (const k of TROOP_KEYS) {
    const raw = (input as Record<string, unknown>)[k];
    const n = typeof raw === 'number' ? Math.floor(raw) : parseInt(String(raw ?? 0), 10);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

interface MembershipContext {
  factionId: number;
  role: 'leader' | 'officer' | 'member';
  galaxyId: number;
}

async function loadMembership(req: AuthRequest): Promise<MembershipContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { activeGalaxyId: true },
  });
  if (!user?.activeGalaxyId) return null;

  const member = await prisma.factionMember.findUnique({
    where: { userId_galaxyId: { userId: req.userId, galaxyId: user.activeGalaxyId } },
    select: { factionId: true, role: true, galaxyId: true },
  });
  if (!member) return null;
  return {
    factionId: member.factionId,
    role: member.role as MembershipContext['role'],
    galaxyId: member.galaxyId,
  };
}

async function loadOperationFull(operationId: number) {
  return prisma.warOperation.findUnique({
    where: { id: operationId },
    include: {
      waves: {
        orderBy: { ordinal: 'asc' },
        include: {
          slots: {
            orderBy: { claimedAt: 'asc' },
          },
        },
      },
      messages: {
        orderBy: { id: 'desc' },
        take: MESSAGES_PAGE,
      },
    },
  });
}

async function serializeOperation(operationId: number) {
  const op = await loadOperationFull(operationId);
  if (!op) return null;
  // Hydrate usernames for slots + messages (a separate small query is cheaper than nested joins for our scale).
  const userIds = new Set<number>();
  userIds.add(op.createdByUserId);
  for (const w of op.waves) for (const s of w.slots) userIds.add(s.userId);
  for (const m of op.messages) userIds.add(m.userId);

  const users = userIds.size === 0
    ? []
    : await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, username: true, isSupporter: true },
      });
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const usernameById = new Map(users.map((u) => [u.id, u.username] as const));

  // Hydrate nexus labels for slots
  const nexusIds = new Set<number>();
  for (const w of op.waves) for (const s of w.slots) nexusIds.add(s.fromNexusId);
  const nexuses = nexusIds.size === 0
    ? []
    : await prisma.nexus.findMany({
        where: { id: { in: Array.from(nexusIds) } },
        select: { id: true, name: true, x: true, y: true },
      });
  const nexusById = new Map(nexuses.map((n) => [n.id, n] as const));

  return {
    id: op.id,
    factionId: op.factionId,
    name: op.name,
    status: op.status,
    targetNexusId: op.targetNexusId,
    targetX: op.targetX,
    targetY: op.targetY,
    targetName: op.targetName,
    arrivalAt: op.arrivalAt.toISOString(),
    rev: op.rev,
    createdByUserId: op.createdByUserId,
    createdByUsername: usernameById.get(op.createdByUserId) ?? '.',
    createdAt: op.createdAt.toISOString(),
    updatedAt: op.updatedAt.toISOString(),
    waves: op.waves.map((w) => ({
      id: w.id,
      ordinal: w.ordinal,
      label: w.label ?? `Wave ${w.ordinal + 1}`,
      arrivalOffsetMs: w.arrivalOffsetMs,
      troops: (w.troops ?? {}) as Record<string, number>,
      slots: w.slots.map((s) => {
        const nx = nexusById.get(s.fromNexusId);
        return {
          id: s.id,
          userId: s.userId,
          username: usernameById.get(s.userId) ?? '.',
          isSupporter: userById.get(s.userId)?.isSupporter ?? false,
          fromNexusId: s.fromNexusId,
          fromNexusName: nx?.name ?? `Nexus #${s.fromNexusId}`,
          fromNexusX: nx?.x ?? null,
          fromNexusY: nx?.y ?? null,
          troops: (s.troops ?? {}) as Record<string, number>,
          note: s.note ?? null,
          sentAttackId: s.sentAttackId ?? null,
          claimedAt: s.claimedAt.toISOString(),
        };
      }),
    })),
    thread: op.messages
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        username: usernameById.get(m.userId) ?? '.',
        isSupporter: userById.get(m.userId)?.isSupporter ?? false,
        content: m.content,
        kind: m.kind,
        createdAt: m.createdAt.toISOString(),
      })),
  };
}

async function serializeOperationSummary(operationId: number) {
  const op = await prisma.warOperation.findUnique({
    where: { id: operationId },
    include: {
      waves: {
        select: {
          id: true,
          ordinal: true,
          troops: true,
          slots: { select: { id: true, userId: true, troops: true } },
        },
      },
    },
  });
  if (!op) return null;
  const contributors = new Set<number>();
  for (const w of op.waves) for (const s of w.slots) contributors.add(s.userId);
  return {
    id: op.id,
    name: op.name,
    status: op.status,
    targetName: op.targetName,
    targetX: op.targetX,
    targetY: op.targetY,
    arrivalAt: op.arrivalAt.toISOString(),
    waveCount: op.waves.length,
    contributorCount: contributors.size,
    rev: op.rev,
    updatedAt: op.updatedAt.toISOString(),
  };
}

function bumpRev(operationId: number) {
  return prisma.warOperation.update({
    where: { id: operationId },
    data: { rev: { increment: 1 } },
    select: { factionId: true },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Endpoints
// ────────────────────────────────────────────────────────────────────────────

export async function listOperations(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    const ops = await prisma.warOperation.findMany({
      where: { factionId: ctx.factionId, status: { in: ['planning', 'locked', 'launched'] } },
      include: {
        waves: { select: { id: true, slots: { select: { userId: true } } } },
      },
      orderBy: { arrivalAt: 'asc' },
    });

    const summaries = ops.map((op) => {
      const contributors = new Set<number>();
      for (const w of op.waves) for (const s of w.slots) contributors.add(s.userId);
      return {
        id: op.id,
        name: op.name,
        status: op.status,
        targetNexusId: op.targetNexusId,
        targetName: op.targetName,
        targetX: op.targetX,
        targetY: op.targetY,
        arrivalAt: op.arrivalAt.toISOString(),
        waveCount: op.waves.length,
        contributorCount: contributors.size,
        rev: op.rev,
        updatedAt: op.updatedAt.toISOString(),
        createdByUserId: op.createdByUserId,
      };
    });

    res.json({ operations: summaries });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getOperation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    const operationId = parseInt(req.params.operationId, 10);
    if (!Number.isFinite(operationId)) {
      res.status(400).json({ error: 'Invalid operation id' });
      return;
    }
    const op = await prisma.warOperation.findUnique({ where: { id: operationId }, select: { factionId: true } });
    if (!op || op.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    const full = await serializeOperation(operationId);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createOperation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    if (ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can open operations' });
      return;
    }
    const body = req.body as {
      name?: string;
      targetNexusId?: number;
      arrivalAt?: string;
    };
    const name = (body?.name ?? '').toString().trim();
    const targetNexusId = Number(body?.targetNexusId);
    const arrivalAt = body?.arrivalAt ? new Date(body.arrivalAt) : null;

    if (!name || name.length > NAME_MAX) {
      res.status(400).json({ error: `Operation name is required (max ${NAME_MAX} chars)` });
      return;
    }
    if (!Number.isFinite(targetNexusId) || targetNexusId <= 0) {
      res.status(400).json({ error: 'Invalid target nexus' });
      return;
    }
    if (!arrivalAt || isNaN(arrivalAt.getTime())) {
      res.status(400).json({ error: 'Invalid arrival time' });
      return;
    }

    const target = await prisma.nexus.findUnique({
      where: { id: targetNexusId },
      select: { id: true, name: true, x: true, y: true, galaxyId: true },
    });
    if (!target || target.galaxyId !== ctx.galaxyId) {
      res.status(404).json({ error: 'Target not found in this galaxy' });
      return;
    }

    const activeCount = await prisma.warOperation.count({
      where: { factionId: ctx.factionId, status: { in: ['planning', 'locked'] } },
    });
    if (activeCount >= MAX_ACTIVE_OPS_PER_FACTION) {
      res.status(409).json({ error: `Limit of ${MAX_ACTIVE_OPS_PER_FACTION} active operations reached` });
      return;
    }

    const op = await prisma.warOperation.create({
      data: {
        factionId: ctx.factionId,
        galaxyId: ctx.galaxyId,
        name,
        targetNexusId: target.id,
        targetX: target.x,
        targetY: target.y,
        targetName: target.name,
        arrivalAt,
        createdByUserId: req.userId,
      },
    });

    broadcastOperationUpdate(ctx.factionId, op.id, 'created', req.userId);
    const full = await serializeOperation(op.id);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateOperation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    if (ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can modify operations' });
      return;
    }
    const operationId = parseInt(req.params.operationId, 10);
    if (!Number.isFinite(operationId)) {
      res.status(400).json({ error: 'Invalid operation id' });
      return;
    }
    const op = await prisma.warOperation.findUnique({ where: { id: operationId } });
    if (!op || op.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    const body = req.body as { name?: string; arrivalAt?: string; status?: string };
    const data: { name?: string; arrivalAt?: Date; status?: 'planning' | 'locked' | 'cancelled' | 'completed' } = {};
    if (typeof body.name === 'string') {
      const n = body.name.trim();
      if (!n || n.length > NAME_MAX) {
        res.status(400).json({ error: `Name length must be 1..${NAME_MAX}` });
        return;
      }
      data.name = n;
    }
    if (typeof body.arrivalAt === 'string') {
      const t = new Date(body.arrivalAt);
      if (isNaN(t.getTime())) {
        res.status(400).json({ error: 'Invalid arrival time' });
        return;
      }
      data.arrivalAt = t;
    }
    if (typeof body.status === 'string') {
      if (!['planning', 'locked', 'cancelled', 'completed'].includes(body.status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      data.status = body.status as typeof data.status;
    }

    await prisma.warOperation.update({
      where: { id: operationId },
      data: { ...data, rev: { increment: 1 } },
    });
    broadcastOperationUpdate(ctx.factionId, operationId, 'updated', req.userId);
    const full = await serializeOperation(operationId);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteOperation(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    if (ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can delete operations' });
      return;
    }
    const operationId = parseInt(req.params.operationId, 10);
    if (!Number.isFinite(operationId)) {
      res.status(400).json({ error: 'Invalid operation id' });
      return;
    }
    const op = await prisma.warOperation.findUnique({ where: { id: operationId } });
    if (!op || op.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    await prisma.warOperation.delete({ where: { id: operationId } });
    broadcastOperationDeleted(ctx.factionId, operationId, req.userId);
    res.json({ ok: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function addWave(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    if (ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can add waves' });
      return;
    }
    const operationId = parseInt(req.params.operationId, 10);
    if (!Number.isFinite(operationId)) {
      res.status(400).json({ error: 'Invalid operation id' });
      return;
    }
    const op = await prisma.warOperation.findUnique({
      where: { id: operationId },
      include: { waves: { select: { ordinal: true } } },
    });
    if (!op || op.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    if (op.waves.length >= MAX_WAVES_PER_OP) {
      res.status(409).json({ error: `Max ${MAX_WAVES_PER_OP} waves per operation` });
      return;
    }
    const body = req.body as { label?: string; arrivalOffsetMs?: number; troops?: unknown };
    const ordinal = op.waves.length;
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 48) : null;
    const offset = Number.isFinite(Number(body.arrivalOffsetMs)) ? Math.floor(Number(body.arrivalOffsetMs)) : 0;
    const troops = sanitizeTroopMap(body.troops);

    await prisma.warOperationWave.create({
      data: { operationId, ordinal, label, arrivalOffsetMs: offset, troops },
    });
    await bumpRev(operationId);
    broadcastOperationUpdate(ctx.factionId, operationId, 'wave_added', req.userId);
    const full = await serializeOperation(operationId);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateWave(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    if (ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can modify waves' });
      return;
    }
    const waveId = parseInt(req.params.waveId, 10);
    if (!Number.isFinite(waveId)) {
      res.status(400).json({ error: 'Invalid wave id' });
      return;
    }
    const wave = await prisma.warOperationWave.findUnique({
      where: { id: waveId },
      include: { operation: { select: { id: true, factionId: true } } },
    });
    if (!wave || wave.operation.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Wave not found' });
      return;
    }
    const body = req.body as { label?: string; arrivalOffsetMs?: number; troops?: unknown };
    const data: { label?: string | null; arrivalOffsetMs?: number; troops?: Record<string, number> } = {};
    if (typeof body.label === 'string') data.label = body.label.trim().slice(0, 48) || null;
    if (Number.isFinite(Number(body.arrivalOffsetMs))) data.arrivalOffsetMs = Math.floor(Number(body.arrivalOffsetMs));
    if (body.troops !== undefined) data.troops = sanitizeTroopMap(body.troops);

    await prisma.warOperationWave.update({ where: { id: waveId }, data });
    await bumpRev(wave.operation.id);
    broadcastOperationUpdate(ctx.factionId, wave.operation.id, 'wave_updated', req.userId);
    const full = await serializeOperation(wave.operation.id);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteWave(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    if (ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'Only leaders and officers can delete waves' });
      return;
    }
    const waveId = parseInt(req.params.waveId, 10);
    if (!Number.isFinite(waveId)) {
      res.status(400).json({ error: 'Invalid wave id' });
      return;
    }
    const wave = await prisma.warOperationWave.findUnique({
      where: { id: waveId },
      include: { operation: { select: { id: true, factionId: true } } },
    });
    if (!wave || wave.operation.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Wave not found' });
      return;
    }
    const operationId = wave.operation.id;
    await prisma.warOperationWave.delete({ where: { id: waveId } });
    // Re-pack ordinals so the UI ordering stays clean.
    const remaining = await prisma.warOperationWave.findMany({
      where: { operationId },
      orderBy: { ordinal: 'asc' },
      select: { id: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.warOperationWave.update({ where: { id: remaining[i].id }, data: { ordinal: i } });
    }
    await bumpRev(operationId);
    broadcastOperationUpdate(ctx.factionId, operationId, 'wave_deleted', req.userId);
    const full = await serializeOperation(operationId);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function claimSlot(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    const waveId = parseInt(req.params.waveId, 10);
    if (!Number.isFinite(waveId)) {
      res.status(400).json({ error: 'Invalid wave id' });
      return;
    }
    const wave = await prisma.warOperationWave.findUnique({
      where: { id: waveId },
      include: { operation: { select: { id: true, factionId: true, status: true } } },
    });
    if (!wave || wave.operation.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Wave not found' });
      return;
    }
    if (wave.operation.status !== 'planning' && wave.operation.status !== 'locked') {
      res.status(409).json({ error: 'Operation is no longer accepting claims' });
      return;
    }
    const body = req.body as { fromNexusId?: number; troops?: unknown; note?: string };
    const fromNexusId = Number(body?.fromNexusId);
    if (!Number.isFinite(fromNexusId) || fromNexusId <= 0) {
      res.status(400).json({ error: 'Invalid source nexus' });
      return;
    }
    const nexus = await prisma.nexus.findUnique({
      where: { id: fromNexusId },
      select: { id: true, ownerId: true, galaxyId: true },
    });
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== ctx.galaxyId) {
      res.status(403).json({ error: 'You do not own that nexus' });
      return;
    }
    const troops = sanitizeTroopMap(body?.troops);
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 128) : null;

    const slot = await prisma.warOperationSlot.upsert({
      where: { waveId_userId_fromNexusId: { waveId, userId: req.userId, fromNexusId } },
      create: {
        waveId,
        userId: req.userId,
        fromNexusId,
        troops,
        note,
      },
      update: {
        troops,
        note,
      },
    });
    await bumpRev(wave.operation.id);
    broadcastOperationUpdate(ctx.factionId, wave.operation.id, 'slot_claimed', req.userId);
    const full = await serializeOperation(wave.operation.id);
    res.json({ operation: full, slotId: slot.id });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function releaseSlot(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    const slotId = parseInt(req.params.slotId, 10);
    if (!Number.isFinite(slotId)) {
      res.status(400).json({ error: 'Invalid slot id' });
      return;
    }
    const slot = await prisma.warOperationSlot.findUnique({
      where: { id: slotId },
      include: { wave: { select: { operationId: true, operation: { select: { factionId: true } } } } },
    });
    if (!slot || slot.wave.operation.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Slot not found' });
      return;
    }
    if (slot.userId !== req.userId && ctx.role !== 'leader' && ctx.role !== 'officer') {
      res.status(403).json({ error: 'You can only release your own slot' });
      return;
    }
    await prisma.warOperationSlot.delete({ where: { id: slotId } });
    await bumpRev(slot.wave.operationId);
    broadcastOperationUpdate(ctx.factionId, slot.wave.operationId, 'slot_released', req.userId);
    const full = await serializeOperation(slot.wave.operationId);
    res.json({ operation: full });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postThreadMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    const operationId = parseInt(req.params.operationId, 10);
    if (!Number.isFinite(operationId)) {
      res.status(400).json({ error: 'Invalid operation id' });
      return;
    }
    const op = await prisma.warOperation.findUnique({ where: { id: operationId }, select: { factionId: true } });
    if (!op || op.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    const body = req.body as { content?: string };
    const content = (body?.content ?? '').toString().trim();
    if (!content) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }
    if (content.length > MESSAGE_MAX) {
      res.status(400).json({ error: `Message must be ${MESSAGE_MAX} characters or less` });
      return;
    }
    const msg = await prisma.warOperationMessage.create({
      data: { operationId, userId: req.userId, content, kind: 'chat' },
    });
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, isSupporter: true } });
    const out = {
      id: msg.id,
      userId: msg.userId,
      username: user?.username ?? '.',
      isSupporter: user?.isSupporter ?? false,
      content: msg.content,
      kind: msg.kind,
      createdAt: msg.createdAt.toISOString(),
    };
    broadcastThreadMessage(ctx.factionId, operationId, out);
    res.json({ message: out });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getThread(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }
    const operationId = parseInt(req.params.operationId, 10);
    if (!Number.isFinite(operationId)) {
      res.status(400).json({ error: 'Invalid operation id' });
      return;
    }
    const op = await prisma.warOperation.findUnique({ where: { id: operationId }, select: { factionId: true } });
    if (!op || op.factionId !== ctx.factionId) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }
    const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
    const messages = await prisma.warOperationMessage.findMany({
      where: { operationId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: MESSAGES_PAGE,
    });
    const userIds = Array.from(new Set(messages.map((m) => m.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, isSupporter: true },
    });
    const userById2 = new Map(users.map((u) => [u.id, u] as const));
    res.json({
      messages: messages.reverse().map((m) => ({
        id: m.id,
        userId: m.userId,
        username: userById2.get(m.userId)?.username ?? '.',
        isSupporter: userById2.get(m.userId)?.isSupporter ?? false,
        content: m.content,
        kind: m.kind,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Galaxy starfield, every nexus, classified by relationship to the caller's faction.
// Used by the "Open Operation" target picker so officers can click rather than type coords.
export async function getGalaxyStarfield(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await loadMembership(req);
    if (!ctx) {
      res.status(403).json({ error: 'You are not in a faction' });
      return;
    }

    const [nexuses, factionMembers, activeWars] = await Promise.all([
      prisma.nexus.findMany({
        where: { galaxyId: ctx.galaxyId },
        select: { id: true, name: true, x: true, y: true, points: true, ownerId: true },
      }),
      prisma.factionMember.findMany({
        where: { galaxyId: ctx.galaxyId },
        select: { userId: true, factionId: true },
      }),
      prisma.factionWar.findMany({
        where: {
          galaxyId: ctx.galaxyId,
          status: 'active',
          OR: [{ declarerFactionId: ctx.factionId }, { targetFactionId: ctx.factionId }],
        },
        select: { declarerFactionId: true, targetFactionId: true },
      }),
    ]);

    const factionByUserId = new Map(factionMembers.map((m) => [m.userId, m.factionId] as const));
    const enemyFactionIds = new Set<number>();
    for (const w of activeWars) {
      enemyFactionIds.add(w.declarerFactionId === ctx.factionId ? w.targetFactionId : w.declarerFactionId);
    }

    const ownerIds = Array.from(new Set(nexuses.map((n) => n.ownerId).filter((v): v is number => v != null)));
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, username: true, isSupporter: true } })
      : [];
    const ownerById = new Map(owners.map((u) => [u.id, u] as const));
    const usernameById = new Map(owners.map((u) => [u.id, u.username] as const));

    const items = nexuses.map((n) => {
      let rel: 'mine' | 'faction' | 'enemy' | 'neutral' | 'unowned' = 'neutral';
      if (n.ownerId == null) rel = 'unowned';
      else if (n.ownerId === req.userId) rel = 'mine';
      else {
        const fid = factionByUserId.get(n.ownerId);
        if (fid === ctx.factionId) rel = 'faction';
        else if (fid != null && enemyFactionIds.has(fid)) rel = 'enemy';
        else rel = 'neutral';
      }
      return {
        id: n.id,
        name: n.name,
        x: n.x,
        y: n.y,
        points: n.points,
        ownerId: n.ownerId,
        ownerName: n.ownerId != null ? (usernameById.get(n.ownerId) ?? null) : null,
        ownerIsSupporter: n.ownerId != null ? (ownerById.get(n.ownerId)?.isSupporter ?? false) : false,
        relationship: rel,
      };
    });

    res.json({ nexuses: items });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'warRoomController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export { serializeOperationSummary };
