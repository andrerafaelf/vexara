import prisma from '../lib/prisma.js';
import { logError } from './logger.js';

// XP required to reach each level (cumulative). 50 levels total.
// 200 XP/level = 10,000 XP to max.
// Active player (~400 XP/day: dailies + streak + 1 combat win): L50 in ~25 days.
// Very active (~680 XP/day: above + ops/treaties + captures): L50 in ~15 days.
// Casual player (~200 XP/day: daily quests only): earns meaningful rewards every session.
// Season target: 28 days.
const LEVEL_XP_THRESHOLDS: number[] = (() => {
	const thresholds: number[] = [0];
	for (let lvl = 1; lvl <= 50; lvl++) {
		thresholds.push(lvl * 200); // flat 200 XP per level
	}
	return thresholds; // index = level, value = cumulative XP required
})();

export const MAX_PASS_LEVEL = 50;

// Vex Pass costs 1,000 VP. €4.99 purchase = 1,000 VP.
export const PASS_COST_VP = 1000;

export const PASS_XP = {
	QUEST_COMPLETE:     200,
	QUEST_STREAK_BONUS:  75,
	ATTACK_LAUNCHED:     25,
	ATTACK_WON:         100,
	NEXUS_CAPTURED:     150,
	DEFENSE_WON:         75,
	COORDINATED_ASSAULT: 120,
	FACTION_WAR_OP:      120,
	DIPLOMATIC_TREATY:    60
} as const;

export type PassXpEvent = keyof typeof PASS_XP;

interface PassReward {
	level: number;
	free: string | null;
	paid: string | null;
}

