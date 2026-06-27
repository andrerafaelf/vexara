import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { refreshResources } from '../models/Nexus.js';
import { notifyFactionUpdated } from '../services/warRoomSocket.js';
import { ResourceConflictError } from '../services/nexusService.js';

const MAX_DONATE = 1_000_000;

// GET /factions/:id/treasury — returns faction treasury balances + recent log
export async function getTreasury(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id);
		const member = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: req.userId!, galaxyId: req.galaxyId! } },
			select: { factionId: true, role: true }
		});
		if (!member || member.factionId !== factionId) {
			res.status(403).json({ error: 'Not a member of this faction' });
			return;
		}
		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { treasuryBiomass: true, treasuryAlloy: true, treasuryOre: true }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}
		const recentEvents = await prisma.factionEvent.findMany({
			where: { factionId, type: { in: ['treasury_donate', 'treasury_spend'] } },
			orderBy: { createdAt: 'desc' },
			take: 20,
			select: { type: true, actorName: true, meta: true, createdAt: true }
		});
		res.json({
			treasury: {
				biomass: faction.treasuryBiomass,
				alloy: faction.treasuryAlloy,
				ore: faction.treasuryOre
			},
			log: recentEvents,
			myRole: member.role
		});
	} catch (err) {
		logError('treasury_get_error', { message: (err as Error).message });
		res.status(500).json({ error: 'Internal server error' });
	}
}

// POST /factions/:id/treasury/donate — any member donates from their nexus
export async function donate(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id);
		const { nexusId, biomass = 0, alloy = 0, ore = 0 } = req.body as {
			nexusId?: unknown;
			biomass?: unknown;
			alloy?: unknown;
			ore?: unknown;
		};

		const parsedNexusId = parseInt(String(nexusId));
		const donBiomass = Math.max(0, Math.min(MAX_DONATE, Math.floor(Number(biomass))));
		const donAlloy = Math.max(0, Math.min(MAX_DONATE, Math.floor(Number(alloy))));
		const donOre = Math.max(0, Math.min(MAX_DONATE, Math.floor(Number(ore))));

		if (!parsedNexusId || donBiomass + donAlloy + donOre === 0) {
			res.status(400).json({ error: 'Specify nexusId and at least one resource amount' });
			return;
		}

		const [member, nexus] = await Promise.all([
			prisma.factionMember.findUnique({
				where: { userId_galaxyId: { userId: req.userId!, galaxyId: req.galaxyId! } },
				select: { factionId: true, role: true }
			}),
			prisma.nexus.findUnique({ where: { id: parsedNexusId } })
		]);

		if (!member || member.factionId !== factionId) {
			res.status(403).json({ error: 'Not a member of this faction' });
			return;
		}
		if (!nexus || nexus.ownerId !== req.userId || nexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}

		const galaxy = await prisma.galaxy.findUnique({
			where: { id: req.galaxyId! },
			select: { speedMultiplier: true }
		});
		const refreshed = await refreshResources(nexus, galaxy?.speedMultiplier ?? 1.0);

		if (refreshed.biomass < donBiomass || refreshed.alloy < donAlloy || refreshed.ore < donOre) {
			res.status(400).json({ error: 'Insufficient resources' });
			return;
		}

		const me = await prisma.user.findUnique({
			where: { id: req.userId! },
			select: { username: true }
		});

		// Build per-field gte guards and decrements for any donated amount > 0.
		// Using conditional decrements instead of absolute writes eliminates the
		// race where two concurrent donate requests both read the same stale
		// balance and only one deduction actually lands (minting resources).
		const nexusWhereGuards: Record<string, { gte: number }> = {};
		const nexusDecrements: Record<string, { decrement: number }> = {};
		if (donBiomass > 0) { nexusWhereGuards.biomass = { gte: donBiomass }; nexusDecrements.biomass = { decrement: donBiomass }; }
		if (donAlloy > 0)   { nexusWhereGuards.alloy   = { gte: donAlloy };   nexusDecrements.alloy   = { decrement: donAlloy };   }
		if (donOre > 0)     { nexusWhereGuards.ore     = { gte: donOre };     nexusDecrements.ore     = { decrement: donOre };     }

		try {
			await prisma.$transaction(async (tx) => {
				const { count } = await tx.nexus.updateMany({
					where: { id: nexus.id, ...nexusWhereGuards },
					data: nexusDecrements
				});
				if (count === 0) throw new ResourceConflictError();

				await tx.faction.update({
					where: { id: factionId },
					data: {
						treasuryBiomass: { increment: donBiomass },
						treasuryAlloy: { increment: donAlloy },
						treasuryOre: { increment: donOre }
					}
				});
				await tx.factionEvent.create({
					data: {
						factionId,
						type: 'treasury_donate',
						actorName: me?.username ?? 'Unknown',
						meta: JSON.stringify({ biomass: donBiomass, alloy: donAlloy, ore: donOre })
					}
				});
			});
		} catch (err) {
			if (err instanceof ResourceConflictError) {
				res.status(409).json({ error: 'Insufficient resources - please retry' });
				return;
			}
			throw err;
		}

		notifyFactionUpdated(factionId);
		res.json({ success: true });
	} catch (err) {
		logError('treasury_donate_error', { message: (err as Error).message });
		res.status(500).json({ error: 'Internal server error' });
	}
}

