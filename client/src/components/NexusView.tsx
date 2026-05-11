import React, { useEffect, useRef, useState } from 'react';
import {
  cancelBuildQueueItem,
  cancelTrainingQueueItem,
  checkBuildQueue,
  checkTrainingQueue,
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
import '../styles/NexusView.css';
import { Nexus, TroopTransfer } from '../types/game';
import StarfieldMap from './Map';
import NexusMap from './NexusMap';
import Toast from './Toast';

// Import troop images
import annihilatorplatformImg from '../assets/troops/annihilatorplatform.png';
import assaulttrooperImg from '../assets/troops/assaulttrooper.png';
import breakerunitImg from '../assets/troops/breakerunit.png';
import bulwarkguardImg from '../assets/troops/bulwarkguard.png';
import disruptorunitImg from '../assets/troops/disruptorunit.png';
import interceptorbikeImg from '../assets/troops/interceptorbike.png';
import lancerdroneImg from '../assets/troops/lancerdrone.png';
import overseerImg from '../assets/troops/overseer.png';
import reconoperativeImg from '../assets/troops/reconoperative.png';
import siegemechImg from '../assets/troops/siegemech.png';
import skimmerbikeImg from '../assets/troops/skimmerbike.png';
import suppressorteamImg from '../assets/troops/suppressorteam.png';

// Import building images
import alloyforgeImg from '../assets/buildings/alloyforge.png';
import biomassfarmImg from '../assets/buildings/biomassfarm.png';
import commandcoreImg from '../assets/buildings/commandcore.png';
import lifesupportImg from '../assets/buildings/lifesupport.png';
import oreextractorImg from '../assets/buildings/oreextractor.png';
import recruitmentcoreImg from '../assets/buildings/recruitmentcore.png';
import shieldgridImg from '../assets/buildings/shieldgrid.png';
import storagevaultImg from '../assets/buildings/storagevault.png';

interface NexusViewProps {
  nexus: Nexus;
  onUpdate: () => void;
  initialTab?: NexusTab;
  onTabChange?: (tab: NexusTab) => void;
}

type NexusTab = 'overview' | 'buildings' | 'troops' | 'map';

const MAX_BUILD_QUEUE = 5;
const MAX_TRAINING_QUEUE = 5;

const NEXUS_TYPE_BUFFS: Record<string, { icon: string; label: string }> = {
  'Resource Depot': { icon: '⚡', label: '2x Resource Production' },
  'Supply Cache': { icon: '📦', label: '2x Storage Capacity' },
  'Military Outpost': { icon: '🛡️', label: '+50% Shield Efficiency · 25% Faster Training' },
  'Reclaimed Outpost': { icon: '🔧', label: '20% Faster Construction' },
};

const BUILDING_NAMES: { [key: string]: string } = {
  commandCore: 'Command Core',
  recruitmentCore: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
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
};

const BUILDING_COSTS: { [key: string]: any } = {
  commandCore: { biomass: 90, alloy: 80, ore: 70, time: 70 },
  recruitmentCore: { biomass: 200, alloy: 170, ore: 90, time: 115 },
  lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 90 },
  storageVault: { biomass: 60, alloy: 50, ore: 70, time: 70 },
  biomassFarm: { biomass: 50, alloy: 60, ore: 60, time: 70 },
  alloyForge: { biomass: 65, alloy: 40, ore: 60, time: 70 },
  oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 90 },
  shieldGrid: { biomass: 50, alloy: 100, ore: 60, time: 115 },
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
};

const COST_SCALING = {
  early: 1.5,
  mid: 1.65,
  late: 1.8,
};

const TIME_SCALING = {
  early: 1.25,
  mid: 1.35,
  late: 1.45,
};

// Command Core reduces building time by 5% per level (compounding).
const COMMAND_BUILD_TIME_FACTOR_PER_LEVEL = 0.95;
// Recruitment Core reduces training time by 8% per level (compounding). Overseer is exempt.
const RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL = 0.92;

const getCommandTimeFactor = (commandLevel: number) =>
  Math.pow(COMMAND_BUILD_TIME_FACTOR_PER_LEVEL, Math.max(0, commandLevel || 0));

const NEXUS_TYPE_TRAINING_MULTIPLIERS: Record<string, number> = {
  'Military Outpost': 0.75,
};

const getTroopTrainSeconds = (troopType: string, baseTime: number, recruitmentLevel: number, nexusType?: string | null) => {
  if (troopType === 'overseer') return baseTime;
  const recruitFactor = Math.pow(RECRUITMENT_TRAIN_TIME_FACTOR_PER_LEVEL, Math.max(0, recruitmentLevel || 0));
  const nexusFactor = NEXUS_TYPE_TRAINING_MULTIPLIERS[nexusType ?? ''] ?? 1;
  return Math.max(1, Math.floor(baseTime * recruitFactor * nexusFactor));
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
  overseer: overseerImg,
};

const TROOP_DESCRIPTIONS: { [key: string]: string } = {
  assaultTrooper:
    'Standard offensive infantry. Versatile frontline soldier used for sustained attacks and general combat operations. Requires Lv1 Recruitment Core.',
  lancerDrone:
    'Anti-vehicle defensive unit. Autonomous unit equipped with precision lances, optimized to intercept fast attackers and hold defensive lines. Requires Lv2 Recruitment Core.',
  breakerUnit:
    'Heavy assault unit. Armored shock unit designed to breach defenses and deal high structural and troop damage. Requires Lv3 Recruitment Core, Lv3 Ore Extractor.',
  reconOperative:
    'Scout & intelligence unit. Fast, lightly equipped operative used to gather intelligence, scan enemy nexuses, and detect incoming forces. Requires Lv4 Recruitment Core, Lv3 Command Core.',
  skimmerBike:
    'Fast raid unit. High-speed hover bike used for quick strikes, resource extraction, and rapid retreats. Requires Lv5 Recruitment Core, Lv4 Alloy Forge.',
  siegeMech:
    'Heavy siege unit. Massive mechanized unit specialized in destroying fortifications and shield grids. Requires Lv10 Recruitment Core, Lv9 Ore Extractor, Lv8 Command Core.',
  bulwarkGuard:
    'Elite defensive infantry. Heavily shielded unit deployed to significantly strengthen nexus defenses. Requires Lv5 Recruitment Core, Lv5 Life Support.',
  suppressorTeam:
    'Ranged support unit. Long-range fireteam that weakens enemy forces before direct engagement. Requires Lv7 Recruitment Core, Lv6 Command Core.',
  disruptorUnit:
    'Anti-armor & anti-mech unit. Specialized unit using EMP weapons to counter heavy units and machinery. Requires Lv7 Recruitment Core, Lv6 Ore Extractor.',
  interceptorBike:
    'Rapid response unit. Extremely fast unit used to chase scouts, reinforce nearby nexuses, or intercept raids. Requires Lv8 Recruitment Core, Lv7 Alloy Forge.',
  annihilatorPlatform:
    'Heavy artillery unit. Slow but devastating artillery platform capable of inflicting massive damage. Requires Lv12 Recruitment Core, Lv10 Command Core, Lv10 Shield Grid.',
  overseer:
    'Conquest & control unit. Non-combat command unit required to reduce Control Level and permanently capture enemy nexuses. Requires Lv14 Recruitment Core, Lv14 Command Core, Lv13 Shield Grid. Up to 3 per nexus.',
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
  overseer: { buildings: { recruitmentCore: 14, commandCore: 14, shieldGrid: 13 }, maxPerNexus: 3 },
};

