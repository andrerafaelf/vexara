import type { Response } from 'express';
import { serializeAttack } from '../models/Nexus.js';
import prisma from '../lib/prisma.js';
import * as reportService from '../services/reportService.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';

export async function getReports(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await reportService.getNexusById(nexusId);
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const reports = await reportService.getReportsForNexus(nexusId);
    const enriched = await Promise.all(
      reports.map(async (r) => {
        const [attackerUser, defenderUser] = await Promise.all([
          r.attackerUserId ? reportService.getUserById(r.attackerUserId) : null,
          r.defenderUserId ? reportService.getUserById(r.defenderUserId) : null,
        ]);
        const attackerUsername = attackerUser?.username ?? (r.attackerUserId == null ? 'Rogue AI' : undefined);
        return serializeAttack({ ...r, attackerUsername, attackerIsSupporter: attackerUser?.isSupporter, defenderUsername: defenderUser?.username, defenderIsSupporter: defenderUser?.isSupporter });
      }),
    );
    res.json(enriched);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const attackId = parseInt(req.params.attackId);
    const attack = await reportService.getAttackById(attackId);
    if (!attack) { res.status(404).json({ error: 'Report not found' }); return; }
    if (attack.galaxyId !== req.galaxyId) { res.status(403).json({ error: 'Report is in a different galaxy' }); return; }
    const nexuses = await reportService.getOwnedNexusIds(req.userId, req.galaxyId);
    const ownedIds = new Set(nexuses.map((n) => n.id));
    if (!ownedIds.has(attack.attackerNexusId) && !ownedIds.has(attack.defenderNexusId)) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    await reportService.upsertReportRead(req.userId, attackId, req.galaxyId);
    res.json({ success: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function markAllRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parseInt(req.params.nexusId);
    const nexus = await reportService.getNexusById(nexusId);
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const attacks = await reportService.getCompletedAttacksForNexus(nexusId, req.galaxyId);
    if (attacks.length === 0) { res.json({ success: true, count: 0 }); return; }
    await reportService.markAllRead(req.userId, attacks, req.galaxyId);
    res.json({ success: true, count: attacks.length, ids: attacks.map((a) => String(a.id)) });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getUnreadNexusIds(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusIds = await reportService.getUnreadNexusIds(req.userId, req.galaxyId);
    res.json(nexusIds);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getReadIds(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = req.params.nexusId ? parseInt(req.params.nexusId) : null;
    if (nexusId !== null) {
      const nexus = await reportService.getNexusById(nexusId);
      if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
        res.status(403).json({ error: 'Not authorized' }); return;
      }
    }
    const reads = await reportService.getReadIds(req.userId, req.galaxyId);
    res.json(reads.map((r) => String(r.attackId)));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getActivitySummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sinceRaw = req.query.since as string | undefined;
    const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (isNaN(since.getTime())) {
      res.status(400).json({ error: 'Invalid since parameter' }); return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { activeGalaxyId: true } });
    if (!user?.activeGalaxyId) { res.json({ attacks: [], buildings: [], troops: [], events: [] }); return; }
    const galaxyId = user.activeGalaxyId;

    const [ownNexuses, completedAttacks] = await Promise.all([
      prisma.nexus.findMany({
        where: { ownerId: req.userId, galaxyId },
        select: { id: true, name: true, buildQueue: true, trainingQueue: true },
      }),
      prisma.attack.findMany({
        where: {
          galaxyId,
          status: 'completed',
          returnsAt: { gte: since },
          OR: [{ attackerUserId: req.userId }, { defenderUserId: req.userId }],
        },
        select: {
          id: true, type: true, result: true, returnsAt: true,
          attackerUserId: true, defenderUserId: true,
          attackerNexus: { select: { name: true } },
          defenderNexus: { select: { name: true } },
        },
        orderBy: { returnsAt: 'desc' },
        take: 20,
      }),
    ]);

    const nexusIds = ownNexuses.map((n) => n.id);

    // Completed building upgrades: items in trainingQueue/buildQueue that finished since last visit
    // We proxy this via the attack/report data, buildings that finished show up in nexus state.
    // Instead surface a simple count of buildings/troops that likely completed based on queue timestamps.
    const buildingsDone: Array<{ nexusName: string; building: string; level: number }> = [];
    const troopsDone: Array<{ nexusName: string; type: string; count: number }> = [];

    for (const nexus of ownNexuses) {
      const bq = (nexus.buildQueue as Array<{ building: string; targetLevel: number; completesAt: string }> | null) ?? [];
      for (const item of bq) {
        const at = new Date(item.completesAt);
        if (at >= since && at <= new Date()) {
          buildingsDone.push({ nexusName: nexus.name, building: item.building, level: item.targetLevel });
        }
      }
      const tq = (nexus.trainingQueue as Array<{ troopType: string; amount: number; completesAt: string }> | null) ?? [];
      for (const item of tq) {
        const at = new Date(item.completesAt);
        if (at >= since && at <= new Date()) {
          troopsDone.push({ nexusName: nexus.name, type: item.troopType, count: item.amount });
        }
      }
    }

    const attacks = completedAttacks.map((a) => {
      const r = a.result as { victory?: boolean } | null;
      const isMyAttack = a.attackerUserId === req.userId;
      const result = r == null ? undefined : r.victory
        ? (isMyAttack ? 'victory' : 'defeat')
        : (isMyAttack ? 'defeat' : 'victory');
      return {
        id: a.id,
        type: a.type,
        isMyAttack,
        attackerNexus: a.attackerNexus?.name,
        defenderNexus: a.defenderNexus?.name,
        result,
        completedAt: a.returnsAt,
      };
    });

    res.json({ attacks, buildings: buildingsDone, troops: troopsDone, since: since.toISOString() });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Battle log for a nexus — last 5 completed attacks the requesting user was personally involved in.
export async function getNexusHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parseInt(req.params.nexusId);
    if (!nexusId) { res.status(400).json({ error: 'Invalid nexus ID' }); return; }

    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId }, select: { id: true, galaxyId: true } });
    if (!nexus || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const attacks = await prisma.attack.findMany({
      where: {
        OR: [
          { defenderNexusId: nexusId, defenderUserId: req.userId },
          { attackerNexusId: nexusId, attackerUserId: req.userId },
          { defenderNexusId: nexusId, attackerUserId: req.userId },
          { attackerNexusId: nexusId, defenderUserId: req.userId },
        ],
        status: 'completed',
        type: { not: 'support' },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, type: true, result: true, createdAt: true,
        attackerUserId: true,
        attackerNexus: { select: { name: true } },
        defenderNexus: { select: { name: true } },
      },
    });

    const history = attacks.map((a) => {
      const r = a.result as { victory?: boolean; conquered?: boolean } | null;
      return {
        id: a.id,
        attackerNexus: a.attackerNexus?.name ?? 'Unknown',
        defenderNexus: a.defenderNexus?.name ?? 'Unknown',
        victory: r?.victory ?? null,
        conquered: r?.conquered ?? false,
        isScout: a.type === 'scout',
        createdAt: a.createdAt,
      };
    });

    res.json(history);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'reportController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