// Full 50-level Vex Protocol reward table.
//
// Free track  (Protocol: Field):
//   Every level gives all three resources at once, scaling from small early-game
//   packs to massive late-game caches. VP at 5 milestone levels = 250 VP total.
//   Badge milestones at L10(bronze) / L25(silver) / L40(gold) / L50(platinum).
//   Veteran title at L40. Platinum badge at L50.
//     L5:10 + L10:20 + L20:25 + L30:30 + L40:35 + L50:20 = 140
//     remaining 110 VP spread across L15/L25/L35/L45
//     L15:20 + L25:25 + L35:30 + L45:35 = 110 ✓  total = 250
//
// Paid track  (Protocol: Command):
//   Titles: Conscript(1) → Operative(8) → Proven(18) → Vex Commander(30) → High Commander(45) → Season Conqueror(50)
//   Boosts escalate from +5% 12h → +35% 120h.
//   Tokens: 1 token at L20, 1 at L35, 2 at L50 (total 4 tokens on full paid pass).
//   VP at 20 levels = 500 VP total.
//
// Combined total returned to player: 250 (free) + 500 (paid) = 750 VP on a 1,000 VP pass.
//
// Reward format strings:
//   resources:<biomass>:<alloy>:<ore>          — all three deposited to selected nexus
//   boost:production:<pct>:<hours>             — time-limited production multiplier
//   title:<Name>                               — season-scoped prestige title
//   badge:<tier>                               — permanent career badge
//   vexpoints:<amount>                         — credited to User.vexPoints
//   token:<count>                              — MilestoneToken rows (rewardType: 'battle_pass')
const REWARD_TABLE: PassReward[] = [
	// ── Act I: Enlistment (1–10) ─────────────────────────────────────────────────
	{ level:  1, free: 'resources:500:500:500',                                         paid: 'title:Conscript' },
	{ level:  2, free: 'resources:800:800:800',                                         paid: 'boost:production:5:12' },
	{ level:  3, free: 'resources:1000:1000:1000',                                      paid: 'vexpoints:10' },
	{ level:  4, free: 'resources:1200:1200:1200',                                      paid: 'boost:production:8:18' },
	{ level:  5, free: 'resources:1500:1500:1500,vexpoints:10',                         paid: 'vexpoints:10' },
	{ level:  6, free: 'resources:2000:2000:2000',                                      paid: 'boost:production:10:24' },
	{ level:  7, free: 'resources:2500:2500:2500',                                      paid: 'boost:production:10:24' },
	{ level:  8, free: 'resources:3000:3000:3000',                                      paid: 'title:Operative,vexpoints:10' },
	{ level:  9, free: 'resources:3500:3500:3500',                                      paid: 'boost:production:12:24' },
	{ level: 10, free: 'badge:bronze,resources:4000:4000:4000,vexpoints:20',            paid: 'vexpoints:15,boost:production:12:36' },

	// ── Act II: Field Ops (11–20) ────────────────────────────────────────────────
	{ level: 11, free: 'resources:5000:5000:5000',                                      paid: 'boost:production:15:36' },
	{ level: 12, free: 'resources:6000:6000:6000',                                      paid: 'boost:production:15:36' },
	{ level: 13, free: 'resources:7000:7000:7000',                                      paid: 'vexpoints:10' },
	{ level: 14, free: 'resources:8000:8000:8000',                                      paid: 'boost:production:15:48' },
	{ level: 15, free: 'resources:9000:9000:9000,vexpoints:20',                         paid: 'vexpoints:15' },
	{ level: 16, free: 'resources:10000:10000:10000',                                   paid: 'boost:production:18:48' },
	{ level: 17, free: 'resources:11000:11000:11000',                                   paid: 'boost:production:18:48' },
	{ level: 18, free: 'resources:12000:12000:12000',                                   paid: 'title:Proven,vexpoints:15' },
	{ level: 19, free: 'resources:13000:13000:13000',                                   paid: 'boost:production:20:48' },
	{ level: 20, free: 'resources:15000:15000:15000,vexpoints:25',                      paid: 'vexpoints:20,boost:production:20:72,token:1' },

	// ── Act III: Warfront (21–30) ────────────────────────────────────────────────
	{ level: 21, free: 'resources:17000:17000:17000',                                   paid: 'boost:production:22:72' },
	{ level: 22, free: 'resources:19000:19000:19000',                                   paid: 'boost:production:22:72' },
	{ level: 23, free: 'resources:21000:21000:21000',                                   paid: 'vexpoints:15' },
	{ level: 24, free: 'resources:23000:23000:23000',                                   paid: 'boost:production:22:72' },
	{ level: 25, free: 'badge:silver,resources:25000:25000:25000,vexpoints:25',         paid: 'vexpoints:20' },
	{ level: 26, free: 'resources:27000:27000:27000',                                   paid: 'boost:production:25:72' },
	{ level: 27, free: 'resources:29000:29000:29000',                                   paid: 'boost:production:25:72' },
	{ level: 28, free: 'resources:31000:31000:31000',                                   paid: 'vexpoints:15' },
	{ level: 29, free: 'resources:34000:34000:34000',                                   paid: 'boost:production:25:96' },
	{ level: 30, free: 'resources:37000:37000:37000,vexpoints:30',                      paid: 'title:Vex Commander,vexpoints:25,boost:production:25:96' },

	// ── Act IV: High Command (31–40) ─────────────────────────────────────────────
	{ level: 31, free: 'resources:40000:40000:40000',                                   paid: 'boost:production:28:96' },
	{ level: 32, free: 'resources:43000:43000:43000',                                   paid: 'boost:production:28:96' },
	{ level: 33, free: 'resources:46000:46000:46000',                                   paid: 'vexpoints:15' },
	{ level: 34, free: 'resources:50000:50000:50000',                                   paid: 'boost:production:28:96' },
	{ level: 35, free: 'resources:54000:54000:54000,vexpoints:30',                      paid: 'vexpoints:25,token:1' },
	{ level: 36, free: 'resources:58000:58000:58000',                                   paid: 'boost:production:30:96' },
	{ level: 37, free: 'resources:62000:62000:62000',                                   paid: 'boost:production:30:96' },
	{ level: 38, free: 'resources:66000:66000:66000',                                   paid: 'vexpoints:20' },
	{ level: 39, free: 'resources:70000:70000:70000',                                   paid: 'boost:production:30:120' },
	{ level: 40, free: 'badge:gold,title:Veteran,resources:75000:75000:75000,vexpoints:35', paid: 'vexpoints:30,boost:production:30:120' },

	// ── Act V: The Vex Reckoning (41–50) ─────────────────────────────────────────
	{ level: 41, free: 'resources:80000:80000:80000',                                   paid: 'boost:production:32:120' },
	{ level: 42, free: 'resources:85000:85000:85000',                                   paid: 'boost:production:32:120' },
	{ level: 43, free: 'resources:90000:90000:90000',                                   paid: 'vexpoints:20' },
	{ level: 44, free: 'resources:95000:95000:95000',                                   paid: 'boost:production:33:120' },
	{ level: 45, free: 'resources:100000:100000:100000,vexpoints:35',                   paid: 'title:High Commander,vexpoints:35,boost:production:33:120' },
	{ level: 46, free: 'resources:110000:110000:110000',                                paid: 'boost:production:35:120' },
	{ level: 47, free: 'resources:120000:120000:120000',                                paid: 'boost:production:35:120' },
	{ level: 48, free: 'resources:130000:130000:130000',                                paid: 'vexpoints:25' },
	{ level: 49, free: 'resources:140000:140000:140000',                                paid: 'boost:production:35:120' },

	// ── L50: The Capstone ─────────────────────────────────────────────────────────
	// Free: Platinum badge + 20 VP. Rarest badge in the game. Proof you went the distance.
	// Paid: Season Conqueror + 170 VP + 4 tokens + +35% prod 120h.
	{ level: 50, free: 'badge:platinum,vexpoints:20',                                   paid: 'title:Season Conqueror,vexpoints:170,token:4,boost:production:35:120' },
];

