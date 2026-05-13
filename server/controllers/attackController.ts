import type { Response } from 'express';
import { applyQuestRewards, serializeAttack } from '../models/Nexus.js';
import * as attackService from '../services/attackService.js';
import type { AuthRequest } from '../types/index.js';
import { TROOP_STATS } from '../utils/combatMath.js';
import { normalizeTroopPayload, parsePositiveInt } from '../utils/validation.js';

const TROOP_KEYS = [
  'lancerDrone', 'assaultTrooper', 'breakerUnit', 'reconOperative', 'skimmerBike',
  'siegeMech', 'bulwarkGuard', 'suppressorTeam', 'disruptorUnit', 'interceptorBike',
  'annihilatorPlatform', 'overseer',
];
const SUPPORTED_ATTACK_TYPES = new Set(['attack', 'scout']);

export async function sendAttack(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { fromNexusId, toNexusId, troops, type = 'attack' } = req.body as {
      fromNexusId?: unknown; toNexusId?: unknown; troops?: unknown; type?: string;
    };
    const parsedFromNexusId = parsePositiveInt(fromNexusId);
    const parsedToNexusId = parsePositiveInt(toNexusId);
    if (!parsedFromNexusId || !parsedToNexusId) { res.status(400).json({ error: 'Invalid nexus IDs' }); return; }
    if (!SUPPORTED_ATTACK_TYPES.has(type!)) { res.status(400).json({ error: 'Unsupported mission type' }); return; }

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

    if (type === 'scout') {
      const reconOperatives = normalizedTroops.reconOperative || 0;
      const nonScout = TROOP_KEYS.filter((t) => t !== 'reconOperative').some((t) => normalizedTroops[t] > 0);
      if (reconOperatives <= 0 || nonScout) { res.status(400).json({ error: 'Scout missions require Recon Operatives only' }); return; }
    }
    if ((normalizedTroops.overseer || 0) > 1) { res.status(400).json({ error: 'Maximum 1 Overseer per strike' }); return; }

    const attackerRecord = attackerNexus as unknown as Record<string, number>;
    for (const [troopType, amount] of Object.entries(normalizedTroops)) {
      if ((attackerRecord[troopType] || 0) < amount) { res.status(400).json({ error: `Insufficient ${troopType}` }); return; }
    }

    const troopDeductions: Record<string, number> = {};
    for (const [troopType, amount] of Object.entries(normalizedTroops)) {
      troopDeductions[troopType] = (attackerRecord[troopType] || 0) - amount;
    }

    const distance = Math.sqrt(Math.pow(defenderNexus.x - attackerNexus.x, 2) + Math.pow(defenderNexus.y - attackerNexus.y, 2));
    let travelTimeMinutes: number;
    if (type === 'scout') {
      travelTimeMinutes = distance * 4;
    } else {
      const OVERSEER_EFFECTIVE_SPEED = 6;
      let minSpeed = Infinity;
      for (const [troopType, amount] of Object.entries(normalizedTroops)) {
        if (amount > 0 && (TROOP_STATS as Record<string, { speed: number }>)[troopType]) {
          const speed = troopType === 'overseer' ? OVERSEER_EFFECTIVE_SPEED : (TROOP_STATS as Record<string, { speed: number }>)[troopType].speed;
          if (speed < minSpeed) minSpeed = speed;
        }
      }
      travelTimeMinutes = distance * (4 + (28 - minSpeed) / 10);
    }
    const arrivesAt = new Date(Date.now() + travelTimeMinutes * 60 * 1000);

    const [attack, updatedAttackerNexus] = await attackService.createAttackAndDeductTroops(
      {
        galaxyId: req.galaxyId, attackerUserId: req.userId, attackerNexusId: parsedFromNexusId,
        defenderUserId: defenderNexus.ownerId ?? null, defenderNexusId: parsedToNexusId,
        troops: normalizedTroops, arrivesAt, type: type!,
      },
      attackerNexus.id,
      troopDeductions,
    );
    await applyQuestRewards(updatedAttackerNexus, { hasOutgoingStrike: true });
    res.json({ success: true, attack: serializeAttack(attack) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.json(attacks.map((a) => serializeAttack({ ...a, attackerUsername: a.attackerUserId != null ? userMap.get(a.attackerUserId) : undefined })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.json(attacks.map((a) => serializeAttack({ ...a, defenderUsername: a.defenderUserId != null ? userMap.get(a.defenderUserId) : undefined })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
