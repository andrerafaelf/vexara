import prisma from '../lib/prisma.js';
import { logError } from './logger.js';

// XP required to reach each level (cumulative). 50 levels total.
// 300 XP/level = 15,000 XP to max.
// Active player (~505 XP/day: dailies + combat): L50 in ~30 days (week 4-5 of a 6-week season).
// Casual player (~265 XP/day: dailies only): never maxes — still earns meaningful rewards every session.
const LEVEL_XP_THRESHOLDS: number[] = (() => {
	const thresholds: number[] = [0];
	for (let lvl = 1; lvl <= 50; lvl++) {
		thresholds.push(lvl * 300); // flat 300 XP per level
	}
	return thresholds; // index = level, value = cumulative XP required
})();

export const MAX_PASS_LEVEL = 50;

// Vex Pass costs 1,000 VP. €4.99 purchase = 1,000 VP.
export const PASS_COST_VP = 1000;

export const PASS_XP = {
	QUEST_COMPLETE:     150,
	QUEST_STREAK_BONUS:  75,
	ATTACK_LAUNCHED:     20,
	ATTACK_WON:          40,
	NEXUS_CAPTURED:      80,
	DEFENSE_WON:         50,
	COORDINATED_ASSAULT: 100,
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
//   Resources scale from 500 → 25,000 per reward. Badge milestones at L10/25/40.
//   Free VP at L10/20/30/40/50 (100 VP total — tastes the currency, can't buy a pass alone).
//   Veteran title at L40. Platinum badge + 30 VP at L50.
//
// Paid track  (Protocol: Command):
//   Titles: Recruit(1) → Operative(8) → Proven(18) → Vex Commander(30) → High Commander(45) → Season Conqueror(50)
//   Boosts escalate from +5% 12h → +35% 120h. VP chunks grow every act.
//   L50 paid: Season Conqueror + 300 VP + +35% prod 120h — the capstone that justifies the pass.
//
// VP total on paid track (verified):
//   L3:10 + L5:15 + L8:15 + L10:25 + L13:15 + L15:20 + L18:20 + L20:30 +
//   L23:20 + L25:30 + L28:25 + L30:35 + L33:25 + L35:35 + L38:30 + L40:40 +
//   L43:30 + L45:45 + L48:35 + L50:300
//   = 750 VP  (75% of the 1,000 VP cost returned)
//
// Free VP total: L10:10 + L20:15 + L30:20 + L40:25 + L50:30 = 100 VP
//
// Reward format strings:
//   resources:<resource>:<amount>         — deposited to player's nexus
//   boost:production:<pct>:<hours>        — time-limited production multiplier
//   title:<Name>                          — season-scoped prestige title
//   badge:<tier>                          — permanent career badge
//   vexpoints:<amount>                    — credited to User.vexPoints
const REWARD_TABLE: PassReward[] = [
	// ── Act I: Enlistment (1–10) ─────────────────────────────────────────────────
	// Early hook. Resources feel immediately useful. Recruit title + first VP taste.
	{ level:  1, free: 'resources:biomass:500',                                              paid: 'title:Recruit' },
	{ level:  2, free: 'resources:alloy:500',                                                paid: 'boost:production:5:12' },
	{ level:  3, free: 'resources:ore:500',                                                  paid: 'vexpoints:10' },
	{ level:  4, free: 'resources:biomass:750,resources:alloy:500',                          paid: 'boost:production:8:18' },
	{ level:  5, free: 'resources:ore:750',                                                  paid: 'vexpoints:15' },
	{ level:  6, free: 'resources:biomass:1000',                                             paid: 'boost:production:10:24' },
	{ level:  7, free: 'resources:alloy:1000',                                               paid: 'boost:production:10:24' },
	{ level:  8, free: 'resources:ore:1000',                                                 paid: 'title:Operative,vexpoints:15' },
	{ level:  9, free: 'resources:biomass:1200,resources:alloy:800',                         paid: 'boost:production:12:24' },
	{ level: 10, free: 'badge:bronze,vexpoints:10',                                          paid: 'vexpoints:25,boost:production:12:36' },

	// ── Act II: Field Ops (11–20) ────────────────────────────────────────────────
	// Resources grow fast. Paid track starts delivering real boost windows.
	{ level: 11, free: 'resources:biomass:1500',                                             paid: 'boost:production:15:36' },
	{ level: 12, free: 'resources:alloy:1500',                                               paid: 'boost:production:15:36' },
	{ level: 13, free: 'resources:ore:1500',                                                 paid: 'vexpoints:15' },
	{ level: 14, free: 'resources:biomass:2000,resources:ore:1000',                          paid: 'boost:production:15:48' },
	{ level: 15, free: 'resources:alloy:2000',                                               paid: 'vexpoints:20' },
	{ level: 16, free: 'resources:ore:2000',                                                 paid: 'boost:production:18:48' },
	{ level: 17, free: 'resources:biomass:2500,resources:alloy:1500',                        paid: 'boost:production:18:48' },
	{ level: 18, free: 'resources:ore:2500',                                                 paid: 'title:Proven,vexpoints:20' },
	{ level: 19, free: 'resources:biomass:3000,resources:alloy:2000',                        paid: 'boost:production:20:48' },
	{ level: 20, free: 'resources:ore:3000,vexpoints:15',                                    paid: 'vexpoints:30,boost:production:20:72' },

	// ── Act III: Warfront (21–30) ────────────────────────────────────────────────
	// Resources are now serious war-chest drops. Boosts cross into 72h territory.
	{ level: 21, free: 'resources:biomass:3500,resources:alloy:2500',                        paid: 'boost:production:22:72' },
	{ level: 22, free: 'resources:ore:3500',                                                 paid: 'boost:production:22:72' },
	{ level: 23, free: 'resources:biomass:4000,resources:alloy:3000',                        paid: 'vexpoints:20' },
	{ level: 24, free: 'resources:ore:4000',                                                 paid: 'boost:production:22:72' },
	{ level: 25, free: 'badge:silver,resources:biomass:4000',                                paid: 'vexpoints:30' },
	{ level: 26, free: 'resources:alloy:4500,resources:ore:3000',                            paid: 'boost:production:25:72' },
	{ level: 27, free: 'resources:biomass:5000',                                             paid: 'boost:production:25:72' },
	{ level: 28, free: 'resources:alloy:5000,resources:ore:3500',                            paid: 'vexpoints:25' },
	{ level: 29, free: 'resources:biomass:6000,resources:alloy:4000',                        paid: 'boost:production:25:96' },
	{ level: 30, free: 'resources:ore:6000,vexpoints:20',                                    paid: 'title:Vex Commander,vexpoints:35,boost:production:25:96' },

	// ── Act IV: High Command (31–40) ─────────────────────────────────────────────
	// Resources are genuinely impactful now. Boosts hit 96h+. VP gets serious.
	{ level: 31, free: 'resources:biomass:7000,resources:alloy:5000',                        paid: 'boost:production:28:96' },
	{ level: 32, free: 'resources:ore:7000',                                                 paid: 'boost:production:28:96' },
	{ level: 33, free: 'resources:biomass:8000,resources:alloy:5000,resources:ore:4000',     paid: 'vexpoints:25' },
	{ level: 34, free: 'resources:biomass:8000,resources:ore:6000',                          paid: 'boost:production:28:96' },
	{ level: 35, free: 'resources:alloy:9000,resources:biomass:6000',                        paid: 'vexpoints:35' },
	{ level: 36, free: 'resources:ore:9000,resources:alloy:6000',                            paid: 'boost:production:30:96' },
	{ level: 37, free: 'resources:biomass:10000,resources:alloy:7000',                       paid: 'boost:production:30:96' },
	{ level: 38, free: 'resources:ore:10000,resources:biomass:7000',                         paid: 'vexpoints:30' },
	{ level: 39, free: 'resources:biomass:12000,resources:alloy:8000,resources:ore:6000',    paid: 'boost:production:30:120' },
	{ level: 40, free: 'badge:gold,title:Veteran,vexpoints:25',                              paid: 'vexpoints:40,boost:production:30:120' },

	// ── Act V: The Vex Reckoning (41–50) ─────────────────────────────────────────
	// End-game. Resources at this tier are war-defining drops. Paid track rewards
	// are the best in the game. L50 is the single most valuable level in Vexara history.
	{ level: 41, free: 'resources:biomass:13000,resources:alloy:9000',                       paid: 'boost:production:32:120' },
	{ level: 42, free: 'resources:ore:13000,resources:biomass:9000',                         paid: 'boost:production:32:120' },
	{ level: 43, free: 'resources:biomass:15000,resources:alloy:10000,resources:ore:8000',   paid: 'vexpoints:30' },
	{ level: 44, free: 'resources:biomass:15000,resources:alloy:12000',                      paid: 'boost:production:33:120' },
	{ level: 45, free: 'resources:ore:15000,resources:biomass:10000',                        paid: 'title:High Commander,vexpoints:45,boost:production:33:120' },
	{ level: 46, free: 'resources:biomass:18000,resources:alloy:13000',                      paid: 'boost:production:35:120' },
	{ level: 47, free: 'resources:ore:18000,resources:alloy:14000',                          paid: 'boost:production:35:120' },
	{ level: 48, free: 'resources:biomass:20000,resources:alloy:15000,resources:ore:12000',  paid: 'vexpoints:35' },
	{ level: 49, free: 'resources:biomass:22000,resources:alloy:18000,resources:ore:15000',  paid: 'boost:production:35:120' },

	// ── L50: The Capstone ─────────────────────────────────────────────────────────
	// Free: Platinum badge + 30 VP. The rarest badge in the game. Proof you played.
	// Paid: Season Conqueror title + 300 VP (biggest single VP grant) + +35% prod 120h.
	//       300 VP alone is 40% of the pass cost. With 750 total this pass nearly
	//       funds the next one outright. Absolutely insane. You earned it.
	{ level: 50, free: 'badge:platinum,vexpoints:30',                                        paid: 'title:Season Conqueror,vexpoints:300,boost:production:35:120' },
];

const rewardByLevel = new Map(REWARD_TABLE.map((r) => [r.level, r]));

// Grant seasonal XP to a player. Fires level-up rewards for every new level
// crossed. Safe to call fire-and-forget (void) — errors are caught internally.
export async function grantPassXp(
	userId: number,
	galaxyId: number,
	event: PassXpEvent
): Promise<void> {
	try {
		const xpAmount = PASS_XP[event];

		const player = await prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { seasonXp: true, passLevel: true, hasPaidPass: true }
		});

		if (!player) return;
		if (player.passLevel >= MAX_PASS_LEVEL) return;

		const newXp = player.seasonXp + xpAmount;
		let newLevel = player.passLevel;

		while (newLevel < MAX_PASS_LEVEL && newXp >= LEVEL_XP_THRESHOLDS[newLevel + 1]) {
			newLevel++;
			await dispatchReward(userId, galaxyId, newLevel, player.hasPaidPass);
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

async function dispatchReward(
	userId: number,
	galaxyId: number,
	level: number,
	hasPaidPass: boolean
): Promise<void> {
	const reward = rewardByLevel.get(level);
	if (!reward) return;

	const tracks = [reward.free, ...(hasPaidPass ? [reward.paid] : [])].filter(Boolean) as string[];

	for (const rewardStr of tracks) {
		for (const part of rewardStr.split(',')) {
			await applyRewardPart(userId, galaxyId, part.trim());
		}
	}
}

async function applyRewardPart(userId: number, galaxyId: number, part: string): Promise<void> {
	const [type, ...rest] = part.split(':');

	if (type === 'resources') {
		const resource = rest[0] as 'biomass' | 'alloy' | 'ore';
		const amount = parseInt(rest[1] ?? '0', 10);
		if (!amount) return;
		const nexus = await prisma.nexus.findFirst({
			where: { ownerId: userId, galaxyId },
			select: { id: true }
		});
		if (!nexus) return;
		await prisma.nexus.update({
			where: { id: nexus.id },
			data: { [resource]: { increment: amount } }
		});
	} else if (type === 'boost') {
		// Stored in GalaxyPlayer.nexusGroups JSON for Phase 6 economy integration
		const pct = parseInt(rest[1] ?? '0', 10);
		const hours = parseInt(rest[2] ?? '24', 10);
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

// Purchase the paid pass using Vex Points. Deducts 1,000 VP, sets hasPaidPass,
// and back-fills paid rewards for all levels already reached.
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

	// Back-fill paid rewards for levels already reached before purchase
	for (let lvl = 1; lvl <= player.passLevel; lvl++) {
		const reward = rewardByLevel.get(lvl);
		if (!reward?.paid) continue;
		for (const part of reward.paid.split(',')) {
			await applyRewardPart(userId, galaxyId, part.trim());
		}
	}

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
const PASS_TITLE_RANK: Record<string, number> = {
	Recruit: 1,
	Operative: 2,
	Proven: 3,
	Veteran: 4,
	'Vex Commander': 5,
	'High Commander': 6,
	'Season Conqueror': 7
};

// Called by endGalaxy() for each participant. Promotes the player's season
// passTitle to User.passTitle if it outranks their current permanent title.
export async function promotePassTitle(userId: number, galaxyId: number): Promise<void> {
	const [player, user] = await Promise.all([
		prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId, galaxyId } },
			select: { passTitle: true }
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: { passTitle: true }
		})
	]);

	const newTitle = player?.passTitle;
	if (!newTitle) return;

	const currentRank = user?.passTitle ? (PASS_TITLE_RANK[user.passTitle] ?? 0) : 0;
	const newRank = PASS_TITLE_RANK[newTitle] ?? 0;
	if (newRank <= currentRank) return;

	await prisma.user.update({
		where: { id: userId },
		data: { passTitle: newTitle }
	});
}