const POPULATION_BASE = 100;
const POPULATION_GROWTH = 1.27;
const STORAGE_BASE = 1000;
const STORAGE_GROWTH = 1.5;
const SHIELD_BONUS_PER_LEVEL = 0.02;

const TROOP_COSTS: { [key: string]: any } = {
  assaultTrooper: { biomass: 150, alloy: 150, ore: 350, population: 1, time: 79 },
  lancerDrone: { biomass: 150, alloy: 150, ore: 200, population: 1, time: 53 },
  breakerUnit: { biomass: 250, alloy: 150, ore: 300, population: 1, time: 74 },
  reconOperative: { biomass: 400, alloy: 150, ore: 400, population: 1, time: 180 },
  skimmerBike: { biomass: 625, alloy: 500, ore: 750, population: 3, time: 600 },
  bulwarkGuard: { biomass: 400, alloy: 600, ore: 500, population: 2, time: 480 },
  suppressorTeam: { biomass: 450, alloy: 400, ore: 450, population: 2, time: 480 },
  disruptorUnit: { biomass: 550, alloy: 750, ore: 650, population: 2, time: 660 },
  interceptorBike: { biomass: 750, alloy: 600, ore: 900, population: 3, time: 900 },
  siegeMech: { biomass: 1250, alloy: 1000, ore: 2000, population: 4, time: 3600 },
  annihilatorPlatform: { biomass: 2000, alloy: 1750, ore: 3000, population: 5, time: 7200 },
  overseer: { biomass: 180000, alloy: 140000, ore: 120000, population: 5, time: 14400 },
};

const TROOP_CATEGORIES: Record<string, 'offense' | 'defense'> = {
  breakerUnit: 'offense',
  skimmerBike: 'offense',
  suppressorTeam: 'offense',
  disruptorUnit: 'offense',
  interceptorBike: 'offense',
  annihilatorPlatform: 'offense',
  overseer: 'offense',
  assaultTrooper: 'defense',
  lancerDrone: 'defense',
  reconOperative: 'defense',
  siegeMech: 'defense',
  bulwarkGuard: 'defense',
};

interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface IntroQuest {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  tab: 'buildings' | 'troops' | 'map';
}

interface QuestBatch {
  id: 'intro' | 'intermediate' | 'advanced' | 'veteran' | 'conqueror';
  title: string;
  quests: IntroQuest[];
  unlocked: boolean;
  reward: string;
}

interface InfoModalState {
  title: string;
  description: string;
}

