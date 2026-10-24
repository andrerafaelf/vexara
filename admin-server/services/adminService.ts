// Get alpha signups who haven't created an account yet
export async function getPendingAlphaSignups() {
	// Find all AlphaSignup emails not present in User
	const signups = await prisma.alphaSignup.findMany({ select: { email: true, createdAt: true } });
	const users = await prisma.user.findMany({ select: { email: true } });
	const userEmails = new Set(users.map((u) => u.email.toLowerCase()));
	return signups
		.filter((s) => !userEmails.has(s.email.toLowerCase()))
		.sort((a, b) => a.email.localeCompare(b.email));
}
import prisma from '../../server/lib/prisma.js';
import { hashPassword } from '../../server/models/User.js';
import { generateUniqueReferralCode } from '../../server/services/referralService.js';
import { getPopulationMax } from '../../server/utils/population.js';

const TROOP_KEYS = [
	'sentinelLancer',
	'assaultTrooper',
	'vanguardBreaker',
	'reconOperative',
	'wraithSkimmer',
	'siegeMech',
	'bulwarkGuard',
	'aegisSkirmisher',
	'pyreSuppressor',
	'arcDisruptor',
	'phantomLance',
	'voidStalker',
	'plasmaTurret',
	'annihilatorPlatform',
	'siegeColossus',
	'overseer'
] as const;

export async function getOverviewStats() {
	const now = new Date();
	const days = 14;
	const buckets: { date: string; users: number; attacks: number }[] = [];

	// Build 14-day buckets in parallel
	const promises = Array.from({ length: days }, (_, i) => {
		const dayStart = new Date(now);
		dayStart.setDate(dayStart.getDate() - (days - 1 - i));
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(dayStart);
		dayEnd.setHours(23, 59, 59, 999);
		return Promise.all([
			prisma.user.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
			prisma.attack.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
			dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		]);
	});

	const results = await Promise.all(promises);
	for (const [users, attacks, date] of results) {
		buckets.push({ date: date as string, users: users as number, attacks: attacks as number });
	}

	const [
		totalUsers,
		totalNexuses,
		totalAttacks,
		totalFactions,
		totalActiveGalaxies,
		totalMarketListings,
		totalFlaggedUsers,
		totalUnverified,
		totalWarOperations,
		recentAttacks
	] = await Promise.all([
		prisma.user.count(),
		prisma.nexus.count(),
		prisma.attack.count(),
		prisma.faction.count(),
		prisma.galaxy.count({ where: { status: 'active' } }),
		prisma.marketListing.count(),
		prisma.user.count({ where: { isFlagged: true } }),
		prisma.user.count({ where: { emailVerifiedAt: null } }),
		prisma.warOperation.count({ where: { status: { in: ['planning', 'locked', 'launched'] } } }),
		prisma.attack.findMany({
			where: { status: 'traveling' },
			include: {
				attackerNexus: { select: { name: true } },
				defenderNexus: { select: { name: true } }
			},
			orderBy: { arrivesAt: 'asc' },
			take: 10
		})
	]);

	return {
		totals: {
			users: totalUsers,
			nexuses: totalNexuses,
			attacks: totalAttacks,
			factions: totalFactions,
			activeGalaxies: totalActiveGalaxies,
			marketListings: totalMarketListings,
			flaggedUsers: totalFlaggedUsers,
			unverifiedUsers: totalUnverified,
			activeWarOps: totalWarOperations
		},
		activityChart: buckets,
		recentAttacks: recentAttacks.map((a) => ({
			id: a.id,
			type: a.type,
			status: a.status,
			attackerNexus: a.attackerNexus?.name ?? 'Unknown',
			defenderNexus: a.defenderNexus?.name ?? 'Unknown',
			arrivesAt: a.arrivesAt
		}))
	};
}

// Per-galaxy health metrics: player counts, recent activity, churn signals.
export async function getGalaxyHealth() {
	const cutoff7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
	const cutoff24h = new Date(Date.now() - 24 * 3600 * 1000);

	const activeGalaxies = await prisma.galaxy.findMany({
		where: { status: 'active' },
		select: {
			id: true,
			name: true,
			speedMultiplier: true,
			_count: { select: { players: true, nexuses: true } }
		},
		orderBy: { createdAt: 'asc' }
	});

	const health = await Promise.all(
		activeGalaxies.map(async (g) => {
			const [attacks24h, attacks7d, newPlayers7d, factionCount] = await Promise.all([
				prisma.attack.count({
					where: { galaxyId: g.id, createdAt: { gte: cutoff24h } }
				}),
				prisma.attack.count({
					where: { galaxyId: g.id, createdAt: { gte: cutoff7d } }
				}),
				prisma.galaxyPlayer.count({
					where: { galaxyId: g.id, joinedAt: { gte: cutoff7d } }
				}),
				prisma.faction.count({ where: { galaxyId: g.id } })
			]);
			return {
				id: g.id,
				name: g.name,
				speedMultiplier: g.speedMultiplier,
				players: g._count.players,
				nexuses: g._count.nexuses,
				factions: factionCount,
				attacks24h,
				attacks7d,
				newPlayers7d
			};
		})
	);

	return health;
}

