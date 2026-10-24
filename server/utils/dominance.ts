import prisma from '../lib/prisma.js';
import { NOTIF, sendPushToUser } from './push.js';
import { logError, logInfo } from './logger.js';

// Engine defaults. Each galaxy may override any of these via its win* columns
// (see resolveWinConfig); a NULL column falls back to the default here.
const DOMINANCE_THRESHOLD = 0.65;
const DOMINANCE_SUSTAIN_MS = 36 * 60 * 60 * 1000;
const DOMINANCE_MIN_PLAYERS = 15;
const DOMINANCE_MIN_FACTIONS = 4;

// ── Vassal dominance credit (Phase 2a - DIPLOMACY_BALANCE.md §3) ─────────────
// Server-only constants: NOT mirrored to the client. The client receives
// server-computed effective shares and credit breakdowns; it never applies
// these raw constants directly.

// Credit fraction applied to each qualifying vassal's owned-nexus count.
// A quarter keeps vassalising far weaker than conquering (1.0 own vs 0.25 credit).
const VASSAL_DOMINANCE_CREDIT_FRACTION = 0.25;

// A vassal with fewer than this many nexuses credits 0. Also acts as a
// near-dead exclusion: a collapsing vassal drops below 4 and stops counting.
const VASSAL_MIN_NEXUSES_TO_COUNT = 4;

// Only the 3 largest qualifying vassals credit; further vassals are ignored.
// Prevents the puppet-swarm auto-win.
const VASSAL_MAX_COUNTED = 3;

// Total credited vassal nexuses cannot exceed this fraction of the overlord's
// OWN owned-nexus count. The overlord must command the dominant plurality itself.
const VASSAL_CREDIT_CAP_VS_OWN = 0.5;

// ── Vassal relationship types ─────────────────────────────────────────────────

export interface VassalRelationship {
	overlordFactionId: number;
	vassalFactionId: number;
}

export interface VassalCreditResult {
	totalCreditedNexuses: number;
	// Per-vassal breakdown (pre-cap individual credits, useful for leaderboard UI).
	breakdown: Array<{
		vassalFactionId: number;
		vassalOwnNexusCount: number;
		creditedNexuses: number;
	}>;
}

// Returns valid, anti-collusion-enforced overlord->vassal pairs for a galaxy.
// Only active vassal treaties whose meta was stamped at accept time are included.
// Anti-collusion rules applied in order:
//   1. An overlord cannot itself be a vassal anywhere (no chains/rings).
//   2. A faction credits at most one overlord (deterministic: lowest treaty id wins).
export async function resolveActiveVassalRelationships(
	galaxyId: number
): Promise<VassalRelationship[]> {
	const treaties = await prisma.factionTreaty.findMany({
		where: { galaxyId, type: 'vassal', status: 'active' },
		select: { id: true, meta: true },
		orderBy: { id: 'asc' } // lowest id wins on uniqueness tie
	});

	// Parse all treaty pairs that have finalised meta (set at acceptTreaty time).
	const rawPairs: Array<{ id: number; overlordFactionId: number; vassalFactionId: number }> = [];
	for (const t of treaties) {
		const m = t.meta as { overlordFactionId?: unknown; vassalFactionId?: unknown } | null;
		if (
			m == null ||
			typeof m.overlordFactionId !== 'number' ||
			typeof m.vassalFactionId !== 'number' ||
			m.overlordFactionId === m.vassalFactionId
		) {
			continue; // pending-accept (only proposerRole in meta) or legacy null meta
		}
		rawPairs.push({
			id: t.id,
			overlordFactionId: m.overlordFactionId,
			vassalFactionId: m.vassalFactionId
		});
	}

	// Build the universal vassal set from ALL raw pairs (including ones we may
	// later skip). A faction that appears as a vassal anywhere cannot be an
	// overlord in a crediting sense, even if its own overlord treaty is invalid.
	const allVassalSet = new Set(rawPairs.map((p) => p.vassalFactionId));

	const usedVassals = new Set<number>();
	const valid: VassalRelationship[] = [];

	for (const p of rawPairs) {
		// Rule 1: overlord cannot itself be a vassal (no chains/rings).
		if (allVassalSet.has(p.overlordFactionId)) continue;
		// Rule 2: vassal can credit at most one overlord (first by treaty id).
		if (usedVassals.has(p.vassalFactionId)) continue;
		usedVassals.add(p.vassalFactionId);
		valid.push({ overlordFactionId: p.overlordFactionId, vassalFactionId: p.vassalFactionId });
	}

	return valid;
}

