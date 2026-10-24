import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { applyCompletedQueues, computeResourceUpdate } from '../models/Nexus.js';
import { atomicUpdateNexusResources, ResourceConflictError } from '../services/nexusService.js';
import { getMaxStorage } from './economy.js';
import {
	cachesEarnedForXp,
	getActiveProductionBoostPct,
	MAX_PASS_LEVEL,
	PASS_CACHE_BANK_CAP,
	PASS_CACHE_PACING_LEVEL,
	PASS_CACHE_REWARD,
	PASS_CLAIM_WASTE_TOLERANCE,
	PASS_DAILY_XP_CAP,
	PASS_MAX_XP,
	PASS_PACING_BASE_LEVELS,
	PASS_PACING_LEVELS_PER_DAY,
	PASS_TITLE_RANK,
	PASS_XP_PER_LEVEL,
	passLevelForXp,
	rewardByLevel,
	utcDayKey
} from './battlePass.js';

// Vex Pass reward claiming (levels 1..50 and repeatable post-L50 caches) and the
// account-level state snapshot. Split out of battlePass.ts, which keeps the
// reward table, XP granting, purchase and gift.

// Highest level the pacing rule lets a player claim right now. Can exceed 49;
// callers cap it for display.
export function pacingAllowance(anchor: Date, speed: number, nowMs: number = Date.now()): number {
	const days = (Math.max(0, nowMs - anchor.getTime()) / 86_400_000) * speed;
	return PASS_PACING_BASE_LEVELS + Math.floor(PASS_PACING_LEVELS_PER_DAY * days);
}

// Moment the pacing allowance reaches `level` (6h per level at 1x speed).
export function pacingUnlocksAt(anchor: Date, speed: number, level: number): Date {
	const hoursPerLevel = 24 / PASS_PACING_LEVELS_PER_DAY;
	const ms = (Math.max(0, level - PASS_PACING_BASE_LEVELS) * hoursPerLevel * 3_600_000) / speed;
	return new Date(anchor.getTime() + ms);
}

function formatDaysHours(unlocksAt: Date, nowMs: number): string {
	const totalHours = Math.max(0, Math.ceil((unlocksAt.getTime() - nowMs) / 3_600_000));
	return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}

interface Resources {
	biomass: number;
	alloy: number;
	ore: number;
}

interface ParsedReward {
	resources: Resources;
	vexPoints: number;
	titles: string[];
	badges: string[];
	tokens: number;
	boosts: Array<{ pct: number; hours: number }>;
}

// Parse reward format strings (see the REWARD_TABLE header). Resource parts are
// summed into one payload so the storage check sees the whole claim.
function parseRewards(rewardStrings: string[]): ParsedReward {
	const out: ParsedReward = {
		resources: { biomass: 0, alloy: 0, ore: 0 },
		vexPoints: 0,
		titles: [],
		badges: [],
		tokens: 0,
		boosts: []
	};
	for (const rewardStr of rewardStrings) {
		for (const raw of rewardStr.split(',')) {
			const [type, ...rest] = raw.trim().split(':');
			if (type === 'resources') {
				out.resources.biomass += parseInt(rest[0] ?? '0', 10) || 0;
				out.resources.alloy += parseInt(rest[1] ?? '0', 10) || 0;
				out.resources.ore += parseInt(rest[2] ?? '0', 10) || 0;
			} else if (type === 'boost') {
				const pct = parseInt(rest[1] ?? '0', 10) || 0;
				const hours = parseInt(rest[2] ?? '24', 10) || 24;
				if (pct > 0) out.boosts.push({ pct, hours });
			} else if (type === 'title') {
				const name = rest.join(':').trim();
				if (name) out.titles.push(name);
			} else if (type === 'badge') {
				const tier = rest[0]?.trim();
				if (tier) out.badges.push(tier);
			} else if (type === 'vexpoints') {
				out.vexPoints += parseInt(rest[0] ?? '0', 10) || 0;
			} else if (type === 'token') {
				out.tokens += parseInt(rest[0] ?? '1', 10) || 0;
			}
		}
	}
	return out;
}

