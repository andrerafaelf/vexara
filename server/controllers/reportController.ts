import type { Response } from 'express';
import { serializeAttack } from '../models/Nexus.js';
import * as reportService from '../services/reportService.js';
import type { AuthRequest } from '../types/index.js';

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
          reportService.getUserById(r.attackerUserId),
          r.defenderUserId ? reportService.getUserById(r.defenderUserId) : null,
        ]);
        return serializeAttack({ ...r, attackerUsername: attackerUser?.username, defenderUsername: defenderUser?.username });
      }),
    );
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getUnreadNexusIds(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusIds = await reportService.getUnreadNexusIds(req.userId, req.galaxyId);
    res.json(nexusIds);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
  }
}
