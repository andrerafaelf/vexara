import type { Response } from 'express';
import { applyCompletedQueues, normalizeBuildQueue, queueToJson, serializeNexus } from '../models/Nexus.js';
import prisma from '../lib/prisma.js';
import * as referralService from '../services/referralService.js';
import type { AuthRequest } from '../types/index.js';

const BUILDINGS = ['commandCore', 'recruitmentCore', 'lifeSupport', 'storageVault', 'biomassFarm', 'alloyForge', 'oreExtractor', 'shieldGrid'] as const;

const BUILDING_MAX: Record<string, number> = {
  commandCore: 20, recruitmentCore: 15, lifeSupport: 20, storageVault: 20,
  biomassFarm: 20, alloyForge: 20, oreExtractor: 20, shieldGrid: 15,
};

const BUILDING_NAMES: Record<string, string> = {
  commandCore: 'Command Core', recruitmentCore: 'Recruitment Core', lifeSupport: 'Life Support',
  storageVault: 'Storage Vault', biomassFarm: 'Biomass Farm', alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor', shieldGrid: 'Shield Grid',
};

const TROOP_NAMES: Record<string, string> = {
  lancerDrone: 'Lancer Drone', assaultTrooper: 'Assault Trooper', breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative', skimmerBike: 'Skimmer Bike', bulwarkGuard: 'Bulwark Guard',
  suppressorTeam: 'Suppressor Team', disruptorUnit: 'Disruptor Unit', interceptorBike: 'Interceptor Bike',
  siegeMech: 'Siege Mech', annihilatorPlatform: 'Annihilator Platform',
};

const TROOP_POPULATION: Record<string, number> = {
  lancerDrone: 1, assaultTrooper: 1, breakerUnit: 1, reconOperative: 1,
  skimmerBike: 3, bulwarkGuard: 2, suppressorTeam: 2, disruptorUnit: 2,
  interceptorBike: 3, siegeMech: 4, annihilatorPlatform: 5,
};

// Grant amounts indexed by commandCore tier: 1-4 / 5-8 / 9-12 / 13-20
const TROOP_GRANTS: Record<string, [number, number, number, number]> = {
  lancerDrone:          [35,  75,  120, 180],
  breakerUnit:          [35,  75,  120, 180],
  assaultTrooper:       [20,  45,  75,  110],
  reconOperative:       [20,  45,  75,  110],
  bulwarkGuard:         [15,  32,  50,  75],
  suppressorTeam:       [15,  32,  50,  75],
  skimmerBike:          [12,  25,  40,  60],
  disruptorUnit:        [12,  25,  40,  60],
  interceptorBike:      [12,  25,  40,  60],
  siegeMech:            [5,   12,  20,  30],
  annihilatorPlatform:  [2,   5,   10,  15],
};

function commandCoreTier(level: number): 0 | 1 | 2 | 3 {
  if (level <= 4) return 0;
  if (level <= 8) return 1;
  if (level <= 12) return 2;
  return 3;
}

function grantAmountForTroop(troopType: string, commandLevel: number): number {
  const tiers = TROOP_GRANTS[troopType];
  if (!tiers) return 0;
  return tiers[commandCoreTier(commandLevel)];
}

// -- Route handlers --

