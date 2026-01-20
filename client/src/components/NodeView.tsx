import React, { useEffect, useState } from 'react';
import { checkBuildQueue, checkTrainingQueue, getOutgoingAttacks, trainTroops, upgradeBuilding } from '../services/api';
import '../styles/NodeView.css';
import { Village } from '../types/game';
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

interface NodeViewProps {
  village: Village;
  onUpdate: () => void;
}

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
  commandCore: 'Increases max population and unlocks new buildings. Required for node expansion.',
  troopFabricator: 'Allows training of combat units. Higher levels reduce training time.',
  lifeSupport: 'Increases maximum population capacity for housing more troops and workers.',
  storageVault: 'Increases resource storage capacity. Protects resources from raids.',
  biomassFarm: 'Produces Biomass per hour. Higher levels increase production rate.',
  alloyForge: 'Produces Alloy per hour. Higher levels increase production rate.',
  oreExtractor: 'Produces Ore per hour. Higher levels increase production rate.',
  shieldGrid: 'Increases defensive bonus. Protects your node from enemy attacks.',
};

const BUILDING_COSTS: { [key: string]: any } = {
  commandCore: { biomass: 90, alloy: 80, ore: 70, time: 180, factor: 1.26 },
  troopFabricator: { biomass: 200, alloy: 170, ore: 90, time: 300, factor: 1.28 },
  lifeSupport: { biomass: 80, alloy: 100, ore: 70, time: 240, factor: 1.3 },
  storageVault: { biomass: 60, alloy: 50, ore: 40, time: 180, factor: 1.27 },
  biomassFarm: { biomass: 50, alloy: 60, ore: 40, time: 180, factor: 1.25 },
  alloyForge: { biomass: 65, alloy: 40, ore: 40, time: 180, factor: 1.25 },
  oreExtractor: { biomass: 75, alloy: 65, ore: 70, time: 240, factor: 1.25 },
  shieldGrid: { biomass: 50, alloy: 100, ore: 20, time: 300, factor: 1.32 },
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
    'Scout & intelligence unit. Fast, lightly equipped operative used to gather intelligence, scan enemy nodes, and detect incoming forces. Requires Lv3 Recruitment Core, 5 Assault Troopers, 5 Lancer Drones.',
  skimmerBike:
    'Fast raid unit. High-speed hover bike used for quick strikes, resource extraction, and rapid retreats. Requires Lv3 Recruitment Core, Lv3 Alloy Forge, 20 Assault Troopers, 10 Lancer Drones.',
  siegeMech:
    'Heavy siege unit. Massive mechanized unit specialized in destroying fortifications and shield grids. Requires Lv4 Recruitment Core, Lv4 Ore Extractor, 30 Assault Troopers, 10 Breaker Units.',
  bulwarkGuard:
    'Elite defensive infantry. Heavily shielded unit deployed to significantly strengthen node defenses. Requires Lv3 Recruitment Core, Lv5 Life Support.',
  suppressorTeam:
    'Ranged support unit. Long-range fireteam that weakens enemy forces before direct engagement. Requires Lv3 Recruitment Core, Lv3 Command Core.',
  disruptorUnit:
    'Anti-armor & anti-mech unit. Specialized unit using EMP weapons to counter heavy units and machinery. Requires Lv4 Recruitment Core.',
  interceptorBike:
    'Rapid response unit. Extremely fast unit used to chase scouts, reinforce nearby nodes, or intercept raids. Requires Lv4 Recruitment Core, 50 Skimmer Bikes.',
  annihilatorPlatform:
    'Heavy artillery unit. Slow but devastating artillery platform capable of inflicting massive damage. Requires Lv6 Recruitment Core, Lv6 Command Core.',
  overseer:
    'Conquest & control unit. Non-combat command unit required to reduce Control Level and permanently capture enemy nodes. Requires Lv5 Recruitment Core, Lv3 Command Core, Lv2 Shield Grid. Only 1 per node.',
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
  overseer: { buildings: { troopFabricator: 5, commandCore: 3, shieldGrid: 2 }, maxPerVillage: 1 },
};

