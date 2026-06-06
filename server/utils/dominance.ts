import prisma from '../lib/prisma.js';
import { NOTIF, sendPushToUser } from './push.js';

// Engine defaults. Each galaxy may override any of these via its win* columns
// (see resolveWinConfig); a NULL column falls back to the default here.
const DOMINANCE_THRESHOLD = 0.65;
const DOMINANCE_SUSTAIN_MS = 36 * 60 * 60 * 1000;
const DOMINANCE_MIN_PLAYERS = 15;
const DOMINANCE_MIN_FACTIONS = 4;

export interface GalaxyWinSource {
	winShare: number | null;
	winSustainHours: number | null;
	winMinPlayers: number | null;
	winMinFactions: number | null;
}

export interface ResolvedWinConfig {
	threshold: number;
	sustainMs: number;
	minPlayers: number;
	minFactions: number;
}

// Resolve a galaxy's effective victory config, clamping any admin override into a
// sane range so a bad value can't make victory unreachable (or instant).
// Exported so the faction leaderboard (what players SEE) resolves the exact same
// config the victory engine ACTS on — otherwise an admin win-setting change shows
// stale defaults in-game while the real threshold is different.
export function resolveWinConfig(g: GalaxyWinSource): ResolvedWinConfig {
	const share =
		g.winShare != null && Number.isFinite(g.winShare)
			? Math.min(0.95, Math.max(0.3, g.winShare))
			: DOMINANCE_THRESHOLD;
	const sustainHours =
		g.winSustainHours != null && Number.isFinite(g.winSustainHours)
			? Math.min(720, Math.max(0, g.winSustainHours))
			: DOMINANCE_SUSTAIN_MS / 3_600_000;
	const minPlayers =
		g.winMinPlayers != null && Number.isFinite(g.winMinPlayers)
			? Math.max(1, Math.floor(g.winMinPlayers))
			: DOMINANCE_MIN_PLAYERS;
	const minFactions =
		g.winMinFactions != null && Number.isFinite(g.winMinFactions)
			? Math.max(1, Math.floor(g.winMinFactions))
			: DOMINANCE_MIN_FACTIONS;
	return { threshold: share, sustainMs: sustainHours * 3_600_000, minPlayers, minFactions };
}

export async function processDominanceVictories(): Promise<void> {
	const activeGalaxies = await prisma.galaxy.findMany({
		where: { status: 'active' },
		select: {
			id: true,
			name: true,
			winShare: true,
			winSustainHours: true,
			winMinPlayers: true,
			winMinFactions: true
		}
	});

	for (const galaxy of activeGalaxies) {
		try {
			await processGalaxy(galaxy);
		} catch (err) {
			console.error(`processDominanceVictories failed for galaxy ${galaxy.id}:`, err);
		}
	}
}