// Pure helper: compute the vassal dominance credit for a single overlord faction.
// factionNexusCounts maps factionId -> own-nexus count (NOT including any credit).
// Returns 0 if the faction has no qualifying vassals or the cap clips to 0.
// Conservation: this is a virtual scoring overlay only. No nexus is moved.
export function computeVassalCreditForOverlord(
	overlordFactionId: number,
	vassalRelationships: VassalRelationship[],
	factionNexusCounts: Map<number, number>
): VassalCreditResult {
	const overlordOwnCount = factionNexusCounts.get(overlordFactionId) ?? 0;

	const myVassals = vassalRelationships.filter((r) => r.overlordFactionId === overlordFactionId);

	// Filter to qualifying vassals (>= VASSAL_MIN_NEXUSES_TO_COUNT), sort
	// largest first so VASSAL_MAX_COUNTED keeps the three biggest.
	const qualifyingVassals = myVassals
		.map((r) => ({
			vassalFactionId: r.vassalFactionId,
			count: factionNexusCounts.get(r.vassalFactionId) ?? 0
		}))
		.filter((v) => v.count >= VASSAL_MIN_NEXUSES_TO_COUNT)
		.sort((a, b) => b.count - a.count)
		.slice(0, VASSAL_MAX_COUNTED);

	// Per-vassal credit: floor(fraction * count).
	const breakdown = qualifyingVassals.map((v) => ({
		vassalFactionId: v.vassalFactionId,
		vassalOwnNexusCount: v.count,
		creditedNexuses: Math.floor(VASSAL_DOMINANCE_CREDIT_FRACTION * v.count)
	}));

	// Sum raw credits then apply the cap.
	const rawTotal = breakdown.reduce((sum, b) => sum + b.creditedNexuses, 0);
	const cap = Math.floor(VASSAL_CREDIT_CAP_VS_OWN * overlordOwnCount);
	const totalCreditedNexuses = Math.min(rawTotal, cap);

	return { totalCreditedNexuses, breakdown };
}

export interface GalaxyWinSource {
	winShare: number | null;
	winSustainHours: number | null;
	winMinPlayers: number | null;
	winMinFactions: number | null;
	speedMultiplier?: number | null;
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
	const speed = g.speedMultiplier != null && Number.isFinite(g.speedMultiplier) && g.speedMultiplier > 0
		? g.speedMultiplier
		: 1.0;
	const rawSustainHours =
		g.winSustainHours != null && Number.isFinite(g.winSustainHours)
			? Math.min(720, Math.max(0, g.winSustainHours))
			: DOMINANCE_SUSTAIN_MS / 3_600_000;
	const sustainHours = rawSustainHours / speed;
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
			winMinFactions: true,
			speedMultiplier: true
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

	const playerCount = await prisma.galaxyPlayer.count({ where: { galaxyId: galaxy.id } });

	// Scale minPlayers down to the actual galaxy size when no explicit admin
	// override is set (winMinPlayers === null). Engine default of 15 is calibrated
	// for a full-sized galaxy; a small beta/speed galaxy with e.g. 5 players
	// would never reach victory without this. A floor of 3 keeps the condition
	// meaningful (at least a handful of players must be active).
	// seasonEndsAt (via processSeasonExpiry) remains the guaranteed fallback for
	// any galaxy that can't win via dominance - no additional changes needed there.
	const effectiveMinPlayers =
		galaxy.winMinPlayers != null
			? cfg.minPlayers
			: Math.min(cfg.minPlayers, Math.max(3, playerCount));

