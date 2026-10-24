import prisma from '../lib/prisma.js';
import { logError, logInfo } from './logger.js';
import { NOTIF, sendPushToUser } from './push.js';

// The Vex Pass is ONE permanent, account-wide pass. XP lives on User.passXp and
// accumulates across every galaxy, forever. Claims live in PassClaim rows
// (track 'free' | 'paid' for levels 1..50, track 'cache' for the repeatable
// post-L50 resource caches, level 51 = cache #1).
//
// Level = min(50, floor(passXp / 200)): flat 200 XP per level, 10,000 XP to max.
// XP past 10,000 keeps feeding repeatable resource caches (one per 200 XP).
// Daily XP is capped at 800 per account per UTC day, and banked caches are
// capped so XP cannot be stockpiled without limit (see grantPassXp).
// Reward claims are paced per galaxy and must fit the target nexus storage
// (see claimPassReward).
export const MAX_PASS_LEVEL = 50;
export const PASS_XP_PER_LEVEL = 200;
export const PASS_MAX_XP = MAX_PASS_LEVEL * PASS_XP_PER_LEVEL;

// Vex Pass costs 1,000 VP. €4.99 purchase = 1,000 VP.
export const PASS_COST_VP = 1000;

// Repeatable cache granted for every 200 XP past L50 (same on free and paid).
export const PASS_CACHE_REWARD = 'resources:50000:50000:50000';
// Max unclaimed caches that can be banked. Also bounds how far XP can run ahead.
export const PASS_CACHE_BANK_CAP = 10;
// Max pass XP an account can earn per UTC day.
export const PASS_DAILY_XP_CAP = 800;
// Pacing (Rule B): a fresh join may claim up to level 10 right away, then 4 more
// levels per (speed-scaled) day. Caches unlock once the allowance reaches level 50.
export const PASS_PACING_BASE_LEVELS = 10;
export const PASS_PACING_LEVELS_PER_DAY = 4;
export const PASS_CACHE_PACING_LEVEL = 50;
// Storage fit (Rule A): a claim is refused if, for any resource, the part that
// does not fit exceeds this fraction of the payload.
export const PASS_CLAIM_WASTE_TOLERANCE = 0.05;

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
//   Titles: Conscript(1) → Operative(8) → Proven(18) → Vex Commander(30) → High Commander(45) → Protocol Ascendant(50)
//   Boosts escalate from +5% 12h → +35% 120h.
//   Tokens: 1 token at L20, 1 at L35, 4 at L50 (total 6 tokens on full paid pass).
//   VP across the paid track = 520 VP total.
//
// Combined total returned to player: 250 (free) + 520 (paid) = 770 VP on a 1,000 VP pass.
//
// Reward format strings:
//   resources:<biomass>:<alloy>:<ore>          - all three deposited to selected nexus
//   boost:production:<pct>:<hours>             - time-limited production multiplier
//   title:<Name>                               - permanent prestige title
//   badge:<tier>                               - permanent career badge
//   vexpoints:<amount>                         - credited to User.vexPoints
//   token:<count>                              - MilestoneToken rows (rewardType: 'battle_pass')
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
	// Paid: Protocol Ascendant + 170 VP + 4 tokens + +35% prod 120h.
	{ level: 50, free: 'badge:platinum,vexpoints:20',                                   paid: 'title:Protocol Ascendant,vexpoints:170,token:4,boost:production:35:120' },
];

const rewardByLevel = new Map(REWARD_TABLE.map((r) => [r.level, r]));


// Pass title rank: higher = more prestigious. User.passTitle always holds the
// highest-ranked pass title the user owns.
export const PASS_TITLE_RANK: Record<string, number> = {
	Conscript: 1,
	Operative: 2,
	Proven: 3,
	Veteran: 4,
	'Vex Commander': 5,
	'High Commander': 6,
	'Protocol Ascendant': 7
};


