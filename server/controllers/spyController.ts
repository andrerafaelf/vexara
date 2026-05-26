import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { parsePositiveInt } from '../utils/validation.js';
import { TROOP_STATS } from '../utils/combatMath.js';
import { logError } from '../utils/logger.js';

// ---- constants ----
const EMBED_BASE_COST = { biomass: 400, alloy: 200 };
const SABOTAGE_BASE_COST = { biomass: 300, ore: 300 };

// Recon operative speed (mirrors TROOP_STATS.reconOperative.speed = 25)
const RECON_SPEED = (TROOP_STATS as Record<string, { speed: number }>)['reconOperative']?.speed ?? 25;

// Embed detection: 5% base + 2% per defender stealthArray, max 15%.
const EMBED_DETECT_BASE = 0.05;
const EMBED_DETECT_PER_STEALTH = 0.02;
const EMBED_DETECT_MAX = 0.15;

// Intel refresh detection: slightly lower since operative is already embedded.
const REFRESH_DETECT_BASE = 0.04;
const REFRESH_DETECT_PER_STEALTH = 0.015;
const REFRESH_DETECT_MAX = 0.12;

const SABOTAGE_TARGETS = ['troops', 'building'] as const;
type SabotageTarget = (typeof SABOTAGE_TARGETS)[number];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function travelMinutes(x1: number, y1: number, x2: number, y2: number): number {
  const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  // Same formula as scout missions in attackController
  return distance * (4 + (28 - RECON_SPEED) / 10);
}



function buildIntel(defender: Record<string, unknown>) {
  return {
    troops: {
      lancerDrone:          defender.lancerDrone,
      assaultTrooper:       defender.assaultTrooper,
      breakerUnit:          defender.breakerUnit,
      bulwarkGuard:         defender.bulwarkGuard,
      suppressorTeam:       defender.suppressorTeam,
      annihilatorPlatform:  defender.annihilatorPlatform,
      reconOperative:       defender.reconOperative,
      skimmerBike:          defender.skimmerBike,
      siegeMech:            defender.siegeMech,
      disruptorUnit:        defender.disruptorUnit,
      interceptorBike:      defender.interceptorBike,
      overseer:             defender.overseer,
    },
    resources: {
      biomass: Math.floor(defender.biomass as number),
      alloy:   Math.floor(defender.alloy as number),
      ore:     Math.floor(defender.ore as number),
    },
    buildings: {
      commandCore:     defender.commandCore,
      shieldGrid:      defender.shieldGrid,
      recruitmentCore: defender.recruitmentCore,
    },
    nexusType:     (defender.nexusType as string) ?? null,
    buildQueue:    Array.isArray(defender.buildQueue)    ? defender.buildQueue    : [],
    trainingQueue: Array.isArray(defender.trainingQueue) ? defender.trainingQueue : [],
  };
}

