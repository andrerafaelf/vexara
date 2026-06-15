import prisma from '../lib/prisma.js';

export function getNexusById(id: number) {
	return prisma.nexus.findUnique({ where: { id } });
}

export function getAttackById(id: number) {
	return prisma.attack.findUnique({ where: { id } });
}

export function getUserById(id: number) {
	return prisma.user.findUnique({
		where: { id },
		select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true }
	});
}

export async function getReportsForNexus(nexusId: number) {
	const [direct, allied] = await Promise.all([
		prisma.attack.findMany({
			where: {
				type: { not: 'support' },
				OR: [
					{ attackerNexusId: nexusId, status: { in: ['returning', 'completed'] } },
					{ defenderNexusId: nexusId, status: { in: ['returning', 'completed'] } }
				]
			},
			orderBy: { createdAt: 'desc' },
			include: {
				attackerNexus: { select: { id: true, name: true, x: true, y: true } },
				defenderNexus: {
					select: { id: true, name: true, x: true, y: true, biomass: true, alloy: true, ore: true }
				}
			}
		}),
		// Attacks where this nexus contributed allied troops (stored in result.alliedNexusIds JSON array).
		prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Attack"
      WHERE status IN ('returning', 'completed')
        AND type != 'support'
        AND result->'alliedNexusIds' @> ${JSON.stringify([nexusId])}::jsonb
    `.then((rows) =>
			rows.length > 0
				? prisma.attack.findMany({
						where: { id: { in: rows.map((r) => r.id) } },
						orderBy: { createdAt: 'desc' },
						include: {
							attackerNexus: { select: { id: true, name: true, x: true, y: true } },
							defenderNexus: {
								select: {
									id: true,
									name: true,
									x: true,
									y: true,
									biomass: true,
									alloy: true,
									ore: true
								}
							}
						}
					})
				: []
		)
	]);

	// Merge and deduplicate, preserving newest-first order.
	const seen = new Set<number>();
	const merged = [];
	for (const a of [...direct, ...allied]) {
		if (seen.has(a.id)) continue;
		// A wave that arrived to find the target already attacker-owned (a prior
		// wave conquered it) just bounces home untouched — no combat happened, so
		// it isn't a real report. Suppress it instead of logging a phantom "Defeat".
		if ((a.result as { reason?: string } | null)?.reason === 'target_self_owned') continue;
		seen.add(a.id);
		merged.push(a);
	}
	merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return merged;
}

export function getOwnedNexusIds(userId: number, galaxyId: number) {
	return prisma.nexus.findMany({ where: { ownerId: userId, galaxyId }, select: { id: true } });
}

export function upsertReportRead(userId: number, attackId: number, galaxyId: number) {
	return prisma.reportRead.upsert({
		where: { userId_attackId: { userId, attackId } },
		create: { userId, attackId, galaxyId },
		update: { readAt: new Date() }
	});
}

export async function getCompletedAttacksForNexus(nexusId: number, galaxyId: number) {
	const [direct, alliedRows] = await Promise.all([
		prisma.attack.findMany({
			where: {
				galaxyId,
				type: { not: 'support' },
				OR: [
					{ attackerNexusId: nexusId, status: { in: ['returning', 'completed'] } },
					{ defenderNexusId: nexusId, status: { in: ['returning', 'completed'] } }
				]
			},
			select: { id: true }
		}),
		prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Attack"
      WHERE "galaxyId" = ${galaxyId}
        AND status IN ('returning', 'completed')
        AND type != 'support'
        AND result->'alliedNexusIds' @> ${JSON.stringify([nexusId])}::jsonb
    `
	]);
	const seen = new Set<number>();
	const all: { id: number }[] = [];
	for (const a of [...direct, ...alliedRows]) {
		if (!seen.has(a.id)) {
			seen.add(a.id);
			all.push({ id: a.id });
		}
	}
	return all;
}

export async function markAllRead(userId: number, attacks: { id: number }[], galaxyId: number) {
	const now = new Date();
	return prisma.$transaction(
		attacks.map((a) =>
			prisma.reportRead.upsert({
				where: { userId_attackId: { userId, attackId: a.id } },
				create: { userId, attackId: a.id, galaxyId },
				update: { readAt: now, galaxyId }
			})
		)
	);
}

export function getReadIds(userId: number, galaxyId: number) {
	return prisma.reportRead.findMany({ where: { userId, galaxyId }, select: { attackId: true } });
}

export async function getUnreadNexusIds(userId: number, galaxyId: number): Promise<string[]> {
	const ownedNexuses = await prisma.nexus.findMany({
		where: { ownerId: userId, galaxyId },
		select: { id: true }
	});
	if (ownedNexuses.length === 0) return [];

	const nexusIds = ownedNexuses.map((n) => n.id);

	const [completedAttacks, readAttacks] = await Promise.all([
		prisma.attack.findMany({
			where: {
				galaxyId,
				type: { not: 'support' },
				OR: [
					{ attackerNexusId: { in: nexusIds }, status: { in: ['returning', 'completed'] } },
					{ defenderNexusId: { in: nexusIds }, status: { in: ['returning', 'completed'] } }
				]
			},
			select: { id: true, attackerNexusId: true, defenderNexusId: true, result: true }
		}),
		prisma.reportRead.findMany({
			where: { userId, galaxyId },
			select: { attackId: true }
		})
	]);

	const readSet = new Set(readAttacks.map((r) => r.attackId));
	const unreadNexusIds = new Set<number>();

	for (const attack of completedAttacks) {
		// Self-owned bounces aren't real reports (see getReportsForNexus) — they
		// must not drive an unread badge either.
		if ((attack.result as { reason?: string } | null)?.reason === 'target_self_owned') continue;
		if (!readSet.has(attack.id)) {
			if (nexusIds.includes(attack.attackerNexusId)) unreadNexusIds.add(attack.attackerNexusId);
			if (attack.defenderNexusId && nexusIds.includes(attack.defenderNexusId))
				unreadNexusIds.add(attack.defenderNexusId);
		}
	}

	return [...unreadNexusIds].map(String);
}
