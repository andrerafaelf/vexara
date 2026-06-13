import prisma from '../lib/prisma.js';
import { logError } from './logger.js';

// XP required to reach each level (cumulative). 30 levels total.
// Designed so a player doing dailies + moderate combat hits level 30 in ~5 weeks.
const LEVEL_XP_THRESHOLDS: number[] = (() => {
	const thresholds: number[] = [0];
	for (let lvl = 1; lvl <= 30; lvl++) {
		thresholds.push(lvl * 300); // 300 XP per level; 9,000 XP to max
	}
	return thresholds; // index = level, value = cumulative XP required
})();

export const MAX_PASS_LEVEL = 30;

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

// Full 30-level Vex Protocol reward table.
//
// Free track (Protocol: Field):   resources + badges + Veteran title at 30
// Paid track (Protocol: Command): titles + boosts + Vex Points
//
// VP total on paid track: 10+10+10+10+20+10+15+15+15+15+20+20+200 = 600 VP
// (60% of the 1,000 VP cost — the pass pays for 60% of the next one)
//
// Reward format strings:
//   resources:<resource>:<amount>         — deposit to player's nexus
//   boost:production:<pct>:<hours>        — stored in GalaxyPlayer for Phase 6 economy
//   title:<Name>                          — season-scoped title (Phase 6 promotes to User)
//   badge:<tier>                          — cosmetic badge (Phase 6 cosmetic system)
//   vexpoints:<amount>                    — credited to User.vexPoints
const REWARD_TABLE: PassReward[] = [
	{ level:  1, free: 'resources:biomass:200',              paid: 'title:Recruit' },
	{ level:  2, free: 'resources:alloy:200',                paid: 'boost:production:5:12' },
	{ level:  3, free: 'resources:ore:200',                  paid: 'vexpoints:10' },
	{ level:  4, free: 'resources:biomass:300',              paid: 'boost:production:5:12' },
	{ level:  5, free: 'badge:bronze',                       paid: 'vexpoints:10' },
	{ level:  6, free: 'resources:alloy:300',                paid: 'title:Operative' },
	{ level:  7, free: 'resources:ore:300',                  paid: 'boost:production:8:18' },
	{ level:  8, free: 'resources:biomass:400',              paid: 'vexpoints:10' },
	{ level:  9, free: 'resources:alloy:400',                paid: 'boost:production:8:18' },
	{ level: 10, free: 'resources:ore:400',                  paid: 'vexpoints:20' },
	{ level: 11, free: 'resources:biomass:500',              paid: 'boost:production:10:24' },
	{ level: 12, free: 'resources:alloy:500',                paid: 'vexpoints:10' },
	{ level: 13, free: 'resources:ore:500',                  paid: 'boost:production:10:24' },
	{ level: 14, free: 'resources:biomass:600',              paid: 'vexpoints:10' },
	{ level: 15, free: 'badge:silver',                       paid: 'title:Proven' },
	{ level: 16, free: 'resources:alloy:600',                paid: 'boost:production:12:24' },
	{ level: 17, free: 'resources:ore:600',                  paid: 'vexpoints:15' },
	{ level: 18, free: 'resources:biomass:700',              paid: 'boost:production:12:24' },
	{ level: 19, free: 'resources:alloy:700',                paid: 'vexpoints:15' },
	{ level: 20, free: 'resources:ore:700',                  paid: 'boost:production:15:48' },
	{ level: 21, free: 'resources:biomass:800',              paid: 'vexpoints:15' },
	{ level: 22, free: 'resources:alloy:800',                paid: 'boost:production:15:48' },
	{ level: 23, free: 'resources:ore:800,resources:biomass:300', paid: 'vexpoints:15' },
	{ level: 24, free: 'resources:alloy:900',                paid: 'boost:production:18:48' },
	{ level: 25, free: 'badge:gold',                         paid: 'title:Vex Commander' },
	{ level: 26, free: 'resources:ore:900',                  paid: 'boost:production:18:72' },
	{ level: 27, free: 'resources:biomass:1000',             paid: 'vexpoints:20' },
	{ level: 28, free: 'resources:alloy:1000',               paid: 'boost:production:20:72' },
	{ level: 29, free: 'resources:ore:1000',                 paid: 'vexpoints:20' },
	{ level: 30, free: 'title:Veteran,badge:platinum',       paid: 'title:Season Conqueror,vexpoints:200,boost:production:25:72' }
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
		// Season-scoped title stored in GalaxyPlayer (Phase 6 promotes to User)
		// No-op beyond level tracking — client derives display from passLevel + hasPaidPass
	} else if (type === 'badge') {
		// Cosmetic badge — deferred to Phase 6 cosmetic system
	} else if (type === 'vexpoints') {
		const amount = parseInt(rest[0] ?? '0', 10);
		if (!amount) return;
		await prisma.user.update({
			where: { id: userId },
			data: { vexPoints: { increment: amount } }
		});
	}
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
