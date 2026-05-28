import type { AttackType } from '@prisma/client';
import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import { applyQuestRewards, serializeAttack } from '../models/Nexus.js';
import * as attackService from '../services/attackService.js';
import type { AuthRequest, TroopKey } from '../types/index.js';
import { TROOP_STATS } from '../utils/combatMath.js';
import { normalizeTroopPayload, parsePositiveInt } from '../utils/validation.js';
import { logError } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import { NEXUS_TYPE_BONUSES } from '../utils/economy.js';

const TROOP_KEYS: TroopKey[] = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative', 'skimmerBike',
  'siegeMech', 'bulwarkGuard', 'suppressorTeam', 'disruptorUnit', 'interceptorBike',
  'annihilatorPlatform', 'voidStalker', 'plasmaTurret', 'overseer',
];
// Note: Overseers are not actually a troop type that can be sent on their own, but we include them in the normalization and validation logic for convenience since they can be included in attacks/support missions.
const SUPPORTED_ATTACK_TYPES = new Set<AttackType>(['attack', 'scout', 'support']);

// Controller for handling attack-related endpoints: sending attacks, viewing incoming/outgoing attacks, etc.
export async function sendAttack(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { fromNexusId, toNexusId, troops, type = 'attack' } = req.body as {
      fromNexusId?: unknown; toNexusId?: unknown; troops?: unknown; type?: string;
    };
    const parsedFromNexusId = parsePositiveInt(fromNexusId);
    const parsedToNexusId = parsePositiveInt(toNexusId);
    if (!parsedFromNexusId || !parsedToNexusId) { res.status(400).json({ error: 'Invalid nexus IDs' }); return; }
    if (!SUPPORTED_ATTACK_TYPES.has(type as AttackType)) { res.status(400).json({ error: 'Unsupported mission type' }); return; }
    const attackType = type as AttackType;

    const normalizedPayload = normalizeTroopPayload(troops, TROOP_KEYS);
    if ('error' in normalizedPayload && normalizedPayload.error) { res.status(400).json({ error: normalizedPayload.error }); return; }
    const normalizedTroops = (normalizedPayload as { normalized: Record<string, number> }).normalized;

    const [attackerNexus, defenderNexus] = await Promise.all([
      attackService.getNexusById(parsedFromNexusId),
      attackService.getNexusById(parsedToNexusId),
    ]);
    if (!attackerNexus || attackerNexus.ownerId !== req.userId || attackerNexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    if (!defenderNexus) { res.status(404).json({ error: 'Target nexus not found' }); return; }
    if (defenderNexus.galaxyId !== req.galaxyId) { res.status(400).json({ error: 'Cannot attack a nexus in a different galaxy' }); return; }
    if (defenderNexus.ownerId && defenderNexus.ownerId === req.userId) { res.status(400).json({ error: 'Cannot attack your own nexus' }); return; }
    if (defenderNexus.newbieProtectionEndsAt && new Date(defenderNexus.newbieProtectionEndsAt) > new Date()) {
      res.status(403).json({ error: 'This nexus is under newbie protection and cannot be attacked yet', protectedUntil: defenderNexus.newbieProtectionEndsAt }); return;
    }

    const totalTroopsRequested = Object.values(normalizedTroops).reduce((sum, a) => sum + a, 0);
    if (totalTroopsRequested <= 0) { res.status(400).json({ error: 'Select at least one troop' }); return; }
    if ((normalizedTroops.plasmaTurret || 0) > 0) {
      res.status(400).json({ error: 'Plasma Turrets cannot leave their nexus' }); return;
    }

    if (attackType === 'scout') {
      const reconOperatives = normalizedTroops.reconOperative || 0;
      const nonScout = TROOP_KEYS.filter((t) => t !== 'reconOperative').some((t) => normalizedTroops[t] > 0);
      if (reconOperatives <= 0 || nonScout) { res.status(400).json({ error: 'Scout missions require Recon Operatives only' }); return; }
    }
    if (attackType === 'support') {
      // Cannot send support to your own nexus (use troop transfer instead)
      if (defenderNexus.ownerId === req.userId) { res.status(400).json({ error: 'Use troop transfer to move troops between your own nexuses' }); return; }
      // Target must be a friendly player (same faction or friend)
      if (defenderNexus.ownerId) {
        const [sameFaction, areFriends] = await Promise.all([
          prisma.factionMember.findFirst({
            where: {
              galaxyId: req.galaxyId!,
              userId: { in: [req.userId!, defenderNexus.ownerId] },
            },
          }).then(async (m1) => {
            if (!m1) return false;
            const m2 = await prisma.factionMember.findFirst({ where: { galaxyId: req.galaxyId!, userId: m1.userId === req.userId ? defenderNexus.ownerId! : req.userId! } });
            return !!(m1 && m2 && m1.factionId === (m2 as any)?.factionId);
          }),
          prisma.friendship.findFirst({
            where: { OR: [{ userAId: req.userId!, userBId: defenderNexus.ownerId! }, { userAId: defenderNexus.ownerId!, userBId: req.userId! }] },
          }).then(Boolean),
        ]);
        if (!sameFaction && !areFriends) { res.status(403).json({ error: 'Support missions can only be sent to faction members or friends' }); return; }
      } else {
        res.status(400).json({ error: 'Cannot send support to an unowned nexus' }); return;
      }
      // No overseer in support missions
      if ((normalizedTroops.overseer || 0) > 0) { res.status(400).json({ error: 'Overseers cannot be sent on support missions' }); return; }
    }
    if (attackType !== 'support' && (normalizedTroops.overseer || 0) > 1) { res.status(400).json({ error: 'Maximum 1 Overseer per strike' }); return; }

    const attackerRecord = attackerNexus as unknown as Record<string, number>;
    for (const [troopType, amount] of Object.entries(normalizedTroops)) {
      if ((attackerRecord[troopType] || 0) < amount) { res.status(400).json({ error: `Insufficient ${troopType}` }); return; }
    }

    const troopDeductions: Record<string, number> = {};
    for (const [troopType, amount] of Object.entries(normalizedTroops)) {
      troopDeductions[troopType] = (attackerRecord[troopType] || 0) - amount;
    }

    const distance = Math.sqrt(Math.pow(defenderNexus.x - attackerNexus.x, 2) + Math.pow(defenderNexus.y - attackerNexus.y, 2));
    const baseTravel = NEXUS_TYPE_BONUSES[(attackerNexus as unknown as { nexusType?: string | null }).nexusType ?? '']?.travelTimeMultiplier ?? 1;
    const nexusDoubledForTravel = (attackerNexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
    const travelSpeedMultiplier = baseTravel === 1 ? 1 : (nexusDoubledForTravel ? Math.pow(baseTravel, 2) : baseTravel);
    let travelTimeMinutes: number;
    if (attackType === 'scout') {
      travelTimeMinutes = distance * 4 * travelSpeedMultiplier;
    } else {
      // Overseer strikes use the slowest-troop formula then get a 3x surcharge -
      // making conquest trains clearly distinct (and giving defenders time to react).
      const OVERSEER_EFFECTIVE_SPEED = 6;
      const OVERSEER_TRAVEL_MULTIPLIER = 3;
      let minSpeed = Infinity;
      for (const [troopType, amount] of Object.entries(normalizedTroops)) {
        if (amount > 0 && (TROOP_STATS as Record<string, { speed: number }>)[troopType]) {
          const speed = troopType === 'overseer' ? OVERSEER_EFFECTIVE_SPEED : (TROOP_STATS as Record<string, { speed: number }>)[troopType].speed;
          if (speed < minSpeed) minSpeed = speed;
        }
      }
      const hasOverseer = (normalizedTroops.overseer || 0) > 0;
      travelTimeMinutes = distance * (4 + (28 - minSpeed) / 10) * (hasOverseer ? OVERSEER_TRAVEL_MULTIPLIER : 1) * travelSpeedMultiplier;
    }
    const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

    const [attack, updatedAttackerNexus] = await attackService.createAttackAndDeductTroops(
      {
        galaxyId: req.galaxyId, attackerUserId: req.userId, attackerNexusId: parsedFromNexusId,
        defenderUserId: defenderNexus.ownerId ?? null, defenderNexusId: parsedToNexusId,
        troops: normalizedTroops, arrivesAt, type: attackType,
      },
      attackerNexus.id,
      troopDeductions,
    );
    await applyQuestRewards(updatedAttackerNexus, { hasOutgoingStrike: true });

    // Notify the defender immediately that an attack is inbound.
    // Scout missions are intentionally excluded - stealth is part of the mechanic.
    if (defenderNexus.ownerId && attackType === 'attack') {
      const etaMinutes = Math.round(travelTimeMinutes);
      const etaStr = etaMinutes < 60 ? `${etaMinutes}m` : `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;
      void sendPushToUser(defenderNexus.ownerId, NOTIF.ATTACK_INCOMING, {
        title: '⚠️ Incoming Attack',
        body: `A strike is heading for ${defenderNexus.name}. ETA: ${etaStr}.`,
        tag: `incoming-${attack.id}`,
        data: { url: '/' },
      });
    }

    try {
      const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
      const questId = type === 'scout' ? 'scout_1' : 'attack_1';
      void incrementQuestProgress(req.userId, req.galaxyId, questId, 1);
      void incrementQuestProgress(req.userId, req.galaxyId, 'login', 1);
    } catch {}
    res.json({ success: true, attack: serializeAttack(attack) });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'attackController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getIncomingAttacks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexus = await attackService.getNexusById(parseInt(req.params.nexusId));
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const attacks = await attackService.getIncomingAttacks(nexus.id);
    const attackerIds = [...new Set(attacks.map((a) => a.attackerUserId).filter((id): id is number => id != null))];
    const userMap = await attackService.getUsersByIds(attackerIds);
    res.json(attacks.map((a) => {
      const u = a.attackerUserId != null ? userMap.get(a.attackerUserId) : undefined;
      const attackerUsername = u?.username ?? (a.attackerUserId == null ? 'Rogue AI' : undefined);
      return serializeAttack({
        ...a,
        attackerUsername,
        attackerIsSupporter: u?.isSupporter,
        attackerSupporterTier: u?.supporterTier,
        attackerAvatarUrl: a.attackerUserId != null ? avatarUrl(a.attackerUserId, u?.avatarKey ?? null) : null,
        attackerAvatarUrlSm: a.attackerUserId != null ? avatarUrlSm(a.attackerUserId, u?.avatarKey ?? null) : null,
      });
    }));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'attackController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getOutgoingAttacks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nexus = await attackService.getNexusById(parseInt(req.params.nexusId));
    if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const attacks = await attackService.getOutgoingAttacks(nexus.id);
    const defenderIds = [...new Set(attacks.map((a) => a.defenderUserId).filter((id): id is number => id != null))];
    const userMap = await attackService.getUsersByIds(defenderIds);
    res.json(attacks.map((a) => {
      const u = a.defenderUserId != null ? userMap.get(a.defenderUserId) : undefined;
      return serializeAttack({
        ...a,
        defenderUsername: u?.username,
        defenderIsSupporter: u?.isSupporter,
        defenderSupporterTier: u?.supporterTier,
        defenderAvatarUrl: a.defenderUserId != null ? avatarUrl(a.defenderUserId, u?.avatarKey ?? null) : null,
        defenderAvatarUrlSm: a.defenderUserId != null ? avatarUrlSm(a.defenderUserId, u?.avatarKey ?? null) : null,
      });
    }));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'attackController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
