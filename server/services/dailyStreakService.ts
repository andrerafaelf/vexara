import prisma from '../lib/prisma.js';
import { createHash } from 'crypto';

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  target: number;
  category: string;
  reward: { type: 'resources'; biomass: number; alloy: number; ore: number };
}

const QUEST_TEMPLATES: Array<{
  id: string;
  title: string;
  description: string;
  target: number;
  category: string;
  reward: { type: 'resources'; biomass: number; alloy: number; ore: number };
}> = [
  { id: 'train_5',        title: 'Train Troops',    description: 'Train 5 troops of any type',          target: 5,  category: 'train',        reward: { type: 'resources', biomass: 2000, alloy: 2000, ore: 2000 } },
  { id: 'train_15',       title: 'Train Squad',     description: 'Train 15 troops of any type',         target: 15, category: 'train',        reward: { type: 'resources', biomass: 5000, alloy: 5000, ore: 5000 } },
  { id: 'train_30',       title: 'War Machine',     description: 'Train 30 troops of any type',         target: 30, category: 'train_heavy',  reward: { type: 'resources', biomass: 9000, alloy: 9000, ore: 9000 } },
  { id: 'upgrade_1',      title: 'Builder',         description: 'Start 1 building upgrade',            target: 1,  category: 'upgrade',      reward: { type: 'resources', biomass: 3000, alloy: 3000, ore: 3000 } },
  { id: 'upgrade_2',      title: 'Constructor',     description: 'Start 2 building upgrades',           target: 2,  category: 'upgrade',      reward: { type: 'resources', biomass: 6000, alloy: 6000, ore: 6000 } },
  { id: 'attack_1',       title: 'First Strike',    description: 'Launch 1 attack',                     target: 1,  category: 'attack',       reward: { type: 'resources', biomass: 4000, alloy: 4000, ore: 4000 } },
  { id: 'attack_3',       title: 'Aggressor',       description: 'Launch 3 attacks',                    target: 3,  category: 'attack_multi', reward: { type: 'resources', biomass: 9000, alloy: 9000, ore: 9000 } },
  { id: 'support_1',      title: 'Backbone',        description: 'Send 1 support mission to an ally',   target: 1,  category: 'support',      reward: { type: 'resources', biomass: 3500, alloy: 3500, ore: 3500 } },
  { id: 'scout_1',        title: 'Reconnaissance',  description: 'Send 1 espionage mission',            target: 1,  category: 'scout',        reward: { type: 'resources', biomass: 2500, alloy: 2500, ore: 2500 } },
  { id: 'sabotage_1',     title: 'Saboteur',        description: 'Send 1 sabotage mission',             target: 1,  category: 'sabotage',     reward: { type: 'resources', biomass: 4500, alloy: 4500, ore: 4500 } },
  { id: 'market_1',       title: 'Trader',          description: 'Create 1 market listing',             target: 1,  category: 'market',       reward: { type: 'resources', biomass: 3000, alloy: 3000, ore: 3000 } },
  { id: 'buy_market_1',   title: 'Opportunist',     description: 'Buy 1 listing from the market',       target: 1,  category: 'buy',          reward: { type: 'resources', biomass: 3000, alloy: 3000, ore: 3000 } },
  { id: 'transfer_1',     title: 'Logistics',       description: 'Transfer resources between nexuses',  target: 1,  category: 'transfer',     reward: { type: 'resources', biomass: 2500, alloy: 2500, ore: 2500 } },
  { id: 'faction_chat_1', title: 'Intel Drop',      description: 'Send 1 faction chat message',         target: 1,  category: 'faction',      reward: { type: 'resources', biomass: 2000, alloy: 2000, ore: 2000 } },
  { id: 'login',          title: 'Report In',       description: 'Log in to the game today',            target: 1,  category: 'login',        reward: { type: 'resources', biomass: 1500, alloy: 1500, ore: 1500 } },
];

const STREAK_BONUS_MULT = [1, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0];

function getStreakMultiplier(streak: number): number {
  const idx = Math.min(streak, STREAK_BONUS_MULT.length - 1);
  return STREAK_BONUS_MULT[idx];
}

function getNexusLevelMultiplier(level: number | null | undefined): number {
  return Math.max(1, Math.floor(Number(level) || 0));
}

export function getTodaySeed(userId: number, galaxyId: number): string {
  const date = new Date().toISOString().slice(0, 10);
  return createHash('md5').update(`${date}-${userId}-${galaxyId}`).digest('hex').slice(0, 16);
}

export function selectDailyQuests(seed: string): DailyQuest[] {
  const hash = createHash('md5').update(seed).digest();
  const indices: number[] = [];
  const usedCategories = new Set<string>();
  for (let i = 0; i < hash.length && indices.length < 3; i++) {
    const idx = hash[i] % QUEST_TEMPLATES.length;
    const cat = QUEST_TEMPLATES[idx].category;
    if (!indices.includes(idx) && !usedCategories.has(cat)) {
      indices.push(idx);
      usedCategories.add(cat);
    }
  }
  // fallback: fill remaining slots avoiding used categories
  for (let i = 0; i < QUEST_TEMPLATES.length && indices.length < 3; i++) {
    const cat = QUEST_TEMPLATES[i].category;
    if (!indices.includes(i) && !usedCategories.has(cat)) {
      indices.push(i);
      usedCategories.add(cat);
    }
  }
  return indices.map((i) => ({ ...QUEST_TEMPLATES[i] }));
}