// POST /factions/:id/treasury/spend — officers/leaders spend on a buff
// body: { buff: 'production_boost', pct: 10, hours: 24 }
export async function spend(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id);
		const { buff, pct, hours } = req.body as {
			buff?: unknown;
			pct?: unknown;
			hours?: unknown;
		};

		if (buff !== 'production_boost') {
			res.status(400).json({ error: 'Unknown buff type' });
			return;
		}

		const parsedPct = Math.floor(Number(pct));
		const parsedHours = Math.floor(Number(hours));

		// Allowed tiers: 5%/12h, 10%/24h, 15%/48h
		const BUFF_TIERS: Record<string, { biomass: number; alloy: number; ore: number }> = {
			'5:12':  { biomass: 500,  alloy: 500,  ore: 500 },
			'10:24': { biomass: 1500, alloy: 1500, ore: 1500 },
			'15:48': { biomass: 3500, alloy: 3500, ore: 3500 }
		};
		const tierKey = `${parsedPct}:${parsedHours}`;
		const cost = BUFF_TIERS[tierKey];
		if (!cost) {
			res.status(400).json({ error: 'Invalid buff tier. Allowed: 5%/12h, 10%/24h, 15%/48h' });
			return;
		}

		const member = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: req.userId!, galaxyId: req.galaxyId! } },
			select: { factionId: true, role: true }
		});
		if (!member || member.factionId !== factionId) {
			res.status(403).json({ error: 'Not a member of this faction' });
			return;
		}
		if (member.role === 'member') {
			res.status(403).json({ error: 'Only officers and leaders can spend treasury funds' });
			return;
		}

		// Verify faction exists first for a clean 404.
		const factionExists = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { id: true }
		});
		if (!factionExists) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const me = await prisma.user.findUnique({
			where: { id: req.userId! },
			select: { username: true }
		});

		const expiresAt = new Date(Date.now() + parsedHours * 3600 * 1000);

		// Deduct and audit in one transaction so a failed factionEvent.create
		// rolls the deduction back. The gte guard on updateMany still makes the
		// deduction an atomic check-and-deduct (count === 0 means insufficient
		// funds, or a concurrent spend drained the treasury first).
		const spendResult = await prisma.$transaction(async (tx) => {
			const { count } = await tx.faction.updateMany({
				where: {
					id: factionId,
					treasuryBiomass: { gte: cost.biomass },
					treasuryAlloy: { gte: cost.alloy },
					treasuryOre: { gte: cost.ore }
				},
				data: {
					treasuryBiomass: { decrement: cost.biomass },
					treasuryAlloy: { decrement: cost.alloy },
					treasuryOre: { decrement: cost.ore }
				}
			});
			if (count === 0) return { ok: false as const };
			await tx.factionEvent.create({
				data: {
					factionId,
					type: 'treasury_spend',
					actorName: me?.username ?? 'Unknown',
					meta: JSON.stringify({
						buff,
						pct: parsedPct,
						hours: parsedHours,
						cost,
						expiresAt: expiresAt.toISOString()
					})
				}
			});
			return { ok: true as const };
		});
		if (!spendResult.ok) {
			res.status(400).json({ error: 'Insufficient treasury funds' });
			return;
		}

		notifyFactionUpdated(factionId);
		res.json({ success: true, buff: { pct: parsedPct, hours: parsedHours, expiresAt } });
	} catch (err) {
		logError('treasury_spend_error', { message: (err as Error).message });
		res.status(500).json({ error: 'Internal server error' });
	}
}