export async function getMyReferrals(req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = await referralService.getReferralStatus(req.userId!);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getMyPendingTokens(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tokens = await referralService.getPendingTokens(req.userId!);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function redeemToken(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tokenId = parseInt(req.params.tokenId, 10);
    const { rewardType, nexusId, building, troopType } = req.body as {
      rewardType?: string; nexusId?: number; building?: string; troopType?: string;
    };

    if (!rewardType || !nexusId) {
      res.status(400).json({ error: 'rewardType and nexusId are required' });
      return;
    }

    const token = await referralService.getTokenById(tokenId);
    if (!token) { res.status(404).json({ error: 'Token not found' }); return; }
    if (token.referrerId !== req.userId!) { res.status(403).json({ error: 'Not your token' }); return; }
    if (token.redeemedAt) { res.status(400).json({ error: 'Token already redeemed' }); return; }

    const rawNexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
    if (!rawNexus || rawNexus.ownerId !== req.userId! || rawNexus.galaxyId !== req.galaxyId!) {
      res.status(403).json({ error: 'Nexus not found or not yours' }); return;
    }

    const nexus = await applyCompletedQueues(rawNexus);

    if (rewardType === 'building_instant') {
      if (!building || !BUILDINGS.includes(building as typeof BUILDINGS[number])) {
        res.status(400).json({ error: 'Invalid building' }); return;
      }
      const currentLevel = (nexus as unknown as Record<string, number>)[building] ?? 0;
      const maxLevel = BUILDING_MAX[building];
      if (currentLevel >= maxLevel) {
        res.status(400).json({ error: `${BUILDING_NAMES[building]} is already at max level (${maxLevel})` }); return;
      }
      const targetLevel = Math.min(currentLevel + 2, maxLevel);

      const updated = await prisma.nexus.update({
        where: { id: nexus.id },
        data: { [building]: targetLevel },
      });

      await referralService.markTokenRedeemed(tokenId, 'building_instant', {
        building, fromLevel: currentLevel, toLevel: targetLevel, nexusId: nexus.id,
      });

      const levelsGained = targetLevel - currentLevel;
      res.json({
        success: true,
        message: `${BUILDING_NAMES[building]} instantly upgraded by ${levelsGained} level${levelsGained > 1 ? 's' : ''} to level ${targetLevel} at ${nexus.name}.`,
        nexus: serializeNexus(updated),
      });
      return;
    }

    if (rewardType === 'troop_grant') {
      if (!troopType || !TROOP_NAMES[troopType]) {
        res.status(400).json({ error: 'Invalid troop type' }); return;
      }
      const commandLevel = (nexus as unknown as Record<string, number>).commandCore ?? 0;
      const grantAmount = grantAmountForTroop(troopType, commandLevel);
      if (grantAmount === 0) {
        res.status(400).json({ error: 'Cannot determine grant amount' }); return;
      }

      const popPerUnit = TROOP_POPULATION[troopType] ?? 1;
      const popMax = (nexus as unknown as Record<string, number>).populationMax ?? 24;
      const popCurrent = (nexus as unknown as Record<string, number>).populationCurrent ?? 0;
      const popFree = Math.max(0, popMax - popCurrent);
      const canFit = Math.floor(popFree / popPerUnit);
      const actualGrant = Math.min(grantAmount, canFit);

      if (actualGrant <= 0) {
        res.status(400).json({ error: 'Not enough population capacity for any troops' }); return;
      }

      const currentTroops = (nexus as unknown as Record<string, number>)[troopType] ?? 0;
      const updated = await prisma.nexus.update({
        where: { id: nexus.id },
        data: {
          [troopType]: currentTroops + actualGrant,
          populationCurrent: popCurrent + actualGrant * popPerUnit,
        },
      });

      await referralService.markTokenRedeemed(tokenId, 'troop_grant', {
        troopType, amount: actualGrant, nexusId: nexus.id, commandLevel,
      });

      res.json({
        success: true,
        message: `${actualGrant}x ${TROOP_NAMES[troopType]} granted at ${nexus.name}.`,
        nexus: serializeNexus(updated),
      });
      return;
    }

    res.status(400).json({ error: 'Unknown rewardType' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function setReferrer(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { referrerUsername } = req.body as { referrerUsername?: string };
    if (!referrerUsername || typeof referrerUsername !== 'string') {
      res.status(400).json({ error: 'referrerUsername required' }); return;
    }

    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { referredById: true } });
    if (me?.referredById) {
      res.status(400).json({ error: 'You already have a referrer set' }); return;
    }

    const referrer = await prisma.user.findFirst({
      where: { username: { equals: referrerUsername.trim(), mode: 'insensitive' } },
      select: { id: true, username: true },
    });
    if (!referrer) { res.status(404).json({ error: 'Player not found' }); return; }
    if (referrer.id === req.userId!) { res.status(400).json({ error: 'Cannot refer yourself' }); return; }

    await prisma.user.update({ where: { id: req.userId! }, data: { referredById: referrer.id } });
    res.json({ success: true, referrerUsername: referrer.username });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getMyReferrer(req: AuthRequest, res: Response): Promise<void> {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { referredById: true, referredBy: { select: { username: true } } },
    });
    if (!me?.referredById) {
      res.json({ referrer: null }); return;
    }

    // Get referrer's best points across galaxies
    const playerRecords = await prisma.galaxyPlayer.findMany({
      where: { userId: me.referredById },
      select: { points: true },
      orderBy: { points: 'desc' },
      take: 1,
    });
    const referrerPoints = playerRecords[0]?.points ?? 0;

    // Check if our token was already issued (i.e., we hit threshold)
    const token = await prisma.referralToken.findUnique({ where: { refereeId: req.userId! } });

    res.json({
      referrer: {
        username: me.referredBy?.username,
        thresholdMet: token !== null,
        redeemed: token?.redeemedAt !== null,
        referrerPoints,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export { grantAmountForTroop, TROOP_GRANTS, TROOP_NAMES, BUILDING_NAMES, BUILDING_MAX };
