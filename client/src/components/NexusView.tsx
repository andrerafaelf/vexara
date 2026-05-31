import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cancelBuildQueueItem,
  cancelTrainingQueueItem,
  checkBuildQueue,
  checkTrainingQueue,
  claimQuestReward,
  getGalaxyEvents,
  getIncomingAttacks,
  getMyNexuses,
  getNexusTroopTransfers,
  getOutgoingAttacks,
  recallTroops,
  renameNexus,
  sendBackTroops,
  sendTroops,
  trainTroops,
  transferResources,
  upgradeBuilding,
} from '../services/api';
import {
  AlertTriangle,
  ArrowDownLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Hammer,
  Info,
  LayoutGrid,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import '../styles/NexusView.css';
import Username from './Username';
import { Nexus, TroopTransfer } from '../types/game';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { MapNexus } from './Map';

// StarfieldMap is ~1300 LOC + heavy assets and websocket-bound effects. It's only used inside
// the Map and Espionage tabs, which aren't visible on first paint. Pulling it out of the
// initial bundle keeps /nexus/[id] fast on cold load and on every other tab.
const StarfieldMap = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => null,
});
import DailyStreaks from './DailyStreaks';
import NexusMap from './NexusMap';
import NexusTypeBadge from './NexusTypeBadge';
import ResourceIcon from './ResourceIcon';
// Shared source of truth with server/utils/gameConstants.ts.
// If you change any number or formula here, change the server mirror in the same commit.
import {
  BUILDING_COSTS,
  TROOP_COSTS,
  getBuildingCost as getSharedBuildingCost,
  getCommandBuildQueueBonus,
  getCommandTrainingQueueBonus,
  getEffectiveBuildTimeSeconds,
  getEffectiveTrainTimeSeconds,
  getOverseerCost,
  getTrainTimeSeconds as getRecruitDiscountedTrainSeconds,
} from '../realtime/gameConstants.shared';
import { useToast } from '../context/ToastContext';
import { Countdown } from './Countdown';
import { QueueCountdown } from './QueueCountdown';
import { LiveResourceStrip } from './LiveResourceStrip';
import { BuildingCard, LockedBuildingPlot } from './BuildingCard';
import { useNow } from '@/hooks/useNow';
import { formatTimeOfDay } from '@/utils/date';
import { useResourceSnapshot } from '@/realtime/useLiveResources';
import { realtimeStore } from '@/realtime/store';
import { getMaxStorage, getResourceProduction, interpolateResources } from '@/realtime/economy.shared';
import { serverNow } from '@/realtime/serverClock';

// Import troop images
import annihilatorplatformImg from '../assets/troops/annihilatorplatform.png';
import assaulttrooperImg from '../assets/troops/assaulttrooper.png';
import breakerunitImg from '../assets/troops/breakerunit.png';
import bulwarkguardImg from '../assets/troops/bulwarkguard.png';
import disruptorunitImg from '../assets/troops/disruptorunit.png';
import interceptorbikeImg from '../assets/troops/interceptorbike.png';
import lancerdroneImg from '../assets/troops/lancerdrone.png';
import overseerImg from '../assets/troops/overseer.png';
import plasmaturretImg from '../assets/troops/plasmaturret.png';
import reconoperativeImg from '../assets/troops/reconoperative.png';
import siegemechImg from '../assets/troops/siegemech.png';
import skimmerbikeImg from '../assets/troops/skimmerbike.png';
import suppressorteamImg from '../assets/troops/suppressorteam.png';
import voidstalkerImg from '../assets/troops/voidstalker.png';

// Import building images
import alloyforgeImg from '../assets/buildings/alloyforge.png';
import biomassfarmImg from '../assets/buildings/biomassfarm.png';
import commandcoreImg from '../assets/buildings/commandcore.png';
import lifesupportImg from '../assets/buildings/lifesupport.png';
import oreextractorImg from '../assets/buildings/oreextractor.png';
import recruitmentcoreImg from '../assets/buildings/recruitmentcore.png';
import armoryImg from '../assets/buildings/armory.png';
import stealtharrayImg from '../assets/buildings/stealtharray.png';
import shieldgridImg from '../assets/buildings/shieldgrid.png';
import storagevaultImg from '../assets/buildings/storagevault.png';

interface NexusViewProps {
  nexus: Nexus;
  onUpdate: () => void;
  initialTab?: NexusTab;
  onTabChange?: (tab: NexusTab) => void;
}

type NexusTab = 'overview' | 'buildings' | 'troops' | 'deployed' | 'map' | 'espionage';

const BASE_MAX_BUILD_QUEUE = 5;
const BASE_MAX_TRAINING_QUEUE = 5;

// Gate for the buff banner - labels are derived per-type inline so this
// only needs to know which types render a banner.
const NEXUS_TYPES_WITH_BUFF = new Set([
  'Resource Depot',
  'Supply Cache',
  'Military Outpost',
  'Forward Base',
]);

const BUILDING_NAMES: { [key: string]: string } = {
  commandCore: 'Command Core',
  recruitmentCore: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
  armory: 'Armory',
  stealthArray: 'Stealth Array',
};

const BUILDING_DESCRIPTIONS: { [key: string]: string } = {
  commandCore: 'Unlocks new buildings, units, and progression milestones. Required for nexus expansion.',
  recruitmentCore: 'Allows training of combat units. Higher levels reduce training time.',
  lifeSupport: 'Increases maximum population capacity for housing more troops and workers.',
  storageVault: 'Increases resource storage capacity. Protects resources from raids.',
  biomassFarm: 'Produces Biomass per hour. Higher levels increase production rate.',
  alloyForge: 'Produces Alloy per hour. Higher levels increase production rate.',
  oreExtractor: 'Produces Ore per hour. Higher levels increase production rate.',
  shieldGrid: 'Increases defensive bonus. Protects your nexus from enemy attacks.',
  armory: 'Amplifies unit class-counter bonuses in combat (+1.5% per level). Unlocks Void Stalker (Lv3) and Plasma Turret (Lv5).',
  stealthArray: 'Reduces enemy spy success rate and boosts your operative effectiveness (+2% per level). Requires Armory Lv3.',
};


const BUILDING_RULES: {
  [key: string]: {
    maxLevel: number;
    unlock?: { building: string; level: number };
    milestones: Array<{ level: number; requires: Array<{ building: string; level: number }> }>;
  };
} = {
  commandCore: {
    maxLevel: 20,
    milestones: [
      { level: 4, requires: [{ building: 'lifeSupport', level: 2 }] },
      { level: 6, requires: [{ building: 'shieldGrid', level: 2 }] },
      { level: 10, requires: [{ building: 'storageVault', level: 5 }] },
    ],
  },
  recruitmentCore: {
    maxLevel: 15,
    unlock: { building: 'commandCore', level: 2 },
    milestones: [
      { level: 4, requires: [{ building: 'biomassFarm', level: 2 }] },
      { level: 6, requires: [{ building: 'alloyForge', level: 2 }] },
      { level: 10, requires: [{ building: 'lifeSupport', level: 5 }] },
    ],
  },
  lifeSupport: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 2 },
    milestones: [
      { level: 4, requires: [{ building: 'biomassFarm', level: 2 }] },
      { level: 8, requires: [{ building: 'storageVault', level: 4 }] },
    ],
  },
  storageVault: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 2 },
    milestones: [
      { level: 4, requires: [{ building: 'oreExtractor', level: 2 }] },
      { level: 6, requires: [{ building: 'alloyForge', level: 2 }] },
      { level: 10, requires: [{ building: 'commandCore', level: 8 }] },
    ],
  },
  biomassFarm: {
    maxLevel: 20,
    unlock: { building: 'lifeSupport', level: 1 },
    milestones: [
      { level: 6, requires: [{ building: 'recruitmentCore', level: 2 }] },
      { level: 10, requires: [{ building: 'lifeSupport', level: 5 }] },
    ],
  },
  alloyForge: {
    maxLevel: 20,
    unlock: { building: 'oreExtractor', level: 2 },
    milestones: [
      { level: 6, requires: [{ building: 'commandCore', level: 4 }] },
      { level: 10, requires: [{ building: 'oreExtractor', level: 8 }] },
    ],
  },
  oreExtractor: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 1 },
    milestones: [{ level: 8, requires: [{ building: 'alloyForge', level: 4 }] }],
  },
  shieldGrid: {
    maxLevel: 15,
    unlock: { building: 'commandCore', level: 3 },
    milestones: [
      { level: 4, requires: [{ building: 'storageVault', level: 3 }] },
      { level: 8, requires: [{ building: 'alloyForge', level: 5 }] },
    ],
  },
  armory: {
    maxLevel: 20,
    unlock: { building: 'commandCore', level: 5 },
    milestones: [
      { level: 3,  requires: [{ building: 'recruitmentCore', level: 5 }] },
      { level: 5,  requires: [{ building: 'recruitmentCore', level: 7 }, { building: 'shieldGrid', level: 3 }] },
      { level: 10, requires: [{ building: 'commandCore', level: 10 }, { building: 'recruitmentCore', level: 10 }] },
    ],
  },
  stealthArray: {
    maxLevel: 15,
    unlock: { building: 'commandCore', level: 7 },
    milestones: [
      { level: 3,  requires: [{ building: 'armory', level: 3 }] },
      { level: 7,  requires: [{ building: 'shieldGrid', level: 5 }, { building: 'commandCore', level: 10 }] },
      { level: 12, requires: [{ building: 'armory', level: 10 }, { building: 'commandCore', level: 15 }] },
    ],
  },
};


const BUILDING_IMAGES: { [key: string]: any } = {
  commandCore: commandcoreImg,
  recruitmentCore: recruitmentcoreImg,
  lifeSupport: lifesupportImg,
  storageVault: storagevaultImg,
  biomassFarm: biomassfarmImg,
  alloyForge: alloyforgeImg,
  oreExtractor: oreextractorImg,
  shieldGrid: shieldgridImg,
  armory: armoryImg,
  stealthArray: stealtharrayImg,
};

const TROOP_NAMES: { [key: string]: string } = {
  assaultTrooper: 'Assault Trooper',
  lancerDrone: 'Lancer Drone',
  breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative',
  skimmerBike: 'Skimmer Bike',
  siegeMech: 'Siege Mech',
  bulwarkGuard: 'Bulwark Guard',
  suppressorTeam: 'Suppressor Team',
  disruptorUnit: 'Disruptor Unit',
  interceptorBike: 'Interceptor Bike',
  annihilatorPlatform: 'Annihilator Platform',
  voidStalker: 'Void Stalker',
  plasmaTurret: 'Plasma Turret',
  overseer: 'Overseer',
};

const TROOP_IMAGES: { [key: string]: any } = {
  assaultTrooper: assaulttrooperImg,
  lancerDrone: lancerdroneImg,
  breakerUnit: breakerunitImg,
  reconOperative: reconoperativeImg,
  skimmerBike: skimmerbikeImg,
  siegeMech: siegemechImg,
  bulwarkGuard: bulwarkguardImg,
  suppressorTeam: suppressorteamImg,
  disruptorUnit: disruptorunitImg,
  interceptorBike: interceptorbikeImg,
  annihilatorPlatform: annihilatorplatformImg,
  voidStalker: voidstalkerImg,
  plasmaTurret: plasmaturretImg,
  overseer: overseerImg,
};

const TROOP_DESCRIPTIONS: { [key: string]: string } = {
  assaultTrooper:
    'Standard heavy infantry. Frontline soldier optimized for sustained combat. Counters special units. Requires Lv1 Recruitment Core.',
  lancerDrone:
    'Ranged interceptor drone. Suppresses fast-moving light units effectively. Requires Lv2 Recruitment Core.',
  breakerUnit:
    'Light assault breacher. Exploits armor gaps to devastate heavy units. Requires Lv3 Recruitment Core, Lv3 Ore Extractor.',
  reconOperative:
    'Scout & intelligence operative. Gathers intel on enemy nexuses. Requires Lv4 Recruitment Core, Lv3 Command Core.',
  skimmerBike:
    'Fast light raider. High-speed bike that counters heavy armor with mobility. Requires Lv5 Recruitment Core, Lv4 Alloy Forge.',
  siegeMech:
    'Heavy siege unit. Massive mech that crushes special command units. Requires Lv10 Recruitment Core, Lv9 Ore Extractor, Lv8 Command Core.',
  bulwarkGuard:
    'Elite heavy defender. Heavily shielded infantry. Requires Lv5 Recruitment Core, Lv5 Life Support.',
  suppressorTeam:
    'Ranged suppressor. Long-range team specialized in pinning down light cavalry. Requires Lv7 Recruitment Core, Lv6 Command Core.',
  disruptorUnit:
    'Ranged anti-armor. EMP weapons suppress heavy units. Requires Lv7 Recruitment Core, Lv6 Ore Extractor.',
  interceptorBike:
    'Light rapid-response cavalry. Extremely fast, counters heavy armor. Requires Lv8 Recruitment Core, Lv7 Alloy Forge.',
  annihilatorPlatform:
    'Heavy artillery. Slow but devastating ranged platform that suppresses light units. Requires Lv12 Recruitment Core, Lv10 Command Core, Lv10 Shield Grid.',
  voidStalker:
    'Light stealth cavalry. Fastest unit in the game; hard-counters heavy armor - but is itself suppressed by ranged emplacements. Requires Lv9 Recruitment Core, Lv8 Alloy Forge, Lv3 Armory.',
  plasmaTurret:
    'Ranged static emplacement. Cannot be sent on attacks, defends from the nexus. Decimates light cavalry. Requires Lv11 Recruitment Core, Lv9 Command Core, Lv5 Armory.',
  overseer:
    'Conquest unit. Reduces enemy Control by 34 per successful strike. Requires Lv14 Recruitment Core, Lv14 Command Core, Lv13 Shield Grid. Up to 3 per nexus.',
};

const TROOP_REQUIREMENTS: { [key: string]: any } = {
  assaultTrooper: { buildings: { recruitmentCore: 1 } },
  lancerDrone: { buildings: { recruitmentCore: 2 } },
  breakerUnit: { buildings: { recruitmentCore: 3, oreExtractor: 3 } },
  reconOperative: { buildings: { recruitmentCore: 4, commandCore: 3 } },
  skimmerBike: { buildings: { recruitmentCore: 5, alloyForge: 4 } },
  bulwarkGuard: { buildings: { recruitmentCore: 5, lifeSupport: 5 } },
  suppressorTeam: { buildings: { recruitmentCore: 7, commandCore: 6 } },
  disruptorUnit: { buildings: { recruitmentCore: 7, oreExtractor: 6 } },
  interceptorBike: { buildings: { recruitmentCore: 8, alloyForge: 7 } },
  siegeMech: { buildings: { recruitmentCore: 10, oreExtractor: 9, commandCore: 8 } },
  annihilatorPlatform: { buildings: { recruitmentCore: 12, commandCore: 10, shieldGrid: 10 } },
  voidStalker: { buildings: { recruitmentCore: 9, alloyForge: 8, armory: 3 } },
  plasmaTurret: { buildings: { recruitmentCore: 11, commandCore: 9, armory: 5 } },
  overseer: { buildings: { recruitmentCore: 14, commandCore: 14, shieldGrid: 13 }, maxPerNexus: 3 },
};

const POPULATION_BASE = 100;
const POPULATION_GROWTH = 1.15;
const STORAGE_BASE = 1500;
const STORAGE_GROWTH = 1.5;
const SHIELD_BONUS_PER_LEVEL = 0.02;

const TROOP_CATEGORIES: Record<string, 'offense' | 'defense'> = {
  breakerUnit: 'offense',
  skimmerBike: 'offense',
  suppressorTeam: 'offense',
  disruptorUnit: 'offense',
  interceptorBike: 'offense',
  annihilatorPlatform: 'offense',
  voidStalker: 'offense',
  overseer: 'offense',
  assaultTrooper: 'defense',
  lancerDrone: 'defense',
  reconOperative: 'defense',
  siegeMech: 'defense',
  bulwarkGuard: 'defense',
  plasmaTurret: 'defense',
};


interface IntroQuest {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  tab: 'buildings' | 'troops' | 'map';
  // Optional inline "Next up" tooltip copy for the tab where this quest runs.
  // Only present on chapters 1-3 quests - later chapters don't render tooltips.
  // Rendered as raw JSX inside <span className="noob-tip-text">, so HTML-safe
  // strings only (no user input).
  tip?: React.ReactNode;
}

// Quest batch IDs are the canonical server identifiers from
// server/models/Nexus.ts QUEST_REWARD_BATCHES. Keep this union in lockstep -
// the server is what actually writes claimedRewards/completedQuestIds, so any
// drift means rewards never fire (the UI shows quests as "done" while the
// server still doesn't recognize the batch).
interface QuestBatch {
  id: 'intro' | 'expansion' | 'first_blood' | 'shadow_ops' | 'arsenal' | 'veteran' | 'ghost_protocol' | 'annihilator';
  title: string;
  quests: IntroQuest[];
  unlocked: boolean;
  reward: string;
}

interface InfoModalState {
  title: string;
  description: string;
  codexHref?: string;
}

