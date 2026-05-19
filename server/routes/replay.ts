// Public replay endpoint — no auth required.
// Returns the minimum data needed for the client-side combat simulator to
// reproduce the battle exactly. Designed for shareable links and embeds.

import { Router, type Response, type Request } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

router.get('/replay/:attackId', async (req: Request, res: Response) => {
  try {
    const attackId = parseInt(req.params.attackId);
    if (!Number.isFinite(attackId) || attackId <= 0) {
      res.status(400).json({ error: 'Invalid attack id' });
      return;
    }

    const attack = await prisma.attack.findUnique({
      where: { id: attackId },
      select: {
        id: true, type: true, status: true,
        troops: true, result: true,
        attackerNexus: { select: { name: true, x: true, y: true, owner: { select: { username: true } } } },
        defenderNexus: { select: { name: true, x: true, y: true, owner: { select: { username: true } } } },
        createdAt: true,
        arrivesAt: true,
      },
    });

    if (!attack) { res.status(404).json({ error: 'Replay not found' }); return; }
    if (attack.status === 'traveling') { res.status(425).json({ error: 'Battle not yet resolved' }); return; }
    if (attack.type === 'support') { res.status(404).json({ error: 'No replay for support missions' }); return; }

    const result = (attack.result || {}) as Record<string, unknown>;
    const payload = {
      id: String(attack.id),
      type: attack.type,
      attacker: {
        username: attack.attackerNexus?.owner?.username ?? null,
        nexusName: attack.attackerNexus?.name ?? null,
        x: attack.attackerNexus?.x ?? null,
        y: attack.attackerNexus?.y ?? null,
      },
      defender: {
        username: attack.defenderNexus?.owner?.username ?? null,
        nexusName: attack.defenderNexus?.name ?? null,
        x: attack.defenderNexus?.x ?? null,
        y: attack.defenderNexus?.y ?? null,
      },
      attackerInitial: (result.attackerInitial as object) ?? attack.troops,
      defenderInitial: (result.defenderInitial as object) ?? {},
      attackerLosses: result.attackerLosses ?? {},
      defenderLosses: result.defenderLosses ?? {},
      attackerPower: result.attackerPower ?? null,
      defenderPower: result.defenderPower ?? null,
      victory: !!result.victory,
      conquered: !!result.conquered,
      resourcesStolen: result.resourcesStolen ?? { biomass: 0, alloy: 0, ore: 0 },
      buildingDamage: result.buildingDamage ?? null,
      mission: result.mission ?? null,
      intel: result.intel ?? null,
      combatSeed: typeof result.combatSeed === 'number' ? result.combatSeed : attack.id * 2654435761,
      createdAt: attack.createdAt.toISOString(),
      arrivesAt: attack.arrivesAt?.toISOString() ?? null,
    };

    // Replays are immutable once resolved — cache hard for 24h.
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
