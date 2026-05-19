import { Check, Users } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { getOutgoingAttacks } from '../services/api';
import { useGameSocket } from '../hooks/useGameSocket';
import '../styles/Dashboard.css';
import { Nexus, NexusGroup } from '../types/game';
import NexusMap from './NexusMap';
import ResourceIcon from './ResourceIcon';

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
  recruitmentCore: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
};

interface DashboardProps {
  nexuses: Nexus[];
  groups: NexusGroup[];
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

const PRODUCTION_GROWTH = 1.35;
const BASE_PRODUCTION = 600;
const STORAGE_BASE = 1000;
const STORAGE_GROWTH = 1.5;

function calcNexusProduction(nexus: Nexus) {
  return {
    biomass: Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.biomassFarm - 1)),
    alloy: Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.alloyForge - 1)),
    ore: Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.oreExtractor - 1)),
  };
}

function calcNexusStorage(nexus: Nexus) {
  return Math.floor(STORAGE_BASE * Math.pow(STORAGE_GROWTH, nexus.buildings.storageVault));
}

function liveResources(nexus: Nexus, now: number) {
  const prod = calcNexusProduction(nexus);
  const cap = calcNexusStorage(nexus);
  const anchor = nexus.lastResourceUpdate ? new Date(nexus.lastResourceUpdate).getTime() : now;
  const elapsed = Math.max(0, (now - anchor) / 3600000);
  return {
    biomass: Math.min(cap, nexus.resources.biomass + prod.biomass * elapsed),
    alloy: Math.min(cap, nexus.resources.alloy + prod.alloy * elapsed),
    ore: Math.min(cap, nexus.resources.ore + prod.ore * elapsed),
    cap,
    prod,
  };
}

function fmtAmount(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.floor(v).toString();
}

function fmtRate(v: number) {
  if (v >= 1_000) return `+${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k/h`;
  return `+${v}/h`;
}

