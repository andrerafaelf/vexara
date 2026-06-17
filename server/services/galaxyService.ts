import prisma from '../lib/prisma.js';

// Beta Founder window. Founding a nexus on/after the beta launch
// (2026-06-28 18:30 UTC) grants the permanent Beta Founder badge. There is NO
// hard end date — the window stays open for the entire beta. To close it when
// beta ends, set BETA_FOUNDER_END to a date (leave null to keep it open).
// Players who founded earlier (pre-launch) do NOT qualify. Alpha is closed;
// isAlphaFounder is historical.
const BETA_FOUNDER_START = new Date('2026-06-28T18:30:00Z');
const BETA_FOUNDER_END: Date | null = null;

function isBetaFounderWindowOpen(): boolean {
	const now = new Date();
	if (now < BETA_FOUNDER_START) return false;
	if (BETA_FOUNDER_END && now > BETA_FOUNDER_END) return false;
	return true;
}

export function getAllGalaxies() {
	return prisma.galaxy.findMany({ orderBy: { createdAt: 'asc' } });
}

export function getMyGalaxyPlayers(userId: number) {
	return prisma.galaxyPlayer.findMany({ where: { userId }, select: { galaxyId: true } });
}

export function getUserWithGalaxy(userId: number) {
	return prisma.user.findUnique({
		where: { id: userId },
		select: { activeGalaxyId: true, activeGalaxy: true }
	});
}

export function getGalaxyById(id: number) {
	return prisma.galaxy.findUnique({ where: { id } });
}

export function getUserById(id: number) {
	return prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
}

export async function isGalaxyMember(userId: number, galaxyId: number): Promise<boolean> {
	const player = await prisma.galaxyPlayer.findUnique({
		where: { userId_galaxyId: { userId, galaxyId } },
		select: { id: true }
	});
	return player != null;
}

export function leaveGalaxy(userId: number, galaxyId: number) {
	return prisma.$transaction(async (tx) => {
		const player = await tx.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { id: true }
		});
		if (!player) {
			const err = Object.assign(new Error('Not a member of this galaxy'), { status: 400 });
			throw err;
		}
		const ownedNexuses = await tx.nexus.findMany({
			where: { galaxyId, ownerId: userId },
			select: { id: true }
		});
		const nexusIds = ownedNexuses.map((n) => n.id);
		if (nexusIds.length > 0) {
			await tx.attack.deleteMany({ where: { galaxyId, attackerNexusId: { in: nexusIds } } });
			await tx.troopTransfer.deleteMany({ where: { galaxyId, ownerNexusId: { in: nexusIds } } });
			await tx.troopTransfer.deleteMany({ where: { galaxyId, hostNexusId: { in: nexusIds } } });
			await tx.marketListing.deleteMany({ where: { galaxyId, sellerNexusId: { in: nexusIds } } });
			await tx.nexus.updateMany({
				where: { id: { in: nexusIds } },
				data: { ownerId: null, nexusType: 'Forward Base' }
			});
		}
		await tx.galaxyPlayer.delete({ where: { id: player.id } });
		await tx.user.updateMany({
			where: { id: userId, activeGalaxyId: galaxyId },
			data: { activeGalaxyId: null }
		});
	});
}

export function selectGalaxy(userId: number, username: string, galaxyId: number) {
	return prisma.$transaction(async (tx) => {
		const [existing, user] = await Promise.all([
			tx.galaxyPlayer.findUnique({
				where: { userId_galaxyId: { userId, galaxyId } },
				select: { id: true }
			}),
			tx.user.findUnique({ where: { id: userId }, select: { referredById: true } })
		]);
		if (!existing) {
			await tx.galaxyPlayer.create({ data: { userId, galaxyId } });
			const { createStarterNexus } = await import('../utils/starterNexus.js');
			await createStarterNexus(tx, {
				userId,
				username,
				galaxyId,
				referredById: user?.referredById
			});
		}
		// Establishing a starter nexus (joining any galaxy) grants Beta Founder
		// status while the beta window is open. Alpha is closed, so isAlphaFounder
			// is no longer granted. Idempotent: only flips false -> true, so re-joining or
		// joining a second galaxy never resets it.
		await tx.user.update({
			where: { id: userId },
			data: {
					activeGalaxyId: galaxyId,
					...(!existing && isBetaFounderWindowOpen() ? { isBetaFounder: true } : {})
				}
		});
		return { joined: !existing };
	});
}