	if (playerCount < effectiveMinPlayers) {
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

	// Similarly scale minFactions when no explicit override. A galaxy with only
	// 2 active factions can still reach victory - the minimum is the smaller of
	// the engine default and the actual faction count (floor 1).
	// Vassals count as independent factions (per design); use factionCounts.size.
	const effectiveMinFactions =
		galaxy.winMinFactions != null
			? cfg.minFactions
			: Math.min(cfg.minFactions, Math.max(1, factionCounts.size));

	// Require minimum distinct faction count
	if (factionCounts.size < effectiveMinFactions) {
		await prisma.faction.updateMany({
			where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
			data: { dominanceSince: null }
		});
		return;
	}

	// Vassal credit: scoring overlay only. Credited nexuses remain physically
	// owned by the vassal and count for the vassal everywhere else. The overlord
	// gains a bounded virtual increment toward its winning share only.
	// Conservation: factionCounts is never mutated; effectiveCounts is the
	// augmented view used solely for leader selection and threshold comparison.
	const vassalRelationships = await resolveActiveVassalRelationships(galaxy.id);
	const effectiveCounts = new Map<number, number>(factionCounts);
	for (const [factionId] of factionCounts) {
		const { totalCreditedNexuses } = computeVassalCreditForOverlord(
			factionId,
			vassalRelationships,
			factionCounts
		);
		if (totalCreditedNexuses > 0) {
			effectiveCounts.set(factionId, (effectiveCounts.get(factionId) ?? 0) + totalCreditedNexuses);
		}
	}

	// Find leader faction by EFFECTIVE count (own nexuses + credited vassal nexuses).
	let leaderFactionId: number | null = null;
	let maxEffectiveCount = 0;
	for (const [factionId, count] of effectiveCounts) {
		if (count > maxEffectiveCount) {
			maxEffectiveCount = count;
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

	// leaderShare uses the effective count against the TOTAL nexus count (owned +
	// unowned). This is the value compared to cfg.threshold for the win check.
	// Credited nexuses are virtual: they do not reduce the total-nexus denominator.
	const leaderShare = maxEffectiveCount / nexuses.length;

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

	// Gather all participants, all faction memberships, and faction details
	const [allPlayers, allFactionMembers, allFactions] = await Promise.all([
		prisma.galaxyPlayer.findMany({
			where: { galaxyId: galaxy.id },
			select: { userId: true, points: true }
		}),
		prisma.factionMember.findMany({
			where: { galaxyId: galaxy.id },
			select: { userId: true, factionId: true }
		}),
		prisma.faction.findMany({
			where: { galaxyId: galaxy.id },
			select: { id: true, name: true, tag: true }
		})
	]);

	const factionById = new Map(allFactions.map((f) => [f.id, f]));
	const userFactionId = new Map(allFactionMembers.map((m) => [m.userId, m.factionId]));
	const winnerIds = new Set(
		allFactionMembers.filter((m) => m.factionId === winnerFactionId).map((m) => m.userId)
	);

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

	const now = new Date();

	// Write permanent commander stats + season records for every participant
	for (const p of allPlayers) {
		const isWinner = winnerIds.has(p.userId);
		const fid = userFactionId.get(p.userId);
		const factionInfo = fid != null ? factionById.get(fid) : undefined;

		await Promise.all([
			prisma.user.update({
				where: { id: p.userId },
				data: {
					galaxiesPlayed: { increment: 1 },
					lifetimePoints: { increment: p.points },
					...(isWinner ? { galaxiesWon: { increment: 1 } } : {})
				}
			}),
			prisma.seasonRecord.create({
				data: {
					userId: p.userId,
					galaxyId: galaxy.id,
					galaxyName: galaxy.name,
					endedAt: now,
					points: p.points,
					won: isWinner,
					factionName: factionInfo?.name ?? null,
					factionTag: factionInfo?.tag ?? null
				}
			})
		]);
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

// Ends active galaxies whose season timer has passed. The effective end for a
// galaxy is its own Galaxy.seasonEndsAt, falling back to the global
// AppConfig.seasonEndsAt. A galaxy that has not opened yet (startsAt in the
// future) is never ended, and a galaxy created after a stale global timer is left
// alone (the global timer only applies to galaxies that existed when it elapsed).
// Once the global timer has fired it is cleared so it cannot kill later galaxies.
// The winner is the faction with the most nexuses at expiry.
// If no factions own nexuses the galaxy ends with no winner (rare edge case).
export async function processSeasonExpiry(): Promise<void> {
	const now = new Date();
	const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
	const globalEnd = config?.seasonEndsAt ?? null;

	const candidates = await prisma.galaxy.findMany({
		where: { status: 'active' },
		select: { id: true, name: true, startsAt: true, createdAt: true, seasonEndsAt: true }
	});

	const expired = candidates.filter((g) => {
		if (g.startsAt && g.startsAt > now) return false;
		if (g.seasonEndsAt) return g.seasonEndsAt <= now;
		if (!globalEnd || globalEnd > now) return false;
		return g.createdAt <= globalEnd;
	});
	let failed = 0;

	for (const galaxy of expired) {
		try {
			// Determine faction nexus counts to pick a winner
			const members = await prisma.factionMember.findMany({
				where: { galaxyId: galaxy.id },
				select: { userId: true, factionId: true }
			});
			const userToFaction = new Map(members.map((m) => [m.userId, m.factionId]));

			const nexuses = await prisma.nexus.findMany({
				where: { galaxyId: galaxy.id, ownerId: { not: null } },
				select: { ownerId: true }
			});

			const factionCounts = new Map<number, number>();
			for (const n of nexuses) {
				const fid = userToFaction.get(n.ownerId!);
				if (fid) factionCounts.set(fid, (factionCounts.get(fid) ?? 0) + 1);
			}

			let winnerFactionId: number | null = null;
			let maxCount = 0;
			for (const [fid, count] of factionCounts) {
				if (count > maxCount) {
					maxCount = count;
					winnerFactionId = fid;
				}
			}

			if (!winnerFactionId) {
				// No faction owns any nexuses — just close the galaxy with no winner
				await prisma.galaxy.update({
					where: { id: galaxy.id },
					data: { status: 'ended', endedAt: new Date() }
				});
				await prisma.user.updateMany({
					where: { activeGalaxyId: galaxy.id },
					data: { activeGalaxyId: null }
				});
				continue;
			}

			await endGalaxy(galaxy, winnerFactionId);
		} catch (err) {
			failed++;
			logError('season_expiry_failed', {
				message: (err as Error).message,
				galaxyId: galaxy.id
			});
		}
	}

	// Clear the fired global timer (only if nobody changed it meanwhile). Kept when a
	// galaxy failed to end so the next tick retries it. It is cleared even if some
	// galaxies were skipped (future startsAt, or their own per-galaxy date): the global
	// timer is one-shot and must not outlive the galaxies that existed when it fired.
	if (globalEnd && globalEnd <= now && failed === 0) {
		const cleared = await prisma.appConfig.updateMany({
			where: { id: 1, seasonEndsAt: globalEnd },
			data: { seasonEndsAt: null }
		});
		if (cleared.count > 0) {
			logInfo('global_season_timer_cleared', { endedGalaxies: expired.length });
		}
	}
}