async function processGalaxy(galaxy: { id: number; name: string } & GalaxyWinSource): Promise<void> {
	const cfg = resolveWinConfig(galaxy);
	// Get all nexuses in the galaxy. Win share is % of the entire map (owned + neutral),
	// so a faction can't claim victory by joining the only faction in a sparsely-claimed galaxy.
	const nexuses = await prisma.nexus.findMany({
		where: { galaxyId: galaxy.id },
		select: { id: true, ownerId: true }
	});

	if (nexuses.length === 0) {
		await prisma.faction.updateMany({
			where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
			data: { dominanceSince: null }
		});
		return;
	}

	// Require minimum player count in this galaxy
	const playerCount = await prisma.galaxyPlayer.count({ where: { galaxyId: galaxy.id } });
	if (playerCount < cfg.minPlayers) {
		await prisma.faction.updateMany({
			where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
			data: { dominanceSince: null }
		});
		return;
	}

	// Get faction membership for all owned nexuses
	const members = await prisma.factionMember.findMany({
		where: { galaxyId: galaxy.id },
		select: { userId: true, factionId: true }
	});
	const userToFaction = new Map(members.map((m) => [m.userId, m.factionId]));

	// Count nexuses per faction (only owned nexuses contribute to a faction's count)
	const factionCounts = new Map<number, number>();
	for (const nexus of nexuses) {
		if (nexus.ownerId == null) continue;
		const factionId = userToFaction.get(nexus.ownerId);
		if (factionId) {
			factionCounts.set(factionId, (factionCounts.get(factionId) || 0) + 1);
		}
	}

	// Require minimum distinct faction count
	if (factionCounts.size < cfg.minFactions) {
		await prisma.faction.updateMany({
			where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
			data: { dominanceSince: null }
		});
		return;
	}

	// Find leader faction
	let leaderFactionId: number | null = null;
	let maxCount = 0;
	for (const [factionId, count] of factionCounts) {
		if (count > maxCount) {
			maxCount = count;
			leaderFactionId = factionId;
		}
	}

	if (!leaderFactionId) {
		await prisma.faction.updateMany({
			where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
			data: { dominanceSince: null }
		});
		return;
	}

	const leaderShare = maxCount / nexuses.length;

	// Below threshold: reset all dominance timers
	if (leaderShare < cfg.threshold) {
		await prisma.faction.updateMany({
			where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
			data: { dominanceSince: null }
		});
		return;
	}

	// Reset non-leader factions
	await prisma.faction.updateMany({
		where: { galaxyId: galaxy.id, id: { not: leaderFactionId }, dominanceSince: { not: null } },
		data: { dominanceSince: null }
	});

	// Check leader faction dominanceSince
	const leaderFaction = await prisma.faction.findUnique({
		where: { id: leaderFactionId },
		select: { dominanceSince: true }
	});
	if (!leaderFaction) return;

	const now = new Date();
	if (!leaderFaction.dominanceSince) {
		await prisma.faction.update({
			where: { id: leaderFactionId },
			data: { dominanceSince: now }
		});
		return;
	}

	const heldFor = now.getTime() - new Date(leaderFaction.dominanceSince).getTime();
	if (heldFor < cfg.sustainMs) return;

	await endGalaxy(galaxy, leaderFactionId);
}

async function endGalaxy(
	galaxy: { id: number; name: string },
	winnerFactionId: number
): Promise<void> {
	// Get the faction leader to set as winnerUserId for legacy compat
	const faction = await prisma.faction.findUnique({
		where: { id: winnerFactionId },
		select: { name: true, members: { where: { role: 'leader' }, select: { userId: true } } }
	});

	const factionLeader = faction?.members[0]?.userId || null;

	await prisma.galaxy.update({
		where: { id: galaxy.id },
		data: { status: 'ended', endedAt: new Date(), winnerFactionId, winnerUserId: factionLeader }
	});

	// Notify all players
	const allPlayers = await prisma.galaxyPlayer.findMany({
		where: { galaxyId: galaxy.id },
		select: { userId: true }
	});

	const factionMembers = await prisma.factionMember.findMany({
		where: { factionId: winnerFactionId, galaxyId: galaxy.id },
		select: { userId: true }
	});
	const winnerIds = new Set(factionMembers.map((m) => m.userId));

	if (winnerIds.size > 0) {
		// Snapshot influence for winning-faction members. Raw SQL because Prisma can't
		// copy a column to another column in one statement.
		await prisma.$executeRaw`
      UPDATE "GalaxyPlayer"
      SET "finalPoints" = "points"
      WHERE "galaxyId" = ${galaxy.id}
        AND "userId" = ANY(${Array.from(winnerIds)}::int[])
    `;
	}

	for (const p of allPlayers) {
		const isWinner = winnerIds.has(p.userId);
		void sendPushToUser(p.userId, isWinner ? NOTIF.ATTACK_RESOLVED : NOTIF.ATTACK_INCOMING, {
			title: isWinner ? 'Faction Victory' : 'Galaxy Ended',
			body: isWinner
				? `Your faction conquered ${galaxy.name}!`
				: `${galaxy.name} has ended. A faction has achieved victory.`,
			tag: `galaxy-ended-${galaxy.id}`,
			data: { url: '/' }
		});
	}

	// Clear active galaxy for all users in this galaxy
	await prisma.user.updateMany({
		where: { activeGalaxyId: galaxy.id },
		data: { activeGalaxyId: null }
	});
}
