import prisma from '../lib/prisma.js';

export function getAllUsers() {
	return prisma.user.findMany({
		select: {
			id: true,
			username: true,
			email: true,
			createdAt: true,
			nexuses: true,
			galaxyPlayers: { select: { points: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
}

export function getAdminStats() {
	const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	return Promise.all([
		prisma.user.count(),
		prisma.nexus.count(),
		prisma.attack.count({ where: { status: 'traveling' } }),
		prisma.attack.count(),
		prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
		prisma.user.count({ where: { nexuses: { none: {} } } }),
		prisma.galaxyPlayer.findMany({
			select: { points: true, user: { select: { id: true, username: true } } },
			orderBy: { points: 'desc' },
			take: 10
		}),
		prisma.nexus.aggregate({
			_sum: {
				sentinelLancer: true,
				assaultTrooper: true,
				vanguardBreaker: true,
				reconOperative: true,
				wraithSkimmer: true,
				siegeMech: true,
				bulwarkGuard: true,
				aegisSkirmisher: true,
				pyreSuppressor: true,
				arcDisruptor: true,
				phantomLance: true,
				annihilatorPlatform: true,
				voidStalker: true,
				plasmaTurret: true,
				siegeColossus: true,
				overseer: true
			}
		}),
		prisma.galaxyPlayer.aggregate({ _avg: { points: true } }),
		prisma.marketListing.count(),
		prisma.gameEvent.count({
			where: { event: 'first_nexus_created', createdAt: { gte: oneWeekAgo } }
		}),
		prisma.gameEvent.count({
			where: { event: { in: ['first_attack', 'first_scout'] }, createdAt: { gte: oneWeekAgo } }
		}),
		prisma.gameEvent.count({ where: { event: 'joined_faction', createdAt: { gte: oneWeekAgo } } }),
		prisma.user.count({ where: { referredById: { not: null }, createdAt: { gte: oneWeekAgo } } }),
		prisma.user.groupBy({
			by: ['utmSource'],
			where: { createdAt: { gte: oneWeekAgo }, utmSource: { not: null } },
			_count: { id: true },
			orderBy: { _count: { id: 'desc' } },
			take: 8
		}),
		prisma.user.aggregate({ _sum: { referralClickCount: true } })
	]);
}

export function getUserById(id: number) {
	return prisma.user.findUnique({ where: { id } });
}

export function deleteUser(userId: number, villageIds: number[]) {
	return (async () => {
		await prisma.attack.deleteMany({
			where: {
				OR: [{ attackerNexusId: { in: villageIds } }, { defenderNexusId: { in: villageIds } }]
			}
		});
		await prisma.nexus.deleteMany({ where: { ownerId: userId } });
		await prisma.user.delete({ where: { id: userId } });
	})();
}

export function getNexusById(id: number) {
	return prisma.nexus.findUnique({ where: { id } });
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
	return prisma.nexus.update({ where: { id }, data });
}

export function getUserNexuses(userId: number) {
	return prisma.nexus.findMany({ where: { ownerId: userId }, select: { id: true } });
}

export function getAdminAttacks() {
	return prisma.attack.findMany({
		where: { status: 'traveling' },
		include: {
			attackerNexus: { select: { id: true, name: true, x: true, y: true } },
			defenderNexus: { select: { id: true, name: true, x: true, y: true } }
		},
		orderBy: { arrivesAt: 'asc' }
	});
}

export function getAttackById(id: number) {
	return prisma.attack.findUnique({ where: { id } });
}

export function updateAttack(id: number, data: Parameters<typeof prisma.attack.update>[0]['data']) {
	return prisma.attack.update({ where: { id }, data });
}
