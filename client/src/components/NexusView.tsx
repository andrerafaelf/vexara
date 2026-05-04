import React, { useEffect, useState } from 'react';
import { checkBuildQueue, checkTrainingQueue, getOutgoingAttacks, trainTroops, upgradeBuilding } from '../services/api';
import '../styles/NexusView.css';
import { Nexus } from '../types/game';
import StarfieldMap from './Map';
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
}

const MAX_BUILD_QUEUE = 5;
const MAX_TRAINING_QUEUE = 100;

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
  commandCore: 'Increases max population and unlocks new buildings. Required for nexus expansion.',
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
    'Conquest & control unit. Non-combat command unit required to reduce Control Level and permanently capture enemy nexuses. Requires Lv5 Recruitment Core, Lv3 Command Core, Lv2 Shield Grid. Only 1 per nexus.',
};

const TROOP_REQUIREMENTS: { [key: string]: any } = {
  assaultTrooper: { buildings: { troopFabricator: 1 } },
  lancerDrone: { buildings: { troopFabricator: 2 }, troops: { assaultTrooper: 5 } },
  breakerUnit: { buildings: { troopFabricator: 2, oreExtractor: 2 }, troops: { assaultTrooper: 10 } },
  reconOperative: { buildings: { troopFabricator: 3 }, troops: { assaultTrooper: 5, lancerDrone: 5 } },
  skimmerBike: { buildings: { troopFabricator: 3, alloyForge: 3 }, troops: { assaultTrooper: 20, lancerDrone: 10 } },
  siegeMech: { buildings: { troopFabricator: 4, oreExtractor: 4 }, troops: { assaultTrooper: 30, breakerUnit: 10 } },
  bulwarkGuard: { buildings: { troopFabricator: 3, lifeSupport: 5 } },
  suppressorTeam: { buildings: { troopFabricator: 3, commandCore: 3 } },
  disruptorUnit: { buildings: { troopFabricator: 4 } },
  interceptorBike: { buildings: { troopFabricator: 4 }, troops: { skimmerBike: 50 } },
  annihilatorPlatform: { buildings: { troopFabricator: 6, commandCore: 6 } },
  overseer: { buildings: { troopFabricator: 5, commandCore: 3, shieldGrid: 2 }, maxPerNexus: 1 },
};

const TROOP_COSTS: { [key: string]: any } = {
  assaultTrooper: { biomass: 30, alloy: 30, ore: 70, population: 1, time: 158 },
  lancerDrone: { biomass: 50, alloy: 30, ore: 10, population: 1, time: 105 },
  breakerUnit: { biomass: 60, alloy: 30, ore: 40, population: 1, time: 147 },
  reconOperative: { biomass: 100, alloy: 30, ore: 60, population: 1, time: 168 },
  skimmerBike: { biomass: 125, alloy: 100, ore: 150, population: 3, time: 263 },
  siegeMech: { biomass: 125, alloy: 100, ore: 250, population: 4, time: 315 },
  bulwarkGuard: { biomass: 80, alloy: 120, ore: 100, population: 2, time: 210 },
  suppressorTeam: { biomass: 90, alloy: 80, ore: 90, population: 2, time: 228 },
  disruptorUnit: { biomass: 110, alloy: 150, ore: 130, population: 2, time: 245 },
  interceptorBike: { biomass: 150, alloy: 120, ore: 180, population: 3, time: 280 },
  annihilatorPlatform: { biomass: 200, alloy: 180, ore: 300, population: 5, time: 420 },
  overseer: { biomass: 300, alloy: 250, ore: 200, population: 5, time: 525 },
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
}

interface QuestBatch {
  id: 'intro' | 'intermediate' | 'advanced';
  title: string;
  quests: IntroQuest[];
  unlocked: boolean;
  reward: string;
}

interface InfoModalState {
  title: string;
  description: string;
}