function hasResources(r: Resources): boolean {
	return r.biomass > 0 || r.alloy > 0 || r.ore > 0;
}


// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

export type ClaimTarget = { kind: 'level'; level: number } | { kind: 'cache' };

export interface ClaimContext {
	userId: number;
	galaxyId: number | null;
	galaxyStatus: string | null;
	nexusId: number;
}

export type ClaimResult =
	| {
			ok: true;
			level: number;
			tracks: string[];
			delivered: Resources;
			wasted: Resources;
			// Post-credit nexus row, for the realtime resource push. Null when the
			// claim carried no resources.
			nexus: Awaited<ReturnType<typeof prisma.nexus.findUniqueOrThrow>> | null;
	  }
	| {
			ok: false;
			status: number;
			error: string;
			reason?: 'pacing' | 'storage';
			unlocksAt?: string;
			needed?: Resources;
			available?: Resources;
	  };

type ClaimRefusal = Extract<ClaimResult, { ok: false }>;

// Thrown from inside the claim transaction to roll it back and surface a result.
class ClaimAbort extends Error {
	constructor(readonly refusal: ClaimRefusal) {
		super(refusal.error);
		this.name = 'ClaimAbort';
	}
}

function refuse(status: number, error: string): ClaimRefusal {
	return { ok: false, status, error };
}

function isUniqueViolation(err: unknown): boolean {
	return (err as { code?: string } | null)?.code === 'P2002';
}

// Anchor for pacing: the later of the player's join time and the galaxy start.
async function loadPacingAnchor(
	db: Prisma.TransactionClient,
	userId: number,
	galaxyId: number
): Promise<{ anchor: Date; speed: number } | null> {
	const [player, galaxy] = await Promise.all([
		db.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { joinedAt: true }
		}),
		db.galaxy.findUnique({
			where: { id: galaxyId },
			select: { startsAt: true, createdAt: true, speedMultiplier: true }
		})
	]);
	if (!player || !galaxy) return null;
	const galaxyStart = galaxy.startsAt ?? galaxy.createdAt;
	const anchor = player.joinedAt > galaxyStart ? player.joinedAt : galaxyStart;
	const speed = galaxy.speedMultiplier > 0 ? galaxy.speedMultiplier : 1;
	return { anchor, speed };
}

