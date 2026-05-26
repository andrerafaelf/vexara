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
import { isUserOnline, notifyNexusQueueCompleted, notifyNexusResources } from '../services/warRoomSocket.js';
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

// Lifetime trained count for a troop type — survives combat losses so that
// "train N units" quests don't regress when troops die. Falls back to the
// current alive count if no counter exists yet (e.g. legacy nexus row that
// predates the troopsTrained column or skipped the backfill), so a player
// who already has the troops alive doesn't lose quest progress.
function trainedCount(nexus: Nexus & Record<string, unknown>, troopType: string): number {
  const trained = normalizeTroopsTrained(nexus['troopsTrained'])[troopType] || 0;
  const alive = Number(nexus[troopType] || 0);
  return Math.max(trained, alive);
}

export const QUEST_REWARD_BATCHES: QuestBatch[] = [
  // --- Chapter 1: Establishing the Nexus ---
  // First quest line walks the player end-to-end through the opening loop:
  //   Command Core → Recruitment Core → Train troops → Loot a nexus.
  // The quest IDs are referenced verbatim by the client intro batch, so any
  // changes here must be kept in sync with NexusView.tsx.
  {
    id: 'intro',
    isUnlocked: () => true,
    quests: [
      { id: 'build_command_core_1',    check: ({ nexus }) => nexus.commandCore >= 1 },
      { id: 'build_command_core_2',    check: ({ nexus }) => nexus.commandCore >= 2 },
      { id: 'build_troop_fab_1',       check: ({ nexus }) => nexus.recruitmentCore >= 1 },
      { id: 'train_assault_trooper_5', check: ({ nexus }) => trainedCount(nexus, 'assaultTrooper') >= 5 },
      { id: 'send_first_strike',       check: ({ hasOutgoingStrike }) => hasOutgoingStrike },
    ],
    reward: { biomass: 750, alloy: 750, ore: 750, populationCurrent: 10, troops: { assaultTrooper: 10 } },
  },

  // --- Chapter 2: Expansion ---
  {
    id: 'expansion',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('intro'),
    quests: [
      { id: 'build_command_core_3',      check: ({ nexus }) => nexus.commandCore >= 3 },
      { id: 'build_shield_grid_1',       check: ({ nexus }) => nexus.shieldGrid >= 1 },
      { id: 'build_biomass_farm_2',      check: ({ nexus }) => nexus.biomassFarm >= 2 },
      { id: 'build_alloy_forge_2',       check: ({ nexus }) => nexus.alloyForge >= 2 },
      { id: 'train_recon_operative_3',   check: ({ nexus }) => trainedCount(nexus, 'reconOperative') >= 3 },
    ],
    reward: { biomass: 1500, alloy: 1500, ore: 1500, populationCurrent: 15, troops: { reconOperative: 15, lancerDrone: 20 } },
  },

  // --- Chapter 3: First Blood ---
  {
    id: 'first_blood',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('expansion'),
    quests: [
      { id: 'build_command_core_4',  check: ({ nexus }) => nexus.commandCore >= 4 },
      { id: 'build_ore_extractor_4', check: ({ nexus }) => nexus.oreExtractor >= 4 },
      { id: 'build_shield_grid_2',   check: ({ nexus }) => nexus.shieldGrid >= 2 },
      { id: 'train_skimmer_bike_5',  check: ({ nexus }) => trainedCount(nexus, 'skimmerBike') >= 5 },
      { id: 'send_first_strike',     check: ({ hasOutgoingStrike }) => hasOutgoingStrike },
    ],
    reward: { biomass: 3500, alloy: 3500, ore: 3500, populationCurrent: 30, troops: { skimmerBike: 25, breakerUnit: 15 } },
  },

  // --- Chapter 4: Shadow Operations (Espionage) ---
  {
    id: 'shadow_ops',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('first_blood'),
    quests: [
      { id: 'build_command_core_5',      check: ({ nexus }) => nexus.commandCore >= 5 },
      { id: 'build_stealth_array_1',     check: ({ nexus }) => (nexus as unknown as Record<string, number>).stealthArray >= 1 },
      { id: 'build_shield_grid_3',       check: ({ nexus }) => nexus.shieldGrid >= 3 },
      { id: 'train_recon_operative_10',  check: ({ nexus }) => trainedCount(nexus, 'reconOperative') >= 10 },
      { id: 'send_spy_mission',          check: ({ hasOutgoingStrike }) => hasOutgoingStrike },
    ],
    reward: { biomass: 5000, alloy: 5000, ore: 5000, populationCurrent: 25, troops: { reconOperative: 25, disruptorUnit: 10 } },
  },

  // --- Chapter 5: Arsenal (Armory & Heavy Weapons) ---
  {
    id: 'arsenal',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('shadow_ops'),
    quests: [
      { id: 'build_command_core_6',  check: ({ nexus }) => nexus.commandCore >= 6 },
      { id: 'build_armory_3',        check: ({ nexus }) => (nexus as unknown as Record<string, number>).armory >= 3 },
      { id: 'build_troop_fab_5',     check: ({ nexus }) => nexus.recruitmentCore >= 5 },
      { id: 'build_life_support_4',  check: ({ nexus }) => nexus.lifeSupport >= 4 },
      { id: 'train_siege_mech_5',    check: ({ nexus }) => trainedCount(nexus, 'siegeMech') >= 5 },
    ],
    reward: { biomass: 8000, alloy: 8000, ore: 8000, populationCurrent: 50, troops: { siegeMech: 15, disruptorUnit: 10, suppressorTeam: 10 } },
  },

  // --- Chapter 6: Veteran Commander ---
  {
    id: 'veteran',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('arsenal'),
    quests: [
      { id: 'build_command_core_8',   check: ({ nexus }) => nexus.commandCore >= 8 },
      { id: 'build_armory_5',         check: ({ nexus }) => (nexus as unknown as Record<string, number>).armory >= 5 },
      { id: 'build_stealth_array_3',  check: ({ nexus }) => (nexus as unknown as Record<string, number>).stealthArray >= 3 },
      { id: 'train_disruptor_10',     check: ({ nexus }) => trainedCount(nexus, 'disruptorUnit') >= 10 },
      { id: 'complete_attack',        check: ({ hasCompletedAttack }) => hasCompletedAttack },
    ],
    reward: { biomass: 15000, alloy: 15000, ore: 15000, populationCurrent: 75, troops: { siegeMech: 20, interceptorBike: 15, voidStalker: 5 } },
  },

  // --- Chapter 7: Ghost Protocol (Advanced Espionage) ---
  {
    id: 'ghost_protocol',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('veteran'),
    quests: [
      { id: 'build_command_core_10',  check: ({ nexus }) => nexus.commandCore >= 10 },
      { id: 'build_stealth_array_5',  check: ({ nexus }) => (nexus as unknown as Record<string, number>).stealthArray >= 5 },
      { id: 'build_shield_grid_5',    check: ({ nexus }) => nexus.shieldGrid >= 5 },
      { id: 'build_ore_extractor_8',  check: ({ nexus }) => nexus.oreExtractor >= 8 },
      { id: 'train_recon_op_20',      check: ({ nexus }) => trainedCount(nexus, 'reconOperative') >= 20 },
    ],
    reward: { biomass: 25000, alloy: 25000, ore: 25000, populationCurrent: 100, troops: { reconOperative: 30, voidStalker: 10, plasmaTurret: 5 } },
  },

  // --- Chapter 8: Annihilator (Endgame) ---
  {
    id: 'annihilator',
    isUnlocked: ({ claimedRewards }) => claimedRewards.has('ghost_protocol'),
    quests: [
      { id: 'build_command_core_12',  check: ({ nexus }) => nexus.commandCore >= 12 },
      { id: 'build_armory_10',        check: ({ nexus }) => (nexus as unknown as Record<string, number>).armory >= 10 },
      { id: 'build_stealth_array_7',  check: ({ nexus }) => (nexus as unknown as Record<string, number>).stealthArray >= 7 },
      { id: 'train_annihilator_3',    check: ({ nexus }) => trainedCount(nexus, 'annihilatorPlatform') >= 3 },
      { id: 'complete_attack_2',      check: ({ hasCompletedAttack }) => hasCompletedAttack },
    ],
    reward: { biomass: 50000, alloy: 50000, ore: 50000, populationCurrent: 150, troops: { annihilatorPlatform: 3, siegeMech: 25, plasmaTurret: 10 } },
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

// Lazily computes current resources without always writing to the DB.
// Only persists when the staleness exceeds 5 minutes, reduces write pressure while
// keeping displayed values accurate on every read.
const LAZY_WRITE_THRESHOLD_MS = 5 * 60 * 1000;

export async function refreshResources(nexus: Nexus): Promise<Nexus> {
  const resourceUpdate = computeResourceUpdate(nexus);
  const points = calculatePoints({ ...nexus, ...resourceUpdate });
  const staleMs = resourceUpdate.lastResourceUpdate.getTime() - nexus.lastResourceUpdate.getTime();
  if (staleMs < LAZY_WRITE_THRESHOLD_MS) {
    // Return computed values without hitting the DB
    return { ...nexus, ...resourceUpdate, points };
  }
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

export function normalizeTroopsTrained(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
  }
  return out;
}

export function mergeTroopsTrained(existing: unknown, delta: Record<string, number>): Prisma.InputJsonValue {
  const merged = normalizeTroopsTrained(existing);
  for (const [k, v] of Object.entries(delta)) {
    if (v > 0) merged[k] = (merged[k] || 0) + v;
  }
  return merged as Prisma.InputJsonValue;
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
    // Conquered NPC nexuses (pre-typed, nexusTypeLockedAt null) double their bonus when CC hits 15.
    // Player-specialized nexuses (nexusTypeLockedAt set) never get doubled.
    if (
      build.building === 'commandCore' &&
      build.targetLevel >= 15 &&
      nexus.nexusType &&
      !(nexus as unknown as { nexusTypeLockedAt?: Date | null }).nexusTypeLockedAt &&
      !(nexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled
    ) {
      updates['nexusTypeDoubled'] = true;
    }
  }

  const effectiveLifeSupport = (updates['lifeSupport'] as number | undefined) ?? nexus.lifeSupport;
  const recalculatedPopulationMax = getPopulationMax(effectiveLifeSupport);
  const effectivePopulationMax = (updates['populationMax'] as number | undefined) ?? nexus.populationMax;
  const effectivePopulationCurrent = (updates['populationCurrent'] as number | undefined) ?? nexus.populationCurrent;

  if (effectivePopulationMax !== recalculatedPopulationMax) updates['populationMax'] = recalculatedPopulationMax;
  if (effectivePopulationCurrent > recalculatedPopulationMax) updates['populationCurrent'] = recalculatedPopulationMax;

  updates['buildQueue'] = queueToJson(buildQueue);

  const trainedDelta: Record<string, number> = {};
  for (let i = 0; i < trainingQueue.length; ) {
    const entry = trainingQueue[i];
    if (new Date(entry.completesAt) <= now) {
      const key = entry.troopType as TroopKey;
      updates[key] = ((updates[key] as number | undefined) || (nexus as unknown as Record<string, number>)[key] || 0) + entry.amount;
      trainedDelta[key] = (trainedDelta[key] || 0) + entry.amount;
      trainingQueue.splice(i, 1);
    } else {
      i++;
    }
  }

  updates['trainingQueue'] = queueToJson(trainingQueue);

  if (Object.keys(trainedDelta).length > 0) {
    updates['troopsTrained'] = mergeTroopsTrained((nexus as unknown as Record<string, unknown>)['troopsTrained'], trainedDelta);
  }

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

      // Push fresh resource snapshot so the client's interpolation re-anchors
      // and any completed building's new production rate takes effect on the
      // owner's open tab without waiting for the next poll. Drained queues will
      // also re-render via the included MY_NEXUSES refetch on next mutation.
      try {
        notifyNexusResources(nexus.ownerId!, {
          nexusId: updated.id,
          base: { biomass: updated.biomass, alloy: updated.alloy, ore: updated.ore },
          production: getResourceProduction(updated),
          storageMax: getMaxStorage(updated),
          lastResourceUpdate: updated.lastResourceUpdate,
        });
      } catch (emitErr) {
        console.error(`processCompletedQueuesAndNotify emit failed for nexus ${nexus.id}:`, emitErr);
      }

      // Per-completion event so the client can show an instant toast / sound
      // without waiting for its polling loop. The existing push-notification
      // already fires above; this one is for in-tab UX.
      try {
        notifyNexusQueueCompleted(nexus.ownerId!, {
          nexusId: updated.id,
          builds: buildQueueBefore.slice(0, drainedBuildCount).map((b) => ({
            building: b.building,
            targetLevel: b.targetLevel,
          })),
          trainings: Object.entries(trainTotals).map(([troopType, amount]) => ({
            troopType,
            amount: Number(amount),
          })),
        });
      } catch (emitErr) {
        console.error(`processCompletedQueuesAndNotify completion emit failed for nexus ${nexus.id}:`, emitErr);
      }
    } catch (err) {
      console.error(`processCompletedQueuesAndNotify failed for nexus ${nexus.id}:`, err);
    }
  }
}

