import prisma from '../lib/prisma.js';

export const REFERRAL_THRESHOLD = 500;

export function getReferralsByReferrer(referrerId: number) {
  return prisma.referralToken.findMany({
    where: { referrerId },
    include: { referrer: { select: { username: true } } },
    orderBy: { id: 'asc' },
  });
}

export function getReferralTokensByReferrer(referrerId: number) {
  return prisma.referralToken.findMany({
    where: { referrerId },
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

export async function checkAndGrantToken(refereeId: number, currentPoints: number): Promise<void> {
  if (currentPoints < REFERRAL_THRESHOLD) return;

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { referredById: true },
  });
  if (!referee?.referredById) return;

  // Token is unique per referee — if one already exists, the reward was already granted.
  const existing = await prisma.referralToken.findUnique({ where: { refereeId } });
  if (existing) return;

  await prisma.referralToken.create({
    data: { referrerId: referee.referredById, refereeId },
  });
}

export async function getReferralStatus(referrerId: number) {
  const tokens = await prisma.referralToken.findMany({
    where: { referrerId },
    orderBy: { id: 'asc' },
  });

  const refereeIds = tokens.map((t) => t.refereeId);
  const referees = await prisma.user.findMany({
    where: { id: { in: refereeIds } },
    select: { id: true, username: true },
  });

  const playerRecords = await prisma.galaxyPlayer.findMany({
    where: { userId: { in: refereeIds } },
    select: { userId: true, points: true, galaxyId: true },
    orderBy: { points: 'desc' },
  });

  // Pick highest points per user across all galaxies
  const bestPoints = new Map<number, number>();
  for (const p of playerRecords) {
    const current = bestPoints.get(p.userId) ?? 0;
    if (p.points > current) bestPoints.set(p.userId, p.points);
  }

  const usernameMap = new Map(referees.map((r) => [r.id, r.username]));

  return tokens.map((t) => ({
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
}
