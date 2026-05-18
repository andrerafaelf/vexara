import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { parsePositiveInt } from '../utils/validation.js';

// ---- constants ----
const RECON_OPERATIVE_REQUIRED = 1;
const MAX_OPERATIVES = 20;
const EMBED_BASE_COST = { biomass: 400, alloy: 200 }; // per operative
const SABOTAGE_BASE_COST = { biomass: 300, ore: 300 };
// Detection chance: shieldGrid level counts against spy success
// base success chance ~65%, shieldGrid each level reduces by 4%
const BASE_SUCCESS_CHANCE = 0.65;
const SHIELD_DETECTION_PER_LEVEL = 0.04;
const COUNTER_INTEL_MAX_REDUCTION = 0.30; // max 30% reduction from shieldGrid

const SABOTAGE_TARGETS = ['troops', 'biomass', 'alloy', 'ore', 'building'] as const;
type SabotageTarget = (typeof SABOTAGE_TARGETS)[number];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function calcSuccessChance(attackerReconLevel: number, defenderShieldGrid: number): number {
  const shieldReduction = clamp(defenderShieldGrid * SHIELD_DETECTION_PER_LEVEL, 0, COUNTER_INTEL_MAX_REDUCTION);
  // Each recon operative level doesn't apply here — operative count only affects sabotage magnitude
  return clamp(BASE_SUCCESS_CHANCE - shieldReduction, 0.10, 0.95);
}

// Returns which troop field to reduce for sabotage
const TROOP_FIELDS = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative', 'skimmerBike',
  'siegeMech', 'bulwarkGuard', 'suppressorTeam', 'disruptorUnit', 'interceptorBike',
  'annihilatorPlatform', 'overseer',
] as const;

function pickRandomTroopField(nexus: Record<string, unknown>): string | null {
  const nonZero = TROOP_FIELDS.filter((f) => (nexus[f] as number) > 0);
  if (nonZero.length === 0) return null;
  return nonZero[Math.floor(Math.random() * nonZero.length)];
}