// Claim a level (free half plus the paid half if owned) or the next cache,
// delivering resources to the chosen nexus. One interactive transaction: claim
// rows are inserted FIRST (the unique (userId, level, track) row is the claim
// lock), then every reward is applied and the nexus is credited through the
// optimistic-concurrency guard. Any failure rolls the whole claim back.
export async function claimPassReward(
	ctx: ClaimContext,
	target: ClaimTarget
): Promise<ClaimResult> {
	const { userId, galaxyId, nexusId } = ctx;
	if (galaxyId == null || ctx.galaxyStatus !== 'active') {
		return refuse(409, 'No active galaxy');
	}
	if (target.kind === 'level' && (target.level < 1 || target.level > MAX_PASS_LEVEL)) {
		return refuse(400, 'Invalid level');
	}

	const ownedNexus = await prisma.nexus.findFirst({
		where: { id: nexusId, ownerId: userId, galaxyId }
	});
	if (!ownedNexus) return refuse(400, 'Nexus not found');
	// Settle finished builds first (a completed Storage Vault upgrade counts).
	await applyCompletedQueues(ownedNexus);
	const boostPct = await getActiveProductionBoostPct(userId, galaxyId);

	try {
		return await prisma.$transaction(
			async (tx): Promise<ClaimResult> => {
				// Serialize this account's claims (also protects the titles/badges
				// read-modify-write below).
				await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
				const user = await tx.user.findUnique({
					where: { id: userId },
					select: {
						passXp: true,
						hasPaidPass: true,
						passTitle: true,
						earnedTitles: true,
						earnedBadges: true
					}
				});
				if (!user) return refuse(404, 'User not found');

				// Which claim rows are still available, and what they carry.
				let claimLevel: number;
				let tracks: Array<'free' | 'paid' | 'cache'>;
				let rewardStrings: string[];
				if (target.kind === 'level') {
					claimLevel = target.level;
					if (claimLevel > passLevelForXp(user.passXp)) {
						return refuse(400, 'Level not yet reached');
					}
					const row = rewardByLevel.get(claimLevel);
					if (!row) return refuse(400, 'No reward defined for this level');
					const existing = await tx.passClaim.findMany({
						where: { userId, level: claimLevel },
						select: { track: true }
					});
					const done = new Set(existing.map((c) => c.track));
					tracks = [];
					if (!done.has('free')) tracks.push('free');
					if (user.hasPaidPass && !done.has('paid')) tracks.push('paid');
					if (tracks.length === 0) return refuse(400, 'Already claimed');
					rewardStrings = tracks
						.map((t) => (t === 'free' ? row.free : row.paid))
						.filter((r): r is string => !!r);
				} else {
					const cachesClaimed = await tx.passClaim.count({ where: { userId, track: 'cache' } });
					if (cachesEarnedForXp(user.passXp) - cachesClaimed <= 0) {
						return refuse(400, 'No resource cache available');
					}
					claimLevel = MAX_PASS_LEVEL + 1 + cachesClaimed;
					tracks = ['cache'];
					rewardStrings = [PASS_CACHE_REWARD];
				}

				const parsed = parseRewards(rewardStrings);
				const payload = parsed.resources;
				const carriesResources = hasResources(payload);

				// Rule B (pacing): only claims that carry resources are gated.
				if (carriesResources) {
					const pacing = await loadPacingAnchor(tx, userId, galaxyId);
					if (!pacing) return refuse(400, 'Not a member of this galaxy');
					const nowMs = Date.now();
					const allowance = pacingAllowance(pacing.anchor, pacing.speed, nowMs);
					const gateLevel = target.kind === 'level' ? claimLevel : PASS_CACHE_PACING_LEVEL;
					if (allowance < gateLevel) {
						const unlocksAt = pacingUnlocksAt(pacing.anchor, pacing.speed, gateLevel);
						const when = formatDaysHours(unlocksAt, nowMs);
						const error =
							target.kind === 'level'
								? `Level ${claimLevel} unlocks in this galaxy in ${when}. In a galaxy you joined recently, pass rewards open up to level ${PASS_PACING_BASE_LEVELS} right away, then ${PASS_PACING_LEVELS_PER_DAY} more levels per day. The reward stays claimable.`
								: `Resource caches unlock in this galaxy in ${when} (10 days after you joined). Your caches stay banked.`;
						return {
							ok: false,
							status: 400,
							error,
							reason: 'pacing',
							unlocksAt: unlocksAt.toISOString()
						};
					}
				}

				// Rule A (storage fit): refresh the nexus to now, then compare.
				let delivered: Resources = { biomass: 0, alloy: 0, ore: 0 };
				let wasted: Resources = { biomass: 0, alloy: 0, ore: 0 };
				let nexusWrite: { expectedLastUpdate: Date; data: Prisma.NexusUpdateInput } | null = null;
				if (carriesResources) {
					const nexus = await tx.nexus.findFirst({
						where: { id: nexusId, ownerId: userId, galaxyId }
					});
					if (!nexus) return refuse(400, 'Nexus not found');
					const galaxy = await tx.galaxy.findUnique({
						where: { id: galaxyId },
						select: { speedMultiplier: true }
					});
					const refreshed = computeResourceUpdate(
						nexus,
						undefined,
						galaxy?.speedMultiplier ?? 1.0,
						boostPct
					);
					const max = getMaxStorage(nexus);
					const free: Resources = {
						biomass: Math.max(0, Math.floor(max - refreshed.biomass)),
						alloy: Math.max(0, Math.floor(max - refreshed.alloy)),
						ore: Math.max(0, Math.floor(max - refreshed.ore))
					};
					const keys: Array<keyof Resources> = ['biomass', 'alloy', 'ore'];
					const tooBig = keys.some(
						(k) => payload[k] - free[k] > Math.floor(PASS_CLAIM_WASTE_TOLERANCE * payload[k])
					);
					if (tooBig) {
						return {
							ok: false,
							status: 400,
							error: `${nexus.name} can't hold this reward. Free storage needed: ${payload.biomass} Biomass, ${payload.alloy} Alloy, ${payload.ore} Ore. Free storage available: ${free.biomass} Biomass, ${free.alloy} Alloy, ${free.ore} Ore. Spend some resources, upgrade its Storage Vault, or pick another nexus. The reward stays claimable.`,
							reason: 'storage',
							needed: { ...payload },
							available: free
						};
					}
					delivered = {
						biomass: Math.min(payload.biomass, free.biomass),
						alloy: Math.min(payload.alloy, free.alloy),
						ore: Math.min(payload.ore, free.ore)
					};
					wasted = {
						biomass: payload.biomass - delivered.biomass,
						alloy: payload.alloy - delivered.alloy,
						ore: payload.ore - delivered.ore
					};
					nexusWrite = {
						expectedLastUpdate: nexus.lastResourceUpdate,
						data: {
							biomass: refreshed.biomass + delivered.biomass,
							alloy: refreshed.alloy + delivered.alloy,
							ore: refreshed.ore + delivered.ore,
							lastResourceUpdate: refreshed.lastResourceUpdate
						}
					};
				}

				// Claim-before-process: nothing is granted unless every claim row inserts.
				for (const track of tracks) {
					try {
						await tx.passClaim.create({
							data: { userId, level: claimLevel, track, galaxyId, nexusId }
						});
					} catch (err) {
						if (isUniqueViolation(err)) throw new ClaimAbort(refuse(400, 'Already claimed'));
						throw err;
					}
				}

				// Account-level rewards: VP (atomic increment), titles, badges.
				const userData: Prisma.UserUpdateInput = {};
				if (parsed.vexPoints > 0) userData.vexPoints = { increment: parsed.vexPoints };
				const titles = [...((user.earnedTitles as string[] | null) ?? [])];
				let titlesChanged = false;
				for (const t of parsed.titles) {
					if (!titles.includes(t)) {
						titles.push(t);
						titlesChanged = true;
					}
				}
				if (titlesChanged) {
					userData.earnedTitles = titles;
					let best: string | null = user.passTitle ?? null;
					let bestRank = best ? (PASS_TITLE_RANK[best] ?? 0) : 0;
					for (const t of titles) {
						const rank = PASS_TITLE_RANK[t] ?? 0;
						if (rank > bestRank) {
							best = t;
							bestRank = rank;
						}
					}
					userData.passTitle = best;
				}
				const badges = [...((user.earnedBadges as string[] | null) ?? [])];
				let badgesChanged = false;
				for (const b of parsed.badges) {
					if (!badges.includes(b)) {
						badges.push(b);
						badgesChanged = true;
					}
				}
				if (badgesChanged) userData.earnedBadges = badges;
				if (Object.keys(userData).length > 0) {
					await tx.user.update({ where: { id: userId }, data: userData });
				}

				// Tokens (semantics unchanged: MilestoneToken rows, rewardType 'battle_pass').
				if (parsed.tokens > 0) {
					await tx.milestoneToken.createMany({
						data: Array.from({ length: parsed.tokens }, (_, i) => ({
							userId,
							milestone: 0,
							rewardType: 'battle_pass',
							rewardMeta: { reason: 'battle_pass', tokenIndex: i, tokenCount: parsed.tokens }
						}))
					});
				}

				// Production boosts live on GalaxyPlayer.nexusGroups of the claim galaxy.
				if (parsed.boosts.length > 0) {
					await tx.$queryRaw`SELECT 1 FROM "GalaxyPlayer" WHERE "userId" = ${userId} AND "galaxyId" = ${galaxyId} FOR UPDATE`;
					const gp = await tx.galaxyPlayer.findUnique({
						where: { userId_galaxyId: { userId, galaxyId } },
						select: { nexusGroups: true }
					});
					if (!gp) throw new ClaimAbort(refuse(400, 'Not a member of this galaxy'));
					const groups = [...((gp.nexusGroups as unknown as Prisma.JsonObject[] | null) ?? [])];
					for (const b of parsed.boosts) {
						groups.push({
							type: 'production_boost',
							pct: b.pct,
							expiresAt: new Date(Date.now() + b.hours * 3_600_000).toISOString()
						});
					}
					await tx.galaxyPlayer.update({
						where: { userId_galaxyId: { userId, galaxyId } },
						data: { nexusGroups: groups }
					});
				}

				// Nexus credit through the optimistic-concurrency guard.
				const updatedNexus = nexusWrite
					? await atomicUpdateNexusResources(
							nexusId,
							nexusWrite.expectedLastUpdate,
							nexusWrite.data,
							tx
						)
					: null;

				return { ok: true, level: claimLevel, tracks, delivered, wasted, nexus: updatedNexus };
			},
			{ timeout: 15_000 }
		);
	} catch (err) {
		if (err instanceof ClaimAbort) return err.refusal;
		if (err instanceof ResourceConflictError) {
			return refuse(409, 'Resources changed, please retry');
		}
		if (isUniqueViolation(err)) return refuse(400, 'Already claimed');
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Account state (GET /api/battle-pass)
// ---------------------------------------------------------------------------

export async function getPassState(
	userId: number,
	activeGalaxyId: number | null,
	galaxyStatus: string | null
) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			passXp: true,
			hasPaidPass: true,
			passTitle: true,
			passXpDay: true,
			passXpDayTotal: true
		}
	});
	if (!user) return null;
	const claims = await prisma.passClaim.findMany({
		where: { userId },
		select: { level: true, track: true }
	});
	const free: number[] = [];
	const paid: number[] = [];
	let cachesClaimed = 0;
	for (const c of claims) {
		if (c.track === 'free') free.push(c.level);
		else if (c.track === 'paid') paid.push(c.level);
		else if (c.track === 'cache') cachesClaimed++;
	}
	free.sort((a, b) => a - b);
	paid.sort((a, b) => a - b);

	const passLevel = passLevelForXp(user.passXp);
	const earned = cachesEarnedForXp(user.passXp);
	const banked = Math.max(0, earned - cachesClaimed);

	let pacing: {
		anchor: string;
		claimableUpToLevel: number;
		cachesUnlockAt: string | null;
		speedMultiplier: number;
	} | null = null;
	if (activeGalaxyId != null && galaxyStatus === 'active') {
		const p = await loadPacingAnchor(prisma, userId, activeGalaxyId);
		if (p) {
			const allowance = pacingAllowance(p.anchor, p.speed);
			pacing = {
				anchor: p.anchor.toISOString(),
				claimableUpToLevel: Math.min(MAX_PASS_LEVEL - 1, allowance),
				cachesUnlockAt:
					allowance >= PASS_CACHE_PACING_LEVEL
						? null
						: pacingUnlocksAt(p.anchor, p.speed, PASS_CACHE_PACING_LEVEL).toISOString(),
				speedMultiplier: p.speed
			};
		}
	}

	return {
		passXp: user.passXp,
		passLevel,
		xpPerLevel: PASS_XP_PER_LEVEL,
		xpIntoLevel: passLevel >= MAX_PASS_LEVEL ? 0 : user.passXp - passLevel * PASS_XP_PER_LEVEL,
		hasPaidPass: user.hasPaidPass,
		passTitle: user.passTitle ?? null,
		claimed: { free, paid },
		caches: {
			earned,
			claimed: cachesClaimed,
			claimable: Math.min(banked, PASS_CACHE_BANK_CAP),
			bankCap: PASS_CACHE_BANK_CAP,
			// null while the bank is full: XP is clamped until a cache is claimed.
			nextCacheAtXp:
				banked >= PASS_CACHE_BANK_CAP ? null : PASS_MAX_XP + (earned + 1) * PASS_XP_PER_LEVEL,
			reward: PASS_CACHE_REWARD
		},
		xp: {
			today: user.passXpDay === utcDayKey() ? user.passXpDayTotal : 0,
			dailyCap: PASS_DAILY_XP_CAP
		},
		pacing,
		// Backward-compatible fields for the currently deployed client.
		seasonXp: user.passXp,
		claimedLevels: free,
		seasonEndsAt: null as string | null
	};
}