// ---- sendSpyMission ----
// Creates a SpyMission record and returns immediately with travel time.
// Actual resolution happens in processArrivedSpyMissions().
export async function sendSpyMission(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { fromNexusId, toNexusId, type, operatives = 1, sabotageTarget } = req.body as {
      fromNexusId?: unknown; toNexusId?: unknown; type?: string;
      operatives?: unknown; sabotageTarget?: string;
    };

    const parsedFrom = parsePositiveInt(fromNexusId);
    const parsedTo   = parsePositiveInt(toNexusId);
    if (!parsedFrom || !parsedTo) { res.status(400).json({ error: 'Invalid nexus IDs' }); return; }
    if (type !== 'sabotage' && type !== 'embed') { res.status(400).json({ error: 'type must be sabotage or embed' }); return; }

    const opCount = Math.floor(Number(operatives));
    if (opCount < 1) {
      res.status(400).json({ error: 'operatives must be at least 1' }); return;
    }

    if (type === 'sabotage') {
      if (!sabotageTarget || !(SABOTAGE_TARGETS as readonly string[]).includes(sabotageTarget)) {
        res.status(400).json({ error: `sabotageTarget must be one of: ${SABOTAGE_TARGETS.join(', ')}` }); return;
      }
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
    if (type === 'sabotage' && defender.newbieProtectionEndsAt && new Date(defender.newbieProtectionEndsAt) > new Date()) {
      res.status(403).json({ error: 'This nexus is under newbie protection and cannot be sabotaged yet', protectedUntil: defender.newbieProtectionEndsAt }); return;
    }
    if (attacker.reconOperative < opCount) {
      res.status(400).json({ error: `Not enough Recon Operatives (have ${attacker.reconOperative}, need ${opCount})` }); return;
    }

    // Embed costs flat 1-operative worth regardless of opCount sent.
    const embedUnits = 1;
    const biomassNeeded = type === 'embed' ? EMBED_BASE_COST.biomass * embedUnits : SABOTAGE_BASE_COST.biomass * opCount;
    const secondaryNeeded = type === 'embed' ? EMBED_BASE_COST.alloy * embedUnits : SABOTAGE_BASE_COST.ore * opCount;
    const secondaryKey = type === 'embed' ? 'alloy' : 'ore';

    if (attacker.biomass < biomassNeeded || (attacker as unknown as Record<string, number>)[secondaryKey] < secondaryNeeded) {
      res.status(400).json({ error: 'Not enough resources for this mission' }); return;
    }

    // Calculate travel time and deduct operatives + resources immediately so they
    // can't be double-spent while the mission is in flight.
    const mins = travelMinutes(attacker.x, attacker.y, defender.x, defender.y);
    const travelMs = Math.round(mins * 60 * 1000);
    const arrivesAt = new Date(Date.now() + travelMs);

    const resourceUpdate: Record<string, number> = {
      biomass: attacker.biomass - biomassNeeded,
      reconOperative: attacker.reconOperative - opCount,
    };
    resourceUpdate[secondaryKey] = (attacker as unknown as Record<string, number>)[secondaryKey] - secondaryNeeded;

    const [mission] = await Promise.all([
      prisma.spyMission.create({
        data: {
          galaxyId:       req.galaxyId,
          ownerUserId:    req.userId,
          fromNexusId:    parsedFrom,
          toNexusId:      parsedTo,
          type,
          operatives:     opCount,
          sabotageTarget: type === 'sabotage' ? sabotageTarget : null,
          status:         'traveling',
          arrivesAt,
        },
      }),
      prisma.nexus.update({ where: { id: parsedFrom }, data: resourceUpdate }),
    ]);

    res.json({
      queued: true,
      missionId: mission.id,
      arrivesAt: mission.arrivesAt,
      returnsAt: new Date(arrivesAt.getTime() + travelMs), // estimated return
    });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'spyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- processArrivedSpyMissions ----
// Called by the background job loop every 10 seconds.
export async function processArrivedSpyMissions(): Promise<void> {
  const now = new Date();

  // Resolve missions that have arrived at the target
  const arrived = await prisma.spyMission.findMany({
    where: { status: 'traveling', arrivesAt: { lte: now } },
  });

  for (const mission of arrived) {
    try {
      const [attacker, defender] = await Promise.all([
        prisma.nexus.findUnique({ where: { id: mission.fromNexusId } }),
        prisma.nexus.findUnique({ where: { id: mission.toNexusId } }),
      ]);

      if (!defender) {
        // Target nexus gone, mission just completes with no result, return operatives
        const travelMs = mission.arrivesAt.getTime() - mission.createdAt.getTime();
        await Promise.all([
          prisma.spyMission.update({
            where: { id: mission.id },
            data: { status: 'completed', result: { error: 'Target nexus no longer exists' } },
          }),
          attacker && prisma.nexus.update({
            where: { id: mission.fromNexusId },
            data: { reconOperative: { increment: mission.operatives } },
          }),
        ]);
        continue;
      }

      const travelMs = mission.arrivesAt.getTime() - mission.createdAt.getTime();
      const returnsAt = new Date(now.getTime() + travelMs);

      let result: Record<string, unknown> = { type: mission.type, operatives: mission.operatives };
      let operativesReturning = mission.operatives;

      if (mission.type === 'embed') {
        const defenderStealth = (defender as unknown as { stealthArray?: number }).stealthArray ?? 0;
        const detectChance = clamp(
          EMBED_DETECT_BASE + defenderStealth * EMBED_DETECT_PER_STEALTH,
          0, EMBED_DETECT_MAX,
        );
        const detected = Math.random() < detectChance;

        if (detected) {
          operativesReturning = mission.operatives - 1; // 1 operative lost on detection
          result = { ...result, success: false, detected: true };
        } else {
          const existing = await prisma.spyAsset.findFirst({
            where: { ownerUserId: mission.ownerUserId, targetNexusId: mission.toNexusId, status: 'active' },
          });
          if (existing) {
            await prisma.spyAsset.update({ where: { id: existing.id }, data: { lastReportAt: now } });
            result = { ...result, success: true, assetId: existing.id, refreshed: true, intel: buildIntel(defender as unknown as Record<string, unknown>) };
          } else {
            const asset = await prisma.spyAsset.create({
              data: {
                galaxyId:      mission.galaxyId,
                ownerUserId:   mission.ownerUserId,
                ownerNexusId:  mission.fromNexusId,
                targetNexusId: mission.toNexusId,
                status:        'active',
                lastReportAt:  now,
              },
            });
            result = { ...result, success: true, assetId: asset.id, intel: buildIntel(defender as unknown as Record<string, unknown>) };
          }
        }

      } else {
        // Sabotage: deterministic by operative count
        const defenderRecon = defender.reconOperative ?? 0;
        const success = mission.operatives > defenderRecon;

        if (success) {
          const target = mission.sabotageTarget as SabotageTarget;
          const excessOps = Math.max(0, mission.operatives - defenderRecon);
          const excessRatio = clamp((mission.operatives - defenderRecon) / Math.max(mission.operatives, 1), 0, 1);
          const sabotagePercent = clamp(0.05 + excessRatio * 0.35, 0.05, 0.40);
          operativesReturning = mission.operatives - Math.ceil(mission.operatives * 0.25);

          if (target === 'troops') {
            // Sabotage delays the training queue rather than killing garrison troops.
            // Each excess operative past the defender's recon count adds 30 minutes of delay,
            // mirroring the building sabotage mechanic.
            const delayMs = excessOps * 30 * 60 * 1000;
            const tq = (defender.trainingQueue as Array<{ troopType: string; amount: number; completesAt: string; perUnitSeconds?: number }>) ?? [];
            if (tq.length > 0) {
              const delayed = tq.map((item) => ({
                ...item,
                completesAt: new Date(new Date(item.completesAt).getTime() + delayMs).toISOString(),
              }));
              await prisma.nexus.update({ where: { id: mission.toNexusId }, data: { trainingQueue: delayed } });
              result = { ...result, success: true, target, delayMinutes: excessOps * 30 };
            } else {
              result = { ...result, success: true, target, message: 'No active training queue' };
            }
          } else if (target === 'building') {
            const delayMs = excessOps * 30 * 60 * 1000;
            const bq = (defender.buildQueue as Array<{ building: string; targetLevel: number; completesAt: string }>) ?? [];
            if (bq.length > 0) {
              const delayed = bq.map((item) => ({
                ...item,
                completesAt: new Date(new Date(item.completesAt).getTime() + delayMs).toISOString(),
              }));
              await prisma.nexus.update({ where: { id: mission.toNexusId }, data: { buildQueue: delayed } });
              result = { ...result, success: true, target, delayMinutes: excessOps * 30 };
            } else {
              result = { ...result, success: true, target, message: 'No active build queue' };
            }
          }

          if (defenderRecon > 0) {
            await prisma.nexus.update({ where: { id: mission.toNexusId }, data: { reconOperative: 0 } });
          }
        } else {
          operativesReturning = 0; // all lost on sabotage failure
          result = { ...result, success: false, detected: true, defenderRecon };
        }
      }

      // Mark as returning, operatives come back after another travel leg
      await prisma.spyMission.update({
        where: { id: mission.id },
        data: { status: 'returning', returnsAt, result: result as Prisma.InputJsonValue },
      });

      // Surviving operatives are held in the mission until returnsAt
      // (they're already deducted from the nexus, returned in the 'completed' phase)
      if (operativesReturning !== mission.operatives) {
        // Store how many survive so the return phase knows what to give back
        await prisma.spyMission.update({
          where: { id: mission.id },
          data: { operatives: operativesReturning },
        });
      }

    } catch (err) {
      console.error('Error processing spy mission', mission.id, err);
    }
  }

  // Return operatives from missions that have completed their return trip
  const returning = await prisma.spyMission.findMany({
    where: { status: 'returning', returnsAt: { lte: now } },
  });

  for (const mission of returning) {
    try {
      await Promise.all([
        prisma.spyMission.update({ where: { id: mission.id }, data: { status: 'completed' } }),
        mission.operatives > 0 && prisma.nexus.update({
          where: { id: mission.fromNexusId },
          data: { reconOperative: { increment: mission.operatives } },
        }),
      ]);
    } catch (err) {
      console.error('Error completing spy mission return', mission.id, err);
    }
  }
}

// ---- getSpyMissions ----
// Returns in-flight missions (traveling or returning) for a nexus.
export async function getSpyMissions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parsePositiveInt(req.params.nexusId);
    if (!nexusId) { res.status(400).json({ error: 'Invalid nexus ID' }); return; }

    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId }, select: { ownerId: true, galaxyId: true } });
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const missions = await prisma.spyMission.findMany({
      where: { fromNexusId: nexusId, status: { in: ['traveling', 'returning'] } },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      missions.map(async (m) => {
        const target = await prisma.nexus.findUnique({
          where: { id: m.toNexusId },
          select: { name: true, x: true, y: true },
        });
        return { ...m, targetName: target?.name };
      }),
    );

    res.json(enriched);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'spyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- getCompletedSpyMissions ----
// Returns the most recent completed missions so the frontend can show results.
export async function getCompletedSpyMissions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexusId = parsePositiveInt(req.params.nexusId);
    if (!nexusId) { res.status(400).json({ error: 'Invalid nexus ID' }); return; }

    const nexus = await prisma.nexus.findUnique({ where: { id: nexusId }, select: { ownerId: true, galaxyId: true } });
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const missions = await prisma.spyMission.findMany({
      where: { fromNexusId: nexusId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const enriched = await Promise.all(
      missions.map(async (m) => {
        const target = await prisma.nexus.findUnique({
          where: { id: m.toNexusId },
          select: { name: true },
        });
        return { ...m, targetName: target?.name };
      }),
    );

    res.json(enriched);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'spyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
          select: { name: true, x: true, y: true },
        });
        return { ...a, targetName: target?.name, targetX: target?.x, targetY: target?.y };
      }),
    );

    res.json(enriched);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'spyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'spyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- getEmbedIntel ----
// Refresh intel from an already-embedded operative. Instant once stationary.
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

    // Discovery chance per refresh
    const defenderStealth = (defender as unknown as { stealthArray?: number }).stealthArray ?? 0;
    const discoveryChance = clamp(
      REFRESH_DETECT_BASE + defenderStealth * REFRESH_DETECT_PER_STEALTH,
      0, REFRESH_DETECT_MAX,
    );
    if (Math.random() < discoveryChance) {
      await prisma.spyAsset.update({ where: { id: assetId }, data: { status: 'discovered', discoveredAt: new Date() } });
      res.json({ discovered: true });
      return;
    }

    await prisma.spyAsset.update({ where: { id: assetId }, data: { lastReportAt: new Date() } });
    res.json({ discovered: false, intel: buildIntel(defender as unknown as Record<string, unknown>) });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'spyController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
