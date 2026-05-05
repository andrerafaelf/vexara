import React, { useEffect, useRef, useState } from 'react';
import {
  cancelBuildQueueItem,
  cancelTrainingQueueItem,
  checkBuildQueue,
  checkTrainingQueue,
  getIncomingAttacks,
  getOutgoingAttacks,
  renameNexus,
  trainTroops,
  upgradeBuilding,
} from '../services/api';
import '../styles/NexusView.css';
import { Nexus } from '../types/game';
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
}

type NexusTab = 'overview' | 'buildings' | 'troops' | 'map';

const MAX_BUILD_QUEUE = 5;
const MAX_TRAINING_QUEUE = 5;

const BUILDING_NAMES: { [key: string]: string } = {
  commandCore: 'Command Core',
  troopFabricator: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
};

const BUILDING_DESCRIPTIONS: { [key: string]: string } = {
  commandCore: 'Unlocks new buildings, units, and progression milestones. Required for nexus expansion.',
  troopFabricator: 'Allows training of combat units. Higher levels reduce training time.',
  lifeSupport: 'Increases maximum population capacity for housing more troops and workers.',
  storageVault: 'Increases resource storage capacity. Protects resources from raids.',
  biomassFarm: 'Produces Biomass per hour. Higher levels increase production rate.',
  alloyForge: 'Produces Alloy per hour. Higher levels increase production rate.',
  oreExtractor: 'Produces Ore per hour. Higher levels increase production rate.',
  shieldGrid: 'Increases defensive bonus. Protects your nexus from enemy attacks.',
};

