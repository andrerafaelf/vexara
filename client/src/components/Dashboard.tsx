import React, { useEffect, useState } from 'react';
import { getOutgoingAttacks } from '../services/api';
import '../styles/Dashboard.css';
import { Nexus } from '../types/game';
import NexusMap from './NexusMap';

const TROOP_NAMES: { [key: string]: string } = {
  lancerDrone: 'Lancer Drone',
  assaultTrooper: 'Assault Trooper',
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

interface DashboardProps {
  nexuses: Nexus[];
  onSelectNexus: (nexus: Nexus) => void;
}

interface DashboardQuest {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

interface DashboardQuestBatch {
  id: string;
  title: string;
  quests: DashboardQuest[];
  unlocked: boolean;
  reward: string;
}

const Dashboard: React.FC<DashboardProps> = ({ nexuses, onSelectNexus }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [outgoingAttacks, setOutgoingAttacks] = useState<any[]>([]);
  const [selectedAttack, setSelectedAttack] = useState<any | null>(null);

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    loadOutgoingAttacks();
    const interval = setInterval(loadOutgoingAttacks, 20000);
    return () => clearInterval(interval);
  }, [nexuses]);

  const loadOutgoingAttacks = async () => {
    try {
      const allAttacks = await Promise.all(nexuses.map((v) => getOutgoingAttacks(v._id)));
      const attacks = allAttacks.flatMap((response) => response.data);
      setOutgoingAttacks(attacks);
    } catch (err) {
      console.error('Error loading outgoing attacks:', err);
    }
  };
  const totalPoints = nexuses.reduce((sum, v) => sum + v.points, 0);

  const calculateProduction = (nexus: Nexus) => {
    const baseProduction = 600;
    return {
      biomass: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.biomassFarm - 1)),
      alloy: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.alloyForge - 1)),
      ore: Math.floor(baseProduction * Math.pow(1.35, nexus.buildings.oreExtractor - 1)),
    };
  };

  const getStorageCapacity = (nexus: Nexus) => Math.floor(1000 * Math.pow(1.3, nexus.buildings.storageVault));

  const totalProduction = nexuses.reduce(
    (sum, v) => {
      const prod = calculateProduction(v);
      return {
        biomass: sum.biomass + prod.biomass,
        alloy: sum.alloy + prod.alloy,
        ore: sum.ore + prod.ore,
      };
    },
    { biomass: 0, alloy: 0, ore: 0 },
  );

  const totalResources = nexuses.reduce(
    (sum, v) => ({
      biomass: sum.biomass + Math.floor(v.resources.biomass),
      alloy: sum.alloy + Math.floor(v.resources.alloy),
      ore: sum.ore + Math.floor(v.resources.ore),
    }),
    { biomass: 0, alloy: 0, ore: 0 },
  );

  const totalResourceCapacity = nexuses.reduce(
    (sum, v) => ({
      biomass: sum.biomass + getStorageCapacity(v),
      alloy: sum.alloy + getStorageCapacity(v),
      ore: sum.ore + getStorageCapacity(v),
    }),
    { biomass: 0, alloy: 0, ore: 0 },
  );
  const totalTroops = nexuses.reduce(
    (sum, v) => ({
      lancerDrone: sum.lancerDrone + v.troops.lancerDrone,
      assaultTrooper: sum.assaultTrooper + v.troops.assaultTrooper,
      breakerUnit: sum.breakerUnit + v.troops.breakerUnit,
      reconOperative: sum.reconOperative + v.troops.reconOperative,
      skimmerBike: sum.skimmerBike + v.troops.skimmerBike,
      siegeMech: sum.siegeMech + v.troops.siegeMech,
      bulwarkGuard: sum.bulwarkGuard + (v.troops.bulwarkGuard || 0),
      suppressorTeam: sum.suppressorTeam + (v.troops.suppressorTeam || 0),
      disruptorUnit: sum.disruptorUnit + (v.troops.disruptorUnit || 0),
      interceptorBike: sum.interceptorBike + (v.troops.interceptorBike || 0),
      annihilatorPlatform: sum.annihilatorPlatform + (v.troops.annihilatorPlatform || 0),
      overseer: sum.overseer + (v.troops.overseer || 0),
    }),
    {
      lancerDrone: 0,
      assaultTrooper: 0,
      breakerUnit: 0,
      reconOperative: 0,
      skimmerBike: 0,
      siegeMech: 0,
      bulwarkGuard: 0,
      suppressorTeam: 0,
      disruptorUnit: 0,
      interceptorBike: 0,
      annihilatorPlatform: 0,
      overseer: 0,
    },
  );

  const totalTroopCount = Object.values(totalTroops).reduce((a, b) => a + b, 0);

  const activeBuilding = nexuses.filter((v) => v.buildQueue.length > 0);
  const activeTraining = nexuses.filter((v) => v.trainingQueue.length > 0);

  const formatTime = (date: Date) => {
    const diff = new Date(date).getTime() - currentTime.getTime();
    if (diff <= 0) return 'Ready';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getQuestBatches = (nexus: Nexus): DashboardQuestBatch[] => {
    const claimedBatches = new Set(nexus.questRewardClaims || []);
    const completedQuestIds = new Set(nexus.completedQuestIds || []);
    const done = (batchId: string, questId: string, condition: boolean) =>
      completedQuestIds.has(questId) || claimedBatches.has(batchId) || condition;

    const assaultTroopers = nexus.troops.assaultTrooper || 0;
    const reconOperatives = nexus.troops.reconOperative || 0;
    const skimmerBikes = nexus.troops.skimmerBike || 0;
    const hasOutgoingStrike = outgoingAttacks.some((attack) => attack.attacker?.nexus === nexus._id);

    const introQuests: DashboardQuest[] = [
      {
        id: 'command-core-online',
        title: 'Power The Nexus',
        description: 'Upgrade Command Core to Lv1.',
        completed: done('intro', 'build_command_core_1', nexus.buildings.commandCore >= 1),
      },
      {
        id: 'start-fabrication',
        title: 'Enable Recruitment',
        description: 'Upgrade Recruitment Core to Lv1.',
        completed: done('intro', 'build_troop_fab_1', nexus.buildings.troopFabricator >= 1),
      },
      {
        id: 'increase-capacity',
        title: 'Secure Capacity',
        description: 'Upgrade Storage Vault to Lv2.',
        completed: done('intro', 'build_storage_vault_2', nexus.buildings.storageVault >= 2),
      },
      {
        id: 'raise-force',
        title: 'Field Troops',
        description: 'Train 5 Assault Troopers.',
        completed: done('intro', 'train_assault_trooper_5', assaultTroopers >= 5),
      },
    ];

    const introComplete = introQuests.every((quest) => quest.completed);

    const intermediateQuests: DashboardQuest[] = [
      {
        id: 'fortify-core',
        title: 'Fortify The Core',
        description: 'Upgrade Command Core to Lv3.',
        completed: done('intermediate', 'build_command_core_3', nexus.buildings.commandCore >= 3),
      },
      {
        id: 'unlock-defenses',
        title: 'Activate Shield Grid',
        description: 'Upgrade Shield Grid to Lv1.',
        completed: done('intermediate', 'build_shield_grid_1', nexus.buildings.shieldGrid >= 1),
      },
      {
        id: 'upgrade-biomass-chain',
        title: 'Expand Biomass Chain',
        description: 'Upgrade Biomass Farm to Lv2.',
        completed: done('intermediate', 'build_biomass_farm_2', nexus.buildings.biomassFarm >= 2),
      },
      {
        id: 'expand-logistics',
        title: 'Expand Logistics',
        description: 'Upgrade Alloy Forge to Lv2.',
        completed: done('intermediate', 'build_alloy_forge_2', nexus.buildings.alloyForge >= 2),
      },
      {
        id: 'deploy-recon',
        title: 'Deploy Recon',
        description: 'Train 1 Recon Operative.',
        completed: done('intermediate', 'train_recon_operative_1', reconOperatives >= 1),
      },
    ];

    const intermediateComplete = intermediateQuests.every((quest) => quest.completed);

    const advancedQuests: DashboardQuest[] = [
      {
        id: 'command-core-mastery',
        title: 'Core Mastery',
        description: 'Upgrade Command Core to Lv4.',
        completed: done('advanced', 'build_command_core_4', nexus.buildings.commandCore >= 4),
      },
      {
        id: 'extractor-specialization',
        title: 'Extractor Specialization',
        description: 'Upgrade Ore Extractor to Lv4.',
        completed: done('advanced', 'build_ore_extractor_4', nexus.buildings.oreExtractor >= 4),
      },
      {
        id: 'defense-posture',
        title: 'Defense Posture',
        description: 'Upgrade Shield Grid to Lv2.',
        completed: done('advanced', 'build_shield_grid_2', nexus.buildings.shieldGrid >= 2),
      },
      {
        id: 'fast-raiders',
        title: 'Fast Raiders',
        description: 'Train 5 Skimmer Bikes.',
        completed: done('advanced', 'train_skimmer_bike_5', skimmerBikes >= 5),
      },
      {
        id: 'first-expedition',
        title: 'First Expedition',
        description: 'Launch 1 outgoing strike.',
        completed: done('advanced', 'send_first_strike', hasOutgoingStrike),
      },
    ];

    const batches: DashboardQuestBatch[] = [
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
    return batches.filter((batch) => !claimedBatches.has(batch.id));
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Command Overview</h2>
        <p className="empire-stats">
          {nexuses.length} {nexuses.length === 1 ? 'Nexus' : 'Nexuses'} • {totalPoints} Total Influence
        </p>
      </div>

      <div className="dashboard-grid">
        {/* Resources Overview */}
        <div className="dashboard-card">
          <h3>📦 Total Resources</h3>
          <div className="resource-summary">
            <div className="resource-line">
              <span className="resource-icon">🧬</span>
              <span className="resource-label">Biomass</span>
              <span className="resource-value">
                <span className="resource-main">
                  {totalResources.biomass.toLocaleString()}
                  <span className="resource-max">/{totalResourceCapacity.biomass.toLocaleString()}</span>
                </span>
                <span className="production-rate">+{totalProduction.biomass}/h</span>
              </span>
            </div>
            <div className="resource-line">
              <span className="resource-icon">⚙️</span>
              <span className="resource-label">Alloy</span>
              <span className="resource-value">
                <span className="resource-main">
                  {totalResources.alloy.toLocaleString()}
                  <span className="resource-max">/{totalResourceCapacity.alloy.toLocaleString()}</span>
                </span>
                <span className="production-rate">+{totalProduction.alloy}/h</span>
              </span>
            </div>
            <div className="resource-line">
              <span className="resource-icon">💎</span>
              <span className="resource-label">Ore</span>
              <span className="resource-value">
                <span className="resource-main">
                  {totalResources.ore.toLocaleString()}
                  <span className="resource-max">/{totalResourceCapacity.ore.toLocaleString()}</span>
                </span>
                <span className="production-rate">+{totalProduction.ore}/h</span>
              </span>
            </div>
          </div>
        </div>

        {/* Military Overview */}
        <div className="dashboard-card">
          <h3>⚔️ Battle Index</h3>
          <div className="military-summary">
            <div className="total-troops">
              <span className="troops-count">{totalTroopCount}</span>
              <span className="troops-label">Total Troops</span>
            </div>
            {totalTroopCount > 0 && (
              <div className="troop-breakdown">
                {Object.entries(totalTroops).map(([type, count]) =>
                  count > 0 ? (
                    <div key={type} className="battle-troop-line">
                      <span className="battle-troop-name">{TROOP_NAMES[type] || type}</span>
                      <span className="battle-troop-count">{count}</span>
                    </div>
                  ) : null,
                )}
              </div>
            )}
            {totalTroopCount === 0 && (
              <p className="no-troops">
                {outgoingAttacks.length > 0
                  ? 'All troops deployed on missions! Train reinforcements in your Recruitment Core!'
                  : nexuses.some((v) => v.buildings.troopFabricator > 0)
                    ? 'No troops trained yet. Train some in your Recruitment Core!'
                    : 'No troops yet. Build a Recruitment Core!'}
              </p>
            )}
          </div>
        </div>

        {/* Active Buildings */}
        <div className="dashboard-card">
          <h3>🏗️ Construction</h3>
          {activeBuilding.length > 0 ? (
            <div className="activity-list">
              {activeBuilding.map((nexus) => (
                <div key={nexus._id} className="activity-item" onClick={() => onSelectNexus(nexus)}>
                  <div className="activity-nexus">{nexus.name}</div>
                  <div className="activity-details">
                    {BUILDING_NAMES[nexus.buildQueue[0].building] || nexus.buildQueue[0].building} → Lvl{' '}
                    {nexus.buildQueue[0].targetLevel}
                  </div>
                  <div className="activity-time">{formatTime(nexus.buildQueue[0].completesAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-activity">No active construction</p>
          )}
        </div>

        {/* Active Training */}
        <div className="dashboard-card">
          <h3>🎖️ Training</h3>
          {activeTraining.length > 0 ? (
            <div className="activity-list">
              {activeTraining.map((nexus) => (
                <div key={nexus._id} className="activity-item" onClick={() => onSelectNexus(nexus)}>
                  <div className="activity-nexus">{nexus.name}</div>
                  <div className="activity-details">
                    {nexus.trainingQueue[0].amount}x{' '}
                    {TROOP_NAMES[nexus.trainingQueue[0].troopType] || nexus.trainingQueue[0].troopType}
                  </div>
                  <div className="activity-time">{formatTime(nexus.trainingQueue[0].completesAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-activity">No active training</p>
          )}
        </div>

        {/* Outgoing Attacks */}
        {outgoingAttacks.length > 0 && (
          <div className="dashboard-card">
            <h3>⚔️ Outgoing Strikes</h3>
            <div className="activity-list">
              {outgoingAttacks.map((attack) => (
                <div
                  key={attack._id}
                  className="activity-item"
                  onClick={() => setSelectedAttack(attack)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="activity-nexus">
                    {nexuses.find((v) => v._id === attack.attacker.nexus)?.name || 'Unknown'}
                  </div>
                  <div className="activity-details">
                    → {attack.defender?.nexus?.name || 'Unknown'} ({attack.defender?.nexus?.x || '?'}|
                    {attack.defender?.nexus?.y || '?'})
                  </div>
                  <div className="activity-time">{formatTime(attack.arrivesAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nexuses + Quests — full-width row, side by side */}
        <div className="dashboard-full-row">
          <div className="dashboard-card nexuses-overview">
            <h3>🏘️ Your Nexuses</h3>
            <div className="nexuses-list">
              {nexuses.map((nexus) => (
                <div key={nexus._id} className="nexus-summary" onClick={() => onSelectNexus(nexus)}>
                  <NexusMap nexus={nexus} compact />
                  <div className="nexus-summary-header">
                    <span className="nexus-summary-name">{nexus.name}</span>
                    <span className="nexus-summary-coords">
                      ({nexus.x}|{nexus.y})
                    </span>
                  </div>
                  <div className="nexus-summary-stats">
                    <span>📊 {nexus.points} inf</span>
                    <span>
                      👥 {nexus.population.current}/{nexus.population.max}
                    </span>
                  </div>
                  <div className="nexus-summary-resources">
                    <span>
                      🧬 {Math.floor(nexus.resources.biomass).toLocaleString()}
                      <span className="resource-max">/{getStorageCapacity(nexus).toLocaleString()}</span>
                    </span>
                    <span>
                      ⚙️ {Math.floor(nexus.resources.alloy).toLocaleString()}
                      <span className="resource-max">/{getStorageCapacity(nexus).toLocaleString()}</span>
                    </span>
                    <span>
                      💎 {Math.floor(nexus.resources.ore).toLocaleString()}
                      <span className="resource-max">/{getStorageCapacity(nexus).toLocaleString()}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-card quests-overview">
            <h3>🎯 Quest Progress</h3>

            <div className="dashboard-quests-grid">
              {nexuses.map((nexus) => {
                const questBatches = getQuestBatches(nexus);
                return (
                  <div key={`quests-${nexus._id}`} className="dashboard-quest-nexus-block">
                    <div className="dashboard-quest-nexus-header">
                      <span className="dashboard-quest-nexus-name">{nexus.name}</span>
                      <button className="dashboard-quest-open-btn" onClick={() => onSelectNexus(nexus)}>
                        Open
                      </button>
                    </div>

                    {questBatches.map((batch) => {
                      const completedCount = batch.quests.filter((quest) => quest.completed).length;
                      const batchComplete = completedCount === batch.quests.length;
                      return (
                        <div
                          key={`${nexus._id}-${batch.id}`}
                          className={`intro-quests ${batch.unlocked ? '' : 'quest-batch-locked'}`}
                        >
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
                              <div
                                key={`${nexus._id}-${batch.id}-${quest.id}`}
                                className={`intro-quest-item ${quest.completed ? 'completed' : ''}`}
                              >
                                <span className="intro-quest-icon">{quest.completed ? '✅' : '⬜'}</span>
                                <div>
                                  <p className="intro-quest-title">{quest.title}</p>
                                  <p className="intro-quest-description">{quest.description}</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="quest-batch-lock-note">
                              Complete the previous quest batch to unlock this one.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* end dashboard-full-row */}
      </div>

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
                <h4>From</h4>
                <p>{nexuses.find((v) => v._id === selectedAttack.attacker.nexus)?.name || 'Unknown'}</p>
              </div>

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

export default Dashboard;
