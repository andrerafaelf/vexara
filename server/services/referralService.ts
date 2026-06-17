import { randomInt } from 'crypto';
import prisma from '../lib/prisma.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from './warRoomSocket.js';

export const REFERRAL_THRESHOLD = 1000;
export const REFERRAL_EARLY_THRESHOLD = 100;
export const MILESTONE_THRESHOLD = 500;

// At this influence, a referred player triggers a one-time VP bonus paid to BOTH
// sides of the referral. 250 VP each (~half the signup grant). Fires once per
// referee, deduped by User.referralVpBonusAt.
export const REFERRAL_VP_BONUS_THRESHOLD = 5000;
export const REFERRAL_VP_BONUS_AMOUNT = 250;

// Unambiguous alphabet: no 0/O/1/I/L. 8 chars → ~1.1e12 combinations.
const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const REFERRAL_CODE_LENGTH = 8;

function randomReferralCode(): string {
	let out = '';
	for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
		out += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
	}
	return out;
}

export async function generateUniqueReferralCode(): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = randomReferralCode();
		const clash = await prisma.user.findUnique({
			where: { referralCode: code },
			select: { id: true }
		});
		if (!clash) return code;
	}
	throw new Error('Failed to generate unique referral code after 5 attempts');
}

// --- Referral tokens (earned by the referrer when referee hits REFERRAL_THRESHOLD) ---

export function getReferralsByReferrer(referrerId: number) {
	return prisma.referralToken.findMany({
		where: { referrerId },
		include: { referrer: { select: { username: true } } },
		orderBy: { id: 'asc' }
	});
}

export function getPendingTokens(referrerId: number) {
	return prisma.referralToken.findMany({
		where: { referrerId, redeemedAt: null }
	});
}

export function getTokenById(tokenId: number) {
	return prisma.referralToken.findUnique({ where: { id: tokenId } });
}

export function markTokenRedeemed(tokenId: number, rewardType: string, rewardMeta: object) {
	return prisma.referralToken.update({
		where: { id: tokenId },
		data: { redeemedAt: new Date(), rewardType, rewardMeta }
	});
}

// Minimum time (ms) a referred account must exist before the referrer earns
// any tokens. Bots typically hit the threshold within minutes; legitimate
// players take at least a few hours of actual play.
const REFERRAL_MIN_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function checkAndGrantToken(
	refereeId: number,
	currentPoints: number,
	galaxyId: number
): Promise<void> {
	if (currentPoints < REFERRAL_EARLY_THRESHOLD) return;

	const referee = await prisma.user.findUnique({
		where: { id: refereeId },
		select: { referredById: true, createdAt: true }
	});
	if (!referee?.referredById) return;

	// Age gate: suppress token grant for accounts that are too new.
	if (referee.createdAt && Date.now() - referee.createdAt.getTime() < REFERRAL_MIN_AGE_MS) return;

	const refereeUser = await prisma.user.findUnique({
		where: { id: refereeId },
		select: { username: true }
	});
	const refName = refereeUser?.username ?? 'Your referral';

	// VP bonus is independent of the token milestones and self-deduping, so run it
	// up front — it must fire even on calls where the token grants already exist
	// (i.e. a referee who passed 1,000 long ago and is only now crossing 5,000).
	await grantReferralVpBonus(refereeId, referee.referredById, currentPoints, refName);

	// Early reward: 1 token when the referee hits REFERRAL_EARLY_THRESHOLD points.
	// Keyed on a negative galaxyId sentinel so it doesn't collide with the main token's unique index.
	const earlyKey = { refereeId, galaxyId: -galaxyId };
	const earlyExists = await prisma.referralToken.findUnique({
		where: { refereeId_galaxyId: earlyKey },
		select: { id: true }
	});
	if (!earlyExists) {
		await prisma.referralToken.create({
			data: { referrerId: referee.referredById, refereeId, galaxyId: -galaxyId }
		});
		void sendPushToUser(referee.referredById, NOTIF.TOKEN_GRANTED, {
			title: 'Referral reward - Early Scout',
			body: `${refName} is active - you earned 1 token. Keep an eye out: 2 more coming when they hit ${REFERRAL_THRESHOLD} pts.`,
			tag: `token-referral-early-${refereeId}-${galaxyId}`,
			data: { url: '/profile' }
		});
		notifyBadgeUpdate(referee.referredById);
	}

	if (currentPoints < REFERRAL_THRESHOLD) return;

	// Main reward: 2 tokens when the referee hits REFERRAL_THRESHOLD points.
	// Idempotent per (refereeId, galaxyId), tokens stack across galaxies.
	const existing = await prisma.referralToken.findUnique({
		where: { refereeId_galaxyId: { refereeId, galaxyId } },
		select: { id: true }
	});
	if (existing) return;

	await prisma.referralToken.createMany({
		data: [
			{ referrerId: referee.referredById, refereeId, galaxyId },
			{ referrerId: referee.referredById, refereeId, galaxyId }
		],
		skipDuplicates: true
	});

	void sendPushToUser(referee.referredById, NOTIF.TOKEN_GRANTED, {
		title: "Commander's Cache - 2 tokens earned",
		body: `${refName} hit ${REFERRAL_THRESHOLD} points. Spend your tokens on instant building levels or free troops.`,
		tag: `token-referral-${refereeId}-${galaxyId}`,
		data: { url: '/profile' }
	});
	notifyBadgeUpdate(referee.referredById);
}