const NexusView: React.FC<NexusViewProps> = ({ nexus, onUpdate, initialTab = 'overview', onTabChange }) => {
  const router = useRouter();
  const [activeTab, setActiveTabState] = useState<NexusTab>(initialTab);
  const [mapEverVisited, setMapEverVisited] = useState(initialTab === 'map');
  const [espionageEverVisited, setEspionageEverVisited] = useState(initialTab === 'espionage');
  const setActiveTab = (tab: NexusTab) => {
    setActiveTabState(tab);
    if (tab === 'map') setMapEverVisited(true);
    if (tab === 'espionage') setEspionageEverVisited(true);
    onTabChange?.(tab);
  };
  const [troopsSubTab, setTroopsSubTab] = useState<'train' | 'stationed'>('train');
  // Incoming strikes panel collapse toggle. Defaults expanded so an active
  // threat is visible without a click, but can be shrunk when it's crowded.
  const [incomingCollapsed, setIncomingCollapsed] = useState(false);
  const [isRenamingNexus, setIsRenamingNexus] = useState(false);
  const [renameValue, setRenameValue] = useState(nexus.name);
  const [isSavingNexusName, setIsSavingNexusName] = useState(false);
  const showToastGlobal = useToast();
  const queryClient = useQueryClient();
  const { data: galaxyEvents = [] } = useQuery({
    queryKey: ['galaxyEvents'],
    queryFn: () => getGalaxyEvents().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: incomingAttacks = [] } = useQuery({
    queryKey: ['incomingAttacks', nexus._id],
    queryFn: () => getIncomingAttacks(nexus._id).then((r) => r.data),
  });
  const { data: outgoingAttacks = [] } = useQuery({
    queryKey: ['outgoingAttacks', nexus._id],
    queryFn: () => getOutgoingAttacks(nexus._id).then((r) => r.data),
  });
  const { data: ownNexusesData = [] } = useQuery({
    queryKey: ['myNexuses'],
    queryFn: () => getMyNexuses().then((r) => r.data),
  });
  const { data: troopTransfersData = [], refetch: refetchTransfers } = useQuery({
    queryKey: ['troopTransfers', nexus._id],
    queryFn: () => getNexusTroopTransfers(nexus._id).then((r) => r.data),
  });
  const [selectedAttack, setSelectedAttack] = useState<any | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalState | null>(null);
  const ownNexuses: Nexus[] = ownNexusesData;
  const troopTransfers: TroopTransfer[] = troopTransfersData;
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmounts, setTransferAmounts] = useState({ biomass: '', alloy: '', ore: '' });
  const [transferring, setTransferring] = useState(false);
  const [showTroopSend, setShowTroopSend] = useState(false);
  const [troopSendTo, setTroopSendTo] = useState('');
  const [troopSendAmounts, setTroopSendAmounts] = useState<Record<string, string>>({});
  const [sendingTroops, setSendingTroops] = useState(false);
  const submittingRef = useRef<Set<string>>(new Set());
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [claimingBatch, setClaimingBatch] = useState<string | null>(null);

  const dismissTip = (id: string) => setDismissedTips((prev) => new Set(prev).add(id));

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    showToastGlobal(message, type);
  };

  const handleInfoTap = (title: string, description: string, codexHref?: string) => {
    setInfoModal({ title, description, codexHref });
  };

  const submitNexusRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed.length < 3 || trimmed.length > 32) {
      showToast('Nexus name must be between 3 and 32 characters', 'error');
      return;
    }

    if (trimmed === nexus.name) {
      setIsRenamingNexus(false);
      return;
    }

    try {
      setIsSavingNexusName(true);
      await renameNexus(nexus._id, trimmed);
      showToast('Nexus renamed successfully', 'success');
      setIsRenamingNexus(false);
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error renaming nexus', 'error');
    } finally {
      setIsSavingNexusName(false);
    }
  };

  const beginNexusRename = () => {
    setRenameValue(nexus.name);
    setIsRenamingNexus(true);
  };

  const cancelNexusRename = () => {
    setRenameValue(nexus.name);
    setIsRenamingNexus(false);
  };

  const handleClaimQuestReward = async (batchId: string) => {
    if (claimingBatch) return;
    setClaimingBatch(batchId);
    try {
      await claimQuestReward(nexus._id, batchId, nexus._id);
      showToast('Reward claimed!', 'success');
      onUpdate();
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to claim reward', 'error');
    } finally {
      setClaimingBatch(null);
    }
  };

  // Countdown components now subscribe to the shared `useNow()` clock directly, so this
  // component no longer needs its own per-second tick. Only the leaf countdowns re-render
  // every second; this tree stays stable until `nexus` or local state actually changes.

  // Seed the realtime store from the latest server snapshot so useLiveResources
  // and useCanAfford have data to interpolate against before (and between) any
  // socket events. Re-runs whenever the nexus payload changes, which keeps the
  // baseline correct after a manual onUpdate() refetch or any mutation.
  useEffect(() => {
    realtimeStore.set({
      nexusId: String(nexus._id),
      base: { biomass: nexus.resources.biomass, alloy: nexus.resources.alloy, ore: nexus.resources.ore },
      production: getResourceProduction({
        nexusType: nexus.nexusType,
        nexusTypeDoubled: nexus.nexusTypeDoubled,
        isDerelict: nexus.isDerelict,
        commandCore: nexus.buildings.commandCore,
        biomassFarm: nexus.buildings.biomassFarm,
        alloyForge: nexus.buildings.alloyForge,
        oreExtractor: nexus.buildings.oreExtractor,
        storageVault: nexus.buildings.storageVault,
      }),
      storageMax: getMaxStorage({
        nexusType: nexus.nexusType,
        nexusTypeDoubled: nexus.nexusTypeDoubled,
        biomassFarm: nexus.buildings.biomassFarm,
        alloyForge: nexus.buildings.alloyForge,
        oreExtractor: nexus.buildings.oreExtractor,
        storageVault: nexus.buildings.storageVault,
      }),
      anchorMs: nexus.lastResourceUpdate
        ? new Date(nexus.lastResourceUpdate).getTime()
        : Date.now(),
    });
  }, [
    nexus._id,
    nexus.resources.biomass,
    nexus.resources.alloy,
    nexus.resources.ore,
    nexus.buildings.biomassFarm,
    nexus.buildings.alloyForge,
    nexus.buildings.oreExtractor,
    nexus.buildings.storageVault,
    nexus.nexusType,
    nexus.nexusTypeDoubled,
    nexus.lastResourceUpdate,
  ]);

  // Subscribe to the store *without* the 1Hz clock so this large component
  // re-renders only when a fresh server snapshot arrives, not every second.
  // Leaves that need ticking interpolation (BuildingCard, LiveResourceStrip,
  // future TrainCard) call useLiveResources themselves.
  const resourceSnapshot = useResourceSnapshot(String(nexus._id));

  useEffect(() => {
    setActiveTabState(initialTab);
    if (initialTab === 'map') setMapEverVisited(true);
    if (initialTab === 'espionage') setEspionageEverVisited(true);
  }, [initialTab]);

  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    // Apply finished build/training items as quickly as possible. We bias the
    // polling interval toward the next completing queue entry: if something
    // is about to finish in the next 20s we poll every second, otherwise we
    // fall back to the cheap 15s heartbeat. This keeps "Finishing…" from
    // lingering on screen for more than a tick or two after completion.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      // Compare server-issued completesAt against server-anchored now so the
      // refetch fires at the actual queue-completion moment even if the local
      // clock drifts.
      const now = serverNow();
      const buildEnds = nexus.buildQueue.map((item) => new Date(item.completesAt).getTime());
      const trainEnds = nexus.trainingQueue.map((item) => new Date(item.completesAt).getTime());
      const allEnds = [...buildEnds, ...trainEnds].filter((t) => Number.isFinite(t));
      const dueNow = allEnds.some((t) => t <= now);
      const nextEnd = allEnds.filter((t) => t > now).sort((a, b) => a - b)[0];
      const msUntilNext = nextEnd ? nextEnd - now : Infinity;
      const delay = dueNow ? 750 : msUntilNext < 20_000 ? 1000 : 15_000;
      timeoutId = setTimeout(async () => {
        await checkQueues();
        schedule();
      }, delay);
    };
    schedule();

    // PWA / tab resume: timers fire late or get coalesced while the tab is
    // hidden, so any queue item that completed during the background gets
    // "Finishing…" stuck on screen until the next scheduled poll. On resume
    // we immediately reconcile the queue and reset the schedule so the
    // post-resume cadence is fresh instead of mid-15s-wait.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      void checkQueues().then(schedule);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timeoutId) clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nexus._id, nexus.buildQueue.length, nexus.trainingQueue.length]);

  useEffect(() => {
    if (!isRenamingNexus) {
      setRenameValue(nexus.name);
    }
  }, [isRenamingNexus, nexus.name]);

  const refreshTroopTransfers = () => {
    refetchTransfers();
  };

  const handleSendTroops = async () => {
    if (!troopSendTo) return;
    const troops: Record<string, number> = {};
    for (const [k, v] of Object.entries(troopSendAmounts)) {
      troops[k] = parseInt(v) || 0;
    }
    setSendingTroops(true);
    try {
      await sendTroops(nexus._id, troopSendTo, troops);
      showToast('Troops sent', 'success');
      setTroopSendAmounts({});
      setShowTroopSend(false);
      onUpdate();
      await refreshTroopTransfers();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to send troops', 'error');
    } finally {
      setSendingTroops(false);
    }
  };

  const handleRecall = async (transferId: string) => {
    try {
      await recallTroops(transferId);
      showToast('Troops recalled', 'success');
      onUpdate();
      await refreshTroopTransfers();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Recall failed', 'error');
    }
  };

  const handleSendBack = async (transferId: string) => {
    try {
      await sendBackTroops(transferId);
      showToast('Troops sent back to owner', 'success');
      onUpdate();
      await refreshTroopTransfers();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Send back failed', 'error');
    }
  };

  const handleTransferResources = async () => {
    if (!transferTo) return;
    const biomass = parseInt(transferAmounts.biomass) || 0;
    const alloy = parseInt(transferAmounts.alloy) || 0;
    const ore = parseInt(transferAmounts.ore) || 0;
    if (biomass === 0 && alloy === 0 && ore === 0) {
      showToast('Enter at least one amount to transfer', 'error');
      return;
    }
    setTransferring(true);
    try {
      await transferResources(nexus._id, transferTo, biomass, alloy, ore);
      showToast('Resources transferred', 'success');
      setTransferAmounts({ biomass: '', alloy: '', ore: '' });
      setShowTransfer(false);
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Transfer failed', 'error');
    } finally {
      setTransferring(false);
    }
  };

  const checkQueues = async () => {
    try {
      const [buildResponse, trainingResponse] = await Promise.all([
        checkBuildQueue(nexus._id),
        checkTrainingQueue(nexus._id),
      ]);
      const buildCompleted = buildResponse.data?.completed;
      const trainingCompleted = trainingResponse.data?.completed;
      if (buildCompleted) {
        showToast('A building upgrade completed and was applied.', 'success');
      }
      if (trainingCompleted) {
        showToast('Training completed and your troops are ready.', 'success');
      }
      if (buildCompleted || trainingCompleted) {
        onUpdate();
      }
    } catch (err) {
      console.error('Error checking queues:', err);
    }
  };

  const loadAttacks = () => {
    queryClient.invalidateQueries({ queryKey: ['incomingAttacks', nexus._id] });
    queryClient.invalidateQueries({ queryKey: ['outgoingAttacks', nexus._id] });
  };

  const handleUpgrade = async (building: string) => {
    const key = `build-${building}`;
    if (submittingRef.current.has(key)) return;
    submittingRef.current.add(key);

    const maxBuildQueue = BASE_MAX_BUILD_QUEUE + getCommandBuildQueueBonus(nexus.buildings.commandCore);
    if (nexus.buildQueue.length >= maxBuildQueue) {
      showToast(`Build queue is full (${maxBuildQueue}/${maxBuildQueue})`, 'error');
      submittingRef.current.delete(key);
      return;
    }

    const queued = nexus.buildQueue.length > 0;
    try {
      await upgradeBuilding(nexus._id, building);
      showToast(
        queued ? `${BUILDING_NAMES[building]} upgrade added to queue.` : `${BUILDING_NAMES[building]} upgrade started!`,
        queued ? 'info' : 'success',
      );
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error upgrading building', 'error');
    } finally {
      submittingRef.current.delete(key);
    }
  };

  // `rawAmount` is now passed in by the caller (the TrainCard) which owns its own input state,
  // so typing in the input no longer re-renders this entire component. Returns true on
  // successful submission so the caller can clear its own input.
  const handleTrainTroopsImpl = async (troopType: string, rawAmount: string): Promise<boolean> => {
    const key = `train-${troopType}`;
    if (submittingRef.current.has(key)) return false;
    submittingRef.current.add(key);

    const sameChainCount = nexus.trainingQueue.filter((entry: any) =>
      troopType === 'overseer' ? entry.troopType === 'overseer' : entry.troopType !== 'overseer',
    ).length;
    const maxTrainingQueue = BASE_MAX_TRAINING_QUEUE + getCommandTrainingQueueBonus(nexus.buildings.commandCore);
    if (sameChainCount >= maxTrainingQueue) {
      showToast(`Training queue is full (${maxTrainingQueue}/${maxTrainingQueue})`, 'error');
      submittingRef.current.delete(key);
      return false;
    }

    const requirementsResult = checkTroopRequirements(troopType);
    const { maxTrainable } = getMaxTrainableAmount(troopType, TROOP_COSTS[troopType], requirementsResult.canTrain);
    const requestedAmount = rawAmount === '' ? 1 : Number.parseInt(rawAmount, 10);
    const amount = Math.min(Number.isFinite(requestedAmount) ? requestedAmount : 0, maxTrainable);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Not enough population or resources to train this unit right now', 'error');
      submittingRef.current.delete(key);
      return false;
    }

    // Check requirements
    const requirements = TROOP_REQUIREMENTS[troopType];
    if (requirements) {
      // Check building requirements
      if (requirements.buildings) {
        for (const [building, level] of Object.entries(requirements.buildings)) {
          if ((nexus.buildings as any)[building] < (level as number)) {
            showToast(`Requires ${BUILDING_NAMES[building]} Level ${level}`, 'error');
            submittingRef.current.delete(key);
            return false;
          }
        }
      }

      // Check max per nexus
      if (requirements.maxPerNexus) {
        const committed = getCommittedTroopCount(troopType);
        if (committed >= requirements.maxPerNexus) {
          showToast(`Maximum ${requirements.maxPerNexus} ${TROOP_NAMES[troopType]} per nexus`, 'error');
          submittingRef.current.delete(key);
          return false;
        }
        if (amount > requirements.maxPerNexus - committed) {
          showToast(`Can only train ${requirements.maxPerNexus - committed} more`, 'error');
          submittingRef.current.delete(key);
          return false;
        }
      }
    }

    const queued = nexus.trainingQueue.length > 0;
    try {
      await trainTroops(nexus._id, troopType, amount);
      showToast(
        queued
          ? `${amount}x ${TROOP_NAMES[troopType]} added to training queue.`
          : `Training ${amount}x ${TROOP_NAMES[troopType]} started!`,
        queued ? 'info' : 'success',
      );
      onUpdate();
      return true;
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error training troops', 'error');
      return false;
    } finally {
      submittingRef.current.delete(key);
    }
  };

  // Stable wrapper that delegates to the latest impl via ref, lets memoized children
  // (TrainAmountControls) hold onto a single identity instead of getting a fresh function
  // every parent render. Without this, React.memo on the control would always be defeated.
  const handleTrainTroopsRef = useRef(handleTrainTroopsImpl);
  handleTrainTroopsRef.current = handleTrainTroopsImpl;
  const handleTrainTroops = useRef((troopType: string, rawAmount: string) =>
    handleTrainTroopsRef.current(troopType, rawAmount),
  ).current;

  const handleCancelBuildQueue = async (index: number) => {
    const key = `cancel-build-${index}`;
    if (submittingRef.current.has(key)) return;
    submittingRef.current.add(key);
    try {
      await cancelBuildQueueItem(nexus._id, index);
      showToast('Build cancelled. 85% of resources refunded.', 'info');
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error cancelling build', 'error');
    } finally {
      submittingRef.current.delete(key);
    }
  };

  const handleCancelTrainingQueue = async (index: number) => {
    const key = `cancel-train-${index}`;
    if (submittingRef.current.has(key)) return;
    submittingRef.current.add(key);
    try {
      await cancelTrainingQueueItem(nexus._id, index);
      showToast('Training cancelled. 85% of resources refunded.', 'info');
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error cancelling training', 'error');
    } finally {
      submittingRef.current.delete(key);
    }
  };

  // formatTime() was removed, every consumer in the render path now renders a <Countdown />
  // leaf (or, for transient labels driven by handlers, computes diffs against Date.now() inline).

  const fmtNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
  };

  const formatDurationSeconds = (totalSeconds: number) => {
    const safeTotalSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeTotalSeconds / 3600);
    const minutes = Math.floor((safeTotalSeconds % 3600) / 60);
    const seconds = safeTotalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  // Returns the `prevEndAt` for the given build-queue index (for QueueCountdown), since the
  // build queue is a simple linear chain.
  const getPrevBuildEnd = (index: number): string | Date | undefined => {
    const queue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
    return index > 0 ? queue[index - 1]?.completesAt : undefined;
  };

  // Training queue has two parallel chains (overseer vs non-overseer); find the prior entry
  // in the same chain so QueueCountdown can label "Queued • …" correctly.
  const getPrevTrainingEnd = (index: number): string | Date | undefined => {
    const queue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
    const item = queue[index];
    if (!item) return undefined;
    const isOverseerItem = item.troopType === 'overseer';
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = queue[i];
      const candidateIsOverseer = candidate.troopType === 'overseer';
      if (candidateIsOverseer === isOverseerItem) return candidate.completesAt;
    }
    return undefined;
  };

  // Total troops of this type that count against the per-nexus cap:
  // at home + queued for training + away in outgoing strikes (traveling/returning)
  // + away as outbound troop transfers (any status). Mirrors the server check.
  const getCommittedTroopCount = (troopType: string): number => {
    const atHome = (nexus.troops as any)[troopType] || 0;
    const queued = (nexus.trainingQueue || []).reduce(
      (sum: number, e: any) => sum + (e.troopType === troopType ? (Number(e.amount) || 0) : 0),
      0,
    );
    const inFlight = (outgoingAttacks || []).reduce(
      (sum: number, a: any) => sum + ((a.troops?.[troopType] as number) || 0),
      0,
    );
    const outboundTransfers = (troopTransfers || []).reduce(
      (sum: number, t: any) => sum + (String(t.ownerNexusId) === String(nexus._id) ? ((t.troops?.[troopType] as number) || 0) : 0),
      0,
    );
    return atHome + queued + inFlight + outboundTransfers;
  };

  const checkTroopRequirements = (troopType: string) => {
    const requirements = TROOP_REQUIREMENTS[troopType];
    if (!requirements) return { canTrain: true, missingRequirements: [] };

    const missing: string[] = [];

    // Check building requirements
    if (requirements.buildings) {
      for (const [building, level] of Object.entries(requirements.buildings)) {
        if ((nexus.buildings as any)[building] < (level as number)) {
          const isQueued = (nexus.buildQueue || []).some(
            (q) => q.building === building && q.targetLevel >= (level as number),
          );
          const suffix = isQueued ? ' (under construction)' : '';
          missing.push(`${BUILDING_NAMES[building]} Lv${level}${suffix}`);
        }
      }
    }

    // Check max per nexus
    if (requirements.maxPerNexus) {
      const committed = getCommittedTroopCount(troopType);
      if (committed >= requirements.maxPerNexus) {
        missing.push(`Max ${requirements.maxPerNexus} per nexus (already have ${committed})`);
      }
    }

    return { canTrain: missing.length === 0, missingRequirements: missing };
  };

  const getMaxTrainableAmount = (troopType: string, costs: (typeof TROOP_COSTS)[string], canTrain: boolean) => {
    if (!canTrain) return { maxTrainable: 0, shortageReasons: [] };

    // Interpolate from the server snapshot at this render. This does NOT
    // tick - values only refresh when the snapshot does (refetch or push).
    // Real-time ticking for the troop cards lives in a future <TroopCard>
    // extraction (parallel to BuildingCard) so this parent component doesn't
    // re-render every second on the buildings tab too.
    const interpolated = resourceSnapshot
      ? interpolateResources(
          resourceSnapshot.base,
          resourceSnapshot.production,
          resourceSnapshot.storageMax,
          resourceSnapshot.anchorMs,
          Date.now(),
        )
      : null;
    const availableBiomass = interpolated?.biomass ?? nexus.resources.biomass;
    const availableAlloy = interpolated?.alloy ?? nexus.resources.alloy;
    const availableOre = interpolated?.ore ?? nexus.resources.ore;

    const byBiomass =
      costs.biomass > 0 ? Math.floor(availableBiomass / costs.biomass) : Number.POSITIVE_INFINITY;
    const byAlloy = costs.alloy > 0 ? Math.floor(availableAlloy / costs.alloy) : Number.POSITIVE_INFINITY;
    const byOre = costs.ore > 0 ? Math.floor(availableOre / costs.ore) : Number.POSITIVE_INFINITY;
    const remainingPopulation = Math.max(0, nexus.population.max - nexus.population.current);
    const byPopulation =
      costs.population > 0 ? Math.floor(remainingPopulation / costs.population) : Number.POSITIVE_INFINITY;

    let maxTrainable = Math.max(0, Math.floor(Math.min(byBiomass, byAlloy, byOre, byPopulation)));

    const requirements = TROOP_REQUIREMENTS[troopType];
    if (requirements?.maxPerNexus) {
      const remainingAllowed = Math.max(0, requirements.maxPerNexus - getCommittedTroopCount(troopType));
      maxTrainable = Math.min(maxTrainable, remainingAllowed);
    }

    const shortageReasons: string[] = [];
    if (maxTrainable === 0) {
      if (byBiomass === 0) shortageReasons.push(`Biomass ${Math.floor(availableBiomass)}/${costs.biomass}`);
      if (byAlloy === 0) shortageReasons.push(`Alloy ${Math.floor(availableAlloy)}/${costs.alloy}`);
      if (byOre === 0) shortageReasons.push(`Ore ${Math.floor(availableOre)}/${costs.ore}`);
      if (byPopulation === 0) shortageReasons.push(`Population ${remainingPopulation}/${costs.population} free`);
    }

    return { maxTrainable, shortageReasons };
  };

  const calculateProduction = () => {
    // Mirrors server/utils/economy.ts getResourceProduction and the client mirror in
    // client/src/realtime/economy.shared.ts. Derelict Ships override the multiplier
    // entirely (3x base, 4x at Command Core 15) instead of using the doubled formula.
    const baseProduction = 800;
    let productionMult: number;
    if (nexus.isDerelict) {
      productionMult = nexus.buildings.commandCore >= 15 ? 4 : 3;
    } else {
      const rawMult = nexus.nexusType === 'Resource Depot' ? 2 : 1;
      productionMult = rawMult === 1 ? 1 : 1 + (rawMult - 1) * (nexus.nexusTypeDoubled ? 2 : 1);
    }
    const prod = (level: number) => (level <= 0 ? 0 : Math.floor(baseProduction * Math.pow(1.32, level - 1) * productionMult));
    return {
      biomass: prod(nexus.buildings.biomassFarm),
      alloy: prod(nexus.buildings.alloyForge),
      ore: prod(nexus.buildings.oreExtractor),
    };
  };

  // Snapshot of live (interpolated) resources at this moment. Used inside event handlers and
  // for one-off `getTimeUntilAffordable` estimates that don't need to tick per second.
  // The header resource strip uses <LiveResourceStrip> for continuous updates instead.
  const getLiveResources = () => {
    const prod = calculateProduction();
    const nowMs = Date.now();
    const anchorMs = nexus.lastResourceUpdate ? new Date(nexus.lastResourceUpdate).getTime() : nowMs;
    const elapsedHours = Math.max(0, (nowMs - anchorMs) / 3600000);
    return {
      biomass: nexus.resources.biomass + prod.biomass * elapsedHours,
      alloy: nexus.resources.alloy + prod.alloy * elapsedHours,
      ore: nexus.resources.ore + prod.ore * elapsedHours,
    };
  };

  const getTimeUntilAffordable = (cost: { biomass?: number; alloy?: number; ore?: number }) => {
    const prod = calculateProduction();
    const live = getLiveResources();
    const biomassNeeded = Math.max(0, (cost.biomass ?? 0) - live.biomass);
    const alloyNeeded = Math.max(0, (cost.alloy ?? 0) - live.alloy);
    const oreNeeded = Math.max(0, (cost.ore ?? 0) - live.ore);

    // production is per hour; convert remaining shortfalls to seconds
    const biomassSeconds = prod.biomass > 0 ? (biomassNeeded / prod.biomass) * 3600 : biomassNeeded > 0 ? Infinity : 0;
    const alloySeconds = prod.alloy > 0 ? (alloyNeeded / prod.alloy) * 3600 : alloyNeeded > 0 ? Infinity : 0;
    const oreSeconds = prod.ore > 0 ? (oreNeeded / prod.ore) * 3600 : oreNeeded > 0 ? Infinity : 0;

    const maxSeconds = Math.max(biomassSeconds, alloySeconds, oreSeconds);
    if (!isFinite(maxSeconds)) return null;
    return maxSeconds;
  };

  const getBuildingCost = (building: string, currentLevel: number) => {
    // Resources come from the shared cost helper. The shared `time` is the
    // un-discounted base; we display the discounted wall-clock time, so swap
    // it for the effective build seconds (Command Core + Nexus type applied).
    const baseCost = getSharedBuildingCost(building, currentLevel);
    const time = getEffectiveBuildTimeSeconds(
      building,
      currentLevel,
      nexus.buildings.commandCore,
      nexus.nexusType,
      nexus.nexusTypeDoubled ?? false,
    );
    return { biomass: baseCost.biomass, alloy: baseCost.alloy, ore: baseCost.ore, time };
  };



  const formatList = (items: string[]) => {
    if (items.length === 0) {
      return '';
    }

    if (items.length === 1) {
      return items[0];
    }

    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  };

  const getPopulationCapAtLevel = (level: number) => Math.floor(POPULATION_BASE * Math.pow(POPULATION_GROWTH, level));

  const getStorageAtLevel = (level: number) => Math.floor(STORAGE_BASE * Math.pow(STORAGE_GROWTH, level));

  const getProductionAtLevel = (building: 'biomassFarm' | 'alloyForge' | 'oreExtractor', level: number) => {
    // Level 0 means the building hasn't been built yet, so production is zero.
    // Without this, the upgrade-benefit preview would show "+800/h → +800/h"
    // (the old clamp forced level 0 to behave like level 1 and the rendered
    // current/next values matched).
    if (level <= 0) return 0;
    return Math.floor(800 * Math.pow(1.35, level - 1));
  };

  const getUnlocksAtLevel = (building: string, targetLevel: number) => {
    const unlockedBuildings = Object.entries(BUILDING_RULES)
      .filter(([, rule]) => rule.unlock?.building === building && rule.unlock.level === targetLevel)
      .map(([key]) => BUILDING_NAMES[key]);

    const unlockedTroops = Object.entries(TROOP_REQUIREMENTS)
      .filter(([, requirement]) => requirement.buildings?.[building] === targetLevel)
      .map(([key]) => TROOP_NAMES[key]);

    return { unlockedBuildings, unlockedTroops };
  };

  const getUnlockSummary = (building: string, targetLevel: number) => {
    const { unlockedBuildings, unlockedTroops } = getUnlocksAtLevel(building, targetLevel);
    const unlockedItems = [...unlockedBuildings, ...unlockedTroops];

    if (unlockedItems.length === 0) {
      return null;
    }

    return `Unlocks: ${formatList(unlockedItems)}`;
  };

  const getBuildingUpgradeBenefit = (building: string, currentLevel: number) => {
    const targetLevel = currentLevel + 1;

    switch (building) {
      case 'lifeSupport': {
        const currentCap = getPopulationCapAtLevel(currentLevel);
        const nextCap = getPopulationCapAtLevel(targetLevel);
        return `Population cap: ${currentCap.toLocaleString()} -> ${nextCap.toLocaleString()}`;
      }
      case 'storageVault': {
        const currentStorage = getStorageAtLevel(currentLevel);
        const nextStorage = getStorageAtLevel(targetLevel);
        return `Storage: ${currentStorage.toLocaleString()} -> ${nextStorage.toLocaleString()}`;
      }
      case 'biomassFarm': {
        const currentProduction = getProductionAtLevel('biomassFarm', currentLevel);
        const nextProduction = getProductionAtLevel('biomassFarm', targetLevel);
        return `Biomass: +${currentProduction.toLocaleString()}/h -> +${nextProduction.toLocaleString()}/h`;
      }
      case 'alloyForge': {
        const currentProduction = getProductionAtLevel('alloyForge', currentLevel);
        const nextProduction = getProductionAtLevel('alloyForge', targetLevel);
        return `Alloy: +${currentProduction.toLocaleString()}/h -> +${nextProduction.toLocaleString()}/h`;
      }
      case 'oreExtractor': {
        const currentProduction = getProductionAtLevel('oreExtractor', currentLevel);
        const nextProduction = getProductionAtLevel('oreExtractor', targetLevel);
        return `Ore: +${currentProduction.toLocaleString()}/h -> +${nextProduction.toLocaleString()}/h`;
      }
      case 'shieldGrid': {
        const currentBonus = Math.round(currentLevel * SHIELD_BONUS_PER_LEVEL * 100);
        const nextBonus = Math.round(targetLevel * SHIELD_BONUS_PER_LEVEL * 100);
        return `Defense bonus: ${currentBonus}% -> ${nextBonus}%`;
      }
      case 'armory': {
        const currentBonus = (currentLevel * 1.5).toFixed(1);
        const nextBonus = (targetLevel * 1.5).toFixed(1);
        const unlockSummary = getUnlockSummary(building, targetLevel);
        if (unlockSummary) return unlockSummary;
        return `Counter-bonus: +${currentBonus}% → +${nextBonus}%`;
      }
      case 'stealthArray': {
        const currentBonus = currentLevel * 2;
        const nextBonus = targetLevel * 2;
        return `Spy defense / offense: ${currentBonus}% → ${nextBonus}%`;
      }
      case 'commandCore':
      case 'recruitmentCore': {
        const unlockSummary = getUnlockSummary(building, targetLevel);

        if (unlockSummary) {
          return unlockSummary;
        }

        return 'Unlocks: Higher-tier buildings and units';
      }
      default:
        return 'Improves this structure';
    }
  };

  const getRequirementsForTargetLevel = (building: string, targetLevel: number) => {
    const rule = BUILDING_RULES[building];
    if (!rule) return [] as Array<{ building: string; level: number }>;

    const merged = new Map<string, number>();

    if (rule.unlock && targetLevel >= 1) {
      merged.set(rule.unlock.building, rule.unlock.level);
    }

    for (const milestone of rule.milestones) {
      if (targetLevel >= milestone.level) {
        for (const requirement of milestone.requires) {
          const existing = merged.get(requirement.building) || 0;
          merged.set(requirement.building, Math.max(existing, requirement.level));
        }
      }
    }

    return Array.from(merged.entries()).map(([requiredBuilding, level]) => ({ building: requiredBuilding, level }));
  };

  const checkBuildingRequirements = (building: string) => {
    const rule = BUILDING_RULES[building];
    if (!rule) return { canUpgrade: true, missingRequirements: [], atMax: false };

    const plannedBuildings = { ...nexus.buildings } as any;
    for (const queued of nexus.buildQueue || []) {
      plannedBuildings[queued.building] = Math.max(plannedBuildings[queued.building] || 0, queued.targetLevel);
    }

    const currentLevel = plannedBuildings[building] || 0;
    if (currentLevel >= rule.maxLevel) {
      return {
        canUpgrade: false,
        missingRequirements: [`Max level reached (Lv${rule.maxLevel})`],
        atMax: true,
      };
    }

    const targetLevel = currentLevel + 1;
    const requirements = getRequirementsForTargetLevel(building, targetLevel);

    const missing: string[] = [];
    for (const requirement of requirements) {
      if (((nexus.buildings as any)[requirement.building] ?? 0) < requirement.level) {
        const isQueued = (nexus.buildQueue || []).some(
          (q) => q.building === requirement.building && q.targetLevel >= requirement.level,
        );
        const suffix = isQueued ? ' (under construction)' : '';
        missing.push(`${BUILDING_NAMES[requirement.building]} Lv${requirement.level}${suffix}`);
      }
    }

    return { canUpgrade: missing.length === 0, missingRequirements: missing, atMax: false };
  };

  // ── Stable wrappers around closure-bound helpers ────────────────────────
  // BuildingCard is React.memo'd; without identity-stable props the memo is
  // defeated because each render redefines these helper functions. Refs hold
  // the latest implementation, the wrappers below are created once and stay
  // identical for the lifetime of the component. This is the same pattern
  // already used for handleTrainTroops below.
  const helpersRef = useRef({
    getBuildingCost, getBuildingUpgradeBenefit, checkBuildingRequirements,
    getPrevBuildEnd, getTimeUntilAffordable, fmtNum, formatDurationSeconds,
    handleUpgrade, handleInfoTap,
  });
  helpersRef.current = {
    getBuildingCost, getBuildingUpgradeBenefit, checkBuildingRequirements,
    getPrevBuildEnd, getTimeUntilAffordable, fmtNum, formatDurationSeconds,
    handleUpgrade, handleInfoTap,
  };
  const stableHelpers = useRef({
    getBuildingCost: (k: string, l: number) => helpersRef.current.getBuildingCost(k, l),
    getBuildingUpgradeBenefit: (k: string, l: number) => helpersRef.current.getBuildingUpgradeBenefit(k, l),
    checkBuildingRequirements: (k: string) => helpersRef.current.checkBuildingRequirements(k),
    getPrevBuildEnd: (i: number) => helpersRef.current.getPrevBuildEnd(i),
    getTimeUntilAffordable: (c: { biomass?: number; alloy?: number; ore?: number }) =>
      helpersRef.current.getTimeUntilAffordable(c),
    fmtNum: (n: number) => helpersRef.current.fmtNum(n),
    formatDurationSeconds: (s: number) => helpersRef.current.formatDurationSeconds(s),
    onUpgrade: (b: string) => helpersRef.current.handleUpgrade(b),
    onInfoTap: (t: string, d: string, href?: string) => helpersRef.current.handleInfoTap(t, d, href),
  }).current;

  const getQuestBatches = (): { batches: QuestBatch[]; allQuestsComplete: boolean } => {
    // A batch that has had its reward claimed is permanently complete, quests inside it
    // should show as done even if live state (e.g. troops lost in combat) no longer meets the condition.
    const claimedBatches = new Set<string>(Array.isArray(nexus.questRewardClaims) ? nexus.questRewardClaims : []);
    const completedQuestIds = new Set<string>(Array.isArray(nexus.completedQuestIds) ? nexus.completedQuestIds : []);
    const done = (batchId: string, questId: string, condition: boolean) =>
      completedQuestIds.has(questId) || claimedBatches.has(batchId) || condition;

    // Use lifetime trained counts (not current alive) so that "train N units" quests
    // don't regress when troops die in combat. Falls back to alive count for legacy
    // nexuses that predate the troopsTrained field. Mirrors trainedCount() on server.
    const trained = nexus.troopsTrained ?? {};
    const trainedOrAlive = (key: keyof typeof nexus.troops) =>
      Math.max(trained[key] || 0, nexus.troops[key] || 0);
    const assaultTroopers = trainedOrAlive('assaultTrooper');
    const reconOperatives = trainedOrAlive('reconOperative');
    const skimmerBikes = trainedOrAlive('skimmerBike');
    const siegeMechs = trainedOrAlive('siegeMech');
    const disruptorUnits = trainedOrAlive('disruptorUnit');
    const annihilatorPlatforms = trainedOrAlive('annihilatorPlatform');

    // First quest line walks the player through the entire opening loop:
    //   Command Core → Recruitment Core → Train troops → Loot a nexus.
    // Each step gates the next, so a player who follows the prompts hits
    // their first scavenge raid without ever being stuck on "what now?".
    const introQuests: IntroQuest[] = [
      {
        id: 'command-core-online',
        title: 'Power The Nexus',
        description: 'Upgrade Command Core to Lv1 to bring your nexus online.',
        completed: done('intro', 'build_command_core_1', nexus.buildings.commandCore >= 1),
        tab: 'buildings',
        tip: <><strong>Start here:</strong> Upgrade <em>Command Core</em> to Lv1 to power your Nexus and unlock progression.</>,
      },
      {
        id: 'reinforce-command',
        title: 'Reinforce Command',
        description: 'Upgrade Command Core to Lv2 to unlock Recruitment Core.',
        completed: done('intro', 'build_command_core_2', nexus.buildings.commandCore >= 2),
        tab: 'buildings',
        tip: <><strong>Next up:</strong> Upgrade <em>Command Core</em> to Lv2 to unlock the <em>Recruitment Core</em>.</>,
      },
      {
        id: 'start-fabrication',
        title: 'Enable Recruitment',
        description: 'Build Recruitment Core to Lv1 so you can train troops.',
        completed: done('intro', 'build_troop_fab_1', nexus.buildings.recruitmentCore >= 1),
        tab: 'buildings',
        tip: <><strong>Next up:</strong> Build <em>Recruitment Core</em> to Lv1 so you can train your first troops.</>,
      },
      {
        id: 'raise-force',
        title: 'Train Your First Troops',
        description: 'Train 5 Assault Troopers - your first strike force.',
        completed: done('intro', 'train_assault_trooper_5', assaultTroopers >= 5),
        tab: 'troops',
        tip: <><strong>Next up:</strong> Train 5 <em>Assault Troopers</em> - your first strike force.</>,
      },
      {
        id: 'first-loot',
        title: 'Loot A Nexus',
        description: 'Send your troops to scavenge a neutral nexus on the Starfield.',
        completed: done('intro', 'send_first_strike', outgoingAttacks.length > 0),
        tab: 'map',
        tip: <><strong>Next up:</strong> Open the <em>Starfield</em> and send your troops to scavenge a neutral nexus.</>,
      },
    ];

    const introComplete = claimedBatches.has('intro') || introQuests.every((quest) => quest.completed);

    // Batch + quest IDs below are the canonical server identifiers from
    // server/models/Nexus.ts QUEST_REWARD_BATCHES. The server is what writes
    // completedQuestIds and pays out questRewardClaims, so a mismatch means the
    // UI says "done" but no reward ever lands. Keep this in lockstep with the
    // server file and with client/src/components/Dashboard.tsx.

    const expansionQuests: IntroQuest[] = [
      { id: 'fortify-core',          title: 'Fortify The Core',     description: 'Upgrade Command Core to Lv3.',  completed: done('expansion', 'build_command_core_3',    nexus.buildings.commandCore >= 3),   tab: 'buildings', tip: <><strong>Next up:</strong> Upgrade <em>Command Core</em> to Lv3 to fortify your nexus.</> },
      { id: 'unlock-defenses',       title: 'Activate Shield Grid', description: 'Upgrade Shield Grid to Lv1.',   completed: done('expansion', 'build_shield_grid_1',     nexus.buildings.shieldGrid >= 1),    tab: 'buildings', tip: <><strong>Next up:</strong> Build <em>Shield Grid</em> to Lv1 to start your defenses.</> },
      { id: 'upgrade-biomass-chain', title: 'Expand Biomass Chain', description: 'Upgrade Biomass Farm to Lv2.',  completed: done('expansion', 'build_biomass_farm_2',    nexus.buildings.biomassFarm >= 2),   tab: 'buildings', tip: <><strong>Next up:</strong> Upgrade <em>Biomass Farm</em> to Lv2 to expand your food supply.</> },
      { id: 'expand-logistics',      title: 'Expand Logistics',     description: 'Upgrade Alloy Forge to Lv2.',   completed: done('expansion', 'build_alloy_forge_2',     nexus.buildings.alloyForge >= 2),    tab: 'buildings', tip: <><strong>Next up:</strong> Upgrade <em>Alloy Forge</em> to Lv2 to expand your logistics.</> },
      { id: 'deploy-recon',          title: 'Deploy Recon',         description: 'Train 3 Recon Operatives.',     completed: done('expansion', 'train_recon_operative_3', reconOperatives >= 3),               tab: 'troops', tip: <><strong>Next up:</strong> Train 3 <em>Recon Operatives</em> to scout the galaxy.</> },
    ];
    const expansionComplete = claimedBatches.has('expansion') || expansionQuests.every((quest) => quest.completed);

    const firstBloodQuests: IntroQuest[] = [
      { id: 'command-core-mastery',     title: 'Core Mastery',     description: 'Upgrade Command Core to Lv4.',  completed: done('first_blood', 'build_command_core_4',  nexus.buildings.commandCore >= 4),   tab: 'buildings', tip: <><strong>Next up:</strong> Upgrade <em>Command Core</em> to Lv4.</> },
      { id: 'extractor-specialization', title: 'Extractor Focus',  description: 'Upgrade Ore Extractor to Lv4.', completed: done('first_blood', 'build_ore_extractor_4', nexus.buildings.oreExtractor >= 4),  tab: 'buildings', tip: <><strong>Next up:</strong> Upgrade <em>Ore Extractor</em> to Lv4.</> },
      { id: 'defense-posture',          title: 'Defense Posture',  description: 'Upgrade Shield Grid to Lv2.',   completed: done('first_blood', 'build_shield_grid_2',   nexus.buildings.shieldGrid >= 2),    tab: 'buildings', tip: <><strong>Next up:</strong> Upgrade <em>Shield Grid</em> to Lv2 to harden defenses.</> },
      { id: 'fast-raiders',             title: 'Fast Raiders',     description: 'Train 5 Skimmer Bikes.',        completed: done('first_blood', 'train_skimmer_bike_5',  skimmerBikes >= 5),                  tab: 'troops', tip: <><strong>Next up:</strong> Train 5 <em>Skimmer Bikes</em> for fast raids.</> },
      { id: 'first-expedition',         title: 'First Expedition', description: 'Launch an outgoing strike.',    completed: done('first_blood', 'send_first_strike',     outgoingAttacks.length > 0),         tab: 'map', tip: <><strong>Next up:</strong> Open the <em>Starfield</em> and launch an outgoing strike.</> },
    ];
    const firstBloodComplete = claimedBatches.has('first_blood') || firstBloodQuests.every((quest) => quest.completed);

    const shadowOpsQuests: IntroQuest[] = [
      { id: 'shadow-command',    title: 'Shadow Command',    description: 'Upgrade Command Core to Lv5.',  completed: done('shadow_ops', 'build_command_core_5',     nexus.buildings.commandCore >= 5),     tab: 'buildings' },
      { id: 'dark-network',      title: 'Dark Network',      description: 'Build a Stealth Array (Lv1).',  completed: done('shadow_ops', 'build_stealth_array_1',    (nexus.buildings.stealthArray || 0) >= 1), tab: 'buildings' },
      { id: 'reinforce-shields', title: 'Reinforce Shields', description: 'Upgrade Shield Grid to Lv3.',   completed: done('shadow_ops', 'build_shield_grid_3',      nexus.buildings.shieldGrid >= 3),      tab: 'buildings' },
      { id: 'recon-corps',       title: 'Recon Corps',        description: 'Train 10 Recon Operatives.',   completed: done('shadow_ops', 'train_recon_operative_10', reconOperatives >= 10),                tab: 'troops' },
      { id: 'first-spy-mission', title: 'First Spy Mission', description: 'Send an outgoing strike or spy mission.', completed: done('shadow_ops', 'send_spy_mission', outgoingAttacks.length > 0), tab: 'map' },
    ];
    const shadowOpsComplete = claimedBatches.has('shadow_ops') || shadowOpsQuests.every((quest) => quest.completed);

    const arsenalQuests: IntroQuest[] = [
      { id: 'arsenal-command',   title: 'Arsenal Command',   description: 'Upgrade Command Core to Lv6.',     completed: done('arsenal', 'build_command_core_6', nexus.buildings.commandCore >= 6),         tab: 'buildings' },
      { id: 'build-armory',      title: 'Open The Armory',    description: 'Upgrade Armory to Lv3.',           completed: done('arsenal', 'build_armory_3',       (nexus.buildings.armory || 0) >= 3),       tab: 'buildings' },
      { id: 'troop-logistics',   title: 'Troop Logistics',    description: 'Upgrade Recruitment Core to Lv5.', completed: done('arsenal', 'build_troop_fab_5',    nexus.buildings.recruitmentCore >= 5),     tab: 'buildings' },
      { id: 'life-support-push', title: 'Life Support Push',  description: 'Upgrade Life Support to Lv4.',     completed: done('arsenal', 'build_life_support_4', nexus.buildings.lifeSupport >= 4),         tab: 'buildings' },
      { id: 'heavy-armor',       title: 'Heavy Armor',         description: 'Train 5 Siege Mechs.',             completed: done('arsenal', 'train_siege_mech_5',   siegeMechs >= 5),                          tab: 'troops' },
    ];
    const arsenalComplete = claimedBatches.has('arsenal') || arsenalQuests.every((quest) => quest.completed);

    const veteranQuests: IntroQuest[] = [
      { id: 'veteran-command',  title: 'Veteran Command',  description: 'Upgrade Command Core to Lv8.',  completed: done('veteran', 'build_command_core_8',  nexus.buildings.commandCore >= 8),         tab: 'buildings' },
      { id: 'veteran-armory',   title: 'Hardened Arsenal', description: 'Upgrade Armory to Lv5.',         completed: done('veteran', 'build_armory_5',        (nexus.buildings.armory || 0) >= 5),       tab: 'buildings' },
      { id: 'shadow-network',   title: 'Shadow Network',   description: 'Upgrade Stealth Array to Lv3.', completed: done('veteran', 'build_stealth_array_3', (nexus.buildings.stealthArray || 0) >= 3), tab: 'buildings' },
      { id: 'disruptor-corps',  title: 'Disruptor Corps',  description: 'Train 10 Disruptor Units.',     completed: done('veteran', 'train_disruptor_10',    disruptorUnits >= 10),                     tab: 'troops' },
      // `complete_attack` is server-driven (set when an attack resolves), so the
      // live fallback is false - done() picks it up from completedQuestIds.
      { id: 'proven-in-battle', title: 'Proven In Battle', description: 'Complete an attack.',            completed: done('veteran', 'complete_attack',       false),                                    tab: 'map' },
    ];
    const veteranComplete = claimedBatches.has('veteran') || veteranQuests.every((quest) => quest.completed);

    const ghostProtocolQuests: IntroQuest[] = [
      { id: 'ghost-command', title: 'Ghost Command', description: 'Upgrade Command Core to Lv10.', completed: done('ghost_protocol', 'build_command_core_10',  nexus.buildings.commandCore >= 10),        tab: 'buildings' },
      { id: 'ghost-array',   title: 'Ghost Array',   description: 'Upgrade Stealth Array to Lv5.', completed: done('ghost_protocol', 'build_stealth_array_5', (nexus.buildings.stealthArray || 0) >= 5), tab: 'buildings' },
      { id: 'iron-dome',     title: 'Iron Dome',     description: 'Upgrade Shield Grid to Lv5.',   completed: done('ghost_protocol', 'build_shield_grid_5',   nexus.buildings.shieldGrid >= 5),          tab: 'buildings' },
      { id: 'ore-dominance', title: 'Ore Dominance', description: 'Upgrade Ore Extractor to Lv8.', completed: done('ghost_protocol', 'build_ore_extractor_8', nexus.buildings.oreExtractor >= 8),        tab: 'buildings' },
      { id: 'shadow-army',   title: 'Shadow Army',   description: 'Train 20 Recon Operatives.',    completed: done('ghost_protocol', 'train_recon_op_20',     reconOperatives >= 20),                    tab: 'troops' },
    ];
    const ghostProtocolComplete = claimedBatches.has('ghost_protocol') || ghostProtocolQuests.every((quest) => quest.completed);

    const annihilatorQuests: IntroQuest[] = [
      { id: 'apex-command',       title: 'Apex Command',       description: 'Upgrade Command Core to Lv12.', completed: done('annihilator', 'build_command_core_12', nexus.buildings.commandCore >= 12),         tab: 'buildings' },
      { id: 'apex-armory',        title: 'Apex Armory',         description: 'Upgrade Armory to Lv10.',        completed: done('annihilator', 'build_armory_10',       (nexus.buildings.armory || 0) >= 10),       tab: 'buildings' },
      { id: 'deep-cover',         title: 'Deep Cover',          description: 'Upgrade Stealth Array to Lv7.', completed: done('annihilator', 'build_stealth_array_7', (nexus.buildings.stealthArray || 0) >= 7), tab: 'buildings' },
      { id: 'field-annihilators', title: 'Field Annihilators', description: 'Train 3 Annihilator Platforms.', completed: done('annihilator', 'train_annihilator_3',   annihilatorPlatforms >= 3),                  tab: 'troops' },
      { id: 'domination',         title: 'Domination',          description: 'Complete an attack.',           completed: done('annihilator', 'complete_attack_2',     false),                                      tab: 'map' },
    ];

    const allBatches: QuestBatch[] = [
      { id: 'intro',          title: 'Ch.1. Establishing the Nexus', quests: introQuests,         unlocked: true,                  reward: '+750 each resource, +10 pop (×CC bonus), +10 Assault Troopers' },
      { id: 'expansion',      title: 'Ch.2. Expansion',              quests: expansionQuests,     unlocked: introComplete,         reward: '+1500 each resource, +15 pop (×CC bonus), +15 Recon Operatives, +20 Lancer Drones' },
      { id: 'first_blood',    title: 'Ch.3. First Blood',            quests: firstBloodQuests,    unlocked: expansionComplete,     reward: '+3500 each resource, +30 pop (×CC bonus), +25 Skimmer Bikes, +15 Breaker Units' },
      { id: 'shadow_ops',     title: 'Ch.4. Shadow Operations',      quests: shadowOpsQuests,     unlocked: firstBloodComplete,    reward: '+5000 each resource, +25 pop (×CC bonus), +25 Recon Operatives, +10 Disruptor Units' },
      { id: 'arsenal',        title: 'Ch.5. Arsenal',                quests: arsenalQuests,       unlocked: shadowOpsComplete,     reward: '+8000 each resource, +50 pop (×CC bonus), +15 Siege Mechs, +10 Disruptors, +10 Suppressors' },
      { id: 'veteran',        title: 'Ch.6. Veteran Commander',      quests: veteranQuests,       unlocked: arsenalComplete,       reward: '+15000 each resource, +75 pop (×CC bonus), +20 Siege Mechs, +15 Interceptors, +5 Void Stalkers' },
      { id: 'ghost_protocol', title: 'Ch.7. Ghost Protocol',         quests: ghostProtocolQuests, unlocked: veteranComplete,       reward: '+25000 each resource, +100 pop (×CC bonus), +30 Recon Operatives, +10 Void Stalkers, +5 Plasma Turrets' },
      { id: 'annihilator',    title: 'Ch.8. Annihilator',            quests: annihilatorQuests,   unlocked: ghostProtocolComplete, reward: '+50000 each resource, +150 pop (×CC bonus), +3 Annihilator Platforms, +25 Siege Mechs, +10 Plasma Turrets' },
    ];

    const annihilatorComplete = claimedBatches.has('annihilator') || annihilatorQuests.every((quest) => quest.completed);
    const allQuestsComplete = annihilatorComplete;

    // Hide batches that have already been claimed, next tier naturally appears
    return { batches: allBatches.filter((batch) => !claimedBatches.has(batch.id)), allQuestsComplete };
  };

  const production = getResourceProduction({
    nexusType: nexus.nexusType,
    nexusTypeDoubled: nexus.nexusTypeDoubled,
    isDerelict: nexus.isDerelict,
    commandCore: nexus.buildings.commandCore,
    biomassFarm: nexus.buildings.biomassFarm,
    alloyForge: nexus.buildings.alloyForge,
    oreExtractor: nexus.buildings.oreExtractor,
    storageVault: nexus.buildings.storageVault,
  });
  const storageCapacity = getMaxStorage({
    nexusType: nexus.nexusType,
    nexusTypeDoubled: nexus.nexusTypeDoubled,
    biomassFarm: nexus.buildings.biomassFarm,
    alloyForge: nexus.buildings.alloyForge,
    oreExtractor: nexus.buildings.oreExtractor,
    storageVault: nexus.buildings.storageVault,
  });

  const getResourceFillClass = (amount: number) => {
    const pct = amount / storageCapacity;
    if (pct >= 1) return 'resource-amount resource-full';
    if (pct >= 0.8) return 'resource-amount resource-near-full';
    return 'resource-amount';
  };
  const { batches: questBatches, allQuestsComplete } = getQuestBatches();

  // Inline "Next up" tooltip - only renders for the first 3 quest chapters
  // (intro / expansion / first_blood). Picks the first incomplete quest in
  // the earliest unclaimed batch that matches the requested tab. The tip ID
  // doubles as the dismiss key so each step can be dismissed independently.
  // 'map' quests fall back to the buildings tab since the Starfield isn't a
  // NexusView tab - without this, the player would lose the nudge after
  // they're ready to launch their first raid.
  const TIP_BATCH_IDS = ['intro', 'expansion', 'first_blood'] as const;
  const getNextTip = (tab: IntroQuest['tab']): { id: string; tip: React.ReactNode } | null => {
    if (allQuestsComplete) return null;
    for (const batchId of TIP_BATCH_IDS) {
      const batch = questBatches.find((b) => b.id === batchId);
      if (!batch) continue;
      const matchesTab = (q: IntroQuest) => q.tab === tab || (tab === 'buildings' && q.tab === 'map');
      const quest = batch.quests.find((q) => !q.completed && matchesTab(q) && q.tip);
      if (quest) return { id: `tip-${batchId}-${quest.id}`, tip: quest.tip! };
      // If this batch has any incomplete quest for any tab, stop - we don't
      // want to leak tooltips from a later batch while an earlier one is
      // still incomplete on a different tab.
      if (batch.quests.some((q) => !q.completed)) return null;
    }
    return null;
  };

  // Single "next action" surfacing across all tabs — finds the first incomplete
  // intro-chapter quest regardless of which tab it lives on, so the player has
  // a persistent breadcrumb in the header. The per-tab getNextTip stays for the
  // inline tab tooltips; this is the global form used by the header chip.
  // Returns the destination tab so clicking the chip can route the player to
  // the right place ('map' redirects to Starfield navigation instead).
  const getNextAction = (): { id: string; title: string; tab: IntroQuest['tab'] } | null => {
    if (allQuestsComplete) return null;
    for (const batchId of TIP_BATCH_IDS) {
      const batch = questBatches.find((b) => b.id === batchId);
      if (!batch) continue;
      const quest = batch.quests.find((q) => !q.completed);
      if (quest) return { id: `next-${batchId}-${quest.id}`, title: quest.title, tab: quest.tab };
      // Stop at the first batch with any incomplete quests — same reasoning as getNextTip.
      if (batch.quests.some((q) => !q.completed)) return null;
    }
    return null;
  };
  const nextAction = getNextAction();
  const activeBuild = nexus.buildQueue[0];
  const activeTraining = nexus.trainingQueue[0];
  // (`activeBuildTimer` and `activeTrainingTimer` were removed, the live countdown labels are
  // now driven by the <Countdown> leaf wherever they appear, so the tree doesn't re-render on
  // each tick just to recompute these strings.)

  return (
    <div className="nexus-view">
      <div className="nexus-header">
        <div className="nexus-title-row">
          {isRenamingNexus ? (
            <>
              <input
                className="nexus-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitNexusRename();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelNexusRename();
                  }
                }}
                maxLength={32}
                autoFocus
                aria-label="Edit nexus name"
              />
              <button
                type="button"
                className="nexus-rename-action save"
                onClick={submitNexusRename}
                disabled={isSavingNexusName}
                title="Save Nexus Name"
                aria-label="Save Nexus Name"
              >
                {isSavingNexusName ? '…' : <Check size={14} />}
              </button>
              <button
                type="button"
                className="nexus-rename-action cancel"
                onClick={cancelNexusRename}
                disabled={isSavingNexusName}
                title="Cancel Rename"
                aria-label="Cancel Rename"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <h2>{nexus.name}</h2>
              <button
                type="button"
                className="nexus-rename-btn"
                onClick={beginNexusRename}
                title="Rename Nexus"
                aria-label="Rename Nexus"
              >
                <Pencil size={14} />
              </button>
            </>
          )}
        </div>
        {nextAction && (
          <button
            type="button"
            className="next-action-chip"
            onClick={() => {
              if (nextAction.tab === 'map') {
                router.push('/starfield');
                return;
              }
              setActiveTab(nextAction.tab);
            }}
            aria-label={`Next action: ${nextAction.title}`}
          >
            <Sparkles size={12} aria-hidden="true" />
            <span className="next-action-chip-label">Next:</span>
            <span className="next-action-chip-title">{nextAction.title}</span>
            <span className="next-action-chip-arrow" aria-hidden="true">→</span>
          </button>
        )}
        {nexus.nexusType && NEXUS_TYPES_WITH_BUFF.has(nexus.nexusType) && (() => {
          // Single-row banner. Three slots: [icon + name + tier], [bonus math].
          // The label is just the type name - the numbers live in the math slot,
          // so we never repeat ourselves like the old layout did.
          const doubled = !!nexus.nexusTypeDoubled;
          let math: React.ReactNode = null;
          if (nexus.nexusType === 'Resource Depot') {
            const mult = doubled ? 3 : 2;
            math = (
              <>
                Production
                {' '}
                <span className="nexus-type-buff-base">{fmtNum(Math.floor(production.biomass / mult))}/h</span>
                {' → '}
                <strong>{fmtNum(production.biomass)}/h</strong>
                <span className="nexus-type-buff-suffix"> per resource</span>
              </>
            );
          } else if (nexus.nexusType === 'Supply Cache') {
            const mult = doubled ? 3 : 2;
            const lootProt = doubled ? 60 : 40;
            math = (
              <>
                Storage
                {' '}
                <span className="nexus-type-buff-base">{fmtNum(Math.floor(storageCapacity / mult))}</span>
                {' → '}
                <strong>{fmtNum(Math.floor(storageCapacity))}</strong>
                <span className="nexus-type-buff-sep"> · </span>
                <strong>{lootProt}%</strong> loot protection
              </>
            );
          } else if (nexus.nexusType === 'Military Outpost') {
            math = (
              <>
                Training <strong>{doubled ? '4×' : '2×'} faster</strong>
                <span className="nexus-type-buff-sep"> · </span>
                Shield efficiency <strong>{doubled ? '3×' : '2×'}</strong>
              </>
            );
          } else if (nexus.nexusType === 'Forward Base') {
            math = (
              <>
                Troop travel <strong>{doubled ? '~44%' : '25%'} faster</strong>
                <span className="nexus-type-buff-sep"> · </span>
                Construction <strong>{doubled ? '36%' : '20%'} faster</strong>
              </>
            );
          }
          return (
            <div className={`nexus-type-buff-banner${doubled ? ' nexus-type-buff-banner--doubled' : ''}`}>
              <span className="nexus-type-buff-head">
                <NexusTypeBadge type={nexus.nexusType} doubled={nexus.nexusTypeDoubled} size={14} />
                <span className="nexus-type-buff-name">{nexus.nexusType}</span>
                <span
                  className={`nexus-type-tier-chip${doubled ? ' nexus-type-tier-chip--ii' : ''}`}
                  title={doubled
                    ? 'Tier II - specialization bonus fully unlocked at Command Core 15'
                    : 'Tier I - base specialization bonus'}
                >
                  Tier {doubled ? 'II' : 'I'}
                </span>
              </span>
              {math && <span className="nexus-type-buff-math">{math}</span>}
            </div>
          );
        })()}
        <LiveResourceStrip
          baseResources={nexus.resources}
          production={production}
          storageCapacity={storageCapacity}
          lastResourceUpdate={nexus.lastResourceUpdate}
        />
      </div>

      <div className="nexus-tab-bar">
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'overview' ? ' active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutGrid size={14} aria-hidden="true" />
          <span>Overview</span>
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'buildings' ? ' active' : ''}`}
          onClick={() => setActiveTab('buildings')}
        >
          <Building2 size={14} aria-hidden="true" />
          <span>Buildings</span>
          {activeBuild && <span className="nexus-tab-badge" />}
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'troops' ? ' active' : ''}`}
          onClick={() => setActiveTab('troops')}
        >
          <Swords size={14} aria-hidden="true" />
          <span>Troops</span>
          {activeTraining && <span className="nexus-tab-badge" />}
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'deployed' ? ' active' : ''}`}
          onClick={() => setActiveTab('deployed')}
        >
          <ArrowDownLeft size={14} aria-hidden="true" />
          <span>Deployed</span>
          {(troopTransfers.length > 0 || outgoingAttacks.length > 0) && <span className="nexus-tab-badge" />}
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'espionage' ? ' active' : ''}`}
          onClick={() => setActiveTab('espionage')}
        >
          <Eye size={14} aria-hidden="true" />
          <span>Espionage</span>
        </button>
      </div>

      <div className="tab-content">
        <div className="overview-tab" style={activeTab !== 'overview' ? { display: 'none' } : undefined}>
            {nexus.newbieProtectionEndsAt && (
              <NewbieProtectionBanner endsAt={nexus.newbieProtectionEndsAt} />
            )}
            <NexusMap nexus={nexus} onClickBuilding={() => setActiveTab('buildings')} />
            <DailyStreaks active={activeTab === 'overview'} />

            <div className="nexus-stats-row" aria-label="Nexus key stats">
              <div className="nexus-stat">
                <div className="nexus-stat-label">SHIELD</div>
                <div className="nexus-stat-value-row">
                  <span className="nexus-stat-value">{nexus.buildings.shieldGrid}</span>
                  <span className="nexus-stat-max">/ 15</span>
                </div>
                <div className="nexus-stat-bar-track">
                  <div
                    className="nexus-stat-bar-fill nexus-stat-bar-fill-cyan"
                    style={{ width: `${Math.min(100, (nexus.buildings.shieldGrid / 15) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="nexus-stat">
                <div className="nexus-stat-label">CONTROL</div>
                <div className="nexus-stat-value-row">
                  <span className="nexus-stat-value">{nexus.controlLevel ?? 0}</span>
                  <span className="nexus-stat-max">/ 100</span>
                </div>
                <div className="nexus-stat-bar-track">
                  <div
                    className="nexus-stat-bar-fill nexus-stat-bar-fill-cyan"
                    style={{ width: `${Math.min(100, nexus.controlLevel ?? 0)}%` }}
                  />
                </div>
              </div>

              <div className="nexus-stat">
                <div className="nexus-stat-label">POPULATION</div>
                <div className="nexus-stat-value-row">
                  <span className="nexus-stat-value">{nexus.population.current}</span>
                  <span className="nexus-stat-max">/ {nexus.population.max}</span>
                </div>
                <div className="nexus-stat-bar-track">
                  <div
                    className="nexus-stat-bar-fill nexus-stat-bar-fill-cyan"
                    style={{
                      width: `${
                        nexus.population.max > 0
                          ? Math.min(100, (nexus.population.current / nexus.population.max) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="nexus-stat">
                <div className="nexus-stat-label">POINTS</div>
                <div className="nexus-stat-value-row">
                  <span className="nexus-stat-value">{nexus.points.toLocaleString()}</span>
                </div>
                <div className="nexus-stat-coords">
                  ({nexus.x}|{nexus.y})
                </div>
              </div>
            </div>

            <div className="overview-shortcuts">
              <button type="button" className="overview-shortcut-card" onClick={() => setActiveTab('buildings')}>
                <span className="overview-shortcut-title">
                  <Hammer size={14} aria-hidden="true" /> Construction
                </span>
                <span className="overview-shortcut-status">
                  {activeBuild ? 'Active upgrade in progress' : 'No active construction'}
                </span>
                <span className="overview-shortcut-subtitle">
                  {activeBuild ? (
                    <>
                      {BUILDING_NAMES[activeBuild.building] || activeBuild.building} → Lv{activeBuild.targetLevel} •{' '}
                      <Countdown endAt={activeBuild.completesAt} />
                    </>
                  ) : (
                    'Open Buildings'
                  )}
                </span>
              </button>
              <button type="button" className="overview-shortcut-card" onClick={() => setActiveTab('troops')}>
                <span className="overview-shortcut-title">
                  <Swords size={14} aria-hidden="true" /> Training
                </span>
                <span className="overview-shortcut-status">
                  {activeTraining ? 'Troops are being trained' : 'No active training'}
                </span>
                <span className="overview-shortcut-subtitle">
                  {activeTraining ? (
                    <>
                      {activeTraining.amount}x {TROOP_NAMES[activeTraining.troopType] || activeTraining.troopType} •{' '}
                      <Countdown endAt={activeTraining.completesAt} />
                    </>
                  ) : (
                    'Open Troops'
                  )}
                </span>
              </button>
              <div className="overview-shortcut-card overview-strikes-card">
                <span className="overview-shortcut-title">
                  <Swords size={14} aria-hidden="true" /> Strikes
                </span>
                <div className="strikes-card-split">
                  <div className="strikes-card-half">
                    <span className="strikes-card-label">Outgoing</span>
                    {outgoingAttacks.length > 0 ? (
                      <div className="strikes-card-list">
                        {outgoingAttacks.map((a: any) => {
                          const target = a.defender?.nexus ?? a.defenderNexus;
                          const troopSummary = a.troops
                            ? Object.entries(a.troops as Record<string, number>)
                                .filter(([, n]) => (Number(n) || 0) > 0)
                                .map(([k, n]) => `${n} ${TROOP_NAMES[k] || k}`)
                                .join(', ')
                            : '';
                          return (
                            <div key={a._id} className="strikes-card-entry">
                              <span className="strikes-card-entry-who">
                                {a.status === 'returning' && (
                                  <ArrowDownLeft size={11} aria-hidden="true" style={{ marginRight: 4 }} />
                                )}
                                {target?.name
                                  ? `${target.name} (${target.x}|${target.y})`
                                  : 'Unknown nexus'}
                              </span>
                              {troopSummary && (
                                <span className="strikes-card-entry-troops">{troopSummary}</span>
                              )}
                              <span className="strikes-card-entry-time">
                                <span className="strikes-card-entry-arrival">
                                  @ {formatTimeOfDay(a.status === 'returning' ? a.returnsAt : a.arrivesAt, true)}
                                </span>
                                {' '}
                                <Countdown
                                  endAt={a.status === 'returning' ? a.returnsAt : a.arrivesAt}
                                  className="strikes-card-entry-countdown"
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="strikes-card-value">No outgoing strikes</span>
                    )}
                  </div>
                  <div className="strikes-card-divider" />
                  <div className="strikes-card-half">
                    {incomingAttacks.length > 0 ? (
                      <>
                        <button
                          type="button"
                          className="strikes-card-label strikes-card-label--toggle"
                          onClick={() => setIncomingCollapsed((c) => !c)}
                          aria-expanded={!incomingCollapsed}
                          title={incomingCollapsed ? 'Show incoming strikes' : 'Hide incoming strikes'}
                        >
                          <span>Incoming ({incomingAttacks.length})</span>
                          {incomingCollapsed ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronUp size={13} aria-hidden="true" />}
                        </button>
                        {!incomingCollapsed && (
                          <div className="strikes-card-list">
                            {incomingAttacks.map((a: any) => {
                              const src = a.attacker?.nexus ?? a.attackerNexus;
                              return (
                                <div key={a._id} className={`strikes-card-entry${a.type === 'support' ? ' strikes-card-entry--support' : ''}`}>
                                  <span className="strikes-card-entry-who">
                                    {a.type === 'support' && <span className="strikes-card-support-badge">SUPPORT</span>}
                                    <Username name={a.attacker?.user?.username ?? '?'} isSupporter={a.attacker?.user?.isSupporter} supporterTier={a.attacker?.user?.supporterTier} /> · {src?.name ?? '?'}
                                    {src?.x != null && src?.y != null ? ` (${src.x}|${src.y})` : ''}
                                  </span>
                                  <span className="strikes-card-entry-time">
                                    <span className="strikes-card-entry-arrival">
                                      @ {formatTimeOfDay(a.arrivesAt, true)}
                                    </span>
                                    {' '}
                                    <Countdown endAt={a.arrivesAt} className="strikes-card-entry-countdown" />
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="strikes-card-label">Incoming</span>
                        <span className="strikes-card-value">No incoming strikes</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {nexus.buildQueue.length > 0 && (
              <div className="overview-queue-summary">
                <div className="overview-queue-summary-info">
                  <span className="overview-queue-summary-label">
                    <Hammer size={12} aria-hidden="true" /> Building Queue
                  </span>
                  <span className="overview-queue-summary-detail">
                    {nexus.buildQueue.length} item{nexus.buildQueue.length !== 1 ? 's' : ''} ·{' '}
                    {BUILDING_NAMES[nexus.buildQueue[0].building] || nexus.buildQueue[0].building} → Lv
                    {nexus.buildQueue[0].targetLevel}
                    {activeBuild && (
                      <>
                        {' · '}
                        <Countdown endAt={activeBuild.completesAt} />
                      </>
                    )}
                  </span>
                </div>
                <button type="button" className="overview-queue-manage-btn" onClick={() => setActiveTab('buildings')}>
                  Manage →
                </button>
              </div>
            )}

            {nexus.trainingQueue.length > 0 && (
              <div className="overview-queue-summary">
                <div className="overview-queue-summary-info">
                  <span className="overview-queue-summary-label">
                    <Swords size={12} aria-hidden="true" /> Training Queue
                  </span>
                  <span className="overview-queue-summary-detail">
                    {nexus.trainingQueue.length} item{nexus.trainingQueue.length !== 1 ? 's' : ''} ·{' '}
                    {nexus.trainingQueue[0].amount}x{' '}
                    {TROOP_NAMES[nexus.trainingQueue[0].troopType] || nexus.trainingQueue[0].troopType}
                    {activeTraining && (
                      <>
                        {' · '}
                        <Countdown endAt={activeTraining.completesAt} />
                      </>
                    )}
                  </span>
                </div>
                <button type="button" className="overview-queue-manage-btn" onClick={() => setActiveTab('troops')}>
                  Manage →
                </button>
              </div>
            )}

            {galaxyEvents.length > 0 && (
              <div className="overview-galaxy-events">
                <div className="overview-galaxy-events-header">
                  <Sparkles size={13} aria-hidden="true" />
                  <span>Galaxy Events</span>
                </div>
                {(galaxyEvents as any[]).map((ev: any) => {
                  const EventIcon = ev.type === 'resource_storm' ? Zap
                    : ev.type === 'rogue_ai' ? AlertTriangle
                    : Sparkles;

                  const isStorm = ev.type === 'resource_storm' && ev.meta?.xMin != null;
                  const inZone = isStorm &&
                    nexus.x >= ev.meta.xMin && nexus.x <= ev.meta.xMax &&
                    nexus.y >= ev.meta.yMin && nexus.y <= ev.meta.yMax;
                  const multiplier: number = ev.meta?.multiplier ?? 2;
                  // support both old (resource) and new (resources) format
                  const affectedResources: string[] = isStorm
                    ? (Array.isArray(ev.meta?.resources) ? ev.meta.resources : ev.meta?.resource ? [ev.meta.resource] : [])
                    : [];

                  return (
                    <div key={ev.id} className={`overview-galaxy-event-card overview-galaxy-event-card--${ev.type}${inZone ? ' in-zone' : ''}`}>
                      <div className="overview-galaxy-event-row">
                        <EventIcon size={12} aria-hidden="true" />
                        <span className="overview-galaxy-event-title">{ev.title}</span>
                        {inZone && affectedResources.map((r: string) => (
                          <span key={r} className={`overview-storm-badge overview-storm-badge--${r}`}>
                            {multiplier}x {r}
                          </span>
                        ))}
                        {ev.expiresAt && (
                          <span className="overview-galaxy-event-expires">
                            {new Date(ev.expiresAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="overview-galaxy-event-desc">{ev.description}</p>
                      {isStorm && (
                        <p className="overview-galaxy-event-zone">
                          Zone: ({ev.meta.xMin}–{ev.meta.xMax} | {ev.meta.yMin}–{ev.meta.yMax})
                          {inZone && <span className="overview-galaxy-event-in-zone"> · This nexus is in the zone</span>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {questBatches.map((batch) => {
              const completedCount = batch.quests.filter((quest) => quest.completed).length;
              const batchComplete = batch.unlocked && completedCount === batch.quests.length;

              return (
                <div key={batch.id} className={`intro-quests ${batch.unlocked ? '' : 'quest-batch-locked'}`}>
                  <div className="intro-quests-header">
                    <h4>{batch.title}</h4>
                    <span>
                      {completedCount}/{batch.quests.length}
                    </span>
                  </div>
                  <p className="quest-batch-reward">Reward: {batch.reward}</p>

                  {batch.unlocked ? (
                    <>
                      {batch.quests.map((quest) => (
                        <div
                          key={quest.id}
                          className={`intro-quest-item ${quest.completed ? 'completed' : 'quest-actionable'}`}
                          onClick={() => {
                            if (quest.completed) return;
                            if (quest.tab === 'map') {
                              router.push('/starfield');
                            } else {
                              setActiveTab(quest.tab);
                            }
                          }}
                        >
                          <span className="intro-quest-icon" aria-hidden="true">
                            {quest.completed ? <Check size={14} /> : null}
                          </span>
                          <div className="intro-quest-content">
                            <p className="intro-quest-title">{quest.title}</p>
                            <p className="intro-quest-description">{quest.description}</p>
                          </div>
                          {!quest.completed && (
                            <span className="intro-quest-arrow">
                              →{' '}
                              {quest.tab === 'buildings' ? 'Buildings' : quest.tab === 'troops' ? 'Troops' : 'Starfield'}
                            </span>
                          )}
                        </div>
                      ))}
                      {batchComplete && (
                        <div className="quest-claim-row">
                          <button
                            type="button"
                            className="quest-claim-btn"
                            onClick={() => handleClaimQuestReward(batch.id)}
                            disabled={claimingBatch === batch.id}
                          >
                            {claimingBatch === batch.id ? 'Claiming…' : 'Claim Reward'}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="quest-batch-lock-note">Complete the previous quest batch to unlock this one.</p>
                  )}
                </div>
              );
            })}
          </div>

        <div className="buildings-tab" style={activeTab !== 'buildings' ? { display: 'none' } : undefined}>
            <h3>Buildings</h3>

            {nexus.buildings.commandCore >= 15 && !nexus.nexusTypeLockedAt && (!nexus.nexusType || nexus.nexusType === 'Neutral Settlement') && (
              <div className="nexus-spec-prompt" role="alert">
                <span className="nexus-spec-prompt-icon" aria-hidden="true">
                  <Zap size={16} />
                </span>
                <div className="nexus-spec-prompt-body">
                  <strong>Specialization unlocked.</strong> This nexus is ready to specialize. Choose a permanent role to unlock a powerful bonus that cannot be changed.
                </div>
                <button
                  type="button"
                  className="nexus-spec-prompt-btn"
                  onClick={() => setShowSpecModal(true)}
                >
                  Specialize
                </button>
              </div>
            )}

            {(() => {
              const next = getNextTip('buildings');
              if (!next || dismissedTips.has(next.id)) return null;
              return (
                <div className="noob-tip">
                  <span className="noob-tip-icon" aria-hidden="true">
                    <Info size={14} />
                  </span>
                  <span className="noob-tip-text">{next.tip}</span>
                  <button
                    type="button"
                    className="noob-tip-dismiss"
                    onClick={() => dismissTip(next.id)}
                    aria-label="Dismiss tip"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })()}

            {nexus.buildQueue.length > 0 && (
              <div className="queue-section">
                <h4>Building Queue</h4>
                {nexus.buildQueue.map((item, idx) => {
                  return (
                    <QueueCountdown key={idx} endAt={item.completesAt} prevEndAt={getPrevBuildEnd(idx)}>
                      {({ label, isWaiting }) => (
                        <div className={`queue-item ${isWaiting ? 'queue-item-waiting' : ''}`}>
                          <span>
                            {BUILDING_NAMES[item.building]} → Level {item.targetLevel}
                          </span>
                          <div className="queue-item-actions">
                            <span className={isWaiting ? 'queue-time-queued' : 'queue-time'}>{label}</span>
                            <button
                              type="button"
                              className="queue-cancel-btn"
                              onClick={() => handleCancelBuildQueue(idx)}
                              title="Cancel (85% refund)"
                            >
                              <X size={12} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                    </QueueCountdown>
                  );
                })}
              </div>
            )}

            <div className="buildings-grid">
              {(() => {
                // Single pass over the build queue, indexed by building key.
                // Without this each BuildingCard would do 4 separate scans
                // (filter/find/findIndex/some) on every render, which became
                // a hot path on mobile once we got 10+ buildings.
                const queueIndex = new Map<string, { count: number; firstIndex: number }>();
                for (let i = 0; i < nexus.buildQueue.length; i++) {
                  const item = nexus.buildQueue[i];
                  const existing = queueIndex.get(item.building);
                  if (existing) {
                    existing.count++;
                  } else {
                    queueIndex.set(item.building, { count: 1, firstIndex: i });
                  }
                }
                // Split into unlocked vs still-locked plots. A "locked plot" is
                // a level-0 building whose unlock prerequisite isn't met yet —
                // it's rendered as a quiet placeholder (Travian-style open plot)
                // so a new player isn't bombarded with detailed cards they can't
                // act on. Anything they've already built (level >= 1) keeps the
                // full card even if a milestone is currently gating the *next*
                // level, because they need to see cost / time / queue status.
                const buildingEntries = Object.entries(nexus.buildings);
                const unlockedEntries: Array<[string, number]> = [];
                const lockedEntries: Array<[string, number]> = [];
                for (const entry of buildingEntries) {
                  const [key, level] = entry;
                  const rule = BUILDING_RULES[key];
                  const unlock = rule?.unlock;
                  const isLockedPlot =
                    level === 0 &&
                    !!unlock &&
                    (nexus.buildings[unlock.building as keyof typeof nexus.buildings] || 0) < unlock.level;
                  if (isLockedPlot) lockedEntries.push(entry);
                  else unlockedEntries.push(entry);
                }
                return (
                  <>
                    {unlockedEntries.map(([key, level]) => {
                      const stats = queueIndex.get(key);
                      return (
                        <BuildingCard
                          key={key}
                          buildingKey={key}
                          level={level}
                          nexus={nexus}
                          nexusId={String(nexus._id)}
                          buildingName={BUILDING_NAMES[key]}
                          buildingDescription={BUILDING_DESCRIPTIONS[key]}
                          buildingImage={BUILDING_IMAGES[key]}
                          maxLevel={BUILDING_RULES[key]?.maxLevel || 0}
                          buildQueueLength={nexus.buildQueue.length}
                          maxBuildQueue={BASE_MAX_BUILD_QUEUE + getCommandBuildQueueBonus(nexus.buildings.commandCore)}
                          queuedCount={stats?.count ?? 0}
                          firstQueuedIndex={stats?.firstIndex ?? -1}
                          getBuildingCost={stableHelpers.getBuildingCost}
                          getBuildingUpgradeBenefit={stableHelpers.getBuildingUpgradeBenefit}
                          checkBuildingRequirements={stableHelpers.checkBuildingRequirements}
                          getPrevBuildEnd={stableHelpers.getPrevBuildEnd}
                          getTimeUntilAffordable={stableHelpers.getTimeUntilAffordable}
                          fmtNum={stableHelpers.fmtNum}
                          formatDurationSeconds={stableHelpers.formatDurationSeconds}
                          onUpgrade={stableHelpers.onUpgrade}
                          onInfoTap={stableHelpers.onInfoTap}
                        />
                      );
                    })}
                    {lockedEntries.map(([key]) => {
                      const unlock = BUILDING_RULES[key]?.unlock;
                      const unlockLabel = unlock
                        ? `${BUILDING_NAMES[unlock.building] || unlock.building} Lv${unlock.level}`
                        : 'higher tech tier';
                      return (
                        <LockedBuildingPlot
                          key={key}
                          buildingName={BUILDING_NAMES[key]}
                          buildingImage={BUILDING_IMAGES[key]}
                          unlockRequirementLabel={unlockLabel}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>

        <div className="troops-tab" style={activeTab !== 'troops' ? { display: 'none' } : undefined}>
            <h3>Troops</h3>

            {(() => {
              const next = getNextTip('troops');
              if (!next || dismissedTips.has(next.id)) return null;
              return (
                <div className="noob-tip">
                  <span className="noob-tip-icon" aria-hidden="true">
                    <Info size={14} />
                  </span>
                  <span className="noob-tip-text">{next.tip}</span>
                  <button
                    type="button"
                    className="noob-tip-dismiss"
                    onClick={() => dismissTip(next.id)}
                    aria-label="Dismiss tip"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })()}

            {nexus.buildings.recruitmentCore === 0 ? (
              <p>Build a Recruitment Core to train troops!</p>
            ) : (
              <>
                <div className="troops-subtab-bar" role="tablist" aria-label="Troops view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={troopsSubTab === 'train'}
                    className={`troops-subtab-btn${troopsSubTab === 'train' ? ' active' : ''}`}
                    onClick={() => setTroopsSubTab('train')}
                  >
                    <Hammer size={13} aria-hidden="true" />
                    <span>Train</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={troopsSubTab === 'stationed'}
                    className={`troops-subtab-btn${troopsSubTab === 'stationed' ? ' active' : ''}`}
                    onClick={() => setTroopsSubTab('stationed')}
                  >
                    <ShieldCheck size={13} aria-hidden="true" />
                    <span>Stationed</span>
                    {(() => {
                      const total = Object.values(nexus.troops || {}).reduce(
                        (sum: number, v: any) => sum + (Number(v) || 0),
                        0,
                      );
                      return total > 0 ? <span className="troops-subtab-count">{total.toLocaleString()}</span> : null;
                    })()}
                  </button>
                </div>

                {troopsSubTab === 'stationed' && (
                  <div className="troops-stationed-panel">
                    {(() => {
                      const entries = (['offense', 'defense'] as const).map((category) => {
                        const rows = Object.keys(TROOP_NAMES)
                          .filter((type) => TROOP_CATEGORIES[type] === category)
                          .map((type) => ({ type, count: Number((nexus.troops as any)[type]) || 0 }))
                          .filter((row) => row.count > 0);
                        return { category, rows };
                      });
                      const totalCount = entries.reduce((sum, e) => sum + e.rows.reduce((s, r) => s + r.count, 0), 0);
                      if (totalCount === 0) {
                        return (
                          <div className="troops-stationed-empty">
                            <p>No troops stationed at this nexus yet.</p>
                            <button
                              type="button"
                              className="troops-stationed-empty-cta"
                              onClick={() => setTroopsSubTab('train')}
                            >
                              Train your first unit
                            </button>
                          </div>
                        );
                      }
                      return (
                        <>
                          <div className="troops-stationed-summary">
                            <span className="troops-stationed-summary-label">Total at {nexus.name}</span>
                            <span className="troops-stationed-summary-value">{totalCount.toLocaleString()}</span>
                          </div>
                          {entries.map(({ category, rows }) =>
                            rows.length === 0 ? null : (
                              <div key={category} className="troop-category-section">
                                <h4 className={`troop-category-heading troop-category-${category}`}>
                                  {category === 'offense' ? 'Offense' : 'Defense'}
                                </h4>
                                <div className="troops-stationed-grid">
                                  {rows.map(({ type, count }) => (
                                    <div key={type} className="stationed-card">
                                      {TROOP_IMAGES[type] && (
                                        <div className="stationed-card-image-wrap">
                                          <img
                                            src={TROOP_IMAGES[type].src || TROOP_IMAGES[type]}
                                            alt={TROOP_NAMES[type]}
                                            className="stationed-card-image"
                                          />
                                        </div>
                                      )}
                                      <div className="stationed-card-body">
                                        <div className="stationed-card-name">{TROOP_NAMES[type]}</div>
                                        <div className="stationed-card-count">{count.toLocaleString()}</div>
                                      </div>
                                      <button
                                        type="button"
                                        className="troop-info stationed-card-info"
                                        title={TROOP_DESCRIPTIONS[type]}
                                        aria-label={`${TROOP_NAMES[type]} info`}
                                        onClick={() => handleInfoTap(TROOP_NAMES[type], TROOP_DESCRIPTIONS[type], `/codex?tab=troops#troop-${type}`)}
                                      >
                                        <Info size={13} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ),
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {troopsSubTab === 'train' && nexus.trainingQueue.length > 0 && (
                  <div className="queue-section">
                    <h4>Training queue</h4>
                    {nexus.trainingQueue.map((item, idx) => (
                      <QueueCountdown
                        key={idx}
                        endAt={item.completesAt}
                        prevEndAt={getPrevTrainingEnd(idx)}
                      >
                        {({ label, isWaiting }) => (
                          <div className={`queue-item ${isWaiting ? 'queue-item-waiting' : ''}`}>
                            <span>
                              {item.amount}x {TROOP_NAMES[item.troopType] || item.troopType}
                            </span>
                            <div className="queue-item-actions">
                              <span className={isWaiting ? 'queue-time-queued' : 'queue-time'}>{label}</span>
                              <button
                                type="button"
                                className="queue-cancel-btn"
                                onClick={() => handleCancelTrainingQueue(idx)}
                                title="Cancel (85% refund)"
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        )}
                      </QueueCountdown>
                    ))}
                  </div>
                )}

                {troopsSubTab === 'train' && (
                <div className="troops-train">
                  <h4>Train Troops</h4>
                  {(['offense', 'defense'] as const).map((category) => {
                    const categoryTroops = Object.entries(TROOP_COSTS).filter(
                      ([type]) => TROOP_CATEGORIES[type] === category,
                    );
                    // Partition into trainable vs locked. Locked troops collapse
                    // into a single <details> stub at the bottom of the category —
                    // a player with Recruitment Core Lv1 used to see 6+ red
                    // "requires X" cards per category, drowning out the one they
                    // could actually train. Opt-in disclosure removes that noise
                    // without hiding the long-term roadmap.
                    const trainableTroops = categoryTroops.filter(
                      ([type]) => checkTroopRequirements(type).canTrain,
                    );
                    const lockedTroops = categoryTroops.filter(
                      ([type]) => !checkTroopRequirements(type).canTrain,
                    );
                    return (
                      <div key={category} className="troop-category-section">
                        <h4 className={`troop-category-heading troop-category-${category}`}>
                          {category === 'offense' ? 'Offense' : 'Defense'}
                        </h4>
                        <div className="train-grid">
                          {trainableTroops.map(([type, baseCosts]) => {
                            const costs = type === 'overseer'
                              ? { ...baseCosts, ...getOverseerCost(ownNexuses.length) }
                              : baseCosts;
                            const { canTrain, missingRequirements } = checkTroopRequirements(type);
                            const { maxTrainable, shortageReasons } = getMaxTrainableAmount(type, costs, canTrain);
                            const trainSeconds = canTrain
                              ? getEffectiveTrainTimeSeconds(type, nexus.buildings.recruitmentCore, nexus.nexusType, nexus.nexusTypeDoubled ?? false)
                              : costs.time;
                            // Pre-bonus time (Recruitment Core discount applied, Nexus type NOT applied).
                            // Shown as strikethrough next to the actual time when Military Outpost is active,
                            // so the player can see the bonus working.
                            const preBonusTrainSeconds = canTrain
                              ? getRecruitDiscountedTrainSeconds(type, nexus.buildings.recruitmentCore)
                              : costs.time;
                            const militaryBonusActive =
                              nexus.nexusType === 'Military Outpost' &&
                              type !== 'overseer' &&
                              preBonusTrainSeconds !== trainSeconds;
                            const militaryBonusLabel = nexus.nexusTypeDoubled
                              ? '4× faster · Military Outpost T2'
                              : '2× faster · Military Outpost';
                            const isOverseerTrack = type === 'overseer';
                            const sameChainQueueLength = nexus.trainingQueue.filter((entry: any) =>
                              isOverseerTrack ? entry.troopType === 'overseer' : entry.troopType !== 'overseer',
                            ).length;
                            const maxTrainingQueueDisplay =
                              BASE_MAX_TRAINING_QUEUE + getCommandTrainingQueueBonus(nexus.buildings.commandCore);
                            const isTrainingQueueFull = sameChainQueueLength >= maxTrainingQueueDisplay;
                            const isTrainDisabled = !canTrain || isTrainingQueueFull || maxTrainable <= 0;
                            return (
                              <div key={type} className={`train-card ${isTrainDisabled ? 'disabled' : ''}`}>
                                {TROOP_IMAGES[type] && (
                                  <div className="troop-card-image-wrap">
                                    <img
                                      src={TROOP_IMAGES[type].src || TROOP_IMAGES[type]}
                                      alt={TROOP_NAMES[type]}
                                      className="troop-card-image"
                                    />
                                    {((nexus.troops as any)[type] || 0) > 0 && (
                                      <span className="troop-stationed-overlay">
                                        <span className="troop-stationed-dot" />
                                        {(nexus.troops as any)[type]} stationed
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="troop-header">
                                  <h5>{TROOP_NAMES[type]}</h5>
                                  <div className="troop-header-right">
                                    <button
                                      type="button"
                                      className="troop-info"
                                      title={TROOP_DESCRIPTIONS[type]}
                                      aria-label={`${TROOP_NAMES[type]} info`}
                                      onClick={() => handleInfoTap(TROOP_NAMES[type], TROOP_DESCRIPTIONS[type], `/codex?tab=troops#troop-${type}`)}
                                    >
                                      <Info size={14} />
                                    </button>
                                  </div>
                                </div>
                                <div className="train-costs">
                                  <span className="cost-pill"><span className="cost-pill-label">Biomass</span>{costs.biomass}</span>
                                  <span className="cost-pill"><span className="cost-pill-label">Alloy</span>{costs.alloy}</span>
                                  <span className="cost-pill"><span className="cost-pill-label">Ore</span>{costs.ore}</span>
                                  <span className="cost-pill"><span className="cost-pill-label">Pop</span>{costs.population}</span>
                                  <p className="train-time">
                                    {militaryBonusActive && (
                                      <span className="train-time-base" aria-label="without bonus">
                                        {formatDurationSeconds(preBonusTrainSeconds)}
                                      </span>
                                    )}
                                    <span className="train-time-effective">
                                      {formatDurationSeconds(trainSeconds)}
                                    </span>
                                  </p>
                                </div>
                                {militaryBonusActive && (
                                  <p className="nexus-type-bonus-tag" title={`Base ${formatDurationSeconds(preBonusTrainSeconds)} → ${formatDurationSeconds(trainSeconds)} after ${militaryBonusLabel}`}>
                                    {militaryBonusLabel}
                                  </p>
                                )}
                                {isTrainingQueueFull && (
                                  <div className="requirements-missing">
                                    <p className="requires-label">Queue full</p>
                                    <p className="requirement-item">
                                      • Training queue limit reached ({maxTrainingQueueDisplay})
                                    </p>
                                  </div>
                                )}
                                {!canTrain && (
                                  <div className="requirements-missing">
                                    <p className="requires-label">Requires</p>
                                    {missingRequirements.map((req, idx) => (
                                      <p key={idx} className="requirement-item">
                                        • {req}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {canTrain &&
                                  !isTrainingQueueFull &&
                                  shortageReasons.length > 0 &&
                                  (() => {
                                    const eta = getTimeUntilAffordable(costs);
                                    return (
                                      <div className="requirements-missing">
                                        <p className="requires-label">Not enough resources</p>
                                        {shortageReasons.map((reason, idx) => (
                                          <p key={idx} className="requirement-item">
                                            • {reason}
                                          </p>
                                        ))}
                                        {eta !== null && (
                                          <p className="requirement-item resource-eta">
                                            Ready in {formatDurationSeconds(eta)}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                <TrainAmountControls
                                  troopType={type}
                                  troopLabel={TROOP_NAMES[type]}
                                  maxTrainable={maxTrainable}
                                  canTrain={canTrain}
                                  isTrainDisabled={isTrainDisabled}
                                  onTrain={handleTrainTroops}
                                />
                              </div>
                            );
                          })}
                          {trainableTroops.length === 0 && lockedTroops.length > 0 && (
                            <p className="troop-locked-empty">
                              No {category} units available yet — upgrade buildings below to unlock.
                            </p>
                          )}
                        </div>
                        {lockedTroops.length > 0 && (
                          <details className="troop-locked-group">
                            <summary>
                              <span>{lockedTroops.length} more {category} unit{lockedTroops.length === 1 ? '' : 's'} (locked)</span>
                            </summary>
                            <ul className="troop-locked-list">
                              {lockedTroops.map(([type]) => {
                                const { missingRequirements } = checkTroopRequirements(type);
                                return (
                                  <li key={type} className="troop-locked-item">
                                    <span className="troop-locked-name">{TROOP_NAMES[type]}</span>
                                    <span className="troop-locked-req">
                                      {missingRequirements.join(' · ')}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}

              </>
            )}
          </div>

        {/* ── Deployed Forces Tab ── */}
        <div className="deployed-tab" style={activeTab !== 'deployed' ? { display: 'none' } : undefined}>
          <h3 className="section-title">Deployed Forces</h3>

          {/* Outgoing attacks (troops in combat) */}
          {outgoingAttacks.length > 0 && (
            <div className="borrowed-troops-section">
              <h4>Troops in Combat</h4>
              {outgoingAttacks.map((atk: any) => {
                const troopEntries = Object.entries(atk.troops || {}).filter(([, v]) => Number(v) > 0);
                const travelVerb = atk.type === 'support'
                  ? 'Supporting'
                  : atk.type === 'scout'
                    ? 'Scouting'
                    : 'Attacking';
                const statusLabel = atk.status === 'traveling'
                  ? `→ ${travelVerb} ${atk.defender?.nexus?.name ?? '?'} (${atk.defender?.nexus?.x ?? '?'}|${atk.defender?.nexus?.y ?? '?'})`
                  : `← Returning from ${atk.defender?.nexus?.name ?? '?'}`;
                const countdownEndAt = atk.status === 'traveling' ? atk.arrivesAt : atk.returnsAt;
                return (
                  <div key={atk._id} className={`borrowed-entry borrowed-entry-${atk.status}`}>
                    <div className="borrowed-label">
                      <Swords size={12} aria-hidden="true" style={{ marginRight: 4 }} />
                      {statusLabel}
                      {countdownEndAt && (
                        <span className="borrowed-countdown">
                          {' · '}
                          <Countdown endAt={countdownEndAt} />
                          {' @ '}
                          {formatTimeOfDay(countdownEndAt, true)}
                        </span>
                      )}
                    </div>
                    <div className="borrowed-troops">
                      {troopEntries.map(([type, count]) => (
                        <span key={type} className="borrowed-troop-chip">
                          {TROOP_NAMES[type] || type}: {String(count)}
                        </span>
                      ))}
                    </div>
                    <div className="borrowed-meta">
                      {atk.type === 'scout' && <span className="borrowed-type-badge">Scout</span>}
                      {atk.type === 'attack' && <span className="borrowed-type-badge">Attack</span>}
                      {atk.type === 'support' && <span className="borrowed-type-badge">Support</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Troop transfers */}
          {troopTransfers.length > 0 && (
            <div className="borrowed-troops-section">
              <h4>Troop Transfers</h4>
              {troopTransfers.map((t) => {
                const isOwner = t.ownerNexusId === nexus._id;
                const troopEntries = Object.entries(t.troops).filter(([, v]) => Number(v) > 0);
                let statusLabel: string;
                let countdownEndAt: string | null = null;
                if (t.status === 'traveling' && t.arrivesAt) {
                  statusLabel = isOwner
                    ? `→ ${t.hostNexus?.name ?? '?'}`
                    : `From ${t.ownerNexus?.name ?? '?'} arriving`;
                  countdownEndAt = t.arrivesAt;
                } else if (t.status === 'returning' && t.returnsAt) {
                  statusLabel = isOwner
                    ? `← Returning from ${t.hostNexus?.name ?? '?'}`
                    : `Returning to ${t.ownerNexus?.name ?? '?'}`;
                  countdownEndAt = t.returnsAt;
                } else {
                  statusLabel = isOwner
                    ? `Stationed at ${t.hostNexus?.name ?? '?'}`
                    : `From ${t.ownerNexus?.name ?? '?'}`;
                }
                return (
                  <div key={t._id} className={`borrowed-entry borrowed-entry-${t.status}`}>
                    <div className="borrowed-label">
                      {statusLabel}
                      {countdownEndAt && (
                        <span className="borrowed-countdown">
                          {' · '}
                          <Countdown endAt={countdownEndAt} />
                          {' @ '}
                          {formatTimeOfDay(countdownEndAt, true)}
                        </span>
                      )}
                    </div>
                    <div className="borrowed-troops">
                      {troopEntries.map(([type, count]) => (
                        <span key={type} className="borrowed-troop-chip">
                          {TROOP_NAMES[type] || type}: {count}
                        </span>
                      ))}
                    </div>
                    <div className="borrowed-actions">
                      {isOwner && t.status !== 'returning' && (
                        <button type="button" className="borrow-action-btn" onClick={() => handleRecall(t._id)}>
                          {t.status === 'traveling' ? 'Turn Back' : 'Recall'}
                        </button>
                      )}
                      {!isOwner && t.status === 'stationed' && (
                        <button type="button" className="borrow-action-btn" onClick={() => handleSendBack(t._id)}>
                          Send Back
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {outgoingAttacks.length === 0 && troopTransfers.length === 0 && (
            <div className="no-deployed">
              <p>No deployed forces. Send troops on attacks or transfer them to another nexus.</p>
            </div>
          )}
        </div>

        {(activeTab === 'map' || mapEverVisited) && (
          <div className="map-tab" style={activeTab !== 'map' ? { display: 'none' } : undefined}>
            <StarfieldMap currentNexus={nexus} onRefresh={onUpdate} />
          </div>
        )}

        {(activeTab === 'espionage' || espionageEverVisited) && (
          <div style={activeTab !== 'espionage' ? { display: 'none' } : undefined}>
            <EspionageTab nexus={nexus} onToast={showToast} />
          </div>
        )}
      </div>

      {showSpecModal && (
        <div className="attack-modal-overlay" onClick={() => setShowSpecModal(false)}>
          <div className="attack-modal spec-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attack-modal-header">
              <h3>Choose Nexus Specialization</h3>
              <button className="close-btn" onClick={() => setShowSpecModal(false)}>
                <X size={12} aria-hidden="true" />
              </button>
            </div>
            <div className="attack-modal-content">
              <p className="spec-modal-warning">
                This choice is permanent. Once set, the specialization cannot be changed.
              </p>
              <div className="spec-options">
                {[
                  { type: 'Resource Depot', label: '3x Resource Production', desc: 'Triple the output of all three resource buildings. Best for a dedicated economic nexus.' },
                  { type: 'Supply Cache', label: '3x Storage · 60% Loot Protection', desc: 'Triple your storage cap and reduce loot stolen in raids by 60%. The best nexus for holding a large stockpile safely.' },
                  { type: 'Military Outpost', label: '3x Shield Efficiency · 4x Training Speed', desc: 'Triple shield defense and quadruple training speed. The strongest frontline base.' },
                  { type: 'Forward Base', label: '~44% Faster Travel · 36% Faster Construction', desc: 'Troops and transfers launch faster, and all buildings construct faster. Best for a front-line staging point deep in enemy territory.' },
                ].map(({ type, label, desc }) => (
                  <button
                    key={type}
                    className="spec-option-card"
                    onClick={async () => {
                      try {
                        const { specializeNexus } = await import('../services/api');
                        await specializeNexus(nexus._id, type);
                        setShowSpecModal(false);
                        onUpdate();
                        showToast(`Nexus specialized as ${type}`, 'success');
                      } catch {
                        showToast('Failed to specialize nexus', 'error');
                      }
                    }}
                  >
                    <div className="spec-option-header">
                      <NexusTypeBadge type={type} size={16} />
                      <strong>{type}</strong>
                    </div>
                    <div className="spec-option-bonus">{label}</div>
                    <div className="spec-option-desc">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {infoModal && typeof document !== 'undefined' && createPortal(
        <div className="attack-modal-overlay info-modal-overlay" onClick={() => setInfoModal(null)}>
          <div className="attack-modal info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attack-modal-header">
              <h3>{infoModal.title}</h3>
              <button className="close-btn" onClick={() => setInfoModal(null)}>
                <X size={12} aria-hidden="true" />
              </button>
            </div>
            <div className="attack-modal-content">
              <div className="attack-info-section info-modal-body">
                <p>{infoModal.description}</p>
                {infoModal.codexHref && (
                  <a
                    href={infoModal.codexHref}
                    className="info-modal-codex-link"
                    onClick={() => setInfoModal(null)}
                  >
                    More info in Codex →
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {selectedAttack && (
        <div className="attack-modal-overlay" onClick={() => setSelectedAttack(null)}>
          <div className="attack-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attack-modal-header">
              <h3>Strike details</h3>
              <button className="close-btn" onClick={() => setSelectedAttack(null)}>
                <X size={12} aria-hidden="true" />
              </button>
            </div>
            <div className="attack-modal-content">
              <div className="attack-info-section">
                <h4>Target</h4>
                <p>
                  {selectedAttack.defender?.nexus?.name || 'Unknown'}({selectedAttack.defender?.nexus?.x ?? '?'}|
                  {selectedAttack.defender?.nexus?.y ?? '?'})
                </p>
              </div>

              <div className="attack-info-section">
                <h4>Arrival time</h4>
                <p className="arrival-countdown">
                  <Countdown endAt={selectedAttack.arrivesAt} />
                  {' @ '}
                  {formatTimeOfDay(selectedAttack.arrivesAt, true)}
                </p>
              </div>

              <div className="attack-info-section">
                <h4>Troops sent</h4>
                <div className="troops-breakdown">
                  {Object.entries(selectedAttack.troops || {}).map(
                    ([troopType, count]) =>
                      (count as number) > 0 && (
                        <div key={troopType} className="troop-line">
                          <span>{TROOP_NAMES[troopType] || troopType}:</span>
                          <span className="troop-count">{count as number}</span>
                        </div>
                      ),
                  )}
                </div>
              </div>

              <div className="attack-info-section">
                <h4>Mission type</h4>
                <p>
                  {selectedAttack.type === 'attack'
                    ? 'Attack'
                    : selectedAttack.type === 'support'
                      ? 'Support'
                      : 'Scout'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Espionage Tab ----

type SpyMissionMode = 'embed' | 'sabotage';

const SABOTAGE_TARGETS: { key: string; label: string; desc: string }[] = [
  { key: 'troops',   label: 'Delay Training',     desc: 'Push back every batch in the defender\'s training queue. Each operative beyond the defender\'s Recon Operative garrison adds 30 minutes of delay. Empty queue = no effect.' },
  { key: 'building', label: 'Delay Construction', desc: 'Push back every entry in the defender\'s build queue. Each operative beyond the defender\'s Recon Operative garrison adds 30 minutes of delay.' },
];

const TROOP_DISPLAY_NAME: Record<string, string> = {
  reconOperative:      'Recon Operative',
  assaultTrooper:      'Assault Trooper',
  bulwarkGuard:        'Bulwark Guard',
  interceptorBike:     'Interceptor Bike',
  breakerUnit:         'Breaker Unit',
  disruptorUnit:       'Disruptor Unit',
  annihilatorPlatform: 'Annihilator Platform',
  lancerDrone:         'Lancer Drone',
  suppressorTeam:      'Suppressor Team',
  skimmerBike:         'Skimmer Bike',
  siegeMech:           'Siege Mech',
  overseer:            'Overseer',
};

const BUILDING_DISPLAY_NAME: Record<string, string> = {
  commandCore:      'Command Core',
  shieldGrid:       'Shield Grid',
  recruitmentCore:  'Recruitment Core',
};

function humanizeTroopKey(key: string): string {
  return TROOP_DISPLAY_NAME[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function fmtTimeLeft(completesAt: string): string {
  const ms = new Date(completesAt).getTime() - serverNow();
  if (ms <= 0) return 'Done';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function EspionageIntelPanel({ report }: { report: Record<string, unknown> }) {
  // Sabotage outcome
  if (report.type === 'sabotage') {
    if (report.message) return <span className="espionage-result-msg">{report.message as string}</span>;
    const target = report.target as string;
    const delayMinutes = report.delayMinutes as number | undefined;
    if (target === 'troops' && delayMinutes) {
      return <span className="espionage-result-msg">Training queue delayed by {delayMinutes} minutes.</span>;
    }
    if (target === 'building' && delayMinutes) {
      return <span className="espionage-result-msg">Build queue delayed by {delayMinutes} minutes.</span>;
    }
    return null;
  }

  // Embed refreshed (re-embed on existing asset) with no intel returned
  if (report.refreshed && !report.intel) {
    return <span className="espionage-result-msg">Operative already in place. Asset timestamp updated.</span>;
  }

  if (!report.intel) {
    if (report.message) return <span className="espionage-result-msg">{report.message as string}</span>;
    return null;
  }

  const intel = report.intel as Record<string, unknown>;
  const troops    = (intel.troops    ?? {}) as Record<string, number>;
  const resources = (intel.resources ?? {}) as Record<string, number>;
  const buildings = (intel.buildings ?? {}) as Record<string, number>;
  const nexusType    = intel.nexusType as string | null;
  const buildQueue   = (intel.buildQueue   ?? []) as Array<{ building: string; targetLevel: number; completesAt: string }>;
  const trainingQueue = (intel.trainingQueue ?? []) as Array<{ troopType: string; amount: number; completesAt: string; perUnitSeconds?: number }>;
  const troopEntries = Object.entries(troops).filter(([, v]) => v > 0);

  return (
    <div className="espionage-intel">
      {nexusType && (
        <div className="espionage-intel-nexustype">
          Nexus type: <strong>{capitalize(nexusType)}</strong>
        </div>
      )}

      <div className="espionage-intel-cols">
        {/* Troops */}
        <div className="espionage-intel-section">
          <span className="espionage-intel-heading">Garrison</span>
          {troopEntries.length === 0
            ? <span className="espionage-intel-empty">No troops</span>
            : troopEntries.map(([k, v]) => (
                <div key={k} className="espionage-intel-row">
                  <span>{humanizeTroopKey(k)}</span>
                  <span>{v.toLocaleString()}</span>
                </div>
              ))
          }
        </div>

        {/* Resources + Buildings */}
        <div className="espionage-intel-section">
          <span className="espionage-intel-heading">Resources</span>
          {Object.entries(resources).map(([k, v]) => (
            <div key={k} className="espionage-intel-row">
              <span>{capitalize(k)}</span>
              <span>{v.toLocaleString()}</span>
            </div>
          ))}

          {Object.keys(buildings).length > 0 && (
            <>
              <span className="espionage-intel-heading" style={{ marginTop: 8 }}>Buildings</span>
              {Object.entries(buildings).map(([k, v]) => (
                <div key={k} className="espionage-intel-row">
                  <span>{BUILDING_DISPLAY_NAME[k] ?? humanizeTroopKey(k)}</span>
                  <span>Lv {v}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Training queue */}
      <div className="espionage-intel-section espionage-intel-section--full">
        <span className="espionage-intel-heading">Training Queue</span>
        {trainingQueue.length === 0
          ? <span className="espionage-intel-empty">Nothing training</span>
          : trainingQueue.map((entry, i) => (
              <div key={i} className="espionage-intel-row">
                <span>{humanizeTroopKey(entry.troopType)} <span className="espionage-intel-qty">×{entry.amount.toLocaleString()}</span></span>
                <span className="espionage-intel-timer">{fmtTimeLeft(entry.completesAt)}</span>
              </div>
            ))
        }
      </div>

      {/* Build queue */}
      <div className="espionage-intel-section espionage-intel-section--full">
        <span className="espionage-intel-heading">Build Queue</span>
        {buildQueue.length === 0
          ? <span className="espionage-intel-empty">Nothing building</span>
          : buildQueue.map((entry, i) => (
              <div key={i} className="espionage-intel-row">
                <span>{BUILDING_DISPLAY_NAME[entry.building] ?? humanizeTroopKey(entry.building)} <span className="espionage-intel-qty">Lv {entry.targetLevel}</span></span>
                <span className="espionage-intel-timer">{fmtTimeLeft(entry.completesAt)}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// Leaf input component owning its own `amount` state, so keystrokes in the train-amount field
// don't re-render the entire Troops tab (with its 14 train cards) or the parent NexusView.
// On successful submit `onTrain` returns true and we clear the local input.
interface TrainAmountControlsProps {
  troopType: string;
  troopLabel: string;
  maxTrainable: number;
  canTrain: boolean;
  isTrainDisabled: boolean;
  onTrain: (troopType: string, rawAmount: string) => Promise<boolean>;
}

const TrainAmountControls = React.memo(function TrainAmountControls({
  troopType,
  troopLabel,
  maxTrainable,
  canTrain,
  isTrainDisabled,
  onTrain,
}: TrainAmountControlsProps) {
  const [amount, setAmount] = useState('');
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value.replace(/\D/g, ''));
  };
  const onSubmit = async () => {
    const ok = await onTrain(troopType, amount);
    if (ok) setAmount('');
  };
  return (
    <div className="train-controls-wrapper">
      {canTrain && maxTrainable > 0 && (
        <span className="train-max-label">Max trainable: {maxTrainable}</span>
      )}
      <div className="train-controls">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={maxTrainable > 0 ? `1–${maxTrainable}` : '0'}
          value={amount}
          onChange={onChange}
          aria-label={`${troopLabel} amount`}
          disabled={isTrainDisabled}
        />
        <button onClick={onSubmit} disabled={isTrainDisabled}>
          Train
        </button>
      </div>
    </div>
  );
});

// Small leaf banner that subscribes to the shared clock itself, so the surrounding overview
// tree doesn't re-render every second just to check whether newbie protection has expired.
const NewbieProtectionBanner = React.memo(function NewbieProtectionBanner({ endsAt }: { endsAt: string | Date }) {
  const now = useNow();
  const endMs = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime();
  if (endMs <= now) return null;
  return (
    <div className="newbie-protection-banner">
      <ShieldCheck size={14} className="newbie-protection-icon" aria-hidden="true" />
      <div className="newbie-protection-text">
        <span>
          Newbie Protection &middot; ends in{' '}
          <strong>
            <Countdown
              endAt={endMs}
              render={(ms) => {
                const totalMin = Math.floor(ms / 60_000);
                const days = Math.floor(totalMin / 1440);
                const hours = Math.floor((totalMin % 1440) / 60);
                const minutes = totalMin % 60;
                if (days > 0) return `${days}d ${hours}h ${minutes}m`;
                if (hours > 0) return `${hours}h ${minutes}m`;
                return `${minutes}m`;
              }}
            />
          </strong>
        </span>
        <span className="newbie-protection-subtext">
          New nexuses get 3 days of protection from player attacks. No one can hit you until the timer runs out.
        </span>
      </div>
    </div>
  );
});

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Arriving...';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function getSpyKindLabel(mission: Record<string, unknown>): string {
  return mission.type === 'embed' ? 'Embed Operative' : 'Sabotage';
}

function getSpyTargetLabel(mission: Record<string, unknown>): string {
  const name = (mission.targetName as string) ?? `Nexus #${mission.toNexusId}`;
  if (mission.targetX != null && mission.targetY != null) {
    return `${name} (${mission.targetX}|${mission.targetY})`;
  }
  return name;
}

function getSpyResultSummary(report: Record<string, unknown> | null, mission: Record<string, unknown>): string {
  if (!report) return 'No result payload recorded.';
  const success = report.success !== false;
  if (!success) return report.detected ? 'Failed and detected by the target.' : 'Failed without useful intelligence.';
  if (mission.type === 'embed') {
    if (report.refreshed) return 'Embedded operative refreshed existing intel.';
    return 'Intel package gathered from the target nexus.';
  }
  if (report.message) return String(report.message);
  if (report.target === 'troops') {
    return `Training queue delayed by ${Number(report.delayMinutes ?? 0).toLocaleString()} minutes.`;
  }
  if (report.target === 'building') {
    return `Build queue delayed by ${Number(report.delayMinutes ?? 0).toLocaleString()} minutes.`;
  }
  return 'Sabotage completed successfully.';
}

function formatMissionDate(value: unknown): string {
  if (!value) return 'Unknown time';
  return new Date(value as string).toLocaleString();
}

function EspionageTab({ nexus, onToast }: { nexus: Nexus; onToast: (msg: string, t: 'success' | 'error' | 'info') => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<SpyMissionMode>('embed');
  const [spyTarget, setSpyTarget] = useState<MapNexus | null>(null);
  const [operatives, setOperatives] = useState(1);
  const [sabotageTarget, setSabotageTarget] = useState<string>(SABOTAGE_TARGETS[0].key);
  const [loading, setLoading] = useState(false);
  const [intelResult, setIntelResult] = useState<Record<string, unknown> | null>(null);
  const [assets, setAssets] = useState<Array<Record<string, unknown>>>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [discoveredAssets, setDiscoveredAssets] = useState<Array<Record<string, unknown>>>([]);
  const [reembedId, setReembedId] = useState<number | null>(null);
  const [missions, setMissions] = useState<Array<Record<string, unknown>>>([]);
  const [completedMissions, setCompletedMissions] = useState<Array<Record<string, unknown>>>([]);
  // Per-mission expand state. Collapsed by default; resets on every mount
  // (i.e. when the user navigates back into the Espionage tab).
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const dispatchRef = useRef<HTMLDivElement | null>(null);
  const targetBarRef = useRef<HTMLDivElement | null>(null);

  // Tick for countdowns, pause while the document is hidden.
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (t) return;
      setNow(Date.now());
      t = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (!t) return;
      clearInterval(t);
      t = null;
    };
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, []);

  // When a spy target is selected, scroll the dispatch section into view.
  useEffect(() => {
    if (!spyTarget) return;
    const el = dispatchRef.current ?? targetBarRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [spyTarget]);

  const loadAll = () => {
    import('../services/api').then(({ getSpyAssets, getSpyMissions, getCompletedSpyMissions, getDiscoveredSpyAssets }) => {
      getSpyAssets(nexus._id).then((r: any) => setAssets(r.data ?? [])).catch(() => {});
      getSpyMissions(nexus._id).then((r: any) => setMissions(r.data ?? [])).catch(() => {});
      getCompletedSpyMissions(nexus._id).then((r: any) => setCompletedMissions(r.data ?? [])).catch(() => {});
      getDiscoveredSpyAssets(nexus._id).then((r: any) => setDiscoveredAssets(r.data ?? [])).catch(() => {});
    });
  };

  useEffect(() => {
    setAssetsLoading(true);
    loadAll();
    setAssetsLoading(false);
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, [nexus._id]);

  const handleSelectTarget = (target: MapNexus) => {
    setSpyTarget(target);
  };

  const handleModeSwitch = (next: SpyMissionMode) => {
    setMode(next);
    setSpyTarget(null);
    // Embed always uses exactly 1 operative; reset so a leftover sabotage count
    // (e.g. 4) isn't carried over and silently spend extra recon operatives.
    setOperatives(1);
  };

  const handleSend = async () => {
    if (!spyTarget) { onToast('Select a target nexus on the map', 'error'); return; }
    setLoading(true);
    try {
      const { sendSpyMission } = await import('../services/api');
      const r: any = await sendSpyMission(
        String(nexus._id),
        spyTarget._id,
        mode,
        // Embed only ever stations one operative; never spend more than 1 recon on it.
        mode === 'embed' ? 1 : operatives,
        mode === 'sabotage' ? sabotageTarget : undefined,
      );
      if (r.data?.queued) {
        onToast(`Operative${mode === 'sabotage' ? 's' : ''} dispatched. Arrives in ${formatCountdown(new Date(r.data.arrivesAt).getTime() - serverNow())}`, 'info');
        setSpyTarget(null);
        loadAll();
      }
    } catch (e: any) {
      onToast(e?.response?.data?.error ?? 'Mission failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRecall = async (assetId: number) => {
    try {
      const { recallSpyAsset } = await import('../services/api');
      await recallSpyAsset(assetId);
      onToast('Operative recalled', 'info');
      loadAll();
    } catch {
      onToast('Recall failed', 'error');
    }
  };

  const handleRefreshIntel = async (assetId: number) => {
    try {
      const { getEmbedIntel } = await import('../services/api');
      const r: any = await getEmbedIntel(assetId);
      if (r.data?.discovered) {
        onToast('Operative was discovered and captured', 'error');
        loadAll();
      } else {
        setIntelResult({ intelRefresh: true, type: 'embed', ...r.data });
        onToast('Intel refreshed', 'success');
      }
    } catch {
      onToast('Intel refresh failed', 'error');
    }
  };

  // Re-dispatch a fresh embed operative at a previously-discovered target,
  // skipping the map hunt. Uses the same flat 1-operative embed as the form.
  const handleReembed = async (asset: Record<string, unknown>) => {
    if (reconCount < 1) { onToast('No Recon Operatives available. Train some at your Recruitment Core.', 'error'); return; }
    setReembedId(asset.id as number);
    try {
      const { sendSpyMission } = await import('../services/api');
      const r: any = await sendSpyMission(String(nexus._id), String(asset.targetNexusId), 'embed', 1);
      if (r.data?.queued) {
        const label = (asset.targetName as string) ?? `Nexus #${asset.targetNexusId}`;
        onToast(`Operative re-dispatched to ${label}. Arrives in ${formatCountdown(new Date(r.data.arrivesAt).getTime() - serverNow())}`, 'info');
        loadAll();
      }
    } catch (e: any) {
      onToast(e?.response?.data?.error ?? 'Re-embed failed', 'error');
    } finally {
      setReembedId(null);
    }
  };

  const reconCount = nexus.troops?.reconOperative ?? 0;
  const embedCost = { biomass: 400, secondary: 200, secondaryLabel: 'Alloy' };
  const sabotCost = { biomass: 300 * operatives, secondary: 300 * operatives, secondaryLabel: 'Ore' };
  const cost = mode === 'embed' ? embedCost : sabotCost;
  const maxOps = reconCount;
  const selectedSabTarget = SABOTAGE_TARGETS.find(t => t.key === sabotageTarget)!;
  const successfulMissions = completedMissions.filter((m) => (m.result as Record<string, unknown> | null)?.success !== false).length;
  const sabotageMissions = completedMissions.filter((m) => m.type === 'sabotage').length;
  // Embed missions still traveling toward their target (not yet stationed as assets).
  const inboundEmbeds = missions.filter((m) => m.type === 'embed' && m.status === 'traveling').length;

  return (
    <div className="espionage-tab">
      <div className="espionage-command">
        <div className="espionage-command-main">
          <span className="espionage-eyebrow">Shadow Operations</span>
          <h3>Espionage</h3>
          <p>Pick a target, dispatch operatives, then track embeds, sabotage and mission results from one clean timeline.</p>
        </div>
        <div className="espionage-command-stats">
          <div className="espionage-stat">
            <span>Recon Ready</span>
            <strong>{reconCount.toLocaleString()}</strong>
          </div>
          <div className="espionage-stat">
            <span>In Transit</span>
            <strong>{missions.length.toLocaleString()}</strong>
          </div>
          <div className="espionage-stat">
            <span>Embedded</span>
            <strong>{assets.length.toLocaleString()}</strong>
          </div>
          <div className="espionage-stat">
            <span>Successes</span>
            <strong>{successfulMissions.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      <div className="espionage-mode-row" role="group" aria-label="Mission type">
        <button
          className={`espionage-mode-btn${mode === 'embed' ? ' active' : ''}`}
          onClick={() => handleModeSwitch('embed')}
        >
          <Eye size={15} aria-hidden="true" />
          <span>Embed Operative</span>
          <span className="espionage-mode-desc">Gather intel on troops &amp; resources</span>
        </button>
        <button
          className={`espionage-mode-btn${mode === 'sabotage' ? ' active' : ''}`}
          onClick={() => handleModeSwitch('sabotage')}
        >
          <Zap size={15} aria-hidden="true" />
          <span>Sabotage</span>
          <span className="espionage-mode-desc">Destroy troops or delay construction</span>
        </button>
      </div>

      {/* In-flight missions */}
      {missions.length > 0 && (
        <div className="espionage-missions">
          <div className="espionage-section-head">
            <div>
              <span className="espionage-section-kicker">Live Operations</span>
              <h4>Missions in Transit</h4>
            </div>
            <span className="espionage-section-count">{missions.length}</span>
          </div>
          {missions.map((m) => {
            const isReturning = m.status === 'returning';
            const result = (m.result as Record<string, unknown> | null) ?? null;
            const hasArrivedReport = isReturning && !!result;
            const success = result?.success as boolean | undefined;
            const id = String(m.id);
            const liveReportKey = `live:${id}`;
            const isOpen = expandedMissions.has(liveReportKey);
            const toggleReport = () =>
              setExpandedMissions((prev) => {
                const next = new Set(prev);
                if (next.has(liveReportKey)) next.delete(liveReportKey);
                else next.add(liveReportKey);
                return next;
              });
            const targetTime = isReturning
              ? new Date(m.returnsAt as string).getTime()
              : new Date(m.arrivesAt as string).getTime();
            const msLeft = targetTime - now;
            return (
              <div
                key={id}
                className={`espionage-live-card${hasArrivedReport ? ' espionage-live-card--resolved' : ''}${success === false ? ' espionage-live-card--fail' : ''}`}
              >
                <div className="espionage-mission-row">
                  <span className={`espionage-mission-icon espionage-mission-icon--${m.type === 'embed' ? 'embed' : 'sabotage'}`}>
                    {m.type === 'embed' ? <Eye size={14} aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
                  </span>
                  <div className="espionage-mission-info">
                    <span className="espionage-mission-label">
                      {getSpyKindLabel(m)}
                      <span className="espionage-mission-route"> to {getSpyTargetLabel(m)}</span>
                    </span>
                    <span className={`espionage-mission-status${success === false ? ' is-fail' : hasArrivedReport ? ' is-success' : ''}`}>
                      {hasArrivedReport ? 'Report received / operatives returning' : isReturning ? 'Returning' : 'Traveling'} &middot; {formatCountdown(msLeft)} @ {formatTimeOfDay(isReturning ? (m.returnsAt as string) : (m.arrivesAt as string), true)}
                    </span>
                    {hasArrivedReport && (
                      <span className="espionage-history-result">
                        {getSpyResultSummary(result, m)}
                      </span>
                    )}
                  </div>
                  <span className="espionage-mission-ops">{m.operatives as number} op{(m.operatives as number) !== 1 ? 's' : ''}</span>
                  {hasArrivedReport && (
                    <button
                      type="button"
                      className="espionage-live-report-toggle"
                      onClick={toggleReport}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? 'Hide' : 'Report'}
                    </button>
                  )}
                </div>
                {hasArrivedReport && isOpen && (
                  <div className="espionage-live-report">
                    <EspionageIntelPanel report={result} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Map */}
      <div className="espionage-map-wrapper">
        <StarfieldMap
          currentNexus={nexus}
          onRefresh={() => {}}
          mode="espionage"
          onSelectSpyTarget={handleSelectTarget}
        />
      </div>

      {/* Target bar */}
      {spyTarget ? (
        <div className="espionage-target-bar" ref={targetBarRef}>
          <Eye size={13} />
          <span>Target: <strong>{spyTarget.name}</strong> <span className="espionage-target-coords">({spyTarget.x}|{spyTarget.y})</span></span>
          <button className="espionage-target-clear" onClick={() => setSpyTarget(null)}>X</button>
        </div>
      ) : (
        <div className="espionage-target-hint">
          Click any enemy nexus on the map to select it as your target
        </div>
      )}

      {/* Mission config form */}
      {spyTarget && (
        <div className="espionage-form" ref={dispatchRef}>
          {mode === 'sabotage' && (
            <div className="espionage-form-section">
              <label className="espionage-label">Sabotage Target</label>
              <div className="espionage-sab-targets">
                {SABOTAGE_TARGETS.map(t => (
                  <button
                    key={t.key}
                    className={`espionage-sab-btn${sabotageTarget === t.key ? ' active' : ''}`}
                    onClick={() => setSabotageTarget(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="espionage-sab-desc">{selectedSabTarget.desc}</span>
            </div>
          )}

          {mode === 'sabotage' && (
            <div className="espionage-form-row">
              <label className="espionage-label">Recon Operatives</label>
              <div className="espionage-ops-controls">
                <button className="espionage-ops-step" onClick={() => setOperatives(o => Math.max(1, o - 1))} disabled={operatives <= 1}>-</button>
                <input
                  className="espionage-input espionage-input--narrow"
                  type="number" min={1} max={maxOps} value={operatives}
                  onChange={(e) => setOperatives(Math.max(1, Math.min(maxOps, parseInt(e.target.value) || 1)))}
                />
                <button className="espionage-ops-step" onClick={() => setOperatives(o => Math.min(maxOps, o + 1))} disabled={operatives >= maxOps}>+</button>
              </div>
            </div>
          )}

          <div className="espionage-cost-row">
            <span className="espionage-cost-item">
              <span className="espionage-cost-dot espionage-cost-dot--biomass" />
              {cost.biomass.toLocaleString()} Biomass
            </span>
            <span className="espionage-cost-sep">+</span>
            <span className="espionage-cost-item">
              <span className={`espionage-cost-dot espionage-cost-dot--${cost.secondaryLabel.toLowerCase()}`} />
              {cost.secondary.toLocaleString()} {cost.secondaryLabel}
            </span>
          </div>

          {mode === 'embed' && (
            <div className="espionage-risk-note">
              Detection chance: 5% base, +2% per enemy Stealth Array level (max 15%). On detection, 1 operative is lost and no intel is gained. Resources are spent regardless.
            </div>
          )}
          {mode === 'embed' && reconCount < 1 && (
            <div className="espionage-warn">No Recon Operatives available. Train some at your Recruitment Core.</div>
          )}
          {mode === 'sabotage' && reconCount < operatives && (
            <div className="espionage-warn">Not enough Recon Operatives. Train more at your Recruitment Core.</div>
          )}

          <button
            className="espionage-send-btn"
            onClick={handleSend}
            disabled={loading || (mode === 'embed' ? reconCount < 1 : reconCount < operatives)}
          >
            {loading ? 'Dispatching...' : mode === 'embed' ? 'Dispatch Operative' : 'Launch Sabotage'}
          </button>
        </div>
      )}

      {/* Intel refresh result */}
      {intelResult && (
        <div className="espionage-result espionage-result--success">
          <strong className="espionage-result-title">Intel Updated</strong>
          <EspionageIntelPanel report={intelResult} />
        </div>
      )}

      {/* Active embedded assets - placed above mission history so the most
          actionable surface (Refresh Intel / Recall) sits up top. */}
      <div className="espionage-assets">
        <div className="espionage-section-head">
          <div>
            <span className="espionage-section-kicker">Stationed Assets</span>
            <h4>Active Embedded Operatives</h4>
          </div>
          <span className="espionage-section-count">{assets.length}</span>
        </div>
        {assetsLoading ? null : assets.length === 0 ? (
          <div className="espionage-assets-empty">
            {inboundEmbeds > 0
              ? `${inboundEmbeds} embed operative${inboundEmbeds !== 1 ? 's' : ''} still in transit — they'll appear here once they reach the target.`
              : 'No operatives currently embedded at enemy nexuses.'}
          </div>
        ) : (
          assets.map((a) => (
            <div key={String(a.id)} className="espionage-asset-row">
              <span className="espionage-mission-icon espionage-mission-icon--embed">
                <Eye size={14} aria-hidden="true" />
              </span>
              <div className="espionage-asset-info">
                <span className="espionage-asset-target">
                  {(a.targetName as string) ?? `Nexus #${a.targetNexusId}`}
                  {a.targetX != null && a.targetY != null && (
                    <span className="espionage-target-coords"> ({a.targetX as number}|{a.targetY as number})</span>
                  )}
                </span>
                <span className="espionage-asset-last">
                  {a.lastReportAt != null
                    ? `Last report: ${new Date(a.lastReportAt as string).toLocaleString()}`
                    : 'No report yet'}
                </span>
              </div>
              <div className="espionage-asset-actions">
                <button className="espionage-asset-btn" onClick={() => handleRefreshIntel(a.id as number)}>
                  Refresh Intel
                </button>
                <button
                  className="espionage-asset-btn"
                  onClick={() => router.push(`/starfield?attack=${a.targetNexusId as number}`)}
                  title="Attack this target"
                >
                  Attack
                </button>
                <button className="espionage-asset-btn espionage-asset-btn--recall" onClick={() => handleRecall(a.id as number)}>
                  Recall
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recently discovered operatives - quick re-embed without hunting the
          map. Surfaces the last 5 blown covers so the user can immediately
          re-dispatch to a target they were already working. */}
      {discoveredAssets.length > 0 && (
        <div className="espionage-discovered">
          <div className="espionage-section-head">
            <div>
              <span className="espionage-section-kicker espionage-section-kicker--alert">Cover Blown</span>
              <h4>Recently Discovered Operatives</h4>
            </div>
            <span className="espionage-section-count">{discoveredAssets.length}</span>
          </div>
          <p className="espionage-discovered-hint">
            These operatives were detected and captured. Re-dispatch a fresh one to the same target in one click.
          </p>
          {discoveredAssets.map((a) => {
            const id = a.id as number;
            const label = (a.targetName as string) ?? `Nexus #${a.targetNexusId}`;
            const when = (a.discoveredAt as string | null) ?? (a.createdAt as string | null);
            const canReembed = a.reembeddable !== false;
            const isSending = reembedId === id;
            return (
              <div key={String(id)} className="espionage-discovered-row">
                <span className="espionage-mission-icon espionage-mission-icon--discovered">
                  <EyeOff size={14} aria-hidden="true" />
                </span>
                <div className="espionage-asset-info">
                  <span className="espionage-asset-target">
                    {label}
                    {a.targetX != null && a.targetY != null && (
                      <span className="espionage-target-coords"> ({a.targetX as number}|{a.targetY as number})</span>
                    )}
                  </span>
                  <span className="espionage-asset-last espionage-asset-last--alert">
                    {when ? `Discovered ${formatMissionDate(when)}` : 'Cover blown'}
                  </span>
                </div>
                <div className="espionage-asset-actions">
                  <button
                    className="espionage-asset-btn espionage-asset-btn--reembed"
                    onClick={() => handleReembed(a)}
                    disabled={isSending || !canReembed || reconCount < 1}
                    title={!canReembed ? 'Target no longer available' : reconCount < 1 ? 'No Recon Operatives available' : 'Send a fresh operative to this target'}
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                    {isSending ? 'Dispatching...' : 'Re-embed'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed mission results (last 10, newest first). Collapsed by
          default - the tab opens with these furled and only the actionable
          assets list expanded. Toggling is per-row. */}
      {completedMissions.length > 0 && (
        <div className="espionage-completed">
          <div className="espionage-section-head">
            <div>
              <span className="espionage-section-kicker">Chronological Log</span>
              <h4>Recent Mission Results</h4>
            </div>
            <div className="espionage-history-summary">
              <span>{completedMissions.length} total</span>
              <span>{sabotageMissions} sabotage</span>
            </div>
          </div>
          {completedMissions.map((m) => {
            const r = m.result as Record<string, unknown> | null;
            const success = r?.success as boolean | undefined;
            const id = String(m.id);
            const isOpen = expandedMissions.has(id);
            const toggle = () =>
              setExpandedMissions((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            return (
              <div key={id} className={`espionage-completed-row${success === false ? ' espionage-completed-row--fail' : ''}`}>
                <div className="espionage-mission-header">
                  <button
                    type="button"
                    className="espionage-mission-toggle"
                    onClick={toggle}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'Collapse mission details' : 'Expand mission details'}
                  >
                    <span className={`espionage-mission-icon espionage-mission-icon--${m.type === 'embed' ? 'embed' : 'sabotage'}`}>
                      {m.type === 'embed' ? <Eye size={14} aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
                    </span>
                    <span className="espionage-history-copy">
                      <span className="espionage-mission-label">
                        {getSpyKindLabel(m)}
                        <span className="espionage-mission-route"> to {getSpyTargetLabel(m)}</span>
                      </span>
                      <span className="espionage-history-result">{getSpyResultSummary(r, m)}</span>
                      <span className="espionage-history-time">{formatMissionDate(m.createdAt)}</span>
                    </span>
                    <span className={`espionage-mission-status ${success === false ? 'is-fail' : 'is-success'}`}>
                      {success === false ? 'Failed' : 'Succeeded'}
                    </span>
                    <span className="espionage-mission-toggle-icon" aria-hidden="true">{isOpen ? '-' : '+'}</span>
                  </button>
                  {m.toNexusId != null && (
                    <button
                      type="button"
                      className="espionage-asset-btn espionage-mission-attack-btn"
                      onClick={() => router.push(`/starfield?attack=${m.toNexusId as number}`)}
                      title="Attack this target"
                    >
                      <Swords size={12} aria-hidden="true" /> Attack
                    </button>
                  )}
                </div>
                {isOpen && r && <EspionageIntelPanel report={r} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NexusView;