export const toInt = (value: unknown, fallback = 0) => {
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export function getAllGalaxies() {
	return prisma.galaxy.findMany({
		orderBy: { createdAt: 'asc' },
		include: { _count: { select: { players: true, nexuses: true } } }
	});
}

export function createGalaxy(name: string, startsAt?: Date) {
	return prisma.galaxy.create({ data: { name, ...(startsAt ? { startsAt } : {}) } });
}

export function getGalaxyByName(name: string) {
	return prisma.galaxy.findUnique({ where: { name } });
}

export function getGalaxyById(id: number) {
	return prisma.galaxy.findUnique({ where: { id } });
}

// Admin update for a galaxy's lock state and per-galaxy win config. Only the keys
// present in `data` are written; pass null for a win* field to clear an override and
// fall back to the engine default in server/utils/dominance.ts.
export function getAppConfig() {
	return prisma.appConfig.findUnique({ where: { id: 1 } });
}

export function setAppConfig(data: { seasonEndsAt?: Date | null }) {
	return prisma.appConfig.upsert({
		where: { id: 1 },
		create: { id: 1, ...data },
		update: { ...data },
	});
}

export function updateGalaxy(
	id: number,
	data: {
		isLocked?: boolean;
		winShare?: number | null;
		winSustainHours?: number | null;
		winMinPlayers?: number | null;
		winMinFactions?: number | null;
		speedMultiplier?: number;
	}
) {
	return prisma.galaxy.update({ where: { id }, data });
}

export function getAllUsers() {
	return prisma.user.findMany({
		select: {
			id: true,
			username: true,
			email: true,
			createdAt: true,
			emailVerifiedAt: true,
			emailVerificationToken: true,
			isFlagged: true,
			flagReason: true,
			flaggedAt: true,
			registrationIp: true,
			_count: { select: { galaxyPlayers: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
}

export function getUsersInGalaxy(galaxyId: number) {
	return prisma.user.findMany({
		where: { galaxyPlayers: { some: { galaxyId } } },
		select: {
			id: true,
			username: true,
			email: true,
			createdAt: true,
			nexuses: {
				where: { galaxyId },
				select: {
					id: true,
					name: true,
					conqueredAt: true,
					biomass: true,
					alloy: true,
					ore: true,
					populationCurrent: true,
					populationMax: true,
					commandCore: true,
					hangarBay: true,
					plasmaForge: true,
					armorFoundry: true,
					lifeSupport: true,
					storageVault: true,
					biomassFarm: true,
					alloyForge: true,
					oreExtractor: true,
					shieldGrid: true,
					targetingCore: true,
					stealthArray: true,
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
					voidStalker: true,
					plasmaTurret: true,
					annihilatorPlatform: true,
					siegeColossus: true,
					overseer: true
				}
			},
			galaxyPlayers: { where: { galaxyId }, select: { galaxyId: true, points: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
}

export function getAdminStatsForGalaxy(galaxyId: number) {
	const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const troopSumSelect = TROOP_KEYS.reduce<Record<string, boolean>>((acc, key) => {
		acc[key] = true;
		return acc;
	}, {});
	return Promise.all([
		prisma.galaxyPlayer.count({ where: { galaxyId } }),
		prisma.nexus.count({ where: { galaxyId } }),
		prisma.attack.count({ where: { galaxyId, status: 'traveling' } }),
		prisma.attack.count({ where: { galaxyId } }),
		prisma.galaxyPlayer.count({ where: { galaxyId, user: { createdAt: { gte: oneWeekAgo } } } }),
		prisma.galaxyPlayer.aggregate({ where: { galaxyId }, _avg: { points: true } }),
		prisma.marketListing.count({ where: { galaxyId } }),
		prisma.nexus.findMany({ where: { galaxyId, ownerId: { not: null } }, select: troopSumSelect }),
		prisma.user.count({
			where: { galaxyPlayers: { some: { galaxyId } }, nexuses: { some: { galaxyId } } }
		}),
		prisma.galaxyPlayer.findMany({
			where: { galaxyId },
			select: { userId: true, points: true, user: { select: { id: true, username: true } } },
			orderBy: { points: 'desc' },
			take: 10
		}),
		prisma.faction.count({ where: { galaxyId } })
	]);
}

export function createUser(username: string, email: string, password: string) {
	return hashPassword(password).then(async (hashedPassword) => {
		const referralCode = await generateUniqueReferralCode();
		// Do NOT auto-join a galaxy or create a nexus, the user picks a galaxy themselves on first login.
		// isAlphaFounder is NOT granted here - it's earned when the player creates
		// their first nexus (see galaxyService.selectGalaxy). Defaults to false.
		const user = await prisma.user.create({
			data: {
				username,
				email: email.toLowerCase(),
				password: hashedPassword,
				referralCode
			}
		});
		return { user };
	});
}

export function getUserById(id: number) {
	return prisma.user.findUnique({ where: { id } });
}

export async function updateUserCredentials(
	userId: number,
	username?: string,
	email?: string,
	password?: string
) {
	const data: Record<string, string> = {};
	if (username) {
		const usernameOwner = await prisma.user.findFirst({
			where: { username: { equals: username, mode: 'insensitive' }, NOT: { id: userId } }
		});
		if (usernameOwner)
			throw Object.assign(new Error('Username is already in use'), { status: 400 });
		data.username = username;
	}
	if (email) {
		const normalizedEmail = email.toLowerCase();
		const emailOwner = await prisma.user.findFirst({
			where: { email: normalizedEmail, NOT: { id: userId } }
		});
		if (emailOwner) throw Object.assign(new Error('Email is already in use'), { status: 400 });
		data.email = normalizedEmail;
	}
	if (password) data.password = await hashPassword(password);
	if (!Object.keys(data).length)
		throw Object.assign(new Error('No changes provided'), { status: 400 });
	return prisma.user.update({ where: { id: userId }, data });
}

export function findTargetNexus(userId: number, galaxyId: number, nexusId?: unknown) {
	if (nexusId)
		return prisma.nexus.findFirst({ where: { id: toInt(nexusId), ownerId: userId, galaxyId } });
	return prisma.nexus.findFirst({
		where: { ownerId: userId, galaxyId },
		orderBy: { createdAt: 'asc' }
	});
}

export async function findUserNexusWithQueue(userId: number, galaxyId: number, queueKey: string) {
	const nexuses = await prisma.nexus.findMany({
		where: { ownerId: userId, galaxyId },
		orderBy: { createdAt: 'asc' }
	});
	return (
		nexuses.find(
			(n) =>
				Array.isArray((n as unknown as Record<string, unknown>)[queueKey]) &&
				((n as unknown as Record<string, unknown>)[queueKey] as unknown[]).length > 0
		) || null
	);
}

export function updateNexus(id: number, data: Parameters<typeof prisma.nexus.update>[0]['data']) {
	return prisma.nexus.update({ where: { id }, data });
}

export function getAttack(attackerUserId: number, galaxyId: number) {
	return prisma.attack.findFirst({
		where: { attackerUserId, galaxyId, status: 'traveling' },
		orderBy: { arrivesAt: 'asc' }
	});
}

export function updateAttack(id: number, data: Parameters<typeof prisma.attack.update>[0]['data']) {
	return prisma.attack.update({ where: { id }, data });
}

export function deleteUser(userId: number) {
	return (async () => {
		const villages = await prisma.nexus.findMany({
			where: { ownerId: userId },
			select: { id: true }
		});
		const ids = villages.map((v) => v.id);
		await prisma.attack.deleteMany({
			where: { OR: [{ attackerNexusId: { in: ids } }, { defenderNexusId: { in: ids } }] }
		});
		await prisma.nexus.deleteMany({ where: { ownerId: userId } });
		await prisma.user.delete({ where: { id: userId } });
	})();
}

export function resetUserAccount(userId: number, username: string, galaxyId: number) {
	return (async () => {
		const targetGalaxy = await prisma.galaxy.findUnique({
			where: { id: galaxyId },
			select: { id: true, status: true }
		});
		if (!targetGalaxy) throw new Error('Galaxy not found');
		if (targetGalaxy.status !== 'active') throw new Error('Cannot reset into a non-active galaxy');
		const STARTER_NEXUS_DATA = {
			commandCore: 0,
			hangarBay: 0,
			plasmaForge: 0,
			armorFoundry: 0,
			lifeSupport: 1,
			storageVault: 1,
			biomassFarm: 1,
			alloyForge: 1,
			oreExtractor: 1,
			shieldGrid: 0
		};
		return prisma.$transaction(async (tx) => {
			const userNexuses = await tx.nexus.findMany({
				where: { ownerId: userId, galaxyId },
				select: { id: true }
			});
			const nexusIds = userNexuses.map((n) => n.id);
			if (nexusIds.length > 0)
				await tx.attack.deleteMany({
					where: {
						OR: [{ attackerNexusId: { in: nexusIds } }, { defenderNexusId: { in: nexusIds } }]
					}
				});
			await tx.attack.deleteMany({
				where: { galaxyId, OR: [{ attackerUserId: userId }, { defenderUserId: userId }] }
			});
			await tx.nexus.deleteMany({ where: { ownerId: userId, galaxyId } });
			await tx.galaxyPlayer.updateMany({
				where: { userId, galaxyId },
				data: { points: 0, questRewardClaims: [], completedQuestIds: [], nexusGroups: [] }
			});
			await tx.galaxyPlayer.upsert({
				where: { userId_galaxyId: { userId, galaxyId } },
				create: { userId, galaxyId },
				update: {}
			});
			await tx.user.update({ where: { id: userId }, data: { activeGalaxyId: galaxyId } });
			return tx.nexus.create({
				data: {
					name: `${username}'s Nexus`,
					ownerId: userId,
					galaxyId,
					x: Math.floor(Math.random() * 25),
					y: Math.floor(Math.random() * 25),
					...STARTER_NEXUS_DATA,
					buildQueue: [],
					trainingQueue: [],
					populationCurrent: 5,
					populationMax: getPopulationMax(STARTER_NEXUS_DATA.lifeSupport),
					biomass: 500,
					alloy: 500,
					ore: 500,
					controlLevel: 100,
					points: 5,
					lastResourceUpdate: new Date()
				}
			});
		});
	})();
}

export function deleteNexus(nexusId: number) {
	return (async () => {
		const { default: prismaClient } = await import('../../server/lib/prisma.js');
		await prismaClient.attack.deleteMany({
			where: { OR: [{ attackerNexusId: nexusId }, { defenderNexusId: nexusId }] }
		});
		await prismaClient.nexus.delete({ where: { id: nexusId } });
	})();
}

export function getAdminAttacks(galaxyId: number) {
	return prisma.attack.findMany({
		where: { galaxyId, status: 'traveling' },
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

// In-motion troop transfers (own-nexus reinforcements). These live in a separate
// table from attacks, so the strikes list never showed them - this surfaces them
// for operators. Includes the owning user via the source nexus.
export function getAdminTroopTransfers(galaxyId: number) {
	return prisma.troopTransfer.findMany({
		where: { galaxyId, status: { in: ['traveling', 'returning'] } },
		include: {
			ownerNexus: { select: { id: true, name: true, x: true, y: true, ownerId: true } },
			hostNexus: { select: { id: true, name: true, x: true, y: true } }
		},
		orderBy: { arrivesAt: 'asc' }
	});
}

export function getTransferById(id: number) {
	return prisma.troopTransfer.findUnique({ where: { id } });
}

export function updateTransfer(
	id: number,
	data: Parameters<typeof prisma.troopTransfer.update>[0]['data']
) {
	return prisma.troopTransfer.update({ where: { id }, data });
}

export async function getAttackUsernames(
	attackerUserId: number | null,
	defenderUserId: number | null
) {
	const userIds = [attackerUserId, defenderUserId].filter((id): id is number => id != null);
	if (!userIds.length) return new Map<number, string>();
	const users = await prisma.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true, username: true }
	});
	return new Map(users.map((u) => [u.id, u.username]));
}

export function getUserByField(field: string, value: string) {
	return prisma.user.findFirst({
		where: {
			OR: [{ username: { equals: value, mode: 'insensitive' } }, { email: value.toLowerCase() }]
		}
	});
}

export function sendTestNotification(userId: number) {
	return prisma.pushSubscription.count({ where: { userId } });
}

export async function getFactionsInGalaxy(galaxyId: number) {
	const factions = await prisma.faction.findMany({
		where: { galaxyId },
		include: {
			members: {
				include: {
					user: {
						select: {
							id: true,
							username: true,
							email: true,
							galaxyPlayers: { where: { galaxyId }, select: { points: true } },
							nexuses: { where: { galaxyId }, select: { id: true } }
						}
					}
				},
				orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
			},
			_count: {
				select: {
					members: true,
					invites: true,
					joinRequests: true,
					targets: true
				}
			}
		},
		orderBy: { createdAt: 'asc' }
	});

	const factionIds = factions.map((f) => f.id);
	const [activeWars, pendingWars, activeTreaties] = await Promise.all([
		prisma.factionWar.findMany({
			where: {
				galaxyId,
				status: 'active',
				OR: [{ declarerFactionId: { in: factionIds } }, { targetFactionId: { in: factionIds } }]
			},
			select: { declarerFactionId: true, targetFactionId: true }
		}),
		prisma.factionWar.findMany({
			where: {
				galaxyId,
				status: { in: ['pending', 'ceasefire_pending'] },
				OR: [{ declarerFactionId: { in: factionIds } }, { targetFactionId: { in: factionIds } }]
			},
			select: { declarerFactionId: true, targetFactionId: true }
		}),
		prisma.factionTreaty.findMany({
			where: {
				galaxyId,
				status: 'active',
				OR: [{ proposerFactionId: { in: factionIds } }, { targetFactionId: { in: factionIds } }]
			},
			select: { proposerFactionId: true, targetFactionId: true }
		})
	]);

	const activeWarCount = new Map<number, number>();
	for (const war of activeWars) {
		activeWarCount.set(war.declarerFactionId, (activeWarCount.get(war.declarerFactionId) ?? 0) + 1);
		activeWarCount.set(war.targetFactionId, (activeWarCount.get(war.targetFactionId) ?? 0) + 1);
	}

	const pendingWarCount = new Map<number, number>();
	for (const war of pendingWars) {
		pendingWarCount.set(
			war.declarerFactionId,
			(pendingWarCount.get(war.declarerFactionId) ?? 0) + 1
		);
		pendingWarCount.set(war.targetFactionId, (pendingWarCount.get(war.targetFactionId) ?? 0) + 1);
	}

	const treatyCount = new Map<number, number>();
	for (const treaty of activeTreaties) {
		treatyCount.set(treaty.proposerFactionId, (treatyCount.get(treaty.proposerFactionId) ?? 0) + 1);
		treatyCount.set(treaty.targetFactionId, (treatyCount.get(treaty.targetFactionId) ?? 0) + 1);
	}

	return factions.map((f) => {
		const members = f.members.map((m) => ({
			_id: String(m.id),
			id: m.id,
			userId: m.userId,
			username: m.user.username,
			email: m.user.email,
			role: m.role,
			joinedAt: m.joinedAt,
			points: m.user.galaxyPlayers[0]?.points ?? 0,
			nexusCount: m.user.nexuses.length
		}));
		return {
			_id: String(f.id),
			id: f.id,
			galaxyId: f.galaxyId,
			name: f.name,
			tag: f.tag,
			description: f.description,
			motd: f.motd,
			createdAt: f.createdAt,
			dominanceSince: f.dominanceSince,
			memberCount: f._count.members,
			inviteCount: f._count.invites,
			joinRequestCount: f._count.joinRequests,
			targetCount: f._count.targets,
			activeWarCount: activeWarCount.get(f.id) ?? 0,
			pendingWarCount: pendingWarCount.get(f.id) ?? 0,
			activeTreatyCount: treatyCount.get(f.id) ?? 0,
			totalPoints: members.reduce((sum, m) => sum + m.points, 0),
			nexusCount: members.reduce((sum, m) => sum + m.nexusCount, 0),
			members
		};
	});
}

export function getFactionById(factionId: number) {
	return prisma.faction.findUnique({ where: { id: factionId } });
}

export function updateFactionMemberRole(
	factionId: number,
	memberId: number,
	role: 'leader' | 'officer' | 'member'
) {
	return prisma.$transaction(async (tx) => {
		const member = await tx.factionMember.findFirst({ where: { id: memberId, factionId } });
		if (!member) throw Object.assign(new Error('Faction member not found'), { status: 404 });
		if (role === 'leader') {
			await tx.factionMember.updateMany({
				where: { factionId, role: 'leader' },
				data: { role: 'officer' }
			});
		} else if (member.role === 'leader') {
			const nextLeader = await tx.factionMember.findFirst({
				where: { factionId, NOT: { id: memberId } },
				orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
			});
			if (!nextLeader)
				throw Object.assign(new Error('A faction must have at least one leader'), { status: 400 });
			await tx.factionMember.update({ where: { id: nextLeader.id }, data: { role: 'leader' } });
		}
		return tx.factionMember.update({ where: { id: memberId }, data: { role } });
	});
}

export function kickFactionMember(factionId: number, memberId: number) {
	return prisma.$transaction(async (tx) => {
		const member = await tx.factionMember.findFirst({
			where: { id: memberId, factionId },
			include: {
				user: { select: { username: true } },
				faction: { select: { name: true, tag: true } }
			}
		});
		if (!member) throw Object.assign(new Error('Faction member not found'), { status: 404 });

		const remaining = await tx.factionMember.findMany({
			where: { factionId, NOT: { id: memberId } },
			orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
		});

		if (remaining.length === 0) {
			await tx.warOperation.deleteMany({ where: { factionId } });
			await tx.faction.delete({ where: { id: factionId } });
			return { disbanded: true, username: member.user.username, factionName: member.faction.name };
		}

		await tx.factionMember.delete({ where: { id: memberId } });
		if (member.role === 'leader' && !remaining.some((m) => m.role === 'leader')) {
			const nextLeader = remaining.find((m) => m.role === 'officer') ?? remaining[0];
			await tx.factionMember.update({ where: { id: nextLeader.id }, data: { role: 'leader' } });
		}
		return { disbanded: false, username: member.user.username, factionName: member.faction.name };
	});
}

// Marks the email verified and clears any pending token. Conditional on
// emailVerifiedAt being null so a concurrent real verification is never overwritten.
export async function markEmailVerified(userId: number): Promise<boolean> {
	const res = await prisma.user.updateMany({
		where: { id: userId, emailVerifiedAt: null },
		data: {
			emailVerifiedAt: new Date(),
			emailVerificationToken: null,
			emailVerificationTokenExpiresAt: null
		}
	});
	return res.count > 0;
}

export function flagUser(userId: number, reason: string) {
	return prisma.user.update({
		where: { id: userId },
		data: { isFlagged: true, flagReason: reason, flaggedAt: new Date() }
	});
}

export function unflagUser(userId: number) {
	return prisma.user.update({
		where: { id: userId },
		data: { isFlagged: false, flagReason: null, flaggedAt: null }
	});
}

export function getFlaggedUsers() {
	return prisma.user.findMany({
		where: { isFlagged: true },
		select: {
			id: true,
			username: true,
			email: true,
			createdAt: true,
			isFlagged: true,
			flagReason: true,
			flaggedAt: true,
			emailVerifiedAt: true,
			emailVerificationToken: true,
			registrationIp: true,
			_count: { select: { galaxyPlayers: true } }
		},
		orderBy: { flaggedAt: 'desc' }
	});
}

export function disbandFaction(factionId: number) {
	return prisma.$transaction(async (tx) => {
		const faction = await tx.faction.findUnique({
			where: { id: factionId },
			select: { id: true, name: true, tag: true }
		});
		if (!faction) throw Object.assign(new Error('Faction not found'), { status: 404 });
		await tx.warOperation.deleteMany({ where: { factionId } });
		await tx.faction.delete({ where: { id: factionId } });
		return faction;
	});
}

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function countEvent(event: string, since?: Date) {
	return prisma.gameEvent.count({
		where: { event, ...(since ? { createdAt: { gte: since } } : {}) }
	});
}

function distinctUsersWithEvent(event: string, since?: Date) {
	return prisma.gameEvent
		.findMany({
			where: { event, ...(since ? { createdAt: { gte: since } } : {}) },
			select: { userId: true },
			distinct: ['userId']
		})
		.then((rows) => rows.length);
}

export async function getActivationFunnel() {
	const [
		totalRegistered,
		totalVerified,
		totalFirstNexus,
		totalFirstBuild,
		totalFirstTrain,
		totalFirstAttack,
		totalFirstScout,
		totalJoinedFaction
	] = await Promise.all([
		prisma.user.count(),
		prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
		distinctUsersWithEvent('first_nexus_created'),
		distinctUsersWithEvent('first_build'),
		distinctUsersWithEvent('first_train'),
		distinctUsersWithEvent('first_attack'),
		distinctUsersWithEvent('first_scout'),
		distinctUsersWithEvent('joined_faction')
	]);

	// Retention cohorts: for each cohort window, count users who registered
	// within that window AND had any GameEvent after their cohort day.
	async function retentionRate(cohortDays: number, returnAfterDays: number) {
		const cohortStart = daysAgo(cohortDays + returnAfterDays);
		const cohortEnd = daysAgo(returnAfterDays);
		const cohortUsers = await prisma.user.findMany({
			where: { createdAt: { gte: cohortStart, lte: cohortEnd } },
			select: { id: true, createdAt: true }
		});
		if (cohortUsers.length === 0) return { cohort: cohortUsers.length, returned: 0, rate: 0 };
		const returned = await Promise.all(
			cohortUsers.map((u) =>
				prisma.gameEvent
					.count({
						where: {
							userId: u.id,
							createdAt: {
								gte: new Date(u.createdAt.getTime() + returnAfterDays * 24 * 60 * 60 * 1000)
							}
						}
					})
					.then((n) => (n > 0 ? 1 : 0))
			)
		);
		const returnedCount = returned.reduce<number>((a, b) => a + b, 0);
		return {
			cohort: cohortUsers.length,
			returned: returnedCount,
			rate: cohortUsers.length > 0 ? Math.round((returnedCount / cohortUsers.length) * 100) : 0
		};
	}

	const [d1, d3, d7] = await Promise.all([
		retentionRate(14, 1),
		retentionRate(14, 3),
		retentionRate(14, 7)
	]);

	// Average minutes from registration to first_nexus_created
	const firstNexusEvents = await prisma.gameEvent.findMany({
		where: { event: 'first_nexus_created' },
		select: { userId: true, createdAt: true }
	});
	let avgMinutesToFirstAction = 0;
	if (firstNexusEvents.length > 0) {
		const userIds = firstNexusEvents.map((e) => e.userId);
		const users = await prisma.user.findMany({
			where: { id: { in: userIds } },
			select: { id: true, createdAt: true }
		});
		const userMap = new Map(users.map((u) => [u.id, u.createdAt]));
		const deltas = firstNexusEvents
			.map((e) => {
				const reg = userMap.get(e.userId);
				return reg ? (e.createdAt.getTime() - reg.getTime()) / 60000 : null;
			})
			.filter((d): d is number => d !== null && d >= 0 && d < 60 * 24 * 7);
		avgMinutesToFirstAction =
			deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;
	}

	const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

	return {
		funnel: [
			{ step: 'Registered', count: totalRegistered, pct: 100 },
			{ step: 'Verified email', count: totalVerified, pct: pct(totalVerified, totalRegistered) },
			{ step: 'Created nexus', count: totalFirstNexus, pct: pct(totalFirstNexus, totalRegistered) },
			{ step: 'First build', count: totalFirstBuild, pct: pct(totalFirstBuild, totalRegistered) },
			{ step: 'First train', count: totalFirstTrain, pct: pct(totalFirstTrain, totalRegistered) },
			{
				step: 'First attack',
				count: totalFirstAttack,
				pct: pct(totalFirstAttack, totalRegistered)
			},
			{ step: 'First scout', count: totalFirstScout, pct: pct(totalFirstScout, totalRegistered) },
			{
				step: 'Joined faction',
				count: totalJoinedFaction,
				pct: pct(totalJoinedFaction, totalRegistered)
			}
		],
		retention: { d1, d3, d7 },
		avgMinutesToFirstAction
	};
}

export async function getEngagementStats() {
	const now = new Date();
	const since24h = daysAgo(1);
	const since7d = daysAgo(7);
	const since30d = daysAgo(30);

	// Active player counts (distinct users with a GameEvent in window)
	const [active24h, active7d, active30d] = await Promise.all([
		prisma.gameEvent
			.findMany({
				where: { createdAt: { gte: since24h } },
				select: { userId: true },
				distinct: ['userId']
			})
			.then((r) => r.length),
		prisma.gameEvent
			.findMany({
				where: { createdAt: { gte: since7d } },
				select: { userId: true },
				distinct: ['userId']
			})
			.then((r) => r.length),
		prisma.gameEvent
			.findMany({
				where: { createdAt: { gte: since30d } },
				select: { userId: true },
				distinct: ['userId']
			})
			.then((r) => r.length)
	]);

	// Attack stats
	const [attacksLast7d, pvpAttacksLast7d, pveAttacksLast7d, attackersLast7d, defendersLast7d] =
		await Promise.all([
			prisma.attack.count({ where: { type: 'attack', createdAt: { gte: since7d } } }),
			prisma.attack.count({
				where: { type: 'attack', defenderUserId: { not: null }, createdAt: { gte: since7d } }
			}),
			prisma.attack.count({
				where: { type: 'attack', defenderUserId: null, createdAt: { gte: since7d } }
			}),
			prisma.attack
				.findMany({
					where: { type: 'attack', createdAt: { gte: since7d } },
					select: { attackerUserId: true },
					distinct: ['attackerUserId']
				})
				.then((r) => r.filter((a) => a.attackerUserId != null).length),
			prisma.attack
				.findMany({
					where: { type: 'attack', defenderUserId: { not: null }, createdAt: { gte: since7d } },
					select: { defenderUserId: true },
					distinct: ['defenderUserId']
				})
				.then((r) => r.length)
		]);

	// Attacks per day for the last 14 days
	const attacksPerDay: { date: string; attacks: number; pvp: number; pve: number }[] = [];
	const dayPromises = Array.from({ length: 14 }, (_, i) => {
		const dayStart = new Date(now);
		dayStart.setDate(dayStart.getDate() - (13 - i));
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(dayStart);
		dayEnd.setHours(23, 59, 59, 999);
		return Promise.all([
			prisma.attack.count({ where: { type: 'attack', createdAt: { gte: dayStart, lte: dayEnd } } }),
			prisma.attack.count({
				where: {
					type: 'attack',
					defenderUserId: { not: null },
					createdAt: { gte: dayStart, lte: dayEnd }
				}
			}),
			dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
		]);
	});
	const dayResults = await Promise.all(dayPromises);
	for (const [total, pvp, date] of dayResults) {
		attacksPerDay.push({
			date: date as string,
			attacks: total as number,
			pvp: pvp as number,
			pve: (total as number) - (pvp as number)
		});
	}

	// Players with zero attacks ever
	const totalPlayers = await prisma.user.count();
	const playersWithAttacks = await prisma.attack
		.findMany({
			where: { attackerUserId: { not: null } },
			select: { attackerUserId: true },
			distinct: ['attackerUserId']
		})
		.then((r) => r.length);
	const zeroAttackPlayers = totalPlayers - playersWithAttacks;

	// Players stuck on beginner quests (have a nexus but no first_build event)
	const playersWithNexus = await prisma.nexus
		.findMany({
			where: { ownerId: { not: null } },
			select: { ownerId: true },
			distinct: ['ownerId']
		})
		.then((r) => r.map((n) => n.ownerId!));
	const playersWithFirstBuild = await prisma.gameEvent
		.findMany({
			where: { event: 'first_build', userId: { in: playersWithNexus } },
			select: { userId: true },
			distinct: ['userId']
		})
		.then((r) => new Set(r.map((e) => e.userId)));
	const stuckOnOnboarding = playersWithNexus.filter((id) => !playersWithFirstBuild.has(id)).length;

	// Players who dismissed beginner tips
	const dismissedTips = await prisma.user.count({ where: { beginnerTipsEnabled: false } });

	return {
		activePlayers: { last24h: active24h, last7d: active7d, last30d: active30d },
		attacks: {
			last7d: attacksLast7d,
			pvpLast7d: pvpAttacksLast7d,
			pveLast7d: pveAttacksLast7d,
			attackersLast7d,
			defendersLast7d
		},
		attacksPerDay,
		playerHealth: {
			zeroAttackPlayers,
			stuckOnOnboarding,
			dismissedTips
		}
	};
}

// ---------------------------------------------------------------------------
// Combat health — the four COMBAT_BALANCE.md §4 playtest signals
//
// Reads the `combat_resolved` GameEvent emitted per PvP attack (server
// utils/logger.ts logCombatResolved). The doc defines healthy/concerning bands
// for each signal; we compute the value AND classify it so the dashboard can
// colour it without re-encoding the thresholds in the client.
// ---------------------------------------------------------------------------

// A near-mirror is a fight where the two sides were within ~25% on power, i.e.
// powerRatio (loser/winner) ≥ 0.75. The doc's "first-strike win-rate" signal is
// only meaningful in approximately-mirror matchups; lopsided fights are decided
// by the size/counter gap, not initiative.
const MIRROR_POWER_RATIO = 0.75;

interface CombatMeta {
	powerRatio?: number;
	victory?: boolean;
	conquered?: boolean;
	attackerClass?: string | null;
	defenderClass?: string | null;
	attackerHasAnvil?: boolean;
	defenderHasAnvil?: boolean;
	attackerWiped?: boolean;
}

type Health = 'healthy' | 'watch' | 'concerning';

export async function getCombatHealthStats(windowDays = 14) {
	const since = daysAgo(windowDays);

	const events = await prisma.gameEvent.findMany({
		where: { event: 'combat_resolved', createdAt: { gte: since } },
		select: { userId: true, meta: true, createdAt: true },
		orderBy: { createdAt: 'asc' }
	});

	const rows = events.map((e) => ({
		userId: e.userId,
		createdAt: e.createdAt,
		meta: (e.meta ?? {}) as CombatMeta
	}));
	const total = rows.length;

	// ── Signal 1: comp diversity ──
	// Distribution of the attacker's dominant class across all PvP fights, plus
	// how often a defender fielded ANY anvil. "Anvils never built" and "one class
	// >60%" are the concerning cases the doc names.
	const classCounts: Record<'mobile' | 'armor' | 'fire', number> = { mobile: 0, armor: 0, fire: 0 };
	let classedFights = 0;
	let defenderAnvilFights = 0;
	for (const r of rows) {
		const c = r.meta.attackerClass;
		if (c === 'mobile' || c === 'armor' || c === 'fire') {
			classCounts[c]++;
			classedFights++;
		}
		if (r.meta.defenderHasAnvil) defenderAnvilFights++;
	}
	const classPct = {
		mobile: classedFights ? Math.round((classCounts.mobile / classedFights) * 100) : 0,
		armor: classedFights ? Math.round((classCounts.armor / classedFights) * 100) : 0,
		fire: classedFights ? Math.round((classCounts.fire / classedFights) * 100) : 0
	};
	const topClassPct = Math.max(classPct.mobile, classPct.armor, classPct.fire);
	const anvilPct = total ? Math.round((defenderAnvilFights / total) * 100) : 0;
	// Concerning: one class dominates (>60%) OR anvils almost never appear (<10%).
	const compHealth: Health =
		classedFights < 10
			? 'watch'
			: topClassPct > 60 || anvilPct < 10
				? 'concerning'
				: topClassPct > 50 || anvilPct < 25
					? 'watch'
					: 'healthy';

	// ── Signal 2: conquest rate ──
	// Share of PvP fights that resulted in a conquest. Stalemate (conquests almost
	// never happen despite active attacks) is the concerning case.
	const conquests = rows.filter((r) => r.meta.conquered).length;
	const conquestPct = total ? Math.round((conquests / total) * 1000) / 10 : 0;
	const conquestHealth: Health =
		total < 10 ? 'watch' : conquestPct < 1 ? 'concerning' : conquestPct < 3 ? 'watch' : 'healthy';

	// ── Signal 3: post-loss recovery ──
	// For each attacker-wipe event, find that user's NEXT attack (any) and measure
	// the wall-clock gap. Median is the headline; multi-day median = train-time
	// debt too punishing.
	const wipeEvents = rows.filter((r) => r.meta.attackerWiped);
	const recoveryHours: number[] = [];
	// Batch the "next attack after wipe" lookups; cap to keep this bounded.
	const wipeSample = wipeEvents.slice(-200);
	const nextAttacks = await Promise.all(
		wipeSample.map((w) =>
			prisma.attack.findFirst({
				where: { attackerUserId: w.userId, createdAt: { gt: w.createdAt } },
				select: { createdAt: true },
				orderBy: { createdAt: 'asc' }
			})
		)
	);
	for (let i = 0; i < wipeSample.length; i++) {
		const next = nextAttacks[i];
		if (next) {
			const hrs = (next.createdAt.getTime() - wipeSample[i].createdAt.getTime()) / 3_600_000;
			if (hrs >= 0) recoveryHours.push(hrs);
		}
	}
	recoveryHours.sort((a, b) => a - b);
	const medianRecoveryHours =
		recoveryHours.length > 0
			? Math.round(recoveryHours[Math.floor(recoveryHours.length / 2)] * 10) / 10
			: null;
	// Healthy: recover within a session or two (≤ ~6h median). Concerning: >24h.
	const recoveryHealth: Health =
		medianRecoveryHours === null || recoveryHours.length < 5
			? 'watch'
			: medianRecoveryHours > 24
				? 'concerning'
				: medianRecoveryHours > 6
					? 'watch'
					: 'healthy';

	// ── Signal 4: first-strike win-rate in near-mirrors ──
	const mirrorFights = rows.filter(
		(r) => typeof r.meta.powerRatio === 'number' && r.meta.powerRatio >= MIRROR_POWER_RATIO
	);
	const mirrorWins = mirrorFights.filter((r) => r.meta.victory).length;
	const mirrorWinPct = mirrorFights.length
		? Math.round((mirrorWins / mirrorFights.length) * 100)
		: 0;
	// Healthy: 50–60% (slight attacker initiative). >70% = initiative too strong;
	// <40% = defender too dominant.
	const winRateHealth: Health =
		mirrorFights.length < 10
			? 'watch'
			: mirrorWinPct > 70 || mirrorWinPct < 40
				? 'concerning'
				: mirrorWinPct > 65 || mirrorWinPct < 45
					? 'watch'
					: 'healthy';

	return {
		windowDays,
		totalFights: total,
		compDiversity: {
			classPct,
			topClassPct,
			defenderAnvilPct: anvilPct,
			health: compHealth
		},
		conquestRate: {
			conquests,
			conquestPct,
			health: conquestHealth
		},
		postLossRecovery: {
			medianRecoveryHours,
			samples: recoveryHours.length,
			health: recoveryHealth
		},
		firstStrikeWinRate: {
			mirrorFights: mirrorFights.length,
			mirrorWinPct,
			health: winRateHealth
		}
	};
}

export async function getReferralAnalytics() {
	// Top referrers by activated referees (reached REFERRAL_EARLY_THRESHOLD)
	const referralTokens = await prisma.referralToken.findMany({
		select: { referrerId: true, refereeId: true, redeemedAt: true, galaxyId: true }
	});

	// Count unique referees per referrer where the early-scout token exists (galaxyId < 0)
	const earlyByReferrer = new Map<number, Set<number>>();
	const mainByReferrer = new Map<number, Set<number>>();
	for (const t of referralTokens) {
		if (t.galaxyId < 0) {
			if (!earlyByReferrer.has(t.referrerId)) earlyByReferrer.set(t.referrerId, new Set());
			earlyByReferrer.get(t.referrerId)!.add(t.refereeId);
		} else if (t.galaxyId > 0) {
			if (!mainByReferrer.has(t.referrerId)) mainByReferrer.set(t.referrerId, new Set());
			mainByReferrer.get(t.referrerId)!.add(t.refereeId);
		}
	}

	const referrerIds = [...new Set([...earlyByReferrer.keys(), ...mainByReferrer.keys()])];
	const referrers = await prisma.user.findMany({
		where: { id: { in: referrerIds } },
		select: { id: true, username: true, referralClickCount: true }
	});
	const referrerMap = new Map(referrers.map((r) => [r.id, r]));

	const leaderboard = referrerIds
		.map((id) => ({
			userId: id,
			username: referrerMap.get(id)?.username ?? 'Unknown',
			clicks: referrerMap.get(id)?.referralClickCount ?? 0,
			activated: earlyByReferrer.get(id)?.size ?? 0,
			converted: mainByReferrer.get(id)?.size ?? 0
		}))
		.sort((a, b) => b.activated - a.activated)
		.slice(0, 20);

	// Overall funnel
	const totalWithReferralCode = await prisma.user.count({ where: { referredById: { not: null } } });
	const totalReferralClicks = await prisma.user
		.aggregate({ _sum: { referralClickCount: true } })
		.then((r) => r._sum.referralClickCount ?? 0);
	const totalActivated =
		earlyByReferrer.size > 0 ? [...earlyByReferrer.values()].reduce((s, v) => s + v.size, 0) : 0;
	const totalConverted =
		mainByReferrer.size > 0 ? [...mainByReferrer.values()].reduce((s, v) => s + v.size, 0) : 0;

	return {
		funnel: {
			clicks: totalReferralClicks,
			registered: totalWithReferralCode,
			activated: totalActivated,
			converted: totalConverted
		},
		leaderboard
	};
}