// ---- sendSpyMission ----
export async function sendSpyMission(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { fromNexusId, toNexusId, type, operatives = 1, sabotageTarget } = req.body as {
      fromNexusId?: unknown; toNexusId?: unknown; type?: string;
      operatives?: unknown; sabotageTarget?: string;
    };

    const parsedFrom = parsePositiveInt(fromNexusId);
    const parsedTo = parsePositiveInt(toNexusId);
    if (!parsedFrom || !parsedTo) { res.status(400).json({ error: 'Invalid nexus IDs' }); return; }
    if (type !== 'sabotage' && type !== 'embed') { res.status(400).json({ error: 'type must be sabotage or embed' }); return; }

    const opCount = Math.floor(Number(operatives));
    if (opCount < RECON_OPERATIVE_REQUIRED || opCount > MAX_OPERATIVES) {
      res.status(400).json({ error: `operatives must be between ${RECON_OPERATIVE_REQUIRED} and ${MAX_OPERATIVES}` }); return;
    }

    if (type === 'sabotage' && sabotageTarget && !(SABOTAGE_TARGETS as readonly string[]).includes(sabotageTarget)) {
      res.status(400).json({ error: `sabotageTarget must be one of: ${SABOTAGE_TARGETS.join(', ')}` }); return;
    }

    const [attacker, defender] = await Promise.all([
      prisma.nexus.findUnique({ where: { id: parsedFrom } }),
      prisma.nexus.findUnique({ where: { id: parsedTo } }),
    ]);

    if (!attacker || attacker.ownerId !== req.userId || attacker.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    if (!defender || defender.galaxyId !== req.galaxyId) { res.status(404).json({ error: 'Target not found' }); return; }
    if (defender.ownerId === req.userId) { res.status(400).json({ error: 'Cannot spy on your own nexus' }); return; }
    if (attacker.reconOperative < opCount) {
      res.status(400).json({ error: `Not enough Recon Operatives (have ${attacker.reconOperative}, need ${opCount})` }); return;
    }

    // Costs
    const biomassNeeded = (type === 'sabotage' ? SABOTAGE_BASE_COST.biomass : EMBED_BASE_COST.biomass) * opCount;
    const secondaryNeeded = (type === 'sabotage' ? SABOTAGE_BASE_COST.ore : EMBED_BASE_COST.alloy) * opCount;
    const secondaryKey = type === 'sabotage' ? 'ore' : 'alloy';

    if (attacker.biomass < biomassNeeded || (attacker as unknown as Record<string, number>)[secondaryKey] < secondaryNeeded) {
      res.status(400).json({ error: 'Not enough resources for this mission' }); return;
    }

    const successChance = calcSuccessChance(attacker.commandCore, defender.shieldGrid);
    const success = Math.random() < successChance;

    let report: Record<string, unknown> = { type, operatives: opCount, success };

    if (success) {
      if (type === 'sabotage') {
        const target: SabotageTarget = ((SABOTAGE_TARGETS as readonly string[]).includes(sabotageTarget ?? '') ? sabotageTarget as SabotageTarget : 'troops');
        const sabotagePercent = clamp(0.05 + opCount * 0.02, 0.05, 0.30); // 5%–30% based on operatives

        if (target === 'troops') {
          const field = pickRandomTroopField(defender as unknown as Record<string, unknown>);
          if (field) {
            const current = (defender as unknown as Record<string, number>)[field];
            const loss = Math.ceil(current * sabotagePercent);
            await prisma.nexus.update({ where: { id: parsedTo }, data: { [field]: Math.max(0, current - loss) } });
            report = { ...report, target, field, loss };
          } else {
            report = { ...report, target, message: 'No troops to sabotage' };
          }
        } else if (target === 'biomass' || target === 'alloy' || target === 'ore') {
          const current = (defender as unknown as Record<string, number>)[target];
          const loss = Math.ceil(current * sabotagePercent);
          await prisma.nexus.update({ where: { id: parsedTo }, data: { [target]: Math.max(0, current - loss) } });
          report = { ...report, target, loss };
        } else if (target === 'building') {
          // Delay building queue: shift completesAt forward by 30 min per operative
          const delayMs = opCount * 30 * 60 * 1000;
          const bq = (defender.buildQueue as Array<{ building: string; targetLevel: number; completesAt: string }>) ?? [];
          if (bq.length > 0) {
            const delayed = bq.map((item) => ({
              ...item,
              completesAt: new Date(new Date(item.completesAt).getTime() + delayMs).toISOString(),
            }));
            await prisma.nexus.update({ where: { id: parsedTo }, data: { buildQueue: delayed } });
            report = { ...report, target, delayMinutes: opCount * 30 };
          } else {
            report = { ...report, target, message: 'No active build queue' };
          }
        }
      } else if (type === 'embed') {
        // Check if already has active embed from this user on this nexus
        const existing = await prisma.spyAsset.findFirst({
          where: { ownerUserId: req.userId, targetNexusId: parsedTo, status: 'active' },
        });
        if (existing) {
          // Refresh last report
          await prisma.spyAsset.update({ where: { id: existing.id }, data: { lastReportAt: new Date() } });
          report = { ...report, assetId: existing.id, refreshed: true };
        } else {
          const asset = await prisma.spyAsset.create({
            data: {
              galaxyId: req.galaxyId,
              ownerUserId: req.userId,
              ownerNexusId: parsedFrom,
              targetNexusId: parsedTo,
              status: 'active',
              lastReportAt: new Date(),
            },
          });
          report = { ...report, assetId: asset.id };
        }

        // Embedded operative: reveal current nexus state (troops + resources, slightly noisy)
        const noise = (v: number) => Math.round(v * (0.9 + Math.random() * 0.2));
        report = {
          ...report,
          intel: {
            troops: {
              lancerDrone: noise(defender.lancerDrone),
              assaultTrooper: noise(defender.assaultTrooper),
              breakerUnit: noise(defender.breakerUnit),
              bulwarkGuard: noise(defender.bulwarkGuard),
              suppressorTeam: noise(defender.suppressorTeam),
              annihilatorPlatform: noise(defender.annihilatorPlatform),
            },
            resources: {
              biomass: noise(Math.floor(defender.biomass)),
              alloy: noise(Math.floor(defender.alloy)),
              ore: noise(Math.floor(defender.ore)),
            },
            shieldGrid: defender.shieldGrid,
            nexusType: defender.nexusType ?? null,
          },
        };
      }
    } else {
      // Detected: lose the operatives used
      report = { ...report, detected: true };
    }

    // Deduct resources and operatives
    const resourceUpdate: Record<string, number> = {
      biomass: attacker.biomass - biomassNeeded,
      reconOperative: attacker.reconOperative - opCount,
    };
    resourceUpdate[secondaryKey] = (attacker as unknown as Record<string, number>)[secondaryKey] - secondaryNeeded;
    await prisma.nexus.update({ where: { id: parsedFrom }, data: resourceUpdate });

    res.json({ success, report });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

// ---- getSpyAssets ----
export async function getSpyAssets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parsePositiveInt(req.params.nexusId);
    if (!nexusId) { res.status(400).json({ error: 'Invalid nexus ID' }); return; }

    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId }, select: { ownerId: true, galaxyId: true } });
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const assets = await prisma.spyAsset.findMany({
      where: { ownerNexusId: nexusId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      assets.map(async (a) => {
        const target = await prisma.nexus.findUnique({
          where: { id: a.targetNexusId },
          select: { name: true, x: true, y: true, ownerId: true },
        });
        return { ...a, targetName: target?.name, targetX: target?.x, targetY: target?.y };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

// ---- recallSpyAsset ----
export async function recallSpyAsset(req: AuthRequest, res: Response): Promise<void> {
  try {
    const assetId = parsePositiveInt(req.params.assetId);
    if (!assetId) { res.status(400).json({ error: 'Invalid asset ID' }); return; }

    const asset = await prisma.spyAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.ownerUserId !== req.userId || asset.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    await prisma.spyAsset.update({ where: { id: assetId }, data: { status: 'recalled' } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

// ---- getEmbedIntel ----
// Returns fresh intel from an active embedded operative
export async function getEmbedIntel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const assetId = parsePositiveInt(req.params.assetId);
    if (!assetId) { res.status(400).json({ error: 'Invalid asset ID' }); return; }

    const asset = await prisma.spyAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.ownerUserId !== req.userId || asset.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    if (asset.status !== 'active') { res.status(400).json({ error: 'Asset is not active' }); return; }

    const defender = await prisma.nexus.findUnique({ where: { id: asset.targetNexusId } });
    if (!defender) {
      await prisma.spyAsset.update({ where: { id: assetId }, data: { status: 'lost' } });
      res.status(404).json({ error: 'Target nexus no longer exists' }); return;
    }

    // Check if operative was discovered (shieldGrid chance per refresh)
    const discoveryChance = clamp(defender.shieldGrid * 0.03, 0, 0.20);
    if (Math.random() < discoveryChance) {
      await prisma.spyAsset.update({ where: { id: assetId }, data: { status: 'discovered', discoveredAt: new Date() } });
      res.json({ discovered: true });
      return;
    }

    const noise = (v: number) => Math.round(v * (0.88 + Math.random() * 0.24));
    await prisma.spyAsset.update({ where: { id: assetId }, data: { lastReportAt: new Date() } });

    res.json({
      discovered: false,
      intel: {
        troops: {
          lancerDrone: noise(defender.lancerDrone),
          assaultTrooper: noise(defender.assaultTrooper),
          breakerUnit: noise(defender.breakerUnit),
          bulwarkGuard: noise(defender.bulwarkGuard),
          suppressorTeam: noise(defender.suppressorTeam),
          annihilatorPlatform: noise(defender.annihilatorPlatform),
          reconOperative: noise(defender.reconOperative),
        },
        resources: {
          biomass: noise(Math.floor(defender.biomass)),
          alloy: noise(Math.floor(defender.alloy)),
          ore: noise(Math.floor(defender.ore)),
        },
        buildings: {
          commandCore: defender.commandCore,
          shieldGrid: defender.shieldGrid,
          recruitmentCore: defender.recruitmentCore,
        },
        nexusType: defender.nexusType ?? null,
        buildQueueLength: (defender.buildQueue as unknown[])?.length ?? 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
