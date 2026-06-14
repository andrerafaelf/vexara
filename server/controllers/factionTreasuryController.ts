import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { refreshResources } from '../models/Nexus.js';
import { notifyFactionUpdated } from '../services/warRoomSocket.js';

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

		await prisma.$transaction([
			prisma.nexus.update({
				where: { id: nexus.id },
				data: {
					biomass: refreshed.biomass - donBiomass,
					alloy: refreshed.alloy - donAlloy,
					ore: refreshed.ore - donOre,
					lastResourceUpdate: refreshed.lastResourceUpdate
				}
			}),
			prisma.faction.update({
				where: { id: factionId },
				data: {
					treasuryBiomass: { increment: donBiomass },
					treasuryAlloy: { increment: donAlloy },
					treasuryOre: { increment: donOre }
				}
			}),
			prisma.factionEvent.create({
				data: {
					factionId,
					type: 'treasury_donate',
					actorName: me?.username ?? 'Unknown',
					meta: JSON.stringify({ biomass: donBiomass, alloy: donAlloy, ore: donOre })
				}
			})
		]);

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

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { treasuryBiomass: true, treasuryAlloy: true, treasuryOre: true }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}
		if (
			faction.treasuryBiomass < cost.biomass ||
			faction.treasuryAlloy < cost.alloy ||
			faction.treasuryOre < cost.ore
		) {
			res.status(400).json({ error: 'Insufficient treasury funds' });
			return;
		}

		const me = await prisma.user.findUnique({
			where: { id: req.userId! },
			select: { username: true }
		});

		const expiresAt = new Date(Date.now() + parsedHours * 3600 * 1000);

		// Record the spend and log the event; active boost tracked as faction event meta
		await prisma.$transaction([
			prisma.faction.update({
				where: { id: factionId },
				data: {
					treasuryBiomass: { decrement: cost.biomass },
					treasuryAlloy: { decrement: cost.alloy },
					treasuryOre: { decrement: cost.ore }
				}
			}),
			prisma.factionEvent.create({
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
			})
		]);

		notifyFactionUpdated(factionId);
		res.json({ success: true, buff: { pct: parsedPct, hours: parsedHours, expiresAt } });
	} catch (err) {
		logError('treasury_spend_error', { message: (err as Error).message });
		res.status(500).json({ error: 'Internal server error' });
	}
}