const rewardByLevel = new Map(REWARD_TABLE.map((r) => [r.level, r]));

// Grant seasonal XP to a player. Advances passLevel and records newly unlocked
// levels in claimedLevels (as pending — they must be claimed manually).
// Safe to call fire-and-forget (void) — errors are caught internally.
export async function grantPassXp(
	userId: number,
	galaxyId: number,
	event: PassXpEvent
): Promise<void> {
	try {
		const xpAmount = PASS_XP[event];

		const player = await prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { seasonXp: true, passLevel: true, hasPaidPass: true, claimedLevels: true }
		});

		if (!player) return;
		if (player.passLevel >= MAX_PASS_LEVEL) return;

		const newXp = player.seasonXp + xpAmount;
		let newLevel = player.passLevel;

		while (newLevel < MAX_PASS_LEVEL && newXp >= LEVEL_XP_THRESHOLDS[newLevel + 1]) {
			newLevel++;
		}

		await prisma.galaxyPlayer.update({
			where: { userId_galaxyId: { userId, galaxyId } },
			data: { seasonXp: newXp, passLevel: newLevel }
		});
	} catch (err) {
		logError('battle_pass_xp_error', {
			message: (err as Error).message,
			userId,
			galaxyId,
			event
		});
	}
}

// Claim a specific level's reward, depositing resources into the chosen nexus.
// Returns an error string or null on success.
export async function claimPassLevel(
	userId: number,
	galaxyId: number,
	level: number,
	nexusId: number
): Promise<string | null> {
	if (level < 1 || level > MAX_PASS_LEVEL) return 'Invalid level';

	const player = await prisma.galaxyPlayer.findUnique({
		where: { userId_galaxyId: { userId, galaxyId } },
		select: { passLevel: true, hasPaidPass: true, claimedLevels: true }
	});
	if (!player) return 'Not a member of this galaxy';
	if (level > player.passLevel) return 'Level not yet reached';

	const claimed = (player.claimedLevels as number[]) ?? [];
	if (claimed.includes(level)) return 'Already claimed';

	// Verify the nexus belongs to this player in this galaxy
	const nexus = await prisma.nexus.findFirst({
		where: { id: nexusId, ownerId: userId, galaxyId },
		select: { id: true }
	});
	if (!nexus) return 'Nexus not found';

	const reward = rewardByLevel.get(level);
	if (!reward) return 'No reward defined for this level';

	const tracks = [reward.free, ...(player.hasPaidPass ? [reward.paid] : [])].filter(
		Boolean
	) as string[];

	for (const rewardStr of tracks) {
		for (const part of rewardStr.split(',')) {
			await applyRewardPart(userId, galaxyId, part.trim(), nexusId);
		}
	}

	await prisma.galaxyPlayer.update({
		where: { userId_galaxyId: { userId, galaxyId } },
		data: { claimedLevels: [...claimed, level] }
	});

	return null;
}

async function applyRewardPart(
	userId: number,
	galaxyId: number,
	part: string,
	nexusId: number
): Promise<void> {
	const [type, ...rest] = part.split(':');

	if (type === 'resources') {
		// Format: resources:<biomass>:<alloy>:<ore>
		const biomass = parseInt(rest[0] ?? '0', 10);
		const alloy   = parseInt(rest[1] ?? '0', 10);
		const ore     = parseInt(rest[2] ?? '0', 10);
		if (!biomass && !alloy && !ore) return;
		await prisma.nexus.update({
			where: { id: nexusId },
			data: {
				biomass: { increment: biomass },
				alloy:   { increment: alloy },
				ore:     { increment: ore }
			}
		});
	} else if (type === 'boost') {
		const pct     = parseInt(rest[1] ?? '0', 10);
		const hours   = parseInt(rest[2] ?? '24', 10);
		const expiresAt = new Date(Date.now() + hours * 3_600_000);
		const player = await prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { nexusGroups: true }
		});
		if (!player) return;
		const groups = (player.nexusGroups as any[]) ?? [];
		groups.push({ type: 'production_boost', pct, expiresAt: expiresAt.toISOString() });
		await prisma.galaxyPlayer.update({
			where: { userId_galaxyId: { userId, galaxyId } },
			data: { nexusGroups: groups }
		});
	} else if (type === 'title') {
		const titleName = rest.join(':').trim();
		if (!titleName) return;
		// Append to earnedTitles on User (permanent) and set season title on GalaxyPlayer
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { earnedTitles: true }
		});
		const titles = (user?.earnedTitles as string[]) ?? [];
		if (!titles.includes(titleName)) {
			await prisma.user.update({
				where: { id: userId },
				data: { earnedTitles: [...titles, titleName] }
			});
		}
		await prisma.galaxyPlayer.update({
			where: { userId_galaxyId: { userId, galaxyId } },
			data: { passTitle: titleName }
		});
	} else if (type === 'badge') {
		const tier = rest[0]?.trim();
		if (!tier) return;
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { earnedBadges: true }
		});
		if (!user) return;
		const badges = (user.earnedBadges as string[]) ?? [];
		if (!badges.includes(tier)) {
			await prisma.user.update({
				where: { id: userId },
				data: { earnedBadges: [...badges, tier] }
			});
		}
	} else if (type === 'vexpoints') {
		const amount = parseInt(rest[0] ?? '0', 10);
		if (!amount) return;
		await prisma.user.update({
			where: { id: userId },
			data: { vexPoints: { increment: amount } }
		});
	} else if (type === 'token') {
		const count = parseInt(rest[0] ?? '1', 10);
		if (!count) return;
		for (let i = 0; i < count; i++) {
			await prisma.milestoneToken.create({
				data: {
					userId,
					milestone: 0,
					rewardType: 'battle_pass',
					rewardMeta: { reason: 'battle_pass', tokenIndex: i, tokenCount: count }
				}
			});
		}
	}
}