const NexusView: React.FC<NexusViewProps> = ({ nexus, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'buildings' | 'troops' | 'map'>('overview');
  const [trainAmount, setTrainAmount] = useState<{ [key: string]: string }>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [outgoingAttacks, setOutgoingAttacks] = useState<any[]>([]);
  const [selectedAttack, setSelectedAttack] = useState<any | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalState | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleInfoTap = (title: string, description: string) => {
    setInfoModal({ title, description });
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
    const interval = setInterval(() => {
      checkQueues();
      loadOutgoingAttacks();
    }, 5000);
    loadOutgoingAttacks();
    return () => clearInterval(interval);
  }, [nexus]);

  const checkQueues = async () => {
    try {
      const [buildResponse, trainingResponse] = await Promise.all([
        checkBuildQueue(nexus._id),
        checkTrainingQueue(nexus._id),
      ]);
      if (buildResponse.data?.completed) {
        showToast('A building upgrade completed and was applied.', 'success');
      }
      if (trainingResponse.data?.completed) {
        showToast('Training completed and your troops are ready.', 'success');
      }
      onUpdate();
    } catch (err) {
      console.error('Error checking queues:', err);
    }
  };

  const loadOutgoingAttacks = async () => {
    try {
      const response = await getOutgoingAttacks(nexus._id);
      setOutgoingAttacks(response.data);
    } catch (err) {
      console.error('Error loading outgoing attacks:', err);
    }
  };

  const handleUpgrade = async (building: string) => {
    if (nexus.buildQueue.length >= MAX_BUILD_QUEUE) {
      showToast(`Build queue is full (${MAX_BUILD_QUEUE}/${MAX_BUILD_QUEUE})`, 'error');
      return;
    }

    try {
      await upgradeBuilding(nexus._id, building);
      showToast(`${BUILDING_NAMES[building]} upgrade started!`, 'success');
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error upgrading building', 'error');
    }
  };

  const handleTrainTroops = async (troopType: string) => {
    if (nexus.trainingQueue.length >= MAX_TRAINING_QUEUE) {
      showToast(`Training queue is full (${MAX_TRAINING_QUEUE}/${MAX_TRAINING_QUEUE})`, 'error');
      return;
    }

    const rawAmount = trainAmount[troopType] ?? '';
    const amount = rawAmount === '' ? 1 : Number.parseInt(rawAmount, 10);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a troop amount greater than 0', 'error');
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

      // Check troop requirements
      if (requirements.troops) {
        for (const [troop, count] of Object.entries(requirements.troops)) {
          if ((nexus.troops as any)[troop] < (count as number)) {
            showToast(`Requires ${count}x ${TROOP_NAMES[troop]} in this nexus`, 'error');
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

    try {
      await trainTroops(nexus._id, troopType, amount);
      showToast(`Training ${amount}x ${TROOP_NAMES[troopType]} started!`, 'success');
      setTrainAmount({ ...trainAmount, [troopType]: '' });
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error training troops', 'error');
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

    // Check troop requirements
    if (requirements.troops) {
      for (const [troop, count] of Object.entries(requirements.troops)) {
        if ((nexus.troops as any)[troop] < (count as number)) {
          missing.push(`${count}x ${TROOP_NAMES[troop]}`);
        }
      }
    }

    // Check max per nexus
    if (requirements.maxPerNexus && (nexus.troops as any)[troopType] >= requirements.maxPerNexus) {
      missing.push(`Max ${requirements.maxPerNexus} per nexus (already have ${(nexus.troops as any)[troopType]})`);
    }

    return { canTrain: missing.length === 0, missingRequirements: missing };
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
    const assaultTroopers = nexus.troops.assaultTrooper || 0;
    const reconOperatives = nexus.troops.reconOperative || 0;
    const skimmerBikes = nexus.troops.skimmerBike || 0;

    const introQuests: IntroQuest[] = [
      {
        id: 'command-core-online',
        title: 'Power The Nexus',
        description: 'Upgrade Command Core to Lv1.',
        completed: nexus.buildings.commandCore >= 1,
      },
      {
        id: 'start-fabrication',
        title: 'Enable Recruitment',
        description: 'Upgrade Recruitment Core to Lv1.',
        completed: nexus.buildings.troopFabricator >= 1,
      },
      {
        id: 'increase-capacity',
        title: 'Secure Capacity',
        description: 'Upgrade Storage Vault to Lv2.',
        completed: nexus.buildings.storageVault >= 2,
      },
      {
        id: 'raise-force',
        title: 'Field Troops',
        description: 'Train 5 Assault Troopers.',
        completed: assaultTroopers >= 5,
      },
    ];

    const introComplete = introQuests.every((quest) => quest.completed);

    const intermediateQuests: IntroQuest[] = [
      {
        id: 'fortify-core',
        title: 'Fortify The Core',
        description: 'Upgrade Command Core to Lv3.',
        completed: nexus.buildings.commandCore >= 3,
      },
      {
        id: 'unlock-defenses',
        title: 'Activate Shield Grid',
        description: 'Upgrade Shield Grid to Lv1.',
        completed: nexus.buildings.shieldGrid >= 1,
      },
      {
        id: 'upgrade-biomass-chain',
        title: 'Expand Biomass Chain',
        description: 'Upgrade Biomass Farm to Lv2.',
        completed: nexus.buildings.biomassFarm >= 2,
      },
      {
        id: 'expand-logistics',
        title: 'Expand Logistics',
        description: 'Upgrade Alloy Forge to Lv2.',
        completed: nexus.buildings.alloyForge >= 2,
      },
      {
        id: 'deploy-recon',
        title: 'Deploy Recon',
        description: 'Train 1 Recon Operative.',
        completed: reconOperatives >= 1,
      },
    ];

    const intermediateComplete = intermediateQuests.every((quest) => quest.completed);

    const advancedQuests: IntroQuest[] = [
      {
        id: 'command-core-mastery',
        title: 'Core Mastery',
        description: 'Upgrade Command Core to Lv4.',
        completed: nexus.buildings.commandCore >= 4,
      },
      {
        id: 'extractor-specialization',
        title: 'Extractor Specialization',
        description: 'Upgrade Ore Extractor to Lv4.',
        completed: nexus.buildings.oreExtractor >= 4,
      },
      {
        id: 'defense-posture',
        title: 'Defense Posture',
        description: 'Upgrade Shield Grid to Lv2.',
        completed: nexus.buildings.shieldGrid >= 2,
      },
      {
        id: 'fast-raiders',
        title: 'Fast Raiders',
        description: 'Train 5 Skimmer Bikes.',
        completed: skimmerBikes >= 5,
      },
      {
        id: 'first-expedition',
        title: 'First Expedition',
        description: 'Launch 1 outgoing strike.',
        completed: outgoingAttacks.length > 0,
      },
    ];

    return [
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
        unlocked: introComplete && intermediateComplete,
        reward: '+2500 Biomass, +2500 Alloy, +2500 Ore, +20 Skimmer Bikes, +5 Siege Mechs',
      },
    ];
  };

  const production = calculateProduction();
  const storageCapacity = Math.floor(1000 * Math.pow(1.3, nexus.buildings.storageVault));
  const questBatches = getQuestBatches();
  const currentTroops = Object.entries(nexus.troops).filter(([, count]) => Number(count) > 0);

  return (
    <div className="nexus-view">
      <div className="nexus-header">
        <h2>{nexus.name}</h2>
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

      <div className="tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button className={activeTab === 'buildings' ? 'active' : ''} onClick={() => setActiveTab('buildings')}>
          Buildings
        </button>
        <button className={activeTab === 'troops' ? 'active' : ''} onClick={() => setActiveTab('troops')}>
          Troops
        </button>
        <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}>
          Starfield
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <h3>Nexus Overview</h3>
            <div className="stats">
              <p>
                Coordinates: ({nexus.x}|{nexus.y})
              </p>
              <p>Influence: {nexus.points}</p>
            </div>

            {nexus.buildQueue.length > 0 && (
              <div className="queue-section">
                <h4>Fabrication Queue</h4>
                {nexus.buildQueue.map((item, idx) => {
                  const queueTime = getBuildQueueTimeDisplay(idx);

                  return (
                    <div key={idx} className={`queue-item ${queueTime.isWaiting ? 'queue-item-waiting' : ''}`}>
                      {BUILDING_NAMES[item.building]} → Level {item.targetLevel}
                      <span className={queueTime.isWaiting ? 'queue-time-queued' : 'queue-time'}>
                        {queueTime.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {questBatches.map((batch) => {
              const completedCount = batch.quests.filter((quest) => quest.completed).length;
              const batchComplete = completedCount === batch.quests.length;

              return (
                <div key={batch.id} className={`intro-quests ${batch.unlocked ? '' : 'quest-batch-locked'}`}>
                  <div className="intro-quests-header">
                    <h4>{batch.title}</h4>
                    <span>
                      {completedCount}/{batch.quests.length}
                    </span>
                  </div>
                  <p className="quest-batch-reward">Reward: {batch.reward}</p>

                  {batch.unlocked && batchComplete && <p className="quest-batch-earned">Reward tier earned</p>}

                  {batch.unlocked ? (
                    batch.quests.map((quest) => (
                      <div key={quest.id} className={`intro-quest-item ${quest.completed ? 'completed' : ''}`}>
                        <span className="intro-quest-icon">{quest.completed ? '✅' : '⬜'}</span>
                        <div>
                          <p className="intro-quest-title">{quest.title}</p>
                          <p className="intro-quest-description">{quest.description}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="quest-batch-lock-note">Complete the previous quest batch to unlock this one.</p>
                  )}
                </div>
              );
            })}

            {nexus.trainingQueue.length > 0 && (
              <div className="queue-section">
                <h4>Training Queue</h4>
                {nexus.trainingQueue.map((item, idx) => {
                  const queueTime = getTrainingQueueTimeDisplay(idx);

                  return (
                    <div key={idx} className={`queue-item ${queueTime.isWaiting ? 'queue-item-waiting' : ''}`}>
                      {item.amount}x {TROOP_NAMES[item.troopType] || item.troopType}
                      <span className={queueTime.isWaiting ? 'queue-time-queued' : 'queue-time'}>
                        {queueTime.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {outgoingAttacks.length > 0 && (
              <div className="queue-section">
                <h4>⚔️ Outgoing Strikes</h4>
                {outgoingAttacks.map((attack) => (
                  <div
                    key={attack._id}
                    className="queue-item clickable"
                    onClick={() => setSelectedAttack(attack)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span>
                      Strike on {attack.defender?.nexus?.name || 'Unknown'} ({attack.defender?.nexus?.x || '?'}|
                      {attack.defender?.nexus?.y || '?'})
                    </span>
                    <span className="queue-time">{formatTime(attack.arrivesAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'buildings' && (
          <div className="buildings-tab">
            <h3>Buildings</h3>

            {nexus.buildQueue.length > 0 && (
              <div className="queue-section">
                <h4>Fabrication Queue</h4>
                {nexus.buildQueue.map((item, idx) => {
                  const queueTime = getBuildQueueTimeDisplay(idx);

                  return (
                    <div key={idx} className={`queue-item ${queueTime.isWaiting ? 'queue-item-waiting' : ''}`}>
                      {BUILDING_NAMES[item.building]} → Level {item.targetLevel}
                      <span className={queueTime.isWaiting ? 'queue-time-queued' : 'queue-time'}>
                        {queueTime.label}
                      </span>
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
                        <p>Upgrade Cost:</p>
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
                    <button onClick={() => handleUpgrade(key)} disabled={isDisabled}>
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
                          <span className={queueTime.isWaiting ? 'queue-time-queued' : 'queue-time'}>
                            {queueTime.label}
                          </span>
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
                  <div className="train-grid">
                    {Object.entries(TROOP_COSTS).map(([type, costs]) => {
                      const { canTrain, missingRequirements } = checkTroopRequirements(type);
                      const isTrainingQueueFull = nexus.trainingQueue.length >= MAX_TRAINING_QUEUE;
                      const isTrainDisabled = !canTrain || isTrainingQueueFull;
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
                          </div>
                          <p className="train-time">
                            ⏱️ {Math.floor(costs.time / 60)}m {costs.time % 60}s
                          </p>
                          {isTrainingQueueFull && (
                            <div className="requirements-missing">
                              <p className="requires-label">🔒 Queue Full:</p>
                              <p className="requirement-item">• Training queue limit reached ({MAX_TRAINING_QUEUE})</p>
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
                          <div className="train-controls">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="1"
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
                      );
                    })}
                  </div>
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