const TROOP_COSTS: { [key: string]: any } = {
  assaultTrooper: { biomass: 30, alloy: 30, ore: 70, population: 1, time: 900 },
  lancerDrone: { biomass: 50, alloy: 30, ore: 10, population: 1, time: 600 },
  breakerUnit: { biomass: 60, alloy: 30, ore: 40, population: 1, time: 840 },
  reconOperative: { biomass: 100, alloy: 30, ore: 60, population: 1, time: 960 },
  skimmerBike: { biomass: 125, alloy: 100, ore: 150, population: 3, time: 1500 },
  siegeMech: { biomass: 125, alloy: 100, ore: 250, population: 4, time: 1800 },
  bulwarkGuard: { biomass: 80, alloy: 120, ore: 100, population: 2, time: 1200 },
  suppressorTeam: { biomass: 90, alloy: 80, ore: 90, population: 2, time: 1300 },
  disruptorUnit: { biomass: 110, alloy: 150, ore: 130, population: 2, time: 1400 },
  interceptorBike: { biomass: 150, alloy: 120, ore: 180, population: 3, time: 1600 },
  annihilatorPlatform: { biomass: 200, alloy: 180, ore: 300, population: 5, time: 2400 },
  overseer: { biomass: 300, alloy: 250, ore: 200, population: 5, time: 3000 },
};

interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

