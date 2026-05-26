import type { Response } from 'express';
import * as statsService from '../services/statsService.js';
import type { AuthRequest } from '../types/index.js';
import { getResourceProduction } from '../utils/economy.js';
import { logError } from '../utils/logger.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';

const TROOP_KEYS = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative',
  'skimmerBike', 'siegeMech', 'bulwarkGuard', 'suppressorTeam',
  'disruptorUnit', 'interceptorBike', 'annihilatorPlatform', 'overseer',
];

function sumTroops(troopObj: unknown): number {
  if (!troopObj || typeof troopObj !== 'object') return 0;
  return TROOP_KEYS.reduce((sum, k) => sum + (Number((troopObj as Record<string, unknown>)[k]) || 0), 0);
}

export async function getMyStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const [user, player, nexuses, completedAttacks] = await Promise.all([
      statsService.getUserById(userId),
      statsService.getGalaxyPlayer(userId, req.galaxyId),
      statsService.getUserNexuses(userId, req.galaxyId),
      statsService.getCompletedAttacks(userId, req.galaxyId),
    ]);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    let attacksLaunched = 0, attacksDefended = 0, victories = 0, defeats = 0;
    let troopsLost = 0, troopsKilled = 0;
    const resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
    const resourcesLost = { biomass: 0, alloy: 0, ore: 0 };

    for (const attack of completedAttacks) {
      const result = attack.result as Record<string, unknown> | null;
      if (!result) continue;
      const isAttacker = attack.attackerUserId === userId;
      const isDefender = attack.defenderUserId === userId;
      const won = result.victory === true;
      const stolen = result.resourcesStolen as { biomass?: number; alloy?: number; ore?: number } | undefined;
      if (isAttacker) {
        attacksLaunched++;
        if (won) victories++; else defeats++;
        troopsLost += sumTroops(result.attackerLosses);
        troopsKilled += sumTroops(result.defenderLosses);
        if (won && stolen) { resourcesStolen.biomass += stolen.biomass || 0; resourcesStolen.alloy += stolen.alloy || 0; resourcesStolen.ore += stolen.ore || 0; }
      }
      if (isDefender) {
        attacksDefended++;
        troopsLost += sumTroops(result.defenderLosses);
        troopsKilled += sumTroops(result.attackerLosses);
        if (!won && stolen) { resourcesLost.biomass += stolen.biomass || 0; resourcesLost.alloy += stolen.alloy || 0; resourcesLost.ore += stolen.ore || 0; }
      }
    }

    let totalProductionPerHour = { biomass: 0, alloy: 0, ore: 0 };
    let totalCurrentResources = { biomass: 0, alloy: 0, ore: 0 };
    let totalTroops = 0;
    for (const nexus of nexuses) {
      const prod = getResourceProduction(nexus);
      totalProductionPerHour.biomass += prod.biomass; totalProductionPerHour.alloy += prod.alloy; totalProductionPerHour.ore += prod.ore;
      totalCurrentResources.biomass += nexus.biomass; totalCurrentResources.alloy += nexus.alloy; totalCurrentResources.ore += nexus.ore;
      const nexusRecord = nexus as unknown as Record<string, number>;
      for (const k of TROOP_KEYS) totalTroops += nexusRecord[k] || 0;
    }

    const avgResourcesPerDay = { biomass: Math.round(totalProductionPerHour.biomass * 24), alloy: Math.round(totalProductionPerHour.alloy * 24), ore: Math.round(totalProductionPerHour.ore * 24) };
    const accountAgeDays = Math.max(1, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

    res.json({
      username: user.username, isSupporter: user.isSupporter, supporterTier: user.supporterTier ?? null, isFounder: user.isFounder ?? false, avatarUrl: avatarUrl(user.id, user.avatarKey), avatarUrlSm: avatarUrlSm(user.id, user.avatarKey), points: player?.points ?? 0, accountAgeDays, nexusCount: nexuses.length, totalTroops,
      combat: { attacksLaunched, attacksDefended, victories, defeats, troopsLost, troopsKilled, resourcesStolen, resourcesLost },
      resources: {
        current: totalCurrentResources,
        productionPerHour: { biomass: Math.round(totalProductionPerHour.biomass), alloy: Math.round(totalProductionPerHour.alloy), ore: Math.round(totalProductionPerHour.ore) },
        avgPerDay: avgResourcesPerDay,
      },
    });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'statsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getTimeline(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const days = Math.min(90, Math.max(7, parseInt(String(req.query.days), 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [nexuses, attacks] = await Promise.all([
      statsService.getUserNexuses(userId, req.galaxyId),
      statsService.getCompletedAttacksSince(userId, req.galaxyId, since),
    ]);
    let prodPerHour = { biomass: 0, alloy: 0, ore: 0 };
    for (const nexus of nexuses) {
      const p = getResourceProduction(nexus);
      prodPerHour.biomass += p.biomass; prodPerHour.alloy += p.alloy; prodPerHour.ore += p.ore;
    }
    const prodPerDay = { biomass: Math.round(prodPerHour.biomass * 24), alloy: Math.round(prodPerHour.alloy * 24), ore: Math.round(prodPerHour.ore * 24) };
    const buckets: Record<string, { date: string; attacksLaunched: number; attacksDefended: number; troopsKilled: number; troopsLost: number; resourcesStolen: number; resourcesLost: number; biomassProduced: number; alloyProduced: number; oreProduced: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, attacksLaunched: 0, attacksDefended: 0, troopsKilled: 0, troopsLost: 0, resourcesStolen: 0, resourcesLost: 0, biomassProduced: prodPerDay.biomass, alloyProduced: prodPerDay.alloy, oreProduced: prodPerDay.ore };
    }
    for (const attack of attacks) {
      const key = new Date(attack.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      const b = buckets[key];
      const result = attack.result as Record<string, unknown> | null;
      if (!result) continue;
      const isAttacker = attack.attackerUserId === userId;
      const isDefender = attack.defenderUserId === userId;
      const won = result.victory === true;
      const stolen = result.resourcesStolen as { biomass?: number; alloy?: number; ore?: number } | undefined;
      const stolenSum = (stolen?.biomass || 0) + (stolen?.alloy || 0) + (stolen?.ore || 0);
      if (isAttacker) { b.attacksLaunched++; b.troopsLost += sumTroops(result.attackerLosses); b.troopsKilled += sumTroops(result.defenderLosses); if (won && stolen) b.resourcesStolen += stolenSum; }
      if (isDefender) { b.attacksDefended++; b.troopsLost += sumTroops(result.defenderLosses); b.troopsKilled += sumTroops(result.attackerLosses); if (!won && stolen) b.resourcesLost += stolenSum; }
    }
    res.json(Object.values(buckets));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'statsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
