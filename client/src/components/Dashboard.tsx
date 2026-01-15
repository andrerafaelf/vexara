import React, { useEffect, useState } from 'react';
import { getOutgoingAttacks } from '../services/api';
import '../styles/Dashboard.css';
import { Village } from '../types/game';

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

interface DashboardProps {
  villages: Village[];
  onSelectVillage: (village: Village) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ villages, onSelectVillage }) => {
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
    const interval = setInterval(loadOutgoingAttacks, 10000);
    return () => clearInterval(interval);
  }, [villages]);

  const loadOutgoingAttacks = async () => {
    try {
      const allAttacks = await Promise.all(villages.map((v) => getOutgoingAttacks(v._id)));
      const attacks = allAttacks.flatMap((response) => response.data);
      setOutgoingAttacks(attacks);
    } catch (err) {
      console.error('Error loading outgoing attacks:', err);
    }
  };
  const totalPoints = villages.reduce((sum, v) => sum + v.points, 0);

  const calculateProduction = (village: Village) => {
    const baseProduction = 30;
    return {
      biomass: Math.floor(baseProduction * Math.pow(1.2, village.buildings.biomassFarm - 1)),
      alloy: Math.floor(baseProduction * Math.pow(1.2, village.buildings.alloyForge - 1)),
      ore: Math.floor(baseProduction * Math.pow(1.2, village.buildings.oreExtractor - 1)),
    };
  };

  const totalProduction = villages.reduce(
    (sum, v) => {
      const prod = calculateProduction(v);
      return {
        biomass: sum.biomass + prod.biomass,
        alloy: sum.alloy + prod.alloy,
        ore: sum.ore + prod.ore,
      };
    },
    { biomass: 0, alloy: 0, ore: 0 }
  );

  const totalResources = villages.reduce(
    (sum, v) => ({
      biomass: sum.biomass + Math.floor(v.resources.biomass),
      alloy: sum.alloy + Math.floor(v.resources.alloy),
      ore: sum.ore + Math.floor(v.resources.ore),
    }),
    { biomass: 0, alloy: 0, ore: 0 }
  );
  const totalTroops = villages.reduce(
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
    }
  );

  const totalTroopCount = Object.values(totalTroops).reduce((a, b) => a + b, 0);

  const activeBuilding = villages.filter((v) => v.buildQueue.length > 0);
  const activeTraining = villages.filter((v) => v.trainingQueue.length > 0);

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

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Command Overview</h2>
        <p className="empire-stats">
          {villages.length} {villages.length === 1 ? 'Node' : 'Nodes'} • {totalPoints} Total Influence
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
                {totalResources.biomass.toLocaleString()}
                <span className="production-rate">+{totalProduction.biomass}/h</span>
              </span>
            </div>
            <div className="resource-line">
              <span className="resource-icon">⚙️</span>
              <span className="resource-label">Alloy</span>
              <span className="resource-value">
                {totalResources.alloy.toLocaleString()}
                <span className="production-rate">+{totalProduction.alloy}/h</span>
              </span>
            </div>
            <div className="resource-line">
              <span className="resource-icon">💎</span>
              <span className="resource-label">Ore</span>
              <span className="resource-value">
                {totalResources.ore.toLocaleString()}
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
                    <div key={type} className="troop-line">
                      <span>{TROOP_NAMES[type] || type}</span>
                      <span>{count}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}
            {totalTroopCount === 0 && (
              <p className="no-troops">
                {outgoingAttacks.length > 0
                  ? 'All troops deployed on missions! Train reinforcements in your Recruitment Core!'
                  : villages.some((v) => v.buildings.troopFabricator > 0)
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
              {activeBuilding.map((village) => (
                <div key={village._id} className="activity-item" onClick={() => onSelectVillage(village)}>
                  <div className="activity-village">{village.name}</div>
                  <div className="activity-details">
                    {village.buildQueue[0].building} → Lvl {village.buildQueue[0].targetLevel}
                  </div>
                  <div className="activity-time">{formatTime(village.buildQueue[0].completesAt)}</div>
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
              {activeTraining.map((village) => (
                <div key={village._id} className="activity-item" onClick={() => onSelectVillage(village)}>
                  <div className="activity-village">{village.name}</div>
                  <div className="activity-details">
                    {village.trainingQueue[0].amount}x {village.trainingQueue[0].troopType}
                  </div>
                  <div className="activity-time">{formatTime(village.trainingQueue[0].completesAt)}</div>
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
                  <div className="activity-village">
                    {villages.find((v) => v._id === attack.attacker.village)?.name || 'Unknown'}
                  </div>
                  <div className="activity-details">
                    → {attack.defender?.village?.name || 'Unknown'} ({attack.defender?.village?.x || '?'}|
                    {attack.defender?.village?.y || '?'})
                  </div>
                  <div className="activity-time">{formatTime(attack.arrivesAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="dashboard-card quick-actions-card">
          <h3>⚡ Quick Actions</h3>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => onSelectVillage(villages[0])}>
              🏛️ Manage Node
            </button>
            <button className="action-btn" disabled>
              🤝 Syndicates
            </button>
            <button className="action-btn" disabled>
              📊 Command Index
            </button>
            <button className="action-btn" disabled>
              📬 Combat Logs
            </button>
          </div>
        </div>

        {/* Villages Quick View */}
        <div className="dashboard-card villages-overview">
          <h3>🏘️ Your Nodes</h3>
          <div className="villages-list">
            {villages.map((village) => (
              <div key={village._id} className="village-summary" onClick={() => onSelectVillage(village)}>
                <div className="village-summary-header">
                  <span className="village-summary-name">{village.name}</span>
                  <span className="village-summary-coords">
                    ({village.x}|{village.y})
                  </span>
                </div>
                <div className="village-summary-stats">
                  <span>📊 {village.points} inf</span>
                  <span>
                    👥 {village.population.current}/{village.population.max}
                  </span>
                </div>
                <div className="village-summary-resources">
                  <span>🧬 {Math.floor(village.resources.biomass)}</span>
                  <span>⚙️ {Math.floor(village.resources.alloy)}</span>
                  <span>💎 {Math.floor(village.resources.ore)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                <p>{villages.find((v) => v._id === selectedAttack.attacker.village)?.name || 'Unknown'}</p>
              </div>

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
                      )
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