export function passLevelForXp(xp: number): number {
	return Math.min(MAX_PASS_LEVEL, Math.floor(Math.max(0, xp) / PASS_XP_PER_LEVEL));
}

// Caches earned so far: one per full 200 XP past the L50 threshold.
export function cachesEarnedForXp(xp: number): number {
	return Math.max(0, Math.floor((xp - PASS_MAX_XP) / PASS_XP_PER_LEVEL));
}

// UTC day key shared with the daily quests.
export function utcDayKey(): string {
	return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

// Grant pass XP to an account. ONE atomic UPDATE: concurrent grants (combat fires
// 3-4 in parallel) cannot lose XP, because every term is evaluated against the
// locked row. granted = clamp(amount, remaining daily cap, remaining cache-bank
// room); the daily total counts what was actually granted, not the request.
// galaxyId is only used for logging. Safe to call fire-and-forget (void): errors
// are caught and logged.
export async function grantPassXp(
	userId: number,
	galaxyId: number,
	event: PassXpEvent
): Promise<void> {
	try {
		const amount = PASS_XP[event];
		if (!amount) return;
		const today = utcDayKey();
		const cacheCeilingBase = PASS_MAX_XP + PASS_XP_PER_LEVEL * PASS_CACHE_BANK_CAP;
		await prisma.$executeRaw`
      UPDATE "User"
      SET "passXp" = "passXp" + GREATEST(0, LEAST(
            ${amount}::int,
            ${PASS_DAILY_XP_CAP}::int - (CASE WHEN "passXpDay" = ${today}::text THEN "passXpDayTotal" ELSE 0 END),
            ${cacheCeilingBase}::int
              + ${PASS_XP_PER_LEVEL}::int * (
                  SELECT COUNT(*)::int FROM "PassClaim"
                  WHERE "PassClaim"."userId" = "User"."id" AND "PassClaim"."track" = 'cache'
                )
              - "passXp"
          )),
          "passXpDayTotal" = (CASE WHEN "passXpDay" = ${today}::text THEN "passXpDayTotal" ELSE 0 END)
            + GREATEST(0, LEAST(
                ${amount}::int,
                ${PASS_DAILY_XP_CAP}::int - (CASE WHEN "passXpDay" = ${today}::text THEN "passXpDayTotal" ELSE 0 END),
                ${cacheCeilingBase}::int
                  + ${PASS_XP_PER_LEVEL}::int * (
                      SELECT COUNT(*)::int FROM "PassClaim"
                      WHERE "PassClaim"."userId" = "User"."id" AND "PassClaim"."track" = 'cache'
                    )
                  - "passXp"
              )),
          "passXpDay" = ${today}::text
      WHERE "id" = ${userId}::int
    `;
	} catch (err) {
		logError('battle_pass_xp_error', {
			message: (err as Error).message,
			userId,
			galaxyId,
			passEvent: event
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

// ---------------------------------------------------------------------------
// Purchase and gift
// ---------------------------------------------------------------------------

// Purchase the paid track with Vex Points. One atomic conditional statement, so
// two concurrent purchases cannot both charge. No back-fill is needed: a claim
// takes every track still available for a level, so levels claimed earlier on
// the free track keep their paid half claimable.
// Returns an error string or null on success.
export async function purchasePaidPass(userId: number): Promise<string | null> {
	const { count } = await prisma.user.updateMany({
		where: { id: userId, hasPaidPass: false, vexPoints: { gte: PASS_COST_VP } },
		data: { hasPaidPass: true, vexPoints: { decrement: PASS_COST_VP } }
	});
	if (count === 1) return null;
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { hasPaidPass: true }
	});
	if (!user) return 'User not found';
	if (user.hasPaidPass) return 'Already purchased';
	return 'Not enough Vex Points';
}

export type GiftResult =
	| { ok: true; recipientUsername: string }
	| { ok: false; status: number; error: string };

class GiftAbort extends Error {
	constructor(readonly failure: 'gifter_vp' | 'recipient_owned') {
		super(failure);
		this.name = 'GiftAbort';
	}
}

// Gift the paid track to another player for the gifter's 1,000 VP. Single source
// of truth for /api/battle-pass/gift and /api/shop/gift-pass. One transaction:
// conditional decrement on the gifter, conditional unlock on the recipient; if
// either affects no row the whole thing rolls back. The pass is account-wide, so
// there is no shared-galaxy requirement. The shop source also records the
// ShopPurchase ledger row inside the same transaction.
export async function giftPaidPass(
	gifterId: number,
	recipientUsername: string,
	source: 'shop' | 'battle_pass'
): Promise<GiftResult> {
	const gifter = await prisma.user.findUnique({
		where: { id: gifterId },
		select: { id: true, username: true }
	});
	if (!gifter) return { ok: false, status: 404, error: 'User not found' };
	if (gifter.username.toLowerCase() === recipientUsername.toLowerCase()) {
		return { ok: false, status: 400, error: 'You cannot gift a pass to yourself' };
	}
	const recipient = await prisma.user.findFirst({
		where: { username: { equals: recipientUsername, mode: 'insensitive' } },
		select: { id: true, username: true }
	});
	if (!recipient) return { ok: false, status: 404, error: 'Player not found' };
	if (recipient.id === gifter.id) {
		return { ok: false, status: 400, error: 'You cannot gift a pass to yourself' };
	}

	try {
		await prisma.$transaction(async (tx) => {
			const charged = await tx.user.updateMany({
				where: { id: gifter.id, vexPoints: { gte: PASS_COST_VP } },
				data: { vexPoints: { decrement: PASS_COST_VP } }
			});
			if (charged.count === 0) throw new GiftAbort('gifter_vp');
			const unlocked = await tx.user.updateMany({
				where: { id: recipient.id, hasPaidPass: false },
				data: { hasPaidPass: true }
			});
			if (unlocked.count === 0) throw new GiftAbort('recipient_owned');
			if (source === 'shop') {
				await tx.shopPurchase.create({
					data: {
						userId: gifter.id,
						itemKey: 'gift_pass',
						itemType: 'gift_pass',
						vpSpent: PASS_COST_VP,
						meta: { recipientId: recipient.id, recipientUsername: recipient.username }
					}
				});
			}
		});
	} catch (err) {
		if (err instanceof GiftAbort) {
			if (err.failure === 'recipient_owned') {
				return { ok: false, status: 400, error: 'That player already owns the Vex Pass paid track.' };
			}
			const row = await prisma.user.findUnique({
				where: { id: gifter.id },
				select: { vexPoints: true }
			});
			return {
				ok: false,
				status: 400,
				error: `Not enough Vex Points (need ${PASS_COST_VP}, have ${row?.vexPoints ?? 0})`
			};
		}
		throw err;
	}

	logInfo(source === 'shop' ? 'shop_gift_pass' : 'vex_pass_gifted', {
		gifterId: gifter.id,
		gifterUsername: gifter.username,
		recipientId: recipient.id,
		recipientUsername: recipient.username
	});

	void sendPushToUser(recipient.id, NOTIF.TOKEN_GRANTED, {
		title: 'Vex Pass gifted!',
		body: `Commander ${gifter.username} gifted you the Vex Pass paid track.`,
		tag: `vex-pass-gift-${recipient.id}`,
		data: { url: '/play' }
	});

	return { ok: true, recipientUsername: recipient.username };
}

// Credit Vex Points to a user (called from payment webhook after €4.99 purchase).
export async function grantVexPoints(userId: number, amount: number): Promise<void> {
	await prisma.user.update({
		where: { id: userId },
		data: { vexPoints: { increment: amount } }
	});
}

export { REWARD_TABLE, rewardByLevel };
