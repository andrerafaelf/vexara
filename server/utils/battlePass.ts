import prisma from '../lib/prisma.js';
import { logError } from './logger.js';

// XP required to reach each level (cumulative). 30 levels total.
// Designed so a player doing dailies + moderate combat hits level 30 in ~5 weeks.
const LEVEL_XP_THRESHOLDS: number[] = (() => {
	const thresholds: number[] = [0]; // level 0 → 1 requires 0 (starts at 0)
	// Each level requires 300 XP; total to max = 9,000 XP
	for (let lvl = 1; lvl <= 30; lvl++) {
		thresholds.push(lvl * 300);
	}
	return thresholds; // index = level, value = total XP required to REACH that level
})();

export const MAX_PASS_LEVEL = 30;

export const PASS_XP = {
	QUEST_COMPLETE: 150,
	QUEST_STREAK_BONUS: 75,
	ATTACK_LAUNCHED: 20,
	ATTACK_WON: 40,
	NEXUS_CAPTURED: 80,
	DEFENSE_WON: 50,
	COORDINATED_ASSAULT: 100,
	FACTION_WAR_OP: 120,
	DIPLOMATIC_TREATY: 60
} as const;

export type PassXpEvent = keyof typeof PASS_XP;

interface PassReward {
	level: number;
	free: string | null;
	paid: string | null;
}

// Reward table. Keys are level numbers; free/paid describe what to grant.
// Null means no reward on that track at that level.
const REWARD_TABLE: PassReward[] = [
	{ level: 1,  free: null,                        paid: 'title:Recruit' },
	{ level: 3,  free: 'resources:biomass:500',      paid: 'boost:production:10:24' },
	{ level: 5,  free: 'badge:bronze',               paid: 'credit:50' },
	{ level: 10, free: 'resources:alloy:1000',       paid: 'boost:production:15:48' },
	{ level: 15, free: 'badge:silver',               paid: 'title:Proven' },
	{ level: 20, free: 'resources:ore:1500,biomass:500', paid: 'credit:100' },
	{ level: 25, free: 'badge:gold',                 paid: 'boost:production:20:72' },
	{ level: 30, free: 'title:Veteran',              paid: 'title:Season Conqueror,credit:150' }
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

		// Advance level for every threshold crossed
		while (newLevel < MAX_PASS_LEVEL && newXp >= LEVEL_XP_THRESHOLDS[newLevel + 1]) {
			newLevel++;
			await dispatchReward(userId, galaxyId, newLevel, player.hasPaidPass);
		}

		await prisma.galaxyPlayer.update({
			where: { userId_galaxyId: { userId, galaxyId } },
			data: { seasonXp: newXp, passLevel: newLevel }
		});
	} catch (err) {
		logError('battle_pass_xp_error', { message: (err as Error).message, userId, galaxyId, event });
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

// Reward format: "type:key:value" or "type:key"
async function applyRewardPart(userId: number, galaxyId: number, part: string): Promise<void> {
	const [type, ...rest] = part.split(':');

	if (type === 'resources') {
		// "resources:biomass:500"
		const resource = rest[0] as 'biomass' | 'alloy' | 'ore';
		const amount = parseInt(rest[1] ?? '0', 10);
		if (!amount) return;
		// Add to the player's primary nexus in this galaxy
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
		// "boost:production:10:24" — +10% production for 24h
		// Stored in GalaxyPlayer.nexusGroups JSON as a pass buff entry.
		// The economy engine and client can read this in Phase 6; for now it's
		// recorded so the data is there when the buff system is built.
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
		// "title:Veteran" — store as a season pass title separate from commander title
		// Written to GalaxyPlayer so it's season-scoped; Phase 6 can promote to User.
		// No-op for now beyond recording — the client reads passLevel to derive display.
	} else if (type === 'badge') {
		// "badge:gold" — cosmetic season badge; stored in GalaxyPlayer JSON
		// Deferred to Phase 6 cosmetic system.
	} else if (type === 'credit') {
		// "credit:100" — supporter credit in cents (€1.00)
		const cents = parseInt(rest[0] ?? '0', 10);
		if (!cents) return;
		await prisma.user.update({
			where: { id: userId },
			data: { supporterCreditCents: { increment: cents } }
		});
	}
}

// Purchase the paid pass for the current season. Returns error string or null.
export async function purchasePaidPass(userId: number, galaxyId: number): Promise<string | null> {
	const player = await prisma.galaxyPlayer.findUnique({
		where: { userId_galaxyId: { userId, galaxyId } },
		select: { hasPaidPass: true, passLevel: true }
	});
	if (!player) return 'Not a member of this galaxy';
	if (player.hasPaidPass) return 'Already purchased';

	await prisma.galaxyPlayer.update({
		where: { userId_galaxyId: { userId, galaxyId } },
		data: { hasPaidPass: true }
	});

	// Back-fill paid rewards for all levels already reached
	for (let lvl = 1; lvl <= player.passLevel; lvl++) {
		const reward = rewardByLevel.get(lvl);
		if (!reward?.paid) continue;
		for (const part of reward.paid.split(',')) {
			await applyRewardPart(userId, galaxyId, part.trim());
		}
	}

	return null;
}
