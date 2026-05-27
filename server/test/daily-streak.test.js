import assert from 'node:assert/strict';
import test from 'node:test';

const calls = {};

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const {
  claimDailyRewards,
  getTodaySeed,
  selectDailyQuests,
} = await import('../services/dailyStreakService.js');

test('selectDailyQuests returns three quests from distinct categories', () => {
  for (let i = 0; i < 100; i += 1) {
    const quests = selectDailyQuests(`seed-${i}`);
    const categories = new Set(quests.map((q) => q.category));

    assert.equal(quests.length, 3);
    assert.equal(categories.size, quests.length);
  }
});

test('claimDailyRewards deposits the summed reward into the strongest owned nexus', async (t) => {
  const originals = {
    dailyFindUnique: prisma.dailyStreak.findUnique,
    dailyCreate: prisma.dailyStreak.create,
    dailyUpdate: prisma.dailyStreak.update,
    nexusAggregate: prisma.nexus.aggregate,
    nexusFindFirst: prisma.nexus.findFirst,
    nexusUpdate: prisma.nexus.update,
    transaction: prisma.$transaction,
  };
  t.after(() => {
    prisma.dailyStreak.findUnique = originals.dailyFindUnique;
    prisma.dailyStreak.create = originals.dailyCreate;
    prisma.dailyStreak.update = originals.dailyUpdate;
    prisma.nexus.aggregate = originals.nexusAggregate;
    prisma.nexus.findFirst = originals.nexusFindFirst;
    prisma.nexus.update = originals.nexusUpdate;
    prisma.$transaction = originals.transaction;
  });

  prisma.dailyStreak.findUnique = async () => calls.streak ?? null;
  prisma.dailyStreak.create = async (args) => {
    calls.dailyCreate = args;
    return calls.createdStreak;
  };
  prisma.dailyStreak.update = async (args) => {
    calls.dailyUpdate = args;
    return { ...calls.streak, ...args.data };
  };
  prisma.nexus.aggregate = async (args) => {
    calls.nexusAggregate = args;
    return { _max: { commandCore: calls.highestCommandCore ?? null } };
  };
  prisma.nexus.findFirst = async (args) => {
    calls.nexusFindFirst = args;
    return calls.rewardNexus ?? null;
  };
  prisma.nexus.update = async (args) => {
    calls.nexusUpdate = args;
    return {};
  };
  prisma.$transaction = async (ops) => Promise.all(ops);

  const userId = 42;
  const galaxyId = 7;
  const seed = getTodaySeed(userId, galaxyId);
  const quests = selectDailyQuests(seed);
  const progress = Object.fromEntries(quests.map((q) => [q.id, q.target]));
  const highestCommandCore = 8;
  const expectedReward = quests.reduce(
    (sum, quest) => ({
      biomass: sum.biomass + quest.reward.biomass * highestCommandCore,
      alloy: sum.alloy + quest.reward.alloy * highestCommandCore,
      ore: sum.ore + quest.reward.ore * highestCommandCore,
    }),
    { biomass: 0, alloy: 0, ore: 0 },
  );

  calls.streak = {
    userId,
    galaxyId,
    currentStreak: 0,
    longestStreak: 2,
    lastClaimedAt: null,
    questsSeed: seed,
    questsProgress: progress,
    questsClaimed: false,
  };
  calls.highestCommandCore = highestCommandCore;
  calls.rewardNexus = { id: 77, name: 'Stronghold', points: 1200 };

  const result = await claimDailyRewards(userId, galaxyId);

  assert.deepEqual(calls.nexusAggregate, {
    where: { ownerId: userId, galaxyId },
    _max: { commandCore: true },
  });
  assert.deepEqual(calls.nexusFindFirst, {
    where: { ownerId: userId, galaxyId },
    orderBy: [{ points: 'desc' }, { id: 'asc' }],
  });
  assert.deepEqual(calls.nexusUpdate, {
    where: { id: 77 },
    data: {
      biomass: { increment: expectedReward.biomass },
      alloy: { increment: expectedReward.alloy },
      ore: { increment: expectedReward.ore },
    },
  });
  assert.equal(calls.dailyUpdate.data.questsClaimed, true);
  assert.equal(calls.dailyUpdate.data.currentStreak, 1);
  assert.deepEqual(result, {
    success: true,
    streak: 1,
    nexusName: 'Stronghold',
    reward: expectedReward,
  });
});