const Dashboard: React.FC<DashboardProps> = ({ nexuses, groups, onSelectNexus }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [now, setNow] = useState(() => Date.now());
  const [outgoingAttacks, setOutgoingAttacks] = useState<any[]>([]);
  const [selectedAttack, setSelectedAttack] = useState<any | null>(null);
  const [focusedNexusId, setFocusedNexusId] = useState<string | null>(nexuses[0]?._id ?? null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  const loadOutgoingAttacks = useCallback(async () => {
    try {
      const allAttacks = await Promise.all(nexuses.map((v) => getOutgoingAttacks(v._id)));
      const attacks = allAttacks.flatMap((response) => response.data);
      setOutgoingAttacks(attacks);
    } catch (err) {
      console.error('Error loading outgoing attacks:', err);
    }
  }, [nexuses]);

  useEffect(() => {
    loadOutgoingAttacks();
  }, [loadOutgoingAttacks]);

  useGameSocket({ onAttacksRefresh: () => loadOutgoingAttacks() });
  const totalPoints = nexuses.reduce((sum, v) => sum + v.points, 0);

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

  const focusedNexus = nexuses.find((v) => v._id === focusedNexusId) ?? nexuses[0];

  const visibleNexuses =
    activeGroupId !== null
      ? nexuses.filter((n) => groups.find((g) => g.id === activeGroupId)?.nexusIds.includes(n._id))
      : nexuses;

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
        completed: done('intro', 'build_troop_fab_1', nexus.buildings.recruitmentCore >= 1),
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
      {/* ── Hero: selected nexus ── */}
      {focusedNexus && (
        <div className="cc-hero">
          <div className="cc-hero-map">
            <NexusMap nexus={focusedNexus} />
          </div>
          <div className="cc-hero-info">
            <div className="cc-hero-header">
              <div>
                <h2 className="cc-nexus-name">{focusedNexus.name}</h2>
                <span className="cc-nexus-meta">
                  ({focusedNexus.x}|{focusedNexus.y}) &nbsp;·&nbsp; {focusedNexus.points} inf &nbsp;·&nbsp;{' '}
                  <Users size={12} aria-hidden="true" style={{ verticalAlign: -2 }} />{' '}
                  {focusedNexus.population.current}/{focusedNexus.population.max}
                </span>
              </div>
              <button className="cc-manage-btn" onClick={() => onSelectNexus(focusedNexus)}>
                Manage Nexus →
              </button>
            </div>

            {/* Group filter (only when groups exist) */}
            {groups.length > 0 && (
              <div className="cc-group-tabs">
                <button
                  className={`cc-group-tab${activeGroupId === null ? ' active' : ''}`}
                  onClick={() => setActiveGroupId(null)}
                >
                  All
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    className={`cc-group-tab${activeGroupId === g.id ? ' active' : ''}`}
                    onClick={() => setActiveGroupId(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            {/* Nexus switcher (only when > 1 nexus) */}
            {visibleNexuses.length > 1 && (
              <div className="cc-nexus-tabs">
                {visibleNexuses.map((n) => (
                  <button
                    key={n._id}
                    className={`cc-nexus-tab${n._id === focusedNexus._id ? ' active' : ''}`}
                    onClick={() => setFocusedNexusId(n._id)}
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            )}

            {/* Resources */}
            {(() => {
              const live = liveResources(focusedNexus, now);
              const resEntries: { kind: 'biomass' | 'alloy' | 'ore'; label: string; val: number; rate: number }[] = [
                { kind: 'biomass', label: 'Biomass', val: live.biomass, rate: live.prod.biomass },
                { kind: 'alloy',   label: 'Alloy',   val: live.alloy,   rate: live.prod.alloy   },
                { kind: 'ore',     label: 'Ore',      val: live.ore,     rate: live.prod.ore     },
              ];
              return (
                <div className="cc-resources">
                  {resEntries.map(({ kind, label, val, rate }) => {
                    const ratio = val / live.cap;
                    const fillCls = ratio >= 0.98 ? 'cc-res-full' : ratio >= 0.85 ? 'cc-res-near' : '';
                    return (
                      <div key={label} className={`cc-resource-block ${fillCls}`}>
                        <span className="cc-resource-icon">
                          <ResourceIcon kind={kind} size={16} />
                        </span>
                        <div className="cc-resource-text">
                          <span className="cc-resource-label">{label}</span>
                          <span className="cc-resource-value">
                            {fmtAmount(val)}
                            <span className="cc-resource-cap">/{fmtAmount(live.cap)}</span>
                          </span>
                          <div className="cc-resource-bar-wrap">
                            <div className="cc-resource-bar" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                          </div>
                          <span className="cc-resource-rate">{fmtRate(rate)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Activity row ── */}
      <div className="cc-activity-row">
        {/* Construction */}
        <div className="cc-card">
          <h3 className="cc-card-title">Construction</h3>
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

        {/* Training */}
        <div className="cc-card">
          <h3 className="cc-card-title">Training</h3>
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

        {/* Outgoing Strikes */}
        <div className="cc-card">
          <h3 className="cc-card-title">Outgoing Strikes</h3>
          {outgoingAttacks.length > 0 ? (
            <div className="activity-list">
              {outgoingAttacks.map((attack) => (
                <div key={attack._id} className="activity-item" onClick={() => setSelectedAttack(attack)}>
                  <div className="activity-nexus">
                    {nexuses.find((v) => v._id === attack.attacker.nexus)?.name || 'Unknown'}
                  </div>
                  <div className="activity-details">
                    {attack.status === 'returning' ? 'returning from' : '→'}{' '}
                    {attack.defender?.nexus?.name || 'Unknown'} ({attack.defender?.nexus?.x || '?'}|
                    {attack.defender?.nexus?.y || '?'})
                  </div>
                  <div className="activity-time">
                    {formatTime(attack.status === 'returning' ? attack.returnsAt : attack.arrivesAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-activity">No outgoing strikes</p>
          )}
        </div>
      </div>

      {/* ── Bottom row: Quests (wide) + Empire summary (narrow) ── */}
      <div className="cc-bottom-row">
        {/* Quest progress */}
        <div className="cc-card cc-quests-panel">
          <h3 className="cc-card-title">Quest Progress</h3>
          <div className="dashboard-quests-grid">
            {visibleNexuses.map((nexus) => {
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
                    const completedCount = batch.quests.filter((q) => q.completed).length;
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
                              <span className="intro-quest-icon" aria-hidden="true">
                              {quest.completed ? <Check size={14} /> : null}
                            </span>
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
                </div>
              );
            })}
          </div>
        </div>

        {/* Empire summary */}
        <div className="cc-card cc-empire-panel">
          <h3 className="cc-card-title">Empire</h3>
          <div className="cc-empire-stats">
            <div className="cc-empire-stat">
              <span className="cc-empire-stat-value">{nexuses.length}</span>
              <span className="cc-empire-stat-label">Nexuses</span>
            </div>
            <div className="cc-empire-stat">
              <span className="cc-empire-stat-value">{nexuses.reduce((s, v) => s + v.points, 0)}</span>
              <span className="cc-empire-stat-label">Total Influence</span>
            </div>
            <div className="cc-empire-stat">
              <span className="cc-empire-stat-value">{totalTroopCount}</span>
              <span className="cc-empire-stat-label">Total Troops</span>
            </div>
          </div>

          {totalTroopCount > 0 && (
            <>
              <h4 className="cc-troop-heading">Troop Breakdown</h4>
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
            </>
          )}
          {totalTroopCount === 0 && (
            <p className="no-troops">
              {outgoingAttacks.length > 0
                ? 'All troops on missions!'
                : nexuses.some((v) => v.buildings.recruitmentCore > 0)
                  ? 'No troops trained yet.'
                  : 'Build a Recruitment Core to train troops.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Attack detail modal ── */}
      {selectedAttack && (
        <div className="attack-modal-overlay" onClick={() => setSelectedAttack(null)}>
          <div className="attack-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attack-modal-header">
              <h3>Strike Details</h3>
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
                <h4>Arrival Time</h4>
                <p className="arrival-countdown">{formatTime(selectedAttack.arrivesAt)}</p>
              </div>

              <div className="attack-info-section">
                <h4>Troops Sent</h4>
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
                <h4>Mission Type</h4>
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

export default Dashboard;