const NexusView: React.FC<NexusViewProps> = ({ nexus, onUpdate, initialTab = 'overview', onTabChange }) => {
  const [activeTab, setActiveTabState] = useState<NexusTab>(initialTab);
  const setActiveTab = (tab: NexusTab) => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  };
  const [isRenamingNexus, setIsRenamingNexus] = useState(false);
  const [renameValue, setRenameValue] = useState(nexus.name);
  const [isSavingNexusName, setIsSavingNexusName] = useState(false);
  const [trainAmount, setTrainAmount] = useState<{ [key: string]: string }>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [incomingAttacks, setIncomingAttacks] = useState<any[]>([]);
  const [outgoingAttacks, setOutgoingAttacks] = useState<any[]>([]);
  const [selectedAttack, setSelectedAttack] = useState<any | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalState | null>(null);
  const [ownNexuses, setOwnNexuses] = useState<Nexus[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmounts, setTransferAmounts] = useState({ biomass: '', alloy: '', ore: '' });
  const [transferring, setTransferring] = useState(false);
  const [troopTransfers, setTroopTransfers] = useState<TroopTransfer[]>([]);
  const [showTroopSend, setShowTroopSend] = useState(false);
  const [troopSendTo, setTroopSendTo] = useState('');
  const [troopSendAmounts, setTroopSendAmounts] = useState<Record<string, string>>({});
  const [sendingTroops, setSendingTroops] = useState(false);
  const submittingRef = useRef<Set<string>>(new Set());
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());

  const dismissTip = (id: string) => setDismissedTips((prev) => new Set(prev).add(id));

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleInfoTap = (title: string, description: string) => {
    setInfoModal({ title, description });
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

  const handleTrainAmountChange = (troopType: string, value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    setTrainAmount((prev) => ({ ...prev, [troopType]: digitsOnly }));
  };

  useEffect(() => {
    // Update current time every second for real-time countdown
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    setActiveTabState(initialTab);
  }, [initialTab]);

  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkQueues();
      loadAttacks();
      refreshTroopTransfers();
    }, 15000);
    loadAttacks();
    return () => clearInterval(interval);
  }, [nexus]);

  useEffect(() => {
    if (!isRenamingNexus) {
      setRenameValue(nexus.name);
    }
  }, [isRenamingNexus, nexus.name]);

  useEffect(() => {
    getMyNexuses()
      .then((r) => setOwnNexuses(r.data))
      .catch(() => {});
    getNexusTroopTransfers(nexus._id)
      .then((r) => setTroopTransfers(r.data))
      .catch(() => {});
  }, [nexus._id]);

  const refreshTroopTransfers = async () => {
    try {
      const r = await getNexusTroopTransfers(nexus._id);
      setTroopTransfers(r.data);
    } catch {}
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

  const loadAttacks = async () => {
    try {
      const [incomingResponse, outgoingResponse] = await Promise.all([
        getIncomingAttacks(nexus._id),
        getOutgoingAttacks(nexus._id),
      ]);
      setIncomingAttacks(incomingResponse.data);
      setOutgoingAttacks(outgoingResponse.data);
    } catch (err) {
      console.error('Error loading strikes:', err);
    }
  };

  const handleUpgrade = async (building: string) => {
    const key = `build-${building}`;
    if (submittingRef.current.has(key)) return;
    submittingRef.current.add(key);

    if (nexus.buildQueue.length >= MAX_BUILD_QUEUE) {
      showToast(`Build queue is full (${MAX_BUILD_QUEUE}/${MAX_BUILD_QUEUE})`, 'error');
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

  const handleTrainTroops = async (troopType: string) => {
    const key = `train-${troopType}`;
    if (submittingRef.current.has(key)) return;
    submittingRef.current.add(key);

    const sameChainCount = nexus.trainingQueue.filter((entry: any) =>
      troopType === 'overseer' ? entry.troopType === 'overseer' : entry.troopType !== 'overseer',
    ).length;
    if (sameChainCount >= MAX_TRAINING_QUEUE) {
      showToast(`Training queue is full (${MAX_TRAINING_QUEUE}/${MAX_TRAINING_QUEUE})`, 'error');
      submittingRef.current.delete(key);
      return;
    }

    const requirementsResult = checkTroopRequirements(troopType);
    const { maxTrainable } = getMaxTrainableAmount(troopType, TROOP_COSTS[troopType], requirementsResult.canTrain);
    const rawAmount = trainAmount[troopType] ?? '';
    const requestedAmount = rawAmount === '' ? 1 : Number.parseInt(rawAmount, 10);
    const amount = Math.min(Number.isFinite(requestedAmount) ? requestedAmount : 0, maxTrainable);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Not enough population or resources to train this unit right now', 'error');
      submittingRef.current.delete(key);
      return;
    }

    // Check requirements
    const requirements = TROOP_REQUIREMENTS[troopType];
    if (requirements) {
      // Check building requirements
      if (requirements.buildings) {
        for (const [building, level] of Object.entries(requirements.buildings)) {
          if ((nexus.buildings as any)[building] < (level as number)) {
            showToast(`Requires ${BUILDING_NAMES[building]} Level ${level}`, 'error');
            return;
          }
        }
      }

      // Check max per nexus
      if (requirements.maxPerNexus) {
        if ((nexus.troops as any)[troopType] >= requirements.maxPerNexus) {
          showToast(`Maximum ${requirements.maxPerNexus} ${TROOP_NAMES[troopType]} per nexus`, 'error');
          return;
        }
        if (amount > requirements.maxPerNexus - (nexus.troops as any)[troopType]) {
          showToast(`Can only train ${requirements.maxPerNexus - (nexus.troops as any)[troopType]} more`, 'error');
          return;
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
      setTrainAmount({ ...trainAmount, [troopType]: '' });
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error training troops', 'error');
    } finally {
      submittingRef.current.delete(key);
    }
  };

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

  const formatTime = (date: Date | string) => {
    const diff = new Date(date).getTime() - currentTime.getTime();
    if (diff <= 0) return 'Ready to apply';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

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

  const getBuildQueueTimeDisplay = (index: number) => {
    const queue = Array.isArray(nexus.buildQueue) ? nexus.buildQueue : [];
    const item = queue[index];
    if (!item) {
      return { label: '', isWaiting: false };
    }

    const now = currentTime.getTime();
    const endAt = new Date(item.completesAt).getTime();

    if (index > 0) {
      const startsAt = new Date(queue[index - 1].completesAt).getTime();
      const ownDurationSeconds = Math.floor((endAt - startsAt) / 1000);

      if (now < startsAt) {
        return {
          label: `Queued • ${formatDurationSeconds(ownDurationSeconds)}`,
          isWaiting: true,
        };
      }
    }

    const remainingSeconds = Math.floor((endAt - now) / 1000);
    if (remainingSeconds <= 0) {
      return { label: 'Ready to apply', isWaiting: false };
    }

    return { label: formatDurationSeconds(remainingSeconds), isWaiting: false };
  };

  const getTrainingQueueTimeDisplay = (index: number) => {
    const queue = Array.isArray(nexus.trainingQueue) ? nexus.trainingQueue : [];
    const item = queue[index];
    if (!item) {
      return { label: '', isWaiting: false };
    }

    const now = currentTime.getTime();
    const endAt = new Date(item.completesAt).getTime();

    // Find the previous entry in the same chain (overseer vs non-overseer).
    const isOverseerItem = item.troopType === 'overseer';
    let prevSameChain: any = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = queue[i];
      const candidateIsOverseer = candidate.troopType === 'overseer';
      if (candidateIsOverseer === isOverseerItem) {
        prevSameChain = candidate;
        break;
      }
    }

    if (prevSameChain) {
      const startsAt = new Date(prevSameChain.completesAt).getTime();
      const ownDurationSeconds = Math.floor((endAt - startsAt) / 1000);

      if (now < startsAt) {
        return {
          label: `Queued • ${formatDurationSeconds(ownDurationSeconds)}`,
          isWaiting: true,
        };
      }
    }

    const remainingSeconds = Math.floor((endAt - now) / 1000);
    if (remainingSeconds <= 0) {
      return { label: 'Ready to apply', isWaiting: false };
    }

    return { label: formatDurationSeconds(remainingSeconds), isWaiting: false };
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
    if (requirements.maxPerNexus && (nexus.troops as any)[troopType] >= requirements.maxPerNexus) {
      missing.push(`Max ${requirements.maxPerNexus} per nexus (already have ${(nexus.troops as any)[troopType]})`);
    }

    return { canTrain: missing.length === 0, missingRequirements: missing };
  };

  const getMaxTrainableAmount = (troopType: string, costs: (typeof TROOP_COSTS)[string], canTrain: boolean) => {
    if (!canTrain) return { maxTrainable: 0, shortageReasons: [] };

    const byBiomass =
      costs.biomass > 0 ? Math.floor(nexus.resources.biomass / costs.biomass) : Number.POSITIVE_INFINITY;
    const byAlloy = costs.alloy > 0 ? Math.floor(nexus.resources.alloy / costs.alloy) : Number.POSITIVE_INFINITY;
    const byOre = costs.ore > 0 ? Math.floor(nexus.resources.ore / costs.ore) : Number.POSITIVE_INFINITY;
    const remainingPopulation = Math.max(0, nexus.population.max - nexus.population.current);
    const byPopulation =
      costs.population > 0 ? Math.floor(remainingPopulation / costs.population) : Number.POSITIVE_INFINITY;

    let maxTrainable = Math.max(0, Math.floor(Math.min(byBiomass, byAlloy, byOre, byPopulation)));

    const requirements = TROOP_REQUIREMENTS[troopType];
    if (requirements?.maxPerNexus) {
      const remainingAllowed = Math.max(0, requirements.maxPerNexus - ((nexus.troops as any)[troopType] || 0));
      maxTrainable = Math.min(maxTrainable, remainingAllowed);
    }

    const shortageReasons: string[] = [];
    if (maxTrainable === 0) {
      if (byBiomass === 0) shortageReasons.push(`🧬 Biomass ${Math.floor(nexus.resources.biomass)}/${costs.biomass}`);
      if (byAlloy === 0) shortageReasons.push(`⚙️ Alloy ${Math.floor(nexus.resources.alloy)}/${costs.alloy}`);
      if (byOre === 0) shortageReasons.push(`💎 Ore ${Math.floor(nexus.resources.ore)}/${costs.ore}`);
      if (byPopulation === 0) shortageReasons.push(`👥 Population ${remainingPopulation}/${costs.population} free`);
    }

    return { maxTrainable, shortageReasons };
  };

  const calculateProduction = () => {
    const baseProduction = 600;
    const NEXUS_PRODUCTION_MULTIPLIERS: Record<string, number> = { 'Resource Depot': 2 };
    const productionMult = NEXUS_PRODUCTION_MULTIPLIERS[nexus.nexusType ?? ''] ?? 1;
    return {
      biomass: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.biomassFarm - 1) * productionMult),
      alloy: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.alloyForge - 1) * productionMult),
      ore: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.oreExtractor - 1) * productionMult),
    };
  };

  const getLiveResources = () => {
    const prod = calculateProduction();
    const anchorMs = nexus.lastResourceUpdate ? new Date(nexus.lastResourceUpdate).getTime() : currentTime.getTime();
    const elapsedHours = Math.max(0, (currentTime.getTime() - anchorMs) / 3600000);
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
    const base = BUILDING_COSTS[building];
    const targetLevel = currentLevel + 1;

    let biomass = base.biomass;
    let alloy = base.alloy;
    let ore = base.ore;
    let time = base.time;

    for (let level = 2; level <= targetLevel; level += 1) {
      const costMultiplier = level <= 5 ? COST_SCALING.early : level <= 10 ? COST_SCALING.mid : COST_SCALING.late;
      const timeMultiplier = level <= 5 ? TIME_SCALING.early : level <= 10 ? TIME_SCALING.mid : TIME_SCALING.late;
      biomass *= costMultiplier;
      alloy *= costMultiplier;
      ore *= costMultiplier;
      time *= timeMultiplier;
    }

    const NEXUS_BUILD_TIME_MULTIPLIERS: Record<string, number> = { 'Reclaimed Outpost': 0.80 };
    const nexusBuildFactor = NEXUS_BUILD_TIME_MULTIPLIERS[nexus.nexusType ?? ''] ?? 1;
    const reducedTime = Math.max(1, Math.floor(time * getCommandTimeFactor(nexus.buildings.commandCore) * nexusBuildFactor));

    return {
      biomass: Math.floor(biomass),
      alloy: Math.floor(alloy),
      ore: Math.floor(ore),
      time: reducedTime,
    };
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
    const safeLevel = Math.max(1, level);
    return Math.floor(600 * Math.pow(1.35, safeLevel - 1));
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

    if (building !== 'commandCore' && targetLevel >= 1) {
      merged.set('commandCore', 1);
    }

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
      if ((nexus.buildings as any)[requirement.building] < requirement.level) {
        const isQueued = (nexus.buildQueue || []).some(
          (q) => q.building === requirement.building && q.targetLevel >= requirement.level,
        );
        const suffix = isQueued ? ' (under construction)' : '';
        missing.push(`${BUILDING_NAMES[requirement.building]} Lv${requirement.level}${suffix}`);
      }
    }

    return { canUpgrade: missing.length === 0, missingRequirements: missing, atMax: false };
  };

  const getQuestBatches = (): { batches: QuestBatch[]; allQuestsComplete: boolean } => {
    // A batch that has had its reward claimed is permanently complete — quests inside it
    // should show as done even if live state (e.g. troops lost in combat) no longer meets the condition.
    const claimedBatches = new Set<string>(Array.isArray(nexus.questRewardClaims) ? nexus.questRewardClaims : []);
    const completedQuestIds = new Set<string>(Array.isArray(nexus.completedQuestIds) ? nexus.completedQuestIds : []);
    const done = (batchId: string, questId: string, condition: boolean) =>
      completedQuestIds.has(questId) || claimedBatches.has(batchId) || condition;

    const assaultTroopers = nexus.troops.assaultTrooper || 0;
    const reconOperatives = nexus.troops.reconOperative || 0;
    const skimmerBikes = nexus.troops.skimmerBike || 0;
    const siegeMechs = nexus.troops.siegeMech || 0;
    const disruptorUnits = nexus.troops.disruptorUnit || 0;
    const annihilatorPlatforms = nexus.troops.annihilatorPlatform || 0;

    const introQuests: IntroQuest[] = [
      {
        id: 'command-core-online',
        title: 'Power The Nexus',
        description: 'Upgrade Command Core to Lv1.',
        completed: done('intro', 'build_command_core_1', nexus.buildings.commandCore >= 1),
        tab: 'buildings',
      },
      {
        id: 'start-fabrication',
        title: 'Enable Recruitment',
        description: 'Upgrade Recruitment Core to Lv1.',
        completed: done('intro', 'build_troop_fab_1', nexus.buildings.recruitmentCore >= 1),
        tab: 'buildings',
      },
      {
        id: 'increase-capacity',
        title: 'Secure Capacity',
        description: 'Upgrade Storage Vault to Lv2.',
        completed: done('intro', 'build_storage_vault_2', nexus.buildings.storageVault >= 2),
        tab: 'buildings',
      },
      {
        id: 'raise-force',
        title: 'Field Troops',
        description: 'Train 5 Assault Troopers.',
        completed: done('intro', 'train_assault_trooper_5', assaultTroopers >= 5),
        tab: 'troops',
      },
    ];

    const introComplete = claimedBatches.has('intro') || introQuests.every((quest) => quest.completed);

    const intermediateQuests: IntroQuest[] = [
      {
        id: 'fortify-core',
        title: 'Fortify The Core',
        description: 'Upgrade Command Core to Lv3.',
        completed: done('intermediate', 'build_command_core_3', nexus.buildings.commandCore >= 3),
        tab: 'buildings',
      },
      {
        id: 'unlock-defenses',
        title: 'Activate Shield Grid',
        description: 'Upgrade Shield Grid to Lv1.',
        completed: done('intermediate', 'build_shield_grid_1', nexus.buildings.shieldGrid >= 1),
        tab: 'buildings',
      },
      {
        id: 'upgrade-biomass-chain',
        title: 'Expand Biomass Chain',
        description: 'Upgrade Biomass Farm to Lv2.',
        completed: done('intermediate', 'build_biomass_farm_2', nexus.buildings.biomassFarm >= 2),
        tab: 'buildings',
      },
      {
        id: 'expand-logistics',
        title: 'Expand Logistics',
        description: 'Upgrade Alloy Forge to Lv2.',
        completed: done('intermediate', 'build_alloy_forge_2', nexus.buildings.alloyForge >= 2),
        tab: 'buildings',
      },
      {
        id: 'deploy-recon',
        title: 'Deploy Recon',
        description: 'Train 1 Recon Operative.',
        completed: done('intermediate', 'train_recon_operative_1', reconOperatives >= 1),
        tab: 'troops',
      },
    ];

    const intermediateComplete =
      claimedBatches.has('intermediate') || intermediateQuests.every((quest) => quest.completed);

    const advancedQuests: IntroQuest[] = [
      {
        id: 'command-core-mastery',
        title: 'Core Mastery',
        description: 'Upgrade Command Core to Lv4.',
        completed: done('advanced', 'build_command_core_4', nexus.buildings.commandCore >= 4),
        tab: 'buildings',
      },
      {
        id: 'extractor-specialization',
        title: 'Extractor Specialization',
        description: 'Upgrade Ore Extractor to Lv4.',
        completed: done('advanced', 'build_ore_extractor_4', nexus.buildings.oreExtractor >= 4),
        tab: 'buildings',
      },
      {
        id: 'defense-posture',
        title: 'Defense Posture',
        description: 'Upgrade Shield Grid to Lv2.',
        completed: done('advanced', 'build_shield_grid_2', nexus.buildings.shieldGrid >= 2),
        tab: 'buildings',
      },
      {
        id: 'fast-raiders',
        title: 'Fast Raiders',
        description: 'Train 5 Skimmer Bikes.',
        completed: done('advanced', 'train_skimmer_bike_5', skimmerBikes >= 5),
        tab: 'troops',
      },
      {
        id: 'first-expedition',
        title: 'First Expedition',
        description: 'Launch 1 outgoing strike.',
        completed: done('advanced', 'send_first_strike', outgoingAttacks.length > 0),
        tab: 'map',
      },
    ];

    const advancedComplete = claimedBatches.has('advanced') || advancedQuests.every((quest) => quest.completed);

    const veteranQuests: IntroQuest[] = [
      {
        id: 'command-authority',
        title: 'Command Authority',
        description: 'Upgrade Command Core to Lv6.',
        completed: done('veteran', 'build_command_core_6', nexus.buildings.commandCore >= 6),
        tab: 'buildings',
      },
      {
        id: 'veteran-recruits',
        title: 'Veteran Recruits',
        description: 'Upgrade Recruitment Core to Lv5.',
        completed: done('veteran', 'build_troop_fab_5', nexus.buildings.recruitmentCore >= 5),
        tab: 'buildings',
      },
      {
        id: 'population-surge',
        title: 'Population Surge',
        description: 'Upgrade Life Support to Lv4.',
        completed: done('veteran', 'build_life_support_4', nexus.buildings.lifeSupport >= 4),
        tab: 'buildings',
      },
      {
        id: 'iron-fist',
        title: 'Iron Fist',
        description: 'Train 3 Siege Mechs.',
        completed: done('veteran', 'train_siege_mech_3', siegeMechs >= 3),
        tab: 'troops',
      },
      {
        id: 'signal-jammers',
        title: 'Signal Jammers',
        description: 'Train 5 Disruptor Units.',
        completed: done('veteran', 'train_disruptor_unit_5', disruptorUnits >= 5),
        tab: 'troops',
      },
    ];

    const veteranComplete = claimedBatches.has('veteran') || veteranQuests.every((quest) => quest.completed);

    const conquerorQuests: IntroQuest[] = [
      {
        id: 'supreme-command',
        title: 'Supreme Command',
        description: 'Upgrade Command Core to Lv8.',
        completed: done('conqueror', 'build_command_core_8', nexus.buildings.commandCore >= 8),
        tab: 'buildings',
      },
      {
        id: 'deep-extraction',
        title: 'Deep Extraction',
        description: 'Upgrade Ore Extractor to Lv8.',
        completed: done('conqueror', 'build_ore_extractor_8', nexus.buildings.oreExtractor >= 8),
        tab: 'buildings',
      },
      {
        id: 'fortress-shield',
        title: 'Fortress Shield',
        description: 'Upgrade Shield Grid to Lv5.',
        completed: done('conqueror', 'build_shield_grid_5', nexus.buildings.shieldGrid >= 5),
        tab: 'buildings',
      },
      {
        id: 'unleash-annihilator',
        title: 'Unleash Annihilator',
        description: 'Train 1 Annihilator Platform.',
        completed: done('conqueror', 'train_annihilator_1', annihilatorPlatforms >= 1),
        tab: 'troops',
      },
      {
        id: 'raid-and-pillage',
        title: 'Raid And Pillage',
        description: 'Complete 1 attack on another nexus.',
        completed: done('conqueror', 'complete_attack', false),
        tab: 'map',
      },
    ];

    const allBatches: QuestBatch[] = [
      {
        id: 'intro',
        title: 'Intro Quests',
        quests: introQuests,
        unlocked: true,
        reward: '+250 Biomass, +250 Alloy, +250 Ore, +5 Assault Troopers',
      },
      {
        id: 'intermediate',
        title: 'Intermediate Quests',
        quests: intermediateQuests,
        unlocked: introComplete,
        reward: '+900 Biomass, +900 Alloy, +900 Ore, +10 Recon Operatives',
      },
      {
        id: 'advanced',
        title: 'Advanced Quests',
        quests: advancedQuests,
        unlocked: intermediateComplete,
        reward: '+2500 Biomass, +2500 Alloy, +2500 Ore, +20 Skimmer Bikes, +5 Siege Mechs',
      },
      {
        id: 'veteran',
        title: 'Veteran Quests',
        quests: veteranQuests,
        unlocked: advancedComplete,
        reward: '+5000 Biomass, +5000 Alloy, +5000 Ore, +10 Siege Mechs, +5 Disruptor Units',
      },
      {
        id: 'conqueror',
        title: 'Conqueror Quests',
        quests: conquerorQuests,
        unlocked: veteranComplete,
        reward: '+10000 Biomass, +10000 Alloy, +10000 Ore, +1 Annihilator Platform, +10 Siege Mechs',
      },
    ];

    const conquerorComplete = claimedBatches.has('conqueror') || conquerorQuests.every((quest) => quest.completed);
    const allQuestsComplete = conquerorComplete;

    // Hide batches that have already been claimed — next tier naturally appears
    return { batches: allBatches.filter((batch) => !claimedBatches.has(batch.id)), allQuestsComplete };
  };

  const production = calculateProduction();
  const storageCapacity = getStorageAtLevel(nexus.buildings.storageVault) * (nexus.nexusType === 'Supply Cache' ? 2 : 1);

  const getResourceFillClass = (amount: number) => {
    const pct = amount / storageCapacity;
    if (pct >= 1) return 'resource-amount resource-full';
    if (pct >= 0.8) return 'resource-amount resource-near-full';
    return 'resource-amount';
  };
  const { batches: questBatches, allQuestsComplete } = getQuestBatches();
  const activeBuild = nexus.buildQueue[0];
  const activeTraining = nexus.trainingQueue[0];
  const activeBuildTimer = activeBuild ? getBuildQueueTimeDisplay(0).label : null;
  const activeTrainingTimer = activeTraining ? getTrainingQueueTimeDisplay(0).label : null;

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
                {isSavingNexusName ? '...' : '✓'}
              </button>
              <button
                type="button"
                className="nexus-rename-action cancel"
                onClick={cancelNexusRename}
                disabled={isSavingNexusName}
                title="Cancel Rename"
                aria-label="Cancel Rename"
              >
                ✕
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
                ✎
              </button>
            </>
          )}
        </div>
        {nexus.nexusType && NEXUS_TYPE_BUFFS[nexus.nexusType] && (
          <div className="nexus-type-buff-banner">
            <span className="nexus-type-buff-icon">{NEXUS_TYPE_BUFFS[nexus.nexusType].icon}</span>
            <span className="nexus-type-buff-label">
              {nexus.nexusType} — {NEXUS_TYPE_BUFFS[nexus.nexusType].label}
            </span>
          </div>
        )}
        <div className="resources">
          <div className="resource" title="Biomass">
            <span className="resource-icon">🧬</span>
            <span className={getResourceFillClass(nexus.resources.biomass)}>
              <span className="resource-main">
                {Math.floor(nexus.resources.biomass).toLocaleString()}
                <span className="resource-max">
                  /{storageCapacity.toLocaleString()}
                  {nexus.nexusType === 'Supply Cache' && <span className="buff-tag">2x</span>}
                </span>
              </span>
              <span className="production-rate">
                +{Math.floor(production.biomass).toLocaleString()}/h
                {nexus.nexusType === 'Resource Depot' && <span className="buff-tag">2x</span>}
              </span>
            </span>
          </div>
          <div className="resource" title="Alloy">
            <span className="resource-icon">⚙️</span>
            <span className={getResourceFillClass(nexus.resources.alloy)}>
              <span className="resource-main">
                {Math.floor(nexus.resources.alloy).toLocaleString()}
                <span className="resource-max">
                  /{storageCapacity.toLocaleString()}
                  {nexus.nexusType === 'Supply Cache' && <span className="buff-tag">2x</span>}
                </span>
              </span>
              <span className="production-rate">
                +{Math.floor(production.alloy).toLocaleString()}/h
                {nexus.nexusType === 'Resource Depot' && <span className="buff-tag">2x</span>}
              </span>
            </span>
          </div>
          <div className="resource" title="Ore">
            <span className="resource-icon">💎</span>
            <span className={getResourceFillClass(nexus.resources.ore)}>
              <span className="resource-main">
                {Math.floor(nexus.resources.ore).toLocaleString()}
                <span className="resource-max">
                  /{storageCapacity.toLocaleString()}
                  {nexus.nexusType === 'Supply Cache' && <span className="buff-tag">2x</span>}
                </span>
              </span>
              <span className="production-rate">
                +{Math.floor(production.ore).toLocaleString()}/h
                {nexus.nexusType === 'Resource Depot' && <span className="buff-tag">2x</span>}
              </span>
            </span>
          </div>
          <div className="resource" title="Population">
            <span className="resource-icon">👥</span>
            <span className="resource-amount">
              {nexus.population.current}/{nexus.population.max}
            </span>
          </div>
        </div>
      </div>

      <div className="nexus-tab-bar">
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'overview' ? ' active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          🏛️ Overview
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'buildings' ? ' active' : ''}`}
          onClick={() => setActiveTab('buildings')}
        >
          🏗️ Buildings
          {activeBuild && <span className="nexus-tab-badge" />}
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'troops' ? ' active' : ''}`}
          onClick={() => setActiveTab('troops')}
        >
          🎖️ Troops
          {activeTraining && <span className="nexus-tab-badge" />}
        </button>
        <button
          type="button"
          className={`nexus-tab-btn${activeTab === 'map' ? ' active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          🌌 Starfield
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <NexusMap nexus={nexus} onClickBuilding={() => setActiveTab('buildings')} />
            <div className="nexus-overview-meta">
              <span>
                📍 ({nexus.x}|{nexus.y})
              </span>
              <span>📊 {nexus.points} inf</span>
              {nexus.controlLevel !== undefined && <span>🛡️ {nexus.controlLevel}/100 ctrl</span>}
            </div>

            {nexus.newbieProtectionEndsAt && new Date(nexus.newbieProtectionEndsAt) > currentTime && (
              <div className="newbie-protection-banner">
                <span className="newbie-protection-icon">🛡️</span>
                <span className="newbie-protection-text">
                  Newbie Protection — expires in{' '}
                  <strong>{formatTime(nexus.newbieProtectionEndsAt)}</strong>
                </span>
              </div>
            )}

            <div className="overview-shortcuts">
              <button type="button" className="overview-shortcut-card" onClick={() => setActiveTab('buildings')}>
                <span className="overview-shortcut-title">🏗️ Construction</span>
                <span className="overview-shortcut-status">
                  {activeBuild ? 'Active upgrade in progress' : 'No active construction'}
                </span>
                <span className="overview-shortcut-subtitle">
                  {activeBuild
                    ? `${BUILDING_NAMES[activeBuild.building] || activeBuild.building} → Lv${activeBuild.targetLevel} • ${activeBuildTimer}`
                    : 'Open Buildings'}
                </span>
              </button>
              <button type="button" className="overview-shortcut-card" onClick={() => setActiveTab('troops')}>
                <span className="overview-shortcut-title">🎖️ Training</span>
                <span className="overview-shortcut-status">
                  {activeTraining ? 'Troops are being trained' : 'No active training'}
                </span>
                <span className="overview-shortcut-subtitle">
                  {activeTraining
                    ? `${activeTraining.amount}x ${TROOP_NAMES[activeTraining.troopType] || activeTraining.troopType} • ${activeTrainingTimer}`
                    : 'Open Troops'}
                </span>
              </button>
              <div className="overview-shortcut-card overview-strikes-card">
                <span className="overview-shortcut-title">⚔️ Strikes</span>
                <div className="strikes-card-split">
                  <div className="strikes-card-half">
                    <span className="strikes-card-label">Outgoing</span>
                    {outgoingAttacks.length > 0 ? (
                      <div className="strikes-card-list">
                        {outgoingAttacks.map((a: any) => (
                          <div key={a._id} className="strikes-card-entry">
                            <span className="strikes-card-entry-who">
                              {a.status === 'returning' ? '↩ ' : ''}{a.defender?.nexus?.name ?? '?'}
                            </span>
                            <span className="strikes-card-entry-time">
                              {formatTime(a.status === 'returning' ? a.returnsAt : a.arrivesAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="strikes-card-value">No outgoing strikes</span>
                    )}
                  </div>
                  <div className="strikes-card-divider" />
                  <div className="strikes-card-half">
                    <span className="strikes-card-label">Incoming</span>
                    {incomingAttacks.length > 0 ? (
                      <div className="strikes-card-list">
                        {incomingAttacks.map((a: any) => (
                          <div key={a._id} className="strikes-card-entry">
                            <span className="strikes-card-entry-who">
                              {a.attacker?.user?.username ?? '?'} · {a.attacker?.nexus?.name ?? '?'}
                            </span>
                            <span className="strikes-card-entry-time">{formatTime(a.arrivesAt)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="strikes-card-value">No incoming strikes</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {nexus.buildQueue.length > 0 && (
              <div className="overview-queue-summary">
                <div className="overview-queue-summary-info">
                  <span className="overview-queue-summary-label">🏗️ Building Queue</span>
                  <span className="overview-queue-summary-detail">
                    {nexus.buildQueue.length} item{nexus.buildQueue.length !== 1 ? 's' : ''} —{' '}
                    {BUILDING_NAMES[nexus.buildQueue[0].building] || nexus.buildQueue[0].building} → Lv{nexus.buildQueue[0].targetLevel}
                    {activeBuildTimer ? ` · ${activeBuildTimer}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="overview-queue-manage-btn"
                  onClick={() => setActiveTab('buildings')}
                >
                  Manage →
                </button>
              </div>
            )}

            {nexus.trainingQueue.length > 0 && (
              <div className="overview-queue-summary">
                <div className="overview-queue-summary-info">
                  <span className="overview-queue-summary-label">🎖️ Training Queue</span>
                  <span className="overview-queue-summary-detail">
                    {nexus.trainingQueue.length} item{nexus.trainingQueue.length !== 1 ? 's' : ''} —{' '}
                    {nexus.trainingQueue[0].amount}x {TROOP_NAMES[nexus.trainingQueue[0].troopType] || nexus.trainingQueue[0].troopType}
                    {activeTrainingTimer ? ` · ${activeTrainingTimer}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="overview-queue-manage-btn"
                  onClick={() => setActiveTab('troops')}
                >
                  Manage →
                </button>
              </div>
            )}

            {questBatches.map((batch) => {
              const completedCount = batch.quests.filter((quest) => quest.completed).length;

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
                    batch.quests.map((quest) => (
                      <div
                        key={quest.id}
                        className={`intro-quest-item ${quest.completed ? 'completed' : 'quest-actionable'}`}
                        onClick={() => !quest.completed && setActiveTab(quest.tab)}
                      >
                        <span className="intro-quest-icon">{quest.completed ? '✅' : '⬜'}</span>
                        <div className="intro-quest-content">
                          <p className="intro-quest-title">{quest.title}</p>
                          <p className="intro-quest-description">{quest.description}</p>
                        </div>
                        {!quest.completed && (
                          <span className="intro-quest-arrow">
                            → {quest.tab === 'buildings' ? 'Buildings' : quest.tab === 'troops' ? 'Troops' : 'Starfield'}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="quest-batch-lock-note">Complete the previous quest batch to unlock this one.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'buildings' && (
          <div className="buildings-tab">
            <h3>Buildings</h3>

            {!allQuestsComplete && nexus.buildings.commandCore < 1 && !dismissedTips.has('tip-command-core') && (
              <div className="noob-tip">
                <span className="noob-tip-icon">💡</span>
                <span className="noob-tip-text">
                  <strong>Start here:</strong> Upgrade <em>Command Core</em> to Lv1 to power your Nexus and unlock progression.
                </span>
                <button type="button" className="noob-tip-dismiss" onClick={() => dismissTip('tip-command-core')} aria-label="Dismiss tip">✕</button>
              </div>
            )}
            {!allQuestsComplete && nexus.buildings.commandCore >= 1 && nexus.buildings.recruitmentCore < 1 && !dismissedTips.has('tip-recruitment-core') && (
              <div className="noob-tip">
                <span className="noob-tip-icon">💡</span>
                <span className="noob-tip-text">
                  <strong>Next up:</strong> Upgrade <em>Recruitment Core</em> to Lv1 to unlock troop training.
                </span>
                <button type="button" className="noob-tip-dismiss" onClick={() => dismissTip('tip-recruitment-core')} aria-label="Dismiss tip">✕</button>
              </div>
            )}
            {!allQuestsComplete && nexus.buildings.storageVault < 2 && nexus.buildings.commandCore >= 1 && !dismissedTips.has('tip-storage-vault') && (
              <div className="noob-tip">
                <span className="noob-tip-icon">💡</span>
                <span className="noob-tip-text">
                  <strong>Tip:</strong> Upgrade <em>Storage Vault</em> to Lv2 to secure higher resource capacity.
                </span>
                <button type="button" className="noob-tip-dismiss" onClick={() => dismissTip('tip-storage-vault')} aria-label="Dismiss tip">✕</button>
              </div>
            )}

            {nexus.buildQueue.length > 0 && (
              <div className="queue-section">
                <h4>Building Queue</h4>
                {nexus.buildQueue.map((item, idx) => {
                  const queueTime = getBuildQueueTimeDisplay(idx);

                  return (
                    <div key={idx} className={`queue-item ${queueTime.isWaiting ? 'queue-item-waiting' : ''}`}>
                      <span>
                        {BUILDING_NAMES[item.building]} → Level {item.targetLevel}
                      </span>
                      <div className="queue-item-actions">
                        <span className={queueTime.isWaiting ? 'queue-time-queued' : 'queue-time'}>
                          {queueTime.label}
                        </span>
                        <button
                          type="button"
                          className="queue-cancel-btn"
                          onClick={() => handleCancelBuildQueue(idx)}
                          title="Cancel (85% refund)"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="buildings-grid">
              {Object.entries(nexus.buildings).map(([key, level]) => {
                const queuedForBuilding = nexus.buildQueue.filter((item) => item.building === key).length;
                const firstQueuedForBuilding = nexus.buildQueue.find((item) => item.building === key);
                const firstQueuedForBuildingIndex = nexus.buildQueue.findIndex((item) => item.building === key);
                const plannedLevel = level + queuedForBuilding;
                const isUpgrading = nexus.buildQueue.some((item) => item.building === key);
                const maxLevel = BUILDING_RULES[key]?.maxLevel || 0;
                const isAtMax = plannedLevel >= maxLevel;
                const cost = isAtMax ? null : getBuildingCost(key, plannedLevel);
                const upgradeBenefit = isAtMax ? 'Maximum level reached' : getBuildingUpgradeBenefit(key, plannedLevel);
                const { canUpgrade, missingRequirements, atMax } = checkBuildingRequirements(key);
                const isBuildQueueFull = nexus.buildQueue.length >= MAX_BUILD_QUEUE;
                const hasResources =
                  !cost ||
                  (nexus.resources.biomass >= cost.biomass &&
                    nexus.resources.alloy >= cost.alloy &&
                    nexus.resources.ore >= cost.ore);
                const isDisabled = isBuildQueueFull || !canUpgrade || atMax || !hasResources;
                return (
                  <div
                    key={key}
                    className={`building-card ${isUpgrading ? 'upgrading' : ''} ${isAtMax ? 'maxed' : isDisabled ? 'disabled' : ''}`}
                  >
                    {BUILDING_IMAGES[key] && (
                      <img
                        src={BUILDING_IMAGES[key].src || BUILDING_IMAGES[key]}
                        alt={BUILDING_NAMES[key]}
                        className="building-card-image"
                      />
                    )}
                    <div className="building-header">
                      <h4>{BUILDING_NAMES[key]}</h4>
                      <button
                        type="button"
                        className="building-info"
                        title={BUILDING_DESCRIPTIONS[key]}
                        aria-label={`${BUILDING_NAMES[key]} info`}
                        onClick={() => handleInfoTap(BUILDING_NAMES[key], BUILDING_DESCRIPTIONS[key])}
                      >
                        ℹ️
                      </button>
                    </div>
                    <p>
                      Level: {level} / {maxLevel}
                    </p>
                    {!isAtMax && <p className="building-benefit">{upgradeBenefit}</p>}
                    {isUpgrading && (
                      <div className="upgrading-status">
                        <span className="upgrading-badge">⚙️ Upgrading...</span>
                        {firstQueuedForBuilding && (
                          <span
                            className={
                              firstQueuedForBuildingIndex > 0
                                ? 'queue-time-small queue-time-queued'
                                : 'queue-time-small'
                            }
                          >
                            {getBuildQueueTimeDisplay(firstQueuedForBuildingIndex).label}
                          </span>
                        )}
                      </div>
                    )}
                    {cost ? (
                      <div className="building-cost">
                        <div className="cost-details">
                          <span>🧬 {fmtNum(cost.biomass)}</span>
                          <span>⚙️ {fmtNum(cost.alloy)}</span>
                          <span>💎 {fmtNum(cost.ore)}</span>
                        </div>
                        <p className="build-time">
                          ⏱️{' '}
                          {cost.time >= 3600
                            ? `${Math.floor(cost.time / 3600)}h ${Math.floor((cost.time % 3600) / 60)}m ${cost.time % 60}s`
                            : `${Math.floor(cost.time / 60)}m ${cost.time % 60}s`}
                        </p>
                      </div>
                    ) : (
                      <div className="building-maxed-banner">
                        <span className="maxed-badge">🏁 MAX LEVEL</span>
                      </div>
                    )}
                    {!isAtMax && isBuildQueueFull && (
                      <div className="requirements-missing">
                        <p className="requires-label">🔒 Queue Full:</p>
                        <p className="requirement-item">• Build queue limit reached ({MAX_BUILD_QUEUE})</p>
                      </div>
                    )}
                    {!isAtMax && !canUpgrade && (
                      <div className="requirements-missing">
                        <p className="requires-label">🔒 Requires:</p>
                        {missingRequirements.map((req, idx) => (
                          <p key={idx} className="requirement-item">
                            • {req}
                          </p>
                        ))}
                      </div>
                    )}
                    {!hasResources && cost && canUpgrade && (() => {
                      const eta = getTimeUntilAffordable(cost);
                      return (
                        <div className="requirements-missing insuff-resources">
                          <p className="requires-label">⚠️ Insufficient Resources:</p>
                          {nexus.resources.biomass < cost.biomass && (
                            <p className="requirement-item">
                              • Biomass: {Math.floor(nexus.resources.biomass)}/{cost.biomass}
                            </p>
                          )}
                          {nexus.resources.alloy < cost.alloy && (
                            <p className="requirement-item">
                              • Alloy: {Math.floor(nexus.resources.alloy)}/{cost.alloy}
                            </p>
                          )}
                          {nexus.resources.ore < cost.ore && (
                            <p className="requirement-item">
                              • Ore: {Math.floor(nexus.resources.ore)}/{cost.ore}
                            </p>
                          )}
                          {eta !== null && (
                            <p className="requirement-item resource-eta">
                              ⏱️ Ready in {formatDurationSeconds(eta)}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {!isAtMax && (
                      <button
                        className="building-upgrade-button"
                        onClick={() => handleUpgrade(key)}
                        disabled={isDisabled}
                      >
                        Upgrade
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'troops' && (
          <div className="troops-tab">
            <h3>Troops</h3>

            {!allQuestsComplete && nexus.buildings.recruitmentCore >= 1 && (nexus.troops.assaultTrooper || 0) < 5 && !dismissedTips.has('tip-assault-troopers') && (
              <div className="noob-tip">
                <span className="noob-tip-icon">💡</span>
                <span className="noob-tip-text">
                  <strong>Field your first force:</strong> Train at least <em>5 Assault Troopers</em> to complete your intro quest.
                </span>
                <button type="button" className="noob-tip-dismiss" onClick={() => dismissTip('tip-assault-troopers')} aria-label="Dismiss tip">✕</button>
              </div>
            )}

            {nexus.buildings.recruitmentCore === 0 ? (
              <p>Build a Recruitment Core to train troops!</p>
            ) : (
              <>
                {nexus.trainingQueue.length > 0 && (
                  <div className="queue-section">
                    <h4>🔨 Training Queue</h4>
                    {nexus.trainingQueue.map((item, idx) => {
                      const queueTime = getTrainingQueueTimeDisplay(idx);

                      return (
                        <div key={idx} className={`queue-item ${queueTime.isWaiting ? 'queue-item-waiting' : ''}`}>
                          <span>
                            {item.amount}x {TROOP_NAMES[item.troopType] || item.troopType}
                          </span>
                          <div className="queue-item-actions">
                            <span className={queueTime.isWaiting ? 'queue-time-queued' : 'queue-time'}>
                              {queueTime.label}
                            </span>
                            <button
                              type="button"
                              className="queue-cancel-btn"
                              onClick={() => handleCancelTrainingQueue(idx)}
                              title="Cancel (85% refund)"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="troops-train">
                  <h4>Train Troops</h4>
                  {(['offense', 'defense'] as const).map((category) => {
                    const categoryTroops = Object.entries(TROOP_COSTS).filter(
                      ([type]) => TROOP_CATEGORIES[type] === category,
                    );
                    return (
                      <div key={category} className="troop-category-section">
                        <h4 className={`troop-category-heading troop-category-${category}`}>
                          {category === 'offense' ? '⚔️ Offense' : '🛡️ Defense'}
                        </h4>
                        <div className="train-grid">
                          {categoryTroops.map(([type, costs]) => {
                            const { canTrain, missingRequirements } = checkTroopRequirements(type);
                            const { maxTrainable, shortageReasons } = getMaxTrainableAmount(type, costs, canTrain);
                            const trainSeconds = canTrain
                              ? getTroopTrainSeconds(
                                  type,
                                  costs.time,
                                  nexus.buildings.recruitmentCore,
                                  nexus.nexusType,
                                )
                              : costs.time;
                            const isOverseerTrack = type === 'overseer';
                            const sameChainQueueLength = nexus.trainingQueue.filter((entry: any) =>
                              isOverseerTrack ? entry.troopType === 'overseer' : entry.troopType !== 'overseer',
                            ).length;
                            const isTrainingQueueFull = sameChainQueueLength >= MAX_TRAINING_QUEUE;
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
                                      onClick={() => handleInfoTap(TROOP_NAMES[type], TROOP_DESCRIPTIONS[type])}
                                    >
                                      ℹ️
                                    </button>
                                  </div>
                                </div>
                                <div className="train-costs">
                                  <span>🧬 {costs.biomass}</span>
                                  <span>⚙️ {costs.alloy}</span>
                                  <span>💎 {costs.ore}</span>
                                  <span>👥 {costs.population}</span>
                                  <p className="train-time">
                                    ⏱️{' '}
                                    {trainSeconds >= 3600
                                      ? `${Math.floor(trainSeconds / 3600)}h ${Math.floor((trainSeconds % 3600) / 60)}m ${trainSeconds % 60}s`
                                      : `${Math.floor(trainSeconds / 60)}m ${trainSeconds % 60}s`}
                                  </p>
                                </div>
                                {isTrainingQueueFull && (
                                  <div className="requirements-missing">
                                    <p className="requires-label">🔒 Queue Full:</p>
                                    <p className="requirement-item">
                                      • Training queue limit reached ({MAX_TRAINING_QUEUE})
                                    </p>
                                  </div>
                                )}
                                {!canTrain && (
                                  <div className="requirements-missing">
                                    <p className="requires-label">🔒 Requires:</p>
                                    {missingRequirements.map((req, idx) => (
                                      <p key={idx} className="requirement-item">
                                        • {req}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {canTrain && !isTrainingQueueFull && shortageReasons.length > 0 && (() => {
                                  const eta = getTimeUntilAffordable(costs);
                                  return (
                                    <div className="requirements-missing">
                                      <p className="requires-label">⚠️ Not enough resources:</p>
                                      {shortageReasons.map((reason, idx) => (
                                        <p key={idx} className="requirement-item">
                                          • {reason}
                                        </p>
                                      ))}
                                      {eta !== null && (
                                        <p className="requirement-item resource-eta">
                                          ⏱️ Ready in {formatDurationSeconds(eta)}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
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
                                      value={trainAmount[type] ?? ''}
                                      onChange={(e) => handleTrainAmountChange(type, e.target.value)}
                                      aria-label={`${TROOP_NAMES[type]} amount`}
                                      disabled={isTrainDisabled}
                                    />
                                    <button onClick={() => handleTrainTroops(type)} disabled={isTrainDisabled}>
                                      Train
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Troop transfers display */}
                {troopTransfers.length > 0 && (
                  <div className="borrowed-troops-section">
                    <h4>Troop Transfers</h4>
                    {troopTransfers.map((t) => {
                      const isOwner = t.ownerNexusId === nexus._id;
                      const troopEntries = Object.entries(t.troops).filter(([, v]) => Number(v) > 0);

                      let statusLabel: string;
                      let countdown: string | null = null;
                      if (t.status === 'traveling' && t.arrivesAt) {
                        statusLabel = isOwner
                          ? `→ ${t.hostNexus?.name ?? '?'}`
                          : `From ${t.ownerNexus?.name ?? '?'} arriving`;
                        countdown = formatTime(t.arrivesAt);
                      } else if (t.status === 'returning' && t.returnsAt) {
                        statusLabel = isOwner
                          ? `← Returning from ${t.hostNexus?.name ?? '?'}`
                          : `Returning to ${t.ownerNexus?.name ?? '?'}`;
                        countdown = formatTime(t.returnsAt);
                      } else {
                        statusLabel = isOwner
                          ? `Stationed at ${t.hostNexus?.name ?? '?'}`
                          : `From ${t.ownerNexus?.name ?? '?'}`;
                      }

                      return (
                        <div key={t._id} className={`borrowed-entry borrowed-entry-${t.status}`}>
                          <div className="borrowed-label">
                            {statusLabel}
                            {countdown && <span className="borrowed-countdown"> · {countdown}</span>}
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
              </>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <div className="map-tab">
            <StarfieldMap currentNexus={nexus} onRefresh={onUpdate} />
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {infoModal && (
        <div className="attack-modal-overlay" onClick={() => setInfoModal(null)}>
          <div className="attack-modal info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attack-modal-header">
              <h3>{infoModal.title}</h3>
              <button className="close-btn" onClick={() => setInfoModal(null)}>
                ✕
              </button>
            </div>
            <div className="attack-modal-content">
              <div className="attack-info-section info-modal-body">
                <p>{infoModal.description}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAttack && (
        <div className="attack-modal-overlay" onClick={() => setSelectedAttack(null)}>
          <div className="attack-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attack-modal-header">
              <h3>⚔️ Strike Details</h3>
              <button className="close-btn" onClick={() => setSelectedAttack(null)}>
                ✕
              </button>
            </div>
            <div className="attack-modal-content">
              <div className="attack-info-section">
                <h4>Target</h4>
                <p>
                  {selectedAttack.defender?.nexus?.name || 'Unknown'}({selectedAttack.defender?.nexus?.x || '?'}|
                  {selectedAttack.defender?.nexus?.y || '?'})
                </p>
              </div>

              <div className="attack-info-section">
                <h4>⏱️ Arrival Time</h4>
                <p className="arrival-countdown">{formatTime(selectedAttack.arrivesAt)}</p>
              </div>

              <div className="attack-info-section">
                <h4>🎖️ Troops Sent</h4>
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
                <h4>📋 Mission Type</h4>
                <p>
                  {selectedAttack.type === 'attack'
                    ? '⚔️ Attack'
                    : selectedAttack.type === 'support'
                      ? '🛡️ Support'
                      : '🔍 Scout'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NexusView;