export async function recoverControlLevels(): Promise<void> {
  try {
    // Single SQL expression, no per-row round-trips
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
  resources: string[];
  multiplier: number;
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
    // Support both old (resource: string) and new (resources: string[]) format
    const resources: string[] = Array.isArray(meta.resources)
      ? (meta.resources as string[])
      : typeof meta.resource === 'string'
        ? [meta.resource]
        : [];
    const multiplier = typeof meta.multiplier === 'number' ? meta.multiplier : 2;
    storms.push({
      galaxyId: ev.galaxyId,
      resources,
      multiplier,
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
    for (const resource of s.resources) {
      if (resource === 'biomass') bonus.biomass = (bonus.biomass ?? 1) * s.multiplier;
      else if (resource === 'alloy') bonus.alloy = (bonus.alloy ?? 1) * s.multiplier;
      else if (resource === 'ore') bonus.ore = (bonus.ore ?? 1) * s.multiplier;
    }
  }
  return bonus;
}

export async function updateAllResources(): Promise<void> {
  try {
    // Select only columns needed for computation, avoids loading queues/troops/etc.
    const [nexuses, activeStorms] = await Promise.all([
      prisma.nexus.findMany({
        select: {
          id: true, ownerId: true, name: true, nexusType: true, nexusTypeDoubled: true,
          galaxyId: true, x: true, y: true,
          biomassFarm: true, alloyForge: true, oreExtractor: true, storageVault: true,
          biomass: true, alloy: true, ore: true, lastResourceUpdate: true,
          commandCore: true, recruitmentCore: true, lifeSupport: true, shieldGrid: true, armory: true, stealthArray: true,
          lancerDrone: true, assaultTrooper: true, breakerUnit: true, reconOperative: true,
          skimmerBike: true, siegeMech: true, voidStalker: true, plasmaTurret: true,
        },
      }),
      loadActiveStorms(),
    ]);

    if (nexuses.length === 0) return;

    // Compute all updates in memory, pure JS, no DB round-trips
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

    // Single bulk UPDATE via VALUES list, O(1) round-trips regardless of nexus count
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

    // Push the post-tick resource snapshot to any owner with an active socket
    // so their live interpolation re-anchors against the server baseline.
    // We skip neutral nexuses (ownerId null) and offline owners (no socket
    // joined to user:{ownerId}) so we don't build payloads no one will read.
    // The per-row emit is intentionally trivial — payload is ~120 bytes JSON.
    try {
      const onlineCache = new Map<number, boolean>();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const src = nexuses[i];
        // nexuses[i] and rows[i] correspond because the rows loop above
        // iterates `nexuses` in order; preserved here to avoid a per-row find().
        if (!src.ownerId || src.id !== row.id) continue;
        let online = onlineCache.get(src.ownerId);
        if (online === undefined) {
          online = isUserOnline(src.ownerId);
          onlineCache.set(src.ownerId, online);
        }
        if (!online) continue;
        notifyNexusResources(src.ownerId, {
          nexusId: row.id,
          base: { biomass: row.biomass, alloy: row.alloy, ore: row.ore },
          production: getResourceProduction(src),
          storageMax: getMaxStorage(src),
          lastResourceUpdate: row.lastResourceUpdate,
        });
      }
    } catch (emitErr) {
      console.error('updateAllResources emit failed:', emitErr);
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
      armory: (v as unknown as { armory?: number }).armory ?? 0,
      stealthArray: (v as unknown as { stealthArray?: number }).stealthArray ?? 0,
    },
    troops: {
      lancerDrone: v.lancerDrone, assaultTrooper: v.assaultTrooper, breakerUnit: v.breakerUnit,
      reconOperative: v.reconOperative, skimmerBike: v.skimmerBike, siegeMech: v.siegeMech,
      bulwarkGuard: v.bulwarkGuard, suppressorTeam: v.suppressorTeam, disruptorUnit: v.disruptorUnit,
      interceptorBike: v.interceptorBike, annihilatorPlatform: v.annihilatorPlatform,
      voidStalker: (v as unknown as { voidStalker?: number }).voidStalker ?? 0,
      plasmaTurret: (v as unknown as { plasmaTurret?: number }).plasmaTurret ?? 0,
      overseer: v.overseer,
    },
    population: { current: v.populationCurrent, max: v.populationMax },
    buildQueue: (v.buildQueue as unknown[]) ?? [],
    trainingQueue: (v.trainingQueue as unknown[]) ?? [],
    questRewardClaims: (v.questRewardClaims as string[] | null) ?? null,
    completedQuestIds: (v.completedQuestIds as string[] | null) ?? null,
    troopsTrained: normalizeTroopsTrained((v as unknown as { troopsTrained?: unknown }).troopsTrained),
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
  attackerIsSupporter?: boolean;
  attackerSupporterTier?: string | null;
  attackerAvatarUrl?: string | null;
  attackerAvatarUrlSm?: string | null;
  attackerNexusId: number | null;
  attackerNexus?: { id: number; name: string; x: number; y: number; shieldGrid?: number } | null;
  defenderUserId: number | null;
  defenderUsername?: string;
  defenderIsSupporter?: boolean;
  defenderSupporterTier?: string | null;
  defenderAvatarUrl?: string | null;
  defenderAvatarUrlSm?: string | null;
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
        isSupporter: a.attackerIsSupporter ?? false,
        supporterTier: a.attackerSupporterTier ?? null,
        avatarUrl: a.attackerAvatarUrl ?? null,
        avatarUrlSm: a.attackerAvatarUrlSm ?? null,
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
        isSupporter: a.defenderIsSupporter ?? false,
        supporterTier: a.defenderSupporterTier ?? null,
        avatarUrl: a.defenderAvatarUrl ?? null,
        avatarUrlSm: a.defenderAvatarUrlSm ?? null,
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