const BUILDING_COSTS: { [key: string]: any } = {
  commandCore: { biomass: 90, alloy: 80, ore: 70, time: 45 },
  troopFabricator: { biomass: 200, alloy: 170, ore: 90, time: 75 },
  lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 60 },
  storageVault: { biomass: 60, alloy: 50, ore: 40, time: 45 },
  biomassFarm: { biomass: 50, alloy: 60, ore: 40, time: 45 },
  alloyForge: { biomass: 65, alloy: 40, ore: 40, time: 45 },
  oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 60 },
  shieldGrid: { biomass: 50, alloy: 100, ore: 20, time: 75 },
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
  troopFabricator: {
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
      { level: 6, requires: [{ building: 'troopFabricator', level: 2 }] },
      { level: 10, requires: [{ building: 'lifeSupport', level: 5 }] },
    ],
  },
  alloyForge: {
    maxLevel: 15,
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

const BUILDING_IMAGES: { [key: string]: any } = {
  commandCore: commandcoreImg,
  troopFabricator: recruitmentcoreImg,
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
    'Anti-vehicle defensive unit. Autonomous unit equipped with precision lances, optimized to intercept fast attackers and hold defensive lines. Requires Lv2 Recruitment Core, 5 Assault Troopers.',
  breakerUnit:
    'Heavy assault unit. Armored shock unit designed to breach defenses and deal high structural and troop damage. Requires Lv2 Recruitment Core, Lv2 Ore Extractor, 10 Assault Troopers.',
  reconOperative:
    'Scout & intelligence unit. Fast, lightly equipped operative used to gather intelligence, scan enemy nexuses, and detect incoming forces. Requires Lv3 Recruitment Core, 5 Assault Troopers, 5 Lancer Drones.',
  skimmerBike:
    'Fast raid unit. High-speed hover bike used for quick strikes, resource extraction, and rapid retreats. Requires Lv3 Recruitment Core, Lv3 Alloy Forge, 20 Assault Troopers, 10 Lancer Drones.',
  siegeMech:
    'Heavy siege unit. Massive mechanized unit specialized in destroying fortifications and shield grids. Requires Lv4 Recruitment Core, Lv4 Ore Extractor, 30 Assault Troopers, 10 Breaker Units.',
  bulwarkGuard:
    'Elite defensive infantry. Heavily shielded unit deployed to significantly strengthen nexus defenses. Requires Lv3 Recruitment Core, Lv5 Life Support.',
  suppressorTeam:
    'Ranged support unit. Long-range fireteam that weakens enemy forces before direct engagement. Requires Lv3 Recruitment Core, Lv3 Command Core.',
  disruptorUnit:
    'Anti-armor & anti-mech unit. Specialized unit using EMP weapons to counter heavy units and machinery. Requires Lv4 Recruitment Core.',
  interceptorBike:
    'Rapid response unit. Extremely fast unit used to chase scouts, reinforce nearby nexuses, or intercept raids. Requires Lv4 Recruitment Core, 50 Skimmer Bikes.',
  annihilatorPlatform:
    'Heavy artillery unit. Slow but devastating artillery platform capable of inflicting massive damage. Requires Lv6 Recruitment Core, Lv6 Command Core.',
  overseer:
    'Conquest & control unit. Non-combat command unit required to reduce Control Level and permanently capture enemy nexuses. Requires Lv5 Recruitment Core, Lv3 Command Core, Lv2 Shield Grid. Up to 3 per nexus.',
};

const TROOP_REQUIREMENTS: { [key: string]: any } = {
  assaultTrooper: { buildings: { troopFabricator: 1 } },
  lancerDrone: { buildings: { troopFabricator: 2 } },
  breakerUnit: { buildings: { troopFabricator: 3, oreExtractor: 3 } },
  reconOperative: { buildings: { troopFabricator: 3, commandCore: 2 } },
  skimmerBike: { buildings: { troopFabricator: 4, alloyForge: 4 } },
  siegeMech: { buildings: { troopFabricator: 5, oreExtractor: 5 } },
  bulwarkGuard: { buildings: { troopFabricator: 4, lifeSupport: 6 } },
  suppressorTeam: { buildings: { troopFabricator: 4, commandCore: 4 } },
  disruptorUnit: { buildings: { troopFabricator: 5, oreExtractor: 4 } },
  interceptorBike: { buildings: { troopFabricator: 6, alloyForge: 5 } },
  annihilatorPlatform: { buildings: { troopFabricator: 7, commandCore: 6 } },
  overseer: { buildings: { troopFabricator: 9, commandCore: 8, shieldGrid: 6 }, maxPerNexus: 3 },
};

const POPULATION_BASE = 100;
const POPULATION_GROWTH = 1.27;
const STORAGE_BASE = 1000;
const STORAGE_GROWTH = 1.3;
const SHIELD_BONUS_PER_LEVEL = 0.02;

const TROOP_COSTS: { [key: string]: any } = {
  assaultTrooper: { biomass: 30, alloy: 30, ore: 70, population: 1, time: 79 },
  lancerDrone: { biomass: 50, alloy: 30, ore: 10, population: 1, time: 53 },
  breakerUnit: { biomass: 60, alloy: 30, ore: 40, population: 1, time: 74 },
  reconOperative: { biomass: 100, alloy: 30, ore: 60, population: 1, time: 84 },
  skimmerBike: { biomass: 125, alloy: 100, ore: 150, population: 3, time: 131 },
  siegeMech: { biomass: 125, alloy: 100, ore: 250, population: 4, time: 600 },
  bulwarkGuard: { biomass: 80, alloy: 120, ore: 100, population: 2, time: 105 },
  suppressorTeam: { biomass: 90, alloy: 80, ore: 90, population: 2, time: 114 },
  disruptorUnit: { biomass: 110, alloy: 150, ore: 130, population: 2, time: 123 },
  interceptorBike: { biomass: 150, alloy: 120, ore: 180, population: 3, time: 140 },
  annihilatorPlatform: { biomass: 200, alloy: 180, ore: 300, population: 5, time: 900 },
  overseer: { biomass: 300, alloy: 250, ore: 200, population: 5, time: 1800 },
};

const TROOP_CATEGORIES: Record<string, 'offense' | 'defense'> = {
  assaultTrooper: 'offense',
  breakerUnit: 'offense',
  reconOperative: 'offense',
  skimmerBike: 'offense',
  siegeMech: 'offense',
  interceptorBike: 'offense',
  annihilatorPlatform: 'offense',
  overseer: 'offense',
  lancerDrone: 'defense',
  bulwarkGuard: 'defense',
  suppressorTeam: 'defense',
  disruptorUnit: 'defense',
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

const NexusView: React.FC<NexusViewProps> = ({ nexus, onUpdate, initialTab = 'overview' }) => {
  const [activeTab, setActiveTab] = useState<NexusTab>(initialTab);
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
  const submittingRef = useRef<Set<string>>(new Set());

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
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkQueues();
      loadAttacks();
    }, 15000);
    loadAttacks();
    return () => clearInterval(interval);
  }, [nexus]);

  useEffect(() => {
    if (!isRenamingNexus) {
      setRenameValue(nexus.name);
    }
  }, [isRenamingNexus, nexus.name]);

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

    if (nexus.trainingQueue.length >= MAX_TRAINING_QUEUE) {
      showToast(`Training queue is full (${MAX_TRAINING_QUEUE}/${MAX_TRAINING_QUEUE})`, 'error');
      submittingRef.current.delete(key);
      return;
    }

    const requirementsResult = checkTroopRequirements(troopType);
    const maxTrainable = getMaxTrainableAmount(troopType, TROOP_COSTS[troopType], requirementsResult.canTrain);
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

    if (index > 0) {
      const startsAt = new Date(queue[index - 1].completesAt).getTime();
      // The per-entry duration naturally includes amount > 1 because completesAt is batch-based.
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
          missing.push(`${BUILDING_NAMES[building]} Lv${level}`);
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
    if (!canTrain) return 0;

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

    return maxTrainable;
  };

  const calculateProduction = () => {
    const baseProduction = 600;
    return {
      biomass: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.biomassFarm - 1)),
      alloy: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.alloyForge - 1)),
      ore: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.oreExtractor - 1)),
    };
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

    return {
      biomass: Math.floor(biomass),
      alloy: Math.floor(alloy),
      ore: Math.floor(ore),
      time: Math.floor(time),
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
      case 'troopFabricator': {
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
      if ((plannedBuildings as any)[requirement.building] < requirement.level) {
        missing.push(`${BUILDING_NAMES[requirement.building]} Lv${requirement.level}`);
      }
    }

    return { canUpgrade: missing.length === 0, missingRequirements: missing, atMax: false };
  };

  const getQuestBatches = (): QuestBatch[] => {
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
        completed: done('intro', 'build_troop_fab_1', nexus.buildings.troopFabricator >= 1),
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
        completed: done('veteran', 'build_troop_fab_5', nexus.buildings.troopFabricator >= 5),
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

    // Hide batches that have already been claimed — next tier naturally appears
    return allBatches.filter((batch) => !claimedBatches.has(batch.id));
  };

  const production = calculateProduction();
  const storageCapacity = Math.floor(1000 * Math.pow(1.3, nexus.buildings.storageVault));
  const questBatches = getQuestBatches();
  const currentTroops = Object.entries(nexus.troops).filter(([, count]) => Number(count) > 0);
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
        <div className="resources">
          <div className="resource" title="Biomass">
            <span className="resource-icon">🧬</span>
            <span className="resource-amount">
              <span className="resource-main">
                {Math.floor(nexus.resources.biomass).toLocaleString()}
                <span className="resource-max">/{storageCapacity.toLocaleString()}</span>
              </span>
              <span className="production-rate">+{production.biomass}/h</span>
            </span>
          </div>
          <div className="resource" title="Alloy">
            <span className="resource-icon">⚙️</span>
            <span className="resource-amount">
              <span className="resource-main">
                {Math.floor(nexus.resources.alloy).toLocaleString()}
                <span className="resource-max">/{storageCapacity.toLocaleString()}</span>
              </span>
              <span className="production-rate">+{production.alloy}/h</span>
            </span>
          </div>
          <div className="resource" title="Ore">
            <span className="resource-icon">💎</span>
            <span className="resource-amount">
              <span className="resource-main">
                {Math.floor(nexus.resources.ore).toLocaleString()}
                <span className="resource-max">/{storageCapacity.toLocaleString()}</span>
              </span>
              <span className="production-rate">+{production.ore}/h</span>
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

      {activeTab !== 'overview' && (
        <div className="tab-back-nav">
          <button type="button" className="tab-back-btn" onClick={() => setActiveTab('overview')}>
            ← Back to Nexus Overview
          </button>
        </div>
      )}

      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <NexusMap nexus={nexus} onClickBuilding={() => setActiveTab('buildings')} />
            <div className="nexus-overview-meta">
              <span>
                📍 ({nexus.x}|{nexus.y})
              </span>
              <span>📊 {nexus.points} inf</span>
            </div>

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
                            <span className="strikes-card-entry-who">{a.defender?.nexus?.name ?? '?'}</span>
                            <span className="strikes-card-entry-time">{formatTime(a.arrivesAt)}</span>
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

            {nexus.trainingQueue.length > 0 && (
              <div className="queue-section">
                <h4>Training Queue</h4>
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
                        {!quest.completed && <span className="intro-quest-arrow">›</span>}
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
                    className={`building-card ${isUpgrading ? 'upgrading' : ''} ${isDisabled ? 'disabled' : ''}`}
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
                    <p className="building-benefit">{upgradeBenefit}</p>
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
                          <span>🧬 {cost.biomass}</span>
                          <span>⚙️ {cost.alloy}</span>
                          <span>💎 {cost.ore}</span>
                        </div>
                        <p className="build-time">
                          ⏱️ {Math.floor(cost.time / 60)}m {cost.time % 60}s
                        </p>
                      </div>
                    ) : (
                      <div className="building-cost">
                        <p className="build-time">🏁 Max level reached</p>
                      </div>
                    )}
                    {isBuildQueueFull && (
                      <div className="requirements-missing">
                        <p className="requires-label">🔒 Queue Full:</p>
                        <p className="requirement-item">• Build queue limit reached ({MAX_BUILD_QUEUE})</p>
                      </div>
                    )}
                    {!canUpgrade && (
                      <div className="requirements-missing">
                        <p className="requires-label">🔒 Requires:</p>
                        {missingRequirements.map((req, idx) => (
                          <p key={idx} className="requirement-item">
                            • {req}
                          </p>
                        ))}
                      </div>
                    )}
                    {!hasResources && cost && canUpgrade && (
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
                      </div>
                    )}
                    <button
                      className="building-upgrade-button"
                      onClick={() => handleUpgrade(key)}
                      disabled={isDisabled}
                    >
                      Upgrade
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'troops' && (
          <div className="troops-tab">
            <h3>Troops</h3>

            {nexus.buildings.troopFabricator === 0 ? (
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

                <div className="troops-current">
                  <h4>Current Troops</h4>
                  {currentTroops.length > 0 ? (
                    <div className="troop-list">
                      {currentTroops.map(([type, count]) => (
                        <div key={type} className="troop-item">
                          {TROOP_IMAGES[type] && (
                            <img src={TROOP_IMAGES[type].src || TROOP_IMAGES[type]} alt="" className="troop-icon" />
                          )}
                          <span className="troop-name">{TROOP_NAMES[type] || type}</span>
                          <span className="troop-count">{count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No troops stationed here yet.</p>
                  )}
                </div>

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
                            const maxTrainable = getMaxTrainableAmount(type, costs, canTrain);
                            const isTrainingQueueFull = nexus.trainingQueue.length >= MAX_TRAINING_QUEUE;
                            const isTrainDisabled = !canTrain || isTrainingQueueFull || maxTrainable <= 0;
                            return (
                              <div key={type} className={`train-card ${isTrainDisabled ? 'disabled' : ''}`}>
                                {TROOP_IMAGES[type] && (
                                  <img
                                    src={TROOP_IMAGES[type].src || TROOP_IMAGES[type]}
                                    alt={TROOP_NAMES[type]}
                                    className="troop-card-image"
                                  />
                                )}
                                <div className="troop-header">
                                  <h5>{TROOP_NAMES[type]}</h5>
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
                                <div className="train-costs">
                                  <span>🧬 {costs.biomass}</span>
                                  <span>⚙️ {costs.alloy}</span>
                                  <span>💎 {costs.ore}</span>
                                  <span>👥 {costs.population}</span>
                                  <p className="train-time">
                                    ⏱️ {Math.floor(costs.time / 60)}m {costs.time % 60}s
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