const NodeView: React.FC<NodeViewProps> = ({ village, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'buildings' | 'troops' | 'map'>('overview');
  const [trainAmount, setTrainAmount] = useState<{ [key: string]: number }>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [outgoingAttacks, setOutgoingAttacks] = useState<any[]>([]);
  const [selectedAttack, setSelectedAttack] = useState<any | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
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
  }, [village]);

  const checkQueues = async () => {
    try {
      await checkBuildQueue(village._id);
      await checkTrainingQueue(village._id);
      onUpdate();
    } catch (err) {
      console.error('Error checking queues:', err);
    }
  };

  const loadOutgoingAttacks = async () => {
    try {
      const response = await getOutgoingAttacks(village._id);
      setOutgoingAttacks(response.data);
    } catch (err) {
      console.error('Error loading outgoing attacks:', err);
    }
  };

  const handleUpgrade = async (building: string) => {
    try {
      const response = await upgradeBuilding(village._id, building);
      showToast(`${BUILDING_NAMES[building]} upgrade started!`, 'success');
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error upgrading building', 'error');
    }
  };

  const handleTrainTroops = async (troopType: string) => {
    const amount = trainAmount[troopType] || 1;

    // Check requirements
    const requirements = TROOP_REQUIREMENTS[troopType];
    if (requirements) {
      // Check building requirements
      if (requirements.buildings) {
        for (const [building, level] of Object.entries(requirements.buildings)) {
          if ((village.buildings as any)[building] < (level as number)) {
            showToast(`Requires ${BUILDING_NAMES[building]} Level ${level}`, 'error');
            return;
          }
        }
      }

      // Check troop requirements
      if (requirements.troops) {
        for (const [troop, count] of Object.entries(requirements.troops)) {
          if ((village.troops as any)[troop] < (count as number)) {
            showToast(`Requires ${count}x ${TROOP_NAMES[troop]} in this node`, 'error');
            return;
          }
        }
      }

      // Check max per node
      if (requirements.maxPerVillage) {
        if ((village.troops as any)[troopType] >= requirements.maxPerVillage) {
          showToast(`Maximum ${requirements.maxPerVillage} ${TROOP_NAMES[troopType]} per node`, 'error');
          return;
        }
        if (amount > requirements.maxPerVillage - (village.troops as any)[troopType]) {
          showToast(`Can only train ${requirements.maxPerVillage - (village.troops as any)[troopType]} more`, 'error');
          return;
        }
      }
    }

    try {
      await trainTroops(village._id, troopType, amount);
      showToast(`Training ${amount}x ${TROOP_NAMES[troopType]} started!`, 'success');
      setTrainAmount({ ...trainAmount, [troopType]: 1 });
      onUpdate();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Error training troops', 'error');
    }
  };

  const formatTime = (date: Date | string) => {
    const diff = new Date(date).getTime() - currentTime.getTime();
    if (diff <= 0) return 'Ready';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  const checkTroopRequirements = (troopType: string) => {
    const requirements = TROOP_REQUIREMENTS[troopType];
    if (!requirements) return { canTrain: true, missingRequirements: [] };

    const missing: string[] = [];

    // Check building requirements
    if (requirements.buildings) {
      for (const [building, level] of Object.entries(requirements.buildings)) {
        if ((village.buildings as any)[building] < (level as number)) {
          missing.push(`${BUILDING_NAMES[building]} Lv${level}`);
        }
      }
    }

    // Check troop requirements
    if (requirements.troops) {
      for (const [troop, count] of Object.entries(requirements.troops)) {
        if ((village.troops as any)[troop] < (count as number)) {
          missing.push(`${count}x ${TROOP_NAMES[troop]}`);
        }
      }
    }

    // Check max per node
    if (requirements.maxPerVillage && (village.troops as any)[troopType] >= requirements.maxPerVillage) {
      missing.push(`Max ${requirements.maxPerVillage} per node (already have ${(village.troops as any)[troopType]})`);
    }

    return { canTrain: missing.length === 0, missingRequirements: missing };
  };

  const calculateProduction = () => {
    const baseProduction = 30;
    return {
      biomass: Math.floor(baseProduction * Math.pow(1.2, village.buildings.biomassFarm - 1)),
      alloy: Math.floor(baseProduction * Math.pow(1.2, village.buildings.alloyForge - 1)),
      ore: Math.floor(baseProduction * Math.pow(1.2, village.buildings.oreExtractor - 1)),
    };
  };

  const getBuildingCost = (building: string, currentLevel: number) => {
    const base = BUILDING_COSTS[building];
    const factor = Math.pow(base.factor, currentLevel);

    return {
      biomass: Math.floor(base.biomass * factor),
      alloy: Math.floor(base.alloy * factor),
      ore: Math.floor(base.ore * factor),
      time: Math.floor(base.time * factor),
    };
  };

  const production = calculateProduction();

  return (
    <div className="node-view">
      <div className="node-header">
        <h2>{village.name}</h2>
        <div className="resources">
          <div className="resource" title="Biomass">
            <span className="resource-icon">🧬</span>
            <span className="resource-amount">
              {Math.floor(village.resources.biomass)}
              <span className="production-rate">+{production.biomass}/h</span>
            </span>
          </div>
          <div className="resource" title="Alloy">
            <span className="resource-icon">⚙️</span>
            <span className="resource-amount">
              {Math.floor(village.resources.alloy)}
              <span className="production-rate">+{production.alloy}/h</span>
            </span>
          </div>
          <div className="resource" title="Ore">
            <span className="resource-icon">💎</span>
            <span className="resource-amount">
              {Math.floor(village.resources.ore)}
              <span className="production-rate">+{production.ore}/h</span>
            </span>
          </div>
          <div className="resource" title="Population">
            <span className="resource-icon">👥</span>
            <span className="resource-amount">
              {village.population.current}/{village.population.max}
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
            <h3>Node Overview</h3>
            <div className="stats">
              <p>
                Coordinates: ({village.x}|{village.y})
              </p>
              <p>Influence: {village.points}</p>
            </div>

            {village.buildQueue.length > 0 && (
              <div className="queue-section">
                <h4>Fabrication Queue</h4>
                {village.buildQueue.map((item, idx) => (
                  <div key={idx} className="queue-item">
                    {BUILDING_NAMES[item.building]} → Level {item.targetLevel}
                    <span className="queue-time">{formatTime(item.completesAt)}</span>
                  </div>
                ))}
              </div>
            )}

            {village.trainingQueue.length > 0 && (
              <div className="queue-section">
                <h4>Training Queue</h4>
                {village.trainingQueue.map((item, idx) => (
                  <div key={idx} className="queue-item">
                    {item.amount}x {TROOP_NAMES[item.troopType] || item.troopType}
                    <span className="queue-time">{formatTime(item.completesAt)}</span>
                  </div>
                ))}
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
                      Strike on {attack.defender?.village?.name || 'Unknown'} ({attack.defender?.village?.x || '?'}|
                      {attack.defender?.village?.y || '?'})
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

            {village.buildQueue.length > 0 && (
              <div className="queue-section">
                <h4>Fabrication Queue</h4>
                {village.buildQueue.map((item, idx) => (
                  <div key={idx} className="queue-item">
                    {BUILDING_NAMES[item.building]} → Level {item.targetLevel}
                    <span className="queue-time">{formatTime(item.completesAt)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="buildings-grid">
              {Object.entries(village.buildings).map(([key, level]) => {
                const cost = getBuildingCost(key, level);
                const isUpgrading = village.buildQueue.some((item) => item.building === key);
                return (
                  <div key={key} className={`building-card ${isUpgrading ? 'upgrading' : ''}`}>
                    {BUILDING_IMAGES[key] && (
                      <img
                        src={BUILDING_IMAGES[key].src || BUILDING_IMAGES[key]}
                        alt={BUILDING_NAMES[key]}
                        className="building-card-image"
                      />
                    )}
                    <div className="building-header">
                      <h4>{BUILDING_NAMES[key]}</h4>
                      <span className="building-info" title={BUILDING_DESCRIPTIONS[key]}>
                        ℹ️
                      </span>
                    </div>
                    <p>Level: {level}</p>
                    {isUpgrading && (
                      <div className="upgrading-status">
                        <span className="upgrading-badge">⚙️ Upgrading...</span>
                        <span className="queue-time-small">
                          {formatTime(village.buildQueue.find((item) => item.building === key)!.completesAt)}
                        </span>
                      </div>
                    )}
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
                    <button onClick={() => handleUpgrade(key)} disabled={village.buildQueue.length > 0}>
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

            {village.buildings.troopFabricator === 0 ? (
              <p>Build a Recruitment Core to train troops!</p>
            ) : (
              <>
                {village.trainingQueue.length > 0 && (
                  <div className="queue-section">
                    <h4>🔨 Training Queue</h4>
                    {village.trainingQueue.map((item, idx) => (
                      <div key={idx} className="queue-item">
                        <span>
                          {item.amount}x {TROOP_NAMES[item.troopType] || item.troopType}
                        </span>
                        <span className="queue-time">{formatTime(item.completesAt)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="troops-current">
                  <h4>Current Troops</h4>
                  <div className="troop-list">
                    {Object.entries(village.troops).map(([type, count]) => (
                      <div key={type} className="troop-item">
                        <span className="troop-name">{TROOP_NAMES[type] || type}</span>
                        <span className="troop-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="troops-train">
                  <h4>Train Troops</h4>
                  <div className="train-grid">
                    {Object.entries(TROOP_COSTS).map(([type, costs]) => {
                      const { canTrain, missingRequirements } = checkTroopRequirements(type);
                      return (
                        <div key={type} className={`train-card ${!canTrain ? 'disabled' : ''}`}>
                          {TROOP_IMAGES[type] && (
                            <img
                              src={TROOP_IMAGES[type].src || TROOP_IMAGES[type]}
                              alt={TROOP_NAMES[type]}
                              className="troop-card-image"
                            />
                          )}
                          <div className="troop-header">
                            <h5>{TROOP_NAMES[type]}</h5>
                            <span className="troop-info" title={TROOP_DESCRIPTIONS[type]}>
                              ℹ️
                            </span>
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
                              type="number"
                              min="1"
                              value={trainAmount[type] || 1}
                              onChange={(e) =>
                                setTrainAmount({ ...trainAmount, [type]: parseInt(e.target.value) || 1 })
                              }
                              disabled={!canTrain}
                            />
                            <button onClick={() => handleTrainTroops(type)} disabled={!canTrain}>
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
            <h3>Starfield</h3>
            <p>Starfield functionality coming soon...</p>
            <p>
              Your node is at: ({village.x}|{village.y})
            </p>
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

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
                  {selectedAttack.defender?.village?.name || 'Unknown'}({selectedAttack.defender?.village?.x || '?'}|
                  {selectedAttack.defender?.village?.y || '?'})
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

export default NodeView;
