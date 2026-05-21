import { randomInt } from 'crypto';
import prisma from '../lib/prisma.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from './warRoomSocket.js';

export const REFERRAL_THRESHOLD = 1000;
export const MILESTONE_THRESHOLD = 500;

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
    const clash = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error('Failed to generate unique referral code after 5 attempts');
}

// --- Referral tokens (earned by the referrer when referee hits REFERRAL_THRESHOLD) ---

export function getReferralsByReferrer(referrerId: number) {
  return prisma.referralToken.findMany({
    where: { referrerId },
    include: { referrer: { select: { username: true } } },
    orderBy: { id: 'asc' },
  });
}

export function getPendingTokens(referrerId: number) {
  return prisma.referralToken.findMany({
    where: { referrerId, redeemedAt: null },
  });
}

export function getTokenById(tokenId: number) {
  return prisma.referralToken.findUnique({ where: { id: tokenId } });
}

export function markTokenRedeemed(tokenId: number, rewardType: string, rewardMeta: object) {
  return prisma.referralToken.update({
    where: { id: tokenId },
    data: { redeemedAt: new Date(), rewardType, rewardMeta },
  });
}

export async function checkAndGrantToken(refereeId: number, currentPoints: number, galaxyId: number): Promise<void> {
  if (currentPoints < REFERRAL_THRESHOLD) return;

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { referredById: true },
  });
  if (!referee?.referredById) return;

  // Idempotent per (refereeId, galaxyId), tokens stack across galaxies
  const existing = await prisma.referralToken.findUnique({
    where: { refereeId_galaxyId: { refereeId, galaxyId } },
    select: { id: true },
  });
  if (existing) return;

  // Referrer earns 2 tokens per galaxy the referee reaches the threshold in
  await prisma.referralToken.createMany({
    data: [
      { referrerId: referee.referredById, refereeId, galaxyId },
      { referrerId: referee.referredById, refereeId, galaxyId },
    ],
    skipDuplicates: true,
  });

  const refereeUser = await prisma.user.findUnique({ where: { id: refereeId }, select: { username: true } });
  void sendPushToUser(referee.referredById, NOTIF.TOKEN_GRANTED, {
    title: 'You earned 2 referral tokens',
    body: `${refereeUser?.username ?? 'Your referral'} hit ${REFERRAL_THRESHOLD} points — you can spend the tokens from your Referrals tab.`,
    tag: `token-referral-${refereeId}-${galaxyId}`,
    data: { url: '/profile' },
  });
  notifyBadgeUpdate(referee.referredById);
}

export async function getReferralStatus(referrerId: number) {
  // All users who signed up with this referrer's code
  const referees = await prisma.user.findMany({
    where: { referredById: referrerId },
    select: { id: true, username: true },
    orderBy: { id: 'asc' },
  });

  if (referees.length === 0) return { referees: [], tokens: [] };

  const refereeIds = referees.map((r) => r.id);

  const [tokens, playerRecords] = await Promise.all([
    prisma.referralToken.findMany({
      where: { referrerId },
      orderBy: { id: 'asc' },
    }),
    prisma.galaxyPlayer.findMany({
      where: { userId: { in: refereeIds } },
      select: { userId: true, points: true },
      orderBy: { points: 'desc' },
    }),
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
    thresholdMet: (bestPoints.get(r.id) ?? 0) >= REFERRAL_THRESHOLD,
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
    rewardMeta: t.rewardMeta,
  }));

  return { referees: refereeRows, tokens: tokenRows };
}

// --- Milestone tokens (everyone earns 1 at MILESTONE_THRESHOLD points, no referral needed) ---

export async function checkAndGrantMilestoneToken(userId: number, currentPoints: number): Promise<void> {
  if (currentPoints < MILESTONE_THRESHOLD) return;

  const existing = await prisma.milestoneToken.findUnique({
    where: { userId_milestone: { userId, milestone: MILESTONE_THRESHOLD } },
  });
  if (existing) return;

  await prisma.milestoneToken.create({
    data: { userId, milestone: MILESTONE_THRESHOLD },
  });
}

export function getPendingMilestoneTokens(userId: number) {
  return prisma.milestoneToken.findMany({
    where: { userId, redeemedAt: null },
  });
}

export function getMilestoneTokenById(tokenId: number) {
  return prisma.milestoneToken.findUnique({ where: { id: tokenId } });
}

export function markMilestoneTokenRedeemed(tokenId: number, rewardType: string, rewardMeta: object) {
  return prisma.milestoneToken.update({
    where: { id: tokenId },
    data: { redeemedAt: new Date(), rewardType, rewardMeta },
  });
}
