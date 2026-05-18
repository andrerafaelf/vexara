import type { Nexus, Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import {
  calculatePoints as calculatePointsBase,
  computeResourceUpdate as computeResourceUpdateBase,
  getMaxStorage as getMaxStorageBase,
  getResourceProduction as getResourceProductionBase,
  type StormBonus,
} from '../utils/economy.js';
import { getPopulationMax } from '../utils/population.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import type { SerializedNexus, TroopKey } from '../types/index.js';

// --- Re-exports of pure computation helpers ---

type EconomyNexus = Parameters<typeof computeResourceUpdateBase>[0];

export function getResourceProduction(nexus: EconomyNexus) { return getResourceProductionBase(nexus); }
export function getMaxStorage(nexus: EconomyNexus) { return getMaxStorageBase(nexus); }
export function computeResourceUpdate(nexus: EconomyNexus, storm?: StormBonus) { return computeResourceUpdateBase(nexus, storm); }
export function calculatePoints(nexus: Nexus & Record<string, unknown>) { return calculatePointsBase(nexus); }

// --- Quest system ---

interface QuestContext {
  nexus: Nexus & Record<string, unknown>;
  hasOutgoingStrike: boolean;
  hasCompletedAttack: boolean;
  claimedRewards?: Set<string>;
}

interface QuestBatch {
  id: string;
  isUnlocked: (ctx: { claimedRewards: Set<string>; completedBatchIds?: Set<string> }) => boolean;
  quests: { id: string; check: (ctx: QuestContext) => boolean }[];
  reward: {
    biomass?: number;
    alloy?: number;
    ore?: number;
    populationCurrent?: number;
    troops?: Partial<Record<TroopKey, number>>;
  };
}

export const QUEST_REWARD_BATCHES: QuestBatch[] = [
  {
    id: 'intro',
    isUnlocked: () => true,
    quests: [
      { id: 'build_command_core_1',  check: ({ nexus }) => nexus.commandCore >= 1 },
      { id: 'build_troop_fab_1',     check: ({ nexus }) => nexus.recruitmentCore >= 1 },
      { id: 'build_storage_vault_2', check: ({ nexus }) => nexus.storageVault >= 2 },
      { id: 'train_assault_trooper_5', check: ({ nexus }) => nexus.assaultTrooper >= 5 },
    ],
    reward: { biomass: 250, alloy: 250, ore: 250, populationCurrent: 5, troops: { assaultTrooper: 5 } },
  },
  {
    id: 'intermediate',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('intro'),
    quests: [
      { id: 'build_command_core_3',  check: ({ nexus }) => nexus.commandCore >= 3 },
      { id: 'build_shield_grid_1',   check: ({ nexus }) => nexus.shieldGrid >= 1 },
      { id: 'build_biomass_farm_2',  check: ({ nexus }) => nexus.biomassFarm >= 2 },
      { id: 'build_alloy_forge_2',   check: ({ nexus }) => nexus.alloyForge >= 2 },
      { id: 'train_recon_operative_1', check: ({ nexus }) => nexus.reconOperative >= 1 },
    ],
    reward: { biomass: 900, alloy: 900, ore: 900, populationCurrent: 10, troops: { reconOperative: 10 } },
  },
  {
    id: 'advanced',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('intermediate'),
    quests: [
      { id: 'build_command_core_4',  check: ({ nexus }) => nexus.commandCore >= 4 },
      { id: 'build_ore_extractor_4', check: ({ nexus }) => nexus.oreExtractor >= 4 },
      { id: 'build_shield_grid_2',   check: ({ nexus }) => nexus.shieldGrid >= 2 },
      { id: 'train_skimmer_bike_5',  check: ({ nexus }) => nexus.skimmerBike >= 5 },
      { id: 'send_first_strike',     check: ({ hasOutgoingStrike }) => hasOutgoingStrike },
    ],
    reward: { biomass: 2500, alloy: 2500, ore: 2500, populationCurrent: 80, troops: { skimmerBike: 20, siegeMech: 5 } },
  },
  {
    id: 'veteran',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('advanced'),
    quests: [
      { id: 'build_command_core_6',  check: ({ nexus }) => nexus.commandCore >= 6 },
      { id: 'build_troop_fab_5',     check: ({ nexus }) => nexus.recruitmentCore >= 5 },
      { id: 'build_life_support_4',  check: ({ nexus }) => nexus.lifeSupport >= 4 },
      { id: 'train_siege_mech_3',    check: ({ nexus }) => nexus.siegeMech >= 3 },
      { id: 'train_disruptor_unit_5', check: ({ nexus }) => nexus.disruptorUnit >= 5 },
    ],
    reward: { biomass: 5000, alloy: 5000, ore: 5000, populationCurrent: 50, troops: { siegeMech: 10, disruptorUnit: 5 } },
  },
  {
    id: 'conqueror',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('veteran'),
    quests: [
      { id: 'build_command_core_8',  check: ({ nexus }) => nexus.commandCore >= 8 },
      { id: 'build_ore_extractor_8', check: ({ nexus }) => nexus.oreExtractor >= 8 },
      { id: 'build_shield_grid_5',   check: ({ nexus }) => nexus.shieldGrid >= 5 },
      { id: 'train_annihilator_1',   check: ({ nexus }) => nexus.annihilatorPlatform >= 1 },
      { id: 'complete_attack',       check: ({ hasCompletedAttack }) => hasCompletedAttack },
    ],
    reward: { biomass: 10000, alloy: 10000, ore: 10000, populationCurrent: 100, troops: { annihilatorPlatform: 1, siegeMech: 10 } },
  },
];

type NexusWithQuests = Nexus & { questRewardClaims?: string[] | null; completedQuestIds?: string[] | null };
type GalaxyPlayerForQuests = { id: number; questRewardClaims: unknown; completedQuestIds: unknown };

export async function applyQuestRewards(
  nexus: NexusWithQuests,
  options: { hasOutgoingStrike?: boolean; hasCompletedAttack?: boolean; player?: GalaxyPlayerForQuests } = {},
): Promise<NexusWithQuests> {
  if (!nexus.ownerId) return nexus;

  const player = options.player ?? await prisma.galaxyPlayer.findUnique({
    where: { userId_galaxyId: { userId: nexus.ownerId, galaxyId: nexus.galaxyId } },
    select: { id: true, questRewardClaims: true, completedQuestIds: true },
  });
  if (!player) return nexus;

  const claimedRewards = new Set<string>(
    Array.isArray(player.questRewardClaims) ? (player.questRewardClaims as string[]).filter((v) => typeof v === 'string') : [],
  );
  const completedQuestIds = new Set<string>(
    Array.isArray(player.completedQuestIds) ? (player.completedQuestIds as string[]).filter((v) => typeof v === 'string') : [],
  );

  const hasOutgoingStrike =
    options.hasOutgoingStrike ??
    Boolean(await prisma.attack.findFirst({ where: { attackerNexusId: nexus.id, status: 'traveling' }, select: { id: true } }));
  const hasCompletedAttack =
    options.hasCompletedAttack ??
    Boolean(await prisma.attack.findFirst({ where: { attackerNexusId: nexus.id, status: 'completed' }, select: { id: true } }));

  const ctx: QuestContext = { nexus: nexus as Nexus & Record<string, unknown>, hasOutgoingStrike, hasCompletedAttack };

  for (const batch of QUEST_REWARD_BATCHES) {
    for (const quest of batch.quests) {
      if (!completedQuestIds.has(quest.id) && quest.check(ctx)) completedQuestIds.add(quest.id);
    }
  }

  const completedBatchIds = new Set<string>();
  for (const batch of QUEST_REWARD_BATCHES) {
    if (batch.quests.every((q) => completedQuestIds.has(q.id))) completedBatchIds.add(batch.id);
  }

  const newlyClaimedRewards: string[] = [];
  const data: Record<string, unknown> = {
    biomass: nexus.biomass, alloy: nexus.alloy, ore: nexus.ore, populationCurrent: nexus.populationCurrent,
  };

  for (const batch of QUEST_REWARD_BATCHES) {
    if (!batch.isUnlocked({ completedBatchIds, claimedRewards }) || !completedBatchIds.has(batch.id) || claimedRewards.has(batch.id)) continue;

    data['biomass'] = (data['biomass'] as number) + (batch.reward.biomass || 0);
    data['alloy']   = (data['alloy']   as number) + (batch.reward.alloy   || 0);
    data['ore']     = (data['ore']     as number) + (batch.reward.ore     || 0);
    data['populationCurrent'] = (data['populationCurrent'] as number) + (batch.reward.populationCurrent || 0);

    for (const [troopType, amount] of Object.entries(batch.reward.troops || {})) {
      data[troopType] = ((data[troopType] as number | undefined) || (nexus as unknown as Record<string, number>)[troopType] || 0) + (amount as number);
    }

    claimedRewards.add(batch.id);
    newlyClaimedRewards.push(batch.id);
  }

  const updatedCompletedIds = Array.from(completedQuestIds);
  const updatedClaimedRewards = Array.from(claimedRewards);
  const questIdsChanged = updatedCompletedIds.length !== (Array.isArray(player.completedQuestIds) ? player.completedQuestIds.length : 0);

  if (newlyClaimedRewards.length === 0 && !questIdsChanged) {
    return { ...nexus, questRewardClaims: updatedClaimedRewards, completedQuestIds: updatedCompletedIds };
  }

  await prisma.galaxyPlayer.update({
    where: { id: player.id },
    data: { questRewardClaims: updatedClaimedRewards, completedQuestIds: updatedCompletedIds },
  });

  data['points'] = calculatePoints({ ...nexus, ...data } as Nexus & Record<string, unknown>);
  const updatedNexus = await prisma.nexus.update({ where: { id: nexus.id }, data });

  return { ...updatedNexus, questRewardClaims: updatedClaimedRewards, completedQuestIds: updatedCompletedIds };
}

// --- DB helpers ---

export async function refreshResources(nexus: Nexus): Promise<Nexus> {
  const resourceUpdate = computeResourceUpdate(nexus);
  const points = calculatePoints({ ...nexus, ...resourceUpdate });
  return prisma.nexus.update({ where: { id: nexus.id }, data: { ...resourceUpdate, points } });
}

const LEGACY_BUILDING_ALIASES: Record<string, string> = { troopFabricator: 'recruitmentCore' };

export function canonicalBuildingKey(key: string): string {
  return LEGACY_BUILDING_ALIASES[key] || key;
}

export interface BuildQueueEntry { building: string; targetLevel: number; completesAt: string | Date }
export interface TrainingQueueEntry { troopType: string; amount: number; completesAt: string | Date; perUnitSeconds?: number }

export function queueToJson(queue: Array<BuildQueueEntry | TrainingQueueEntry>): Prisma.InputJsonValue[] {
  return queue.map((entry) => ({
    ...entry,
    completesAt: entry.completesAt instanceof Date ? entry.completesAt.toISOString() : entry.completesAt,
  }));
}

export function normalizeBuildQueue(queue: unknown): BuildQueueEntry[] {
  if (!Array.isArray(queue)) return [];
  return (queue as unknown as BuildQueueEntry[]).map((entry) => ({ ...entry, building: canonicalBuildingKey(entry.building) }));
}

export function normalizeTrainingQueue(queue: unknown): TrainingQueueEntry[] {
  if (!Array.isArray(queue)) return [];
  return queue as unknown as TrainingQueueEntry[];
}

export async function applyCompletedQueues(nexus: Nexus): Promise<Nexus> {
  const now = new Date();
  const buildQueue = normalizeBuildQueue(nexus.buildQueue);
  const trainingQueue = normalizeTrainingQueue(nexus.trainingQueue);
  const updates: Record<string, unknown> = {};

  while (buildQueue.length > 0 && new Date(buildQueue[0].completesAt) <= now) {
    const build = buildQueue.shift()!;
    updates[build.building] = build.targetLevel;
    if (build.building === 'lifeSupport') updates['populationMax'] = getPopulationMax(build.targetLevel);
  }

  const effectiveLifeSupport = (updates['lifeSupport'] as number | undefined) ?? nexus.lifeSupport;
  const recalculatedPopulationMax = getPopulationMax(effectiveLifeSupport);
  const effectivePopulationMax = (updates['populationMax'] as number | undefined) ?? nexus.populationMax;
  const effectivePopulationCurrent = (updates['populationCurrent'] as number | undefined) ?? nexus.populationCurrent;

  if (effectivePopulationMax !== recalculatedPopulationMax) updates['populationMax'] = recalculatedPopulationMax;
  if (effectivePopulationCurrent > recalculatedPopulationMax) updates['populationCurrent'] = recalculatedPopulationMax;

  updates['buildQueue'] = queueToJson(buildQueue);

  for (let i = 0; i < trainingQueue.length; ) {
    const entry = trainingQueue[i];
    if (new Date(entry.completesAt) <= now) {
      const key = entry.troopType as TroopKey;
      updates[key] = ((updates[key] as number | undefined) || (nexus as unknown as Record<string, number>)[key] || 0) + entry.amount;
      trainingQueue.splice(i, 1);
    } else {
      i++;
    }
  }

  updates['trainingQueue'] = queueToJson(trainingQueue);

  if (Object.keys(updates).length === 2 && 'buildQueue' in updates && 'trainingQueue' in updates) return nexus;

  return prisma.nexus.update({ where: { id: nexus.id }, data: updates });
}

export function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export async function processCompletedQueuesAndNotify(): Promise<void> {
  const now = new Date();
  const nexuses = await prisma.nexus.findMany({
    where: {
      ownerId: { not: null },
      OR: [{ buildQueue: { not: { equals: [] } } }, { trainingQueue: { not: { equals: [] } } }],
    },
  });

  for (const nexus of nexuses) {
    try {
      const buildQueueBefore = normalizeBuildQueue(nexus.buildQueue);
      const trainingQueueBefore = normalizeTrainingQueue(nexus.trainingQueue);

      const buildReady = buildQueueBefore.length > 0 && new Date(buildQueueBefore[0].completesAt) <= now;
      const trainReady = trainingQueueBefore.some((e) => new Date(e.completesAt) <= now);
      if (!buildReady && !trainReady) continue;

      const updated = await applyCompletedQueues(nexus);

      const buildQueueAfter = normalizeBuildQueue(updated.buildQueue);
      const drainedBuildCount = buildQueueBefore.length - buildQueueAfter.length;
      for (let i = 0; i < drainedBuildCount; i++) {
        const drained = buildQueueBefore[i];
        const label = formatLabel(drained.building);
        void sendPushToUser(nexus.ownerId!, NOTIF.BUILDING_COMPLETE, {
          title: 'Construction Complete',
          body: `${label} upgraded to level ${drained.targetLevel} at ${nexus.name}.`,
          tag: `build-${nexus.id}-${drained.building}-${drained.targetLevel}`,
          data: { url: '/' },
        });
      }

      const trainingQueueAfter = normalizeTrainingQueue(updated.trainingQueue);
      const afterKeys = new Set(trainingQueueAfter.map((e) => `${e.troopType}|${e.completesAt}|${e.amount}`));
      const drainedTraining = trainingQueueBefore.filter(
        (e) => !afterKeys.has(`${e.troopType}|${e.completesAt}|${e.amount}`),
      );
      const trainTotals = drainedTraining.reduce<Record<string, number>>((acc, e) => {
        acc[e.troopType] = (acc[e.troopType] || 0) + e.amount;
        return acc;
      }, {});
      for (const [troopType, amount] of Object.entries(trainTotals)) {
        const label = formatLabel(troopType);
        void sendPushToUser(nexus.ownerId!, NOTIF.TROOP_COMPLETE, {
          title: 'Training Complete',
          body: `${amount}x ${label} ready at ${nexus.name}.`,
          tag: `troop-${nexus.id}-${troopType}-${new Date(drainedTraining[0].completesAt).getTime()}`,
          data: { url: '/' },
        });
      }
    } catch (err) {
      console.error(`processCompletedQueuesAndNotify failed for nexus ${nexus.id}:`, err);
    }
  }
}

export async function recoverControlLevels(): Promise<void> {
  try {
    // Single SQL expression — no per-row round-trips
    await prisma.$executeRaw`
      UPDATE "Nexus"
      SET "controlLevel" = LEAST("controlLevel" + 10, 100)
      WHERE "ownerId" IS NOT NULL
        AND "controlLevel" < 100
    `;
  } catch (err) {
    console.error('Error recovering control levels:', err);
  }
}

interface ActiveStorm {
  galaxyId: number;
  resource: string;
  xMin: number; xMax: number; yMin: number; yMax: number;
}

async function loadActiveStorms(): Promise<ActiveStorm[]> {
  const now = new Date();
  const events = await prisma.galaxyEvent.findMany({
    where: { type: 'resource_storm', resolvedAt: null, expiresAt: { gt: now } },
    select: { galaxyId: true, meta: true },
  });
  const storms: ActiveStorm[] = [];
  for (const ev of events) {
    const meta = ev.meta as Record<string, unknown> | null;
    if (!meta) continue;
    storms.push({
      galaxyId: ev.galaxyId,
      resource: meta.resource as string,
      xMin: meta.xMin as number, xMax: meta.xMax as number,
      yMin: meta.yMin as number, yMax: meta.yMax as number,
    });
  }
  return storms;
}

function getStormBonus(nexus: { galaxyId: number; x: number; y: number }, storms: ActiveStorm[]): StormBonus | undefined {
  const active = storms.filter(
    (s) => s.galaxyId === nexus.galaxyId &&
      nexus.x >= s.xMin && nexus.x <= s.xMax &&
      nexus.y >= s.yMin && nexus.y <= s.yMax,
  );
  if (active.length === 0) return undefined;
  const bonus: StormBonus = {};
  for (const s of active) {
    if (s.resource === 'biomass') bonus.biomass = (bonus.biomass ?? 1) * 2;
    else if (s.resource === 'alloy') bonus.alloy = (bonus.alloy ?? 1) * 2;
    else if (s.resource === 'ore') bonus.ore = (bonus.ore ?? 1) * 2;
  }
  return bonus;
}

export async function updateAllResources(): Promise<void> {
  try {
    // Select only columns needed for computation — avoids loading queues/troops/etc.
    const [nexuses, activeStorms] = await Promise.all([
      prisma.nexus.findMany({
        select: {
          id: true, ownerId: true, name: true, nexusType: true, nexusTypeDoubled: true,
          galaxyId: true, x: true, y: true,
          biomassFarm: true, alloyForge: true, oreExtractor: true, storageVault: true,
          biomass: true, alloy: true, ore: true, lastResourceUpdate: true,
          commandCore: true, recruitmentCore: true, lifeSupport: true, shieldGrid: true,
          lancerDrone: true, assaultTrooper: true, breakerUnit: true, reconOperative: true,
          skimmerBike: true, siegeMech: true,
        },
      }),
      loadActiveStorms(),
    ]);

    if (nexuses.length === 0) return;

    // Compute all updates in memory — pure JS, no DB round-trips
    const rows: Array<{ id: number; biomass: number; alloy: number; ore: number; points: number; lastResourceUpdate: Date; notifyOwner: number | null }> = [];

    for (const nexus of nexuses) {
      const storm = getStormBonus(nexus, activeStorms);
      const resourceUpdate = computeResourceUpdate(nexus, storm);
      const points = calculatePoints({ ...nexus, ...resourceUpdate } as Nexus & Record<string, unknown>);
      const maxStorage = getMaxStorage(nexus);
      const wasAlreadyFull = nexus.biomass >= maxStorage && nexus.alloy >= maxStorage && nexus.ore >= maxStorage;
      const isNowFull = resourceUpdate.biomass >= maxStorage && resourceUpdate.alloy >= maxStorage && resourceUpdate.ore >= maxStorage;
      const notifyOwner = !wasAlreadyFull && isNowFull && nexus.ownerId ? nexus.ownerId : null;
      rows.push({ id: nexus.id, ...resourceUpdate, points, notifyOwner });
    }

    // Single bulk UPDATE via VALUES list — O(1) round-trips regardless of nexus count
    const values = rows
      .map((r) => `(${r.id}, ${r.biomass}, ${r.alloy}, ${r.ore}, ${r.points}, '${r.lastResourceUpdate.toISOString()}'::timestamptz)`)
      .join(',');

    await prisma.$executeRawUnsafe(`
      UPDATE "Nexus" AS n
      SET
        biomass             = v.biomass,
        alloy               = v.alloy,
        ore                 = v.ore,
        points              = v.points,
        "lastResourceUpdate" = v.ts
      FROM (VALUES ${values}) AS v(id, biomass, alloy, ore, points, ts)
      WHERE n.id = v.id
    `);

    // Fire push notifications after the bulk write (non-blocking)
    for (const row of rows) {
      if (row.notifyOwner) {
        const nexus = nexuses.find((n) => n.id === row.id)!;
        void sendPushToUser(row.notifyOwner, NOTIF.RESOURCES_FULL, {
          title: 'Storage Full',
          body: `Resources at ${nexus.name} are at full capacity. Spend or transfer them!`,
          tag: `resources-full-${row.id}`,
          data: { url: '/' },
        });
      }
    }
  } catch (err) {
    console.error('Error updating resources:', err);
  }
}

// --- Serialization ---

export function serializeNexus(v: NexusWithQuests, opts: { ownerData?: unknown } = {}): SerializedNexus {
  const base: SerializedNexus = {
    _id: String(v.id), id: String(v.id), name: v.name,
    owner: v.ownerId ?? null,
    x: v.x, y: v.y,
    resources: { biomass: v.biomass, alloy: v.alloy, ore: v.ore },
    buildings: {
      commandCore: v.commandCore, recruitmentCore: v.recruitmentCore, lifeSupport: v.lifeSupport,
      storageVault: v.storageVault, biomassFarm: v.biomassFarm, alloyForge: v.alloyForge,
      oreExtractor: v.oreExtractor, shieldGrid: v.shieldGrid,
    },
    troops: {
      lancerDrone: v.lancerDrone, assaultTrooper: v.assaultTrooper, breakerUnit: v.breakerUnit,
      reconOperative: v.reconOperative, skimmerBike: v.skimmerBike, siegeMech: v.siegeMech,
      bulwarkGuard: v.bulwarkGuard, suppressorTeam: v.suppressorTeam, disruptorUnit: v.disruptorUnit,
      interceptorBike: v.interceptorBike, annihilatorPlatform: v.annihilatorPlatform, overseer: v.overseer,
    },
    population: { current: v.populationCurrent, max: v.populationMax },
    buildQueue: (v.buildQueue as unknown[]) ?? [],
    trainingQueue: (v.trainingQueue as unknown[]) ?? [],
    questRewardClaims: (v.questRewardClaims as string[] | null) ?? null,
    completedQuestIds: (v.completedQuestIds as string[] | null) ?? null,
    lastResourceUpdate: v.lastResourceUpdate,
    points: v.points,
    controlLevel: v.controlLevel,
    nexusType: v.nexusType ?? null,
    nexusTypeDoubled: (v as unknown as { nexusTypeDoubled?: boolean | null }).nexusTypeDoubled ?? false,
    nexusTypeLockedAt: (v as unknown as { nexusTypeLockedAt?: Date | null }).nexusTypeLockedAt ?? null,
    newbieProtectionEndsAt: v.newbieProtectionEndsAt ?? null,
    createdAt: v.createdAt,
    conqueredAt: v.conqueredAt ?? null,
  };

  if (opts.ownerData) base.owner = opts.ownerData;
  return base;
}

interface AttackWithNexuses {
  id: number;
  attackerUserId: number | null;
  attackerUsername?: string;
  attackerNexusId: number | null;
  attackerNexus?: { id: number; name: string; x: number; y: number; shieldGrid?: number } | null;
  defenderUserId: number | null;
  defenderUsername?: string;
  defenderNexusId: number | null;
  defenderNexus?: { id: number; name: string; x: number; y: number; shieldGrid?: number } | null;
  troops: unknown;
  arrivesAt: Date | null;
  returnsAt: Date | null;
  type: string;
  status: string;
  result: unknown;
  createdAt: Date;
}

export function serializeAttack(a: AttackWithNexuses) {
  const normalizedResult = a.result ? { ...(a.result as Record<string, unknown>) } : a.result;
  const troops = a.troops as Record<string, number> | null;
  if ((normalizedResult as Record<string, unknown>)?.['conquered'] && (troops?.overseer || 0) > 0) {
    (normalizedResult as Record<string, unknown>)['attackerLosses'] = {
      ...((normalizedResult as Record<string, unknown>)['attackerLosses'] as object || {}),
      overseer: troops!.overseer,
    };
  }

  return {
    _id: String(a.id), id: String(a.id),
    attacker: {
      user: {
        _id: a.attackerUserId != null ? String(a.attackerUserId) : a.attackerUserId,
        id:  a.attackerUserId != null ? String(a.attackerUserId) : a.attackerUserId,
        username: a.attackerUsername,
      },
      nexus: a.attackerNexus
        ? { _id: String(a.attackerNexus.id), id: String(a.attackerNexus.id), name: a.attackerNexus.name, x: a.attackerNexus.x, y: a.attackerNexus.y,
            buildings: a.attackerNexus.shieldGrid !== undefined ? { shieldGrid: a.attackerNexus.shieldGrid } : undefined }
        : { _id: a.attackerNexusId != null ? String(a.attackerNexusId) : a.attackerNexusId, id: a.attackerNexusId != null ? String(a.attackerNexusId) : a.attackerNexusId },
    },
    defender: {
      user: {
        _id: a.defenderUserId != null ? String(a.defenderUserId) : a.defenderUserId,
        id:  a.defenderUserId != null ? String(a.defenderUserId) : a.defenderUserId,
        username: a.defenderUsername,
      },
      nexus: a.defenderNexus
        ? { _id: String(a.defenderNexus.id), id: String(a.defenderNexus.id), name: a.defenderNexus.name, x: a.defenderNexus.x, y: a.defenderNexus.y,
            buildings: a.defenderNexus.shieldGrid !== undefined ? { shieldGrid: a.defenderNexus.shieldGrid } : undefined }
        : { _id: a.defenderNexusId != null ? String(a.defenderNexusId) : a.defenderNexusId, id: a.defenderNexusId != null ? String(a.defenderNexusId) : a.defenderNexusId },
    },
    troops: a.troops,
    arrivesAt: a.arrivesAt,
    returnsAt: a.returnsAt,
    type: a.type,
    status: a.status,
    result: normalizedResult,
    createdAt: a.createdAt,
  };
}

export default { serializeNexus, serializeAttack, updateAllResources };