// Returns the active production boost pct for a player (0 if none or expired).
export async function getActiveProductionBoostPct(userId: number, galaxyId: number): Promise<number> {
	const player = await prisma.galaxyPlayer.findUnique({
		where: { userId_galaxyId: { userId, galaxyId } },
		select: { nexusGroups: true }
	});
	if (!player) return 0;
	const groups = (player.nexusGroups as Array<{ type: string; pct?: number; expiresAt?: string }> | null) ?? [];
	const now = new Date();
	let maxPct = 0;
	for (const g of groups) {
		if (g.type === 'production_boost' && typeof g.pct === 'number' && g.expiresAt) {
			if (new Date(g.expiresAt) > now) maxPct = Math.max(maxPct, g.pct);
		}
	}
	return maxPct;
}

// Purchase the paid pass using Vex Points. Deducts 1,000 VP, sets hasPaidPass.
// Does NOT back-fill paid rewards — unclaimed levels remain claimable via
// the normal claim flow, which now includes paid rewards.
// Returns an error string or null on success.
export async function purchasePaidPass(userId: number, galaxyId: number): Promise<string | null> {
	const [player, user] = await Promise.all([
		prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { hasPaidPass: true, passLevel: true }
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: { vexPoints: true }
		})
	]);

	if (!player) return 'Not a member of this galaxy';
	if (player.hasPaidPass) return 'Already purchased';
	if (!user || user.vexPoints < PASS_COST_VP) return 'Not enough Vex Points';

	await Promise.all([
		prisma.galaxyPlayer.update({
			where: { userId_galaxyId: { userId, galaxyId } },
			data: { hasPaidPass: true }
		}),
		prisma.user.update({
			where: { id: userId },
			data: { vexPoints: { decrement: PASS_COST_VP } }
		})
	]);

	return null;
}

// Credit Vex Points to a user (called from payment webhook after €4.99 purchase).
export async function grantVexPoints(userId: number, amount: number): Promise<void> {
	await prisma.user.update({
		where: { id: userId },
		data: { vexPoints: { increment: amount } }
	});
}

// Pass title rank — higher index = more prestigious. Used to ensure we never
// downgrade a user's permanent title when a new season ends.
export const PASS_TITLE_RANK: Record<string, number> = {
	Conscript: 1,
	Operative: 2,
	Proven: 3,
	Veteran: 4,
	'Vex Commander': 5,
	'High Commander': 6,
	'Season Conqueror': 7
};

// Called by endGalaxy() for each participant. Appends the season passTitle to
// User.earnedTitles (if not already there) and keeps User.passTitle as the
// highest-ranked title ever earned.
export async function promotePassTitle(userId: number, galaxyId: number): Promise<void> {
	const [player, user] = await Promise.all([
		prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { passTitle: true }
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: { passTitle: true, earnedTitles: true }
		})
	]);

	const newTitle = player?.passTitle;
	if (!newTitle) return;

	const currentRank = user?.passTitle ? (PASS_TITLE_RANK[user.passTitle] ?? 0) : 0;
	const newRank = PASS_TITLE_RANK[newTitle] ?? 0;

	const earnedTitles = (user?.earnedTitles as string[]) ?? [];
	const updates: Record<string, unknown> = {};

	if (!earnedTitles.includes(newTitle)) {
		updates.earnedTitles = [...earnedTitles, newTitle];
	}
	if (newRank > currentRank) {
		updates.passTitle = newTitle;
	}

	if (Object.keys(updates).length > 0) {
		await prisma.user.update({ where: { id: userId }, data: updates });
	}
}

export { REWARD_TABLE, rewardByLevel };