async function getHighestNexusLevel(userId: number, galaxyId: number): Promise<number> {
  const result = await prisma.nexus.aggregate({
    where: { ownerId: userId, galaxyId },
    _max: { commandCore: true },
  });
  return getNexusLevelMultiplier(result._max.commandCore);
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.toISOString().slice(0, 10) === d2.toISOString().slice(0, 10);
}

function isYesterday(d: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

export async function getDailyStreakData(userId: number, galaxyId: number) {
  const todaySeed = getTodaySeed(userId, galaxyId);

  let streak = await prisma.dailyStreak.findUnique({
    where: { userId_galaxyId: { userId, galaxyId } },
  });

  if (!streak) {
    streak = await prisma.dailyStreak.create({
      data: { userId, galaxyId, questsSeed: todaySeed, questsProgress: {} },
    });
  }

  if (streak.questsSeed !== todaySeed) {
    let newStreak = streak.currentStreak;
    if (streak.lastClaimedAt && !isYesterday(streak.lastClaimedAt) && !isSameDay(streak.lastClaimedAt, new Date())) {
      newStreak = 0;
    }
    streak = await prisma.dailyStreak.update({
      where: { userId_galaxyId: { userId, galaxyId } },
      data: {
        questsSeed: todaySeed,
        questsProgress: {},
        questsClaimed: false,
        currentStreak: newStreak,
      },
    });
  }

  const quests = selectDailyQuests(todaySeed);
  const progress = (streak.questsProgress ?? {}) as Record<string, number>;
  const mult = getStreakMultiplier(streak.currentStreak);
  const nexusLevelMult = await getHighestNexusLevel(userId, galaxyId);
  const rewardMult = mult * nexusLevelMult;

  const streakAboutToExpire = streak.lastClaimedAt
    && !isSameDay(streak.lastClaimedAt, new Date())
    && streak.currentStreak > 0;

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    streakMultiplier: mult,
    streakAboutToExpire: !!streakAboutToExpire,
    claimed: streak.questsClaimed,
    quests: quests.map((q) => ({
      ...q,
      progress: progress[q.id] ?? 0,
      completed: (progress[q.id] ?? 0) >= q.target,
      reward: {
        ...q.reward,
        biomass: Math.floor(q.reward.biomass * rewardMult),
        alloy: Math.floor(q.reward.alloy * rewardMult),
        ore: Math.floor(q.reward.ore * rewardMult),
      },
    })),
  };
}

export async function incrementQuestProgress(userId: number, galaxyId: number, questId: string, amount: number = 1) {
  const todaySeed = getTodaySeed(userId, galaxyId);

  // Upsert so progress is tracked even before the player opens the quests panel.
  // If the record is from a previous day, reset seed and progress atomically.
  let streak = await prisma.dailyStreak.upsert({
    where: { userId_galaxyId: { userId, galaxyId } },
    create: { userId, galaxyId, questsSeed: todaySeed, questsProgress: {} },
    update: {},
  });

  if (streak.questsClaimed && streak.questsSeed === todaySeed) return;

  // Stale seed means it's a new day — reset before recording progress.
  if (streak.questsSeed !== todaySeed) {
    let newStreak = streak.currentStreak;
    if (streak.lastClaimedAt && !isYesterday(streak.lastClaimedAt) && !isSameDay(streak.lastClaimedAt, new Date())) {
      newStreak = 0;
    }
    streak = await prisma.dailyStreak.update({
      where: { userId_galaxyId: { userId, galaxyId } },
      data: { questsSeed: todaySeed, questsProgress: {}, questsClaimed: false, currentStreak: newStreak },
    });
  }

  const progress = (streak.questsProgress ?? {}) as Record<string, number>;
  progress[questId] = (progress[questId] ?? 0) + amount;

  await prisma.dailyStreak.update({
    where: { userId_galaxyId: { userId, galaxyId } },
    data: { questsProgress: progress },
  });
}

export async function claimDailyRewards(userId: number, galaxyId: number) {
  const data = await getDailyStreakData(userId, galaxyId);
  if (data.claimed) return { error: 'Already claimed today' };

  const allComplete = data.quests.every((q) => q.completed);
  if (!allComplete) return { error: 'Complete all quests first' };

  let totalBiomass = 0, totalAlloy = 0, totalOre = 0;
  for (const q of data.quests) {
    totalBiomass += q.reward.biomass;
    totalAlloy += q.reward.alloy;
    totalOre += q.reward.ore;
  }

  const nexus = await prisma.nexus.findFirst({
    where: { ownerId: userId, galaxyId },
    orderBy: [{ points: 'desc' }, { id: 'asc' }],
  });
  if (!nexus) return { error: 'No nexus found' };

  const newStreak = data.currentStreak + 1;
  await prisma.$transaction([
    prisma.nexus.update({
      where: { id: nexus.id },
      data: {
        biomass: { increment: totalBiomass },
        alloy: { increment: totalAlloy },
        ore: { increment: totalOre },
      },
    }),
    prisma.dailyStreak.update({
      where: { userId_galaxyId: { userId, galaxyId } },
      data: {
        questsClaimed: true,
        currentStreak: newStreak,
        longestStreak: Math.max(data.longestStreak, newStreak),
        lastClaimedAt: new Date(),
      },
    }),
  ]);

  return {
    success: true,
    streak: newStreak,
    nexusName: nexus.name,
    reward: { biomass: totalBiomass, alloy: totalAlloy, ore: totalOre },
  };
}