// One-time VP bonus to both the referee and their referrer once the referee
// reaches REFERRAL_VP_BONUS_THRESHOLD influence. Deduped by User.referralVpBonusAt:
// the updateMany WHERE referralVpBonusAt = null guarantees exactly one winner even
// under concurrent calls, so the VP grant below never double-pays.
async function grantReferralVpBonus(
	refereeId: number,
	referrerId: number,
	currentPoints: number,
	refName: string
): Promise<void> {
	if (currentPoints < REFERRAL_VP_BONUS_THRESHOLD) return;

	const claim = await prisma.user.updateMany({
		where: { id: refereeId, referralVpBonusAt: null },
		data: { referralVpBonusAt: new Date() }
	});
	// Another concurrent call already claimed it (or it was granted before).
	if (claim.count === 0) return;

	await prisma.$transaction([
		prisma.user.update({
			where: { id: refereeId },
			data: { vexPoints: { increment: REFERRAL_VP_BONUS_AMOUNT } }
		}),
		prisma.user.update({
			where: { id: referrerId },
			data: { vexPoints: { increment: REFERRAL_VP_BONUS_AMOUNT } }
		})
	]);

	void sendPushToUser(referrerId, NOTIF.TOKEN_GRANTED, {
		title: `+${REFERRAL_VP_BONUS_AMOUNT} Vex Points earned`,
		body: `${refName} reached ${REFERRAL_VP_BONUS_THRESHOLD.toLocaleString()} influence - you both earned ${REFERRAL_VP_BONUS_AMOUNT} VP.`,
		tag: `referral-vp-${refereeId}`,
		data: { url: '/shop' }
	});
	void sendPushToUser(refereeId, NOTIF.TOKEN_GRANTED, {
		title: `+${REFERRAL_VP_BONUS_AMOUNT} Vex Points earned`,
		body: `You hit ${REFERRAL_VP_BONUS_THRESHOLD.toLocaleString()} influence - here's ${REFERRAL_VP_BONUS_AMOUNT} VP from your referral.`,
		tag: `referral-vp-self-${refereeId}`,
		data: { url: '/shop' }
	});
	notifyBadgeUpdate(referrerId);
	notifyBadgeUpdate(refereeId);
}

export async function getReferralStatus(referrerId: number) {
	// All users who signed up with this referrer's code
	const referees = await prisma.user.findMany({
		where: { referredById: referrerId },
		select: { id: true, username: true },
		orderBy: { id: 'asc' }
	});

	if (referees.length === 0) return { referees: [], tokens: [] };

	const refereeIds = referees.map((r) => r.id);

	const [tokens, playerRecords] = await Promise.all([
		prisma.referralToken.findMany({
			where: { referrerId },
			orderBy: { id: 'asc' }
		}),
		prisma.galaxyPlayer.findMany({
			where: { userId: { in: refereeIds } },
			select: { userId: true, points: true },
			orderBy: { points: 'desc' }
		})
	]);

	const bestPoints = new Map<number, number>();
	for (const p of playerRecords) {
		const current = bestPoints.get(p.userId) ?? 0;
		if (p.points > current) bestPoints.set(p.userId, p.points);
	}

	const usernameMap = new Map(referees.map((r) => [r.id, r.username]));

	// One row per referee showing their progress, regardless of whether they've earned a token yet
	const refereeRows = referees.map((r) => ({
		refereeId: r.id,
		refereeUsername: r.username,
		refereePoints: bestPoints.get(r.id) ?? 0,
		thresholdMet: (bestPoints.get(r.id) ?? 0) >= REFERRAL_THRESHOLD
	}));

	// Token rows (for redemption UI)
	const tokenRows = tokens.map((t) => ({
		tokenId: t.id,
		refereeId: t.refereeId,
		refereeUsername: usernameMap.get(t.refereeId) ?? 'Unknown',
		refereePoints: bestPoints.get(t.refereeId) ?? 0,
		thresholdMet: true,
		redeemed: t.redeemedAt !== null,
		redeemedAt: t.redeemedAt,
		rewardType: t.rewardType,
		rewardMeta: t.rewardMeta
	}));

	return { referees: refereeRows, tokens: tokenRows };
}

// --- Milestone tokens (everyone earns 1 at MILESTONE_THRESHOLD points, no referral needed) ---

export async function checkAndGrantMilestoneToken(
	userId: number,
	currentPoints: number
): Promise<void> {
	if (currentPoints < MILESTONE_THRESHOLD) return;

	// Dedupe is handled by a partial unique index (userId, milestone) WHERE milestone > 0,
	// so a P2002 here means "already granted" and we swallow it.
	try {
		await prisma.milestoneToken.create({
			data: { userId, milestone: MILESTONE_THRESHOLD }
		});
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code !== 'P2002') throw err;
	}
}

export function getPendingMilestoneTokens(userId: number) {
	return prisma.milestoneToken.findMany({
		where: { userId, redeemedAt: null },
		select: {
			id: true,
			userId: true,
			milestone: true,
			redeemedAt: true,
			rewardType: true,
			rewardMeta: true,
			kofiTransactionId: true
		}
	});
}

export function getMilestoneTokenById(tokenId: number) {
	return prisma.milestoneToken.findUnique({ where: { id: tokenId } });
}

export function markMilestoneTokenRedeemed(
	tokenId: number,
	rewardType: string,
	rewardMeta: object
) {
	return prisma.milestoneToken.update({
		where: { id: tokenId },
		data: { redeemedAt: new Date(), rewardType, rewardMeta }
	});
}
