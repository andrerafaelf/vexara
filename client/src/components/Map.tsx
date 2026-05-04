import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getIncomingAttacks, getMapArea, getNexusInfo, getOutgoingAttacks, sendAttack } from '../services/api';
import '../styles/Map.css';
import { Nexus } from '../types/game';

interface MapProps {
  currentNexus: Nexus;
  onRefresh: () => void;
}

interface MapNexus {
  _id: string;
  name: string;
  x: number;
  y: number;
  owner: {
    username: string;
    points: number;
  };
  points: number;
  buildings?: { shieldGrid?: number; [key: string]: number | undefined };
  resources?: { biomass: number; alloy: number; ore: number };
  troops?: { [key: string]: number };
  population?: { current: number; max: number };
  control?: number;
  controlLevel?: number;
  intelLevel?: 'public' | 'scouted' | 'owned';
  scoutedAt?: string;
}

const TROOP_LABELS: Record<string, string> = {
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

const VISIBLE_RANGE = 5;
const MAP_SIZE = 35;
const MAP_MAX_INDEX = MAP_SIZE - 1;

interface CrosshairPosition {
  left: number;
  top: number;
}

const Map: React.FC<MapProps> = ({ currentNexus, onRefresh }) => {
  const { user } = useAuth();
  const [nexuses, setVillages] = useState<MapNexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<MapNexus | null>(null);
  const [centerX, setCenterX] = useState(currentNexus.x);
  const [centerY, setCenterY] = useState(currentNexus.y);
  const [showAttackForm, setShowAttackForm] = useState(false);
  const [missionType, setMissionType] = useState<'attack' | 'scout'>('attack');
  const [attackTroops, setAttackTroops] = useState({
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
  });
  const [incomingAttacks, setIncomingAttacks] = useState<any[]>([]);
  const [outgoingAttacks, setOutgoingAttacks] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [targetX, setTargetX] = useState(String(currentNexus.x));
  const [targetY, setTargetY] = useState(String(currentNexus.y));
  const [crosshairPosition, setCrosshairPosition] = useState<CrosshairPosition | null>(null);
  const mapGridWrapperRef = useRef<HTMLDivElement | null>(null);
  const reconAvailable = currentNexus.troops?.reconOperative || 0;
  const visibleRange = VISIBLE_RANGE;
  const visibleDiameter = visibleRange * 2 + 1;

  const clampCoordinate = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      return fallback;
    }

    return Math.max(0, Math.min(MAP_MAX_INDEX, parsed));
  };

  const handleJumpToCoordinates = () => {
    const nextX = clampCoordinate(targetX, centerX);
    const nextY = clampCoordinate(targetY, centerY);
    setCenterX(nextX);
    setCenterY(nextY);
    setTargetX(String(nextX));
    setTargetY(String(nextY));
  };

  const handleResetMap = () => {
    setCenterX(currentNexus.x);
    setCenterY(currentNexus.y);
    setTargetX(String(currentNexus.x));
    setTargetY(String(currentNexus.y));
  };

  const handleCoordinateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJumpToCoordinates();
    }
  };

  // Helper function to get nexus type information
  const getNodeTypeInfo = (nodeName: string): string => {
    if (nodeName.includes('Resource Depot')) {
      return 'Resource Depot: 2x Resources - High biomass, alloy, and ore production. Perfect farming target.';
    } else if (nodeName.includes('Military Outpost')) {
      return 'Military Outpost: 1.5x Troops - Heavily defended with extra garrison. Difficult to conquer.';
    } else if (nodeName.includes('Supply Cache')) {
      return 'Supply Cache: 1.5x Resources - Extra stored resources ready to plunder.';
    } else if (nodeName.includes('Abandoned Base')) {
      return 'Abandoned Base: 30% Troops - Lightly defended ruins. Easy conquest for beginners.';
    } else if (nodeName.includes('Neutral Settlement')) {
      return 'Neutral Settlement: Standard resources and defenses. Balanced expansion target.';
    }
    return 'Unknown nexus type';
  };

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    loadMapArea();
    loadAttacks();
    const interval = setInterval(() => {
      loadAttacks();
    }, 10000);
    return () => clearInterval(interval);
  }, [centerX, centerY]);

  // Pre-select current nexus on mount
  useEffect(() => {
    const selectCurrentNexus = async () => {
      try {
        const response = await getNexusInfo(currentNexus._id);
        setSelectedNexus(response.data);
      } catch (err) {
        console.error('Error loading current nexus:', err);
      }
    };
    selectCurrentNexus();
  }, [currentNexus._id]);

  useEffect(() => {
    setTargetX(String(centerX));
    setTargetY(String(centerY));
  }, [centerX, centerY]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const step = 5;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setCenterY((prev) => Math.min(MAP_MAX_INDEX, prev + step));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setCenterY((prev) => Math.max(0, prev - step));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCenterX((prev) => Math.max(0, prev - step));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCenterX((prev) => Math.min(MAP_MAX_INDEX, prev + step));
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadMapArea = async () => {
    try {
      const response = await getMapArea(centerX, centerY);
      setVillages(response.data);
    } catch (err) {
      console.error('Error loading map:', err);
    }
  };

  const loadAttacks = async () => {
    try {
      const [incoming, outgoing] = await Promise.all([
        getIncomingAttacks(currentNexus._id),
        getOutgoingAttacks(currentNexus._id),
      ]);
      setIncomingAttacks(incoming.data);
      setOutgoingAttacks(outgoing.data);
    } catch (err) {
      console.error('Error loading attacks:', err);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      // Left mouse button
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // Store offset for visual feedback
      setDragOffset({ x: deltaX, y: deltaY });

      const dragThreshold = 90;
      const cellsX = Math.round(-deltaX / dragThreshold);
      const cellsY = Math.round(deltaY / dragThreshold);

      if (cellsX !== 0 || cellsY !== 0) {
        setCenterX((prev) => Math.max(0, Math.min(MAP_MAX_INDEX, prev + cellsX)));
        setCenterY((prev) => Math.max(0, Math.min(MAP_MAX_INDEX, prev + cellsY)));
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragOffset({ x: 0, y: 0 });
      }
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isDragging) {
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleVillageClick = async (nexus: MapNexus, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Don't process clicks if we were dragging
    if (isDragging || Math.abs(dragOffset.x) > 5 || Math.abs(dragOffset.y) > 5) {
      return;
    }
    try {
      const response = await getNexusInfo(nexus._id);
      setSelectedNexus(response.data);
      setShowAttackForm(false);
    } catch (err) {
      console.error('Error loading nexus:', err);
    }
  };

  const handleSendAttack = async () => {
    if (!selectedNexus) return;

    // Check if nexus is conquered
    if (selectedNexus.control !== undefined && selectedNexus.control <= 0) {
      alert('Cannot attack a conquered nexus!');
      return;
    }

    const totalTroops = Object.values(attackTroops).reduce((a, b) => a + b, 0);
    if (totalTroops === 0) {
      alert('Select at least one troop!');
      return;
    }

    if (missionType === 'scout') {
      const nonReconSelected = Object.entries(attackTroops).some(
        ([type, amount]) => type !== 'reconOperative' && Number(amount) > 0,
      );

      if (nonReconSelected || attackTroops.reconOperative <= 0) {
        alert('Scout missions require Recon Operatives only.');
        return;
      }
    }

    try {
      await sendAttack(currentNexus._id, selectedNexus._id, attackTroops, missionType);
      alert(missionType === 'scout' ? 'Recon mission sent!' : 'Strike sent!');
      setShowAttackForm(false);
      setMissionType('attack');
      setAttackTroops({
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
      });
      onRefresh();
      loadAttacks();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error sending strike');
    }
  };

  const formatTime = (date: Date) => {
    const diff = new Date(date).getTime() - currentTime.getTime();
    if (diff <= 0) return 'Arriving...';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const renderGrid = () => {
    const grid = [];

    for (let y = centerY + visibleRange; y >= centerY - visibleRange; y--) {
      const row = [];
      for (let x = centerX - visibleRange; x <= centerX + visibleRange; x++) {
        // Check if coordinates are outside the valid map range.
        const isOutOfBounds = x < 0 || x > MAP_MAX_INDEX || y < 0 || y > MAP_MAX_INDEX;

        const nexus = !isOutOfBounds ? nexuses.find((v) => v.x === x && v.y === y) : null;
        const isCurrent = nexus?._id === currentNexus._id;

        row.push(
          <div
            key={`${x}-${y}`}
            className={`map-cell ${isOutOfBounds ? 'out-of-bounds' : ''} ${nexus ? 'has-nexus' : ''} ${
              isCurrent ? 'current-nexus' : ''
            } ${selectedNexus?._id === nexus?._id ? 'selected' : ''}`}
            onClick={(e) => !isOutOfBounds && nexus && handleVillageClick(nexus, e)}
            title={isOutOfBounds ? 'Out of bounds' : nexus ? `${nexus.name} (${nexus.x}|${nexus.y})` : `(${x}|${y})`}
            data-x={x}
            data-y={y}
          >
            {nexus && <div className="nexus-marker">{isCurrent ? '🏛️' : '🏘️'}</div>}
            <div className="cell-coords">{isOutOfBounds ? '—' : `${x}|${y}`}</div>
          </div>,
        );
      }
      grid.push(
        <div key={y} className="map-row">
          {row}
        </div>,
      );
    }

    return grid;
  };

  useEffect(() => {
    const updateCrosshairPosition = () => {
      if (!selectedNexus || !mapGridWrapperRef.current) {
        setCrosshairPosition(null);
        return;
      }

      const selectedCell = mapGridWrapperRef.current.querySelector<HTMLElement>(
        `[data-x="${selectedNexus.x}"][data-y="${selectedNexus.y}"]`,
      );

      if (!selectedCell) {
        setCrosshairPosition(null);
        return;
      }

      const wrapperRect = mapGridWrapperRef.current.getBoundingClientRect();
      const cellRect = selectedCell.getBoundingClientRect();

      setCrosshairPosition({
        left: cellRect.left - wrapperRect.left + cellRect.width / 2,
        top: cellRect.top - wrapperRect.top + cellRect.height / 2,
      });
    };

    const frameId = window.requestAnimationFrame(updateCrosshairPosition);
    window.addEventListener('resize', updateCrosshairPosition);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateCrosshairPosition);
    };
  }, [selectedNexus, centerX, centerY, nexuses]);

  return (
    <div className="map-container">
      <div className="map-header">
        <h2>World Map</h2>
        <div className="map-info">
          <span>
            Viewing: ({centerX}|{centerY}) | Map Size: {MAP_SIZE}x{MAP_SIZE} ({MAP_SIZE * MAP_SIZE} hexes)
          </span>
          <span className="map-hint">💡 Drag to pan • Arrow keys to navigate • Jump to coordinates</span>
        </div>
        <div className="map-controls">
          <button onClick={() => setCenterY(Math.min(MAP_MAX_INDEX, centerY + 5))}>⬆️ North</button>
          <button onClick={() => setCenterX(Math.max(0, centerX - 5))}>⬅️ West</button>
          <button onClick={handleResetMap}>🏠 Reset Map</button>
          <button onClick={() => setCenterX(Math.min(MAP_MAX_INDEX, centerX + 5))}>➡️ East</button>
          <button onClick={() => setCenterY(Math.max(0, centerY - 5))}>⬇️ South</button>
          <div className="map-coordinate-controls">
            <span>Go to</span>
            <input
              type="number"
              min={0}
              max={MAP_MAX_INDEX}
              value={targetX}
              onChange={(e) => setTargetX(e.target.value)}
              onKeyDown={handleCoordinateKeyDown}
              aria-label="Target X coordinate"
            />
            <span>|</span>
            <input
              type="number"
              min={0}
              max={MAP_MAX_INDEX}
              value={targetY}
              onChange={(e) => setTargetY(e.target.value)}
              onKeyDown={handleCoordinateKeyDown}
              aria-label="Target Y coordinate"
            />
            <button onClick={handleJumpToCoordinates}>Jump</button>
          </div>
        </div>
      </div>

      <div className="map-content">
        <div className="map-grid-wrapper" ref={mapGridWrapperRef}>
          <div
            className="map-grid"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={(e) => handleMouseUp(e)}
            onMouseLeave={(e) => handleMouseUp(e)}
            onDragStart={(e) => e.preventDefault()}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {renderGrid()}
          </div>
          {selectedNexus && crosshairPosition && (
            <div
              className="map-crosshair"
              style={{
                left: `${crosshairPosition.left}px`,
                top: `${crosshairPosition.top}px`,
              }}
            >
              <div className="crosshair-line crosshair-top"></div>
              <div className="crosshair-line crosshair-bottom"></div>
              <div className="crosshair-line crosshair-left"></div>
              <div className="crosshair-line crosshair-right"></div>
              <div className="crosshair-center"></div>
            </div>
          )}
        </div>

        <div className="map-sidebar">
          {selectedNexus ? (
            <div className="nexus-details">
              <h3>
                {selectedNexus.name}
                {!selectedNexus.owner && (
                  <span className="nexus-info-icon" title={getNodeTypeInfo(selectedNexus.name)}>
                    ℹ️
                  </span>
                )}
              </h3>
              <div className="detail-line">
                <span>Owner:</span>
                <span>{selectedNexus.owner?.username || 'Neutral'}</span>
              </div>
              <div className="detail-line">
                <span>Location:</span>
                <span>
                  ({selectedNexus.x}|{selectedNexus.y})
                </span>
              </div>
              <div className="detail-line">
                <span>Points:</span>
                <span>{selectedNexus.points}</span>
              </div>
              {selectedNexus.intelLevel !== 'public' && selectedNexus.buildings && (
                <div className="detail-line">
                  <span>Shield Grid:</span>
                  <span>Level {selectedNexus.buildings.shieldGrid || 0}</span>
                </div>
              )}

              {selectedNexus.intelLevel === 'public' &&
                selectedNexus._id !== currentNexus._id &&
                selectedNexus.owner && (
                  <div className="intel-warning">
                    Detailed nexus intel is hidden. Send a Recon Operative scout mission to reveal buildings, troops,
                    resources, and control level.
                  </div>
                )}

              {selectedNexus.intelLevel !== 'public' && selectedNexus.resources && (
                <>
                  <div className="detail-line">
                    <span>Biomass:</span>
                    <span>
                      {Math.floor(selectedNexus.resources.biomass).toLocaleString()}
                      {selectedNexus.buildings?.storageVault !== undefined && (
                        <span className="resource-max-inline">
                          /{Math.floor(1000 * Math.pow(1.3, selectedNexus.buildings.storageVault)).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="detail-line">
                    <span>Alloy:</span>
                    <span>
                      {Math.floor(selectedNexus.resources.alloy).toLocaleString()}
                      {selectedNexus.buildings?.storageVault !== undefined && (
                        <span className="resource-max-inline">
                          /{Math.floor(1000 * Math.pow(1.3, selectedNexus.buildings.storageVault)).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="detail-line">
                    <span>Ore:</span>
                    <span>
                      {Math.floor(selectedNexus.resources.ore).toLocaleString()}
                      {selectedNexus.buildings?.storageVault !== undefined && (
                        <span className="resource-max-inline">
                          /{Math.floor(1000 * Math.pow(1.3, selectedNexus.buildings.storageVault)).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </div>
                  {selectedNexus.population && (
                    <div className="detail-line">
                      <span>Population:</span>
                      <span>
                        {selectedNexus.population.current}/{selectedNexus.population.max}
                      </span>
                    </div>
                  )}
                  {(selectedNexus.controlLevel !== undefined || selectedNexus.control !== undefined) && (
                    <div className="detail-line">
                      <span>Control:</span>
                      <span>{selectedNexus.controlLevel ?? selectedNexus.control}</span>
                    </div>
                  )}
                  {selectedNexus.scoutedAt && selectedNexus.intelLevel === 'scouted' && (
                    <div className="detail-line intel-timestamp">
                      <span>Scouted:</span>
                      <span>{new Date(selectedNexus.scoutedAt).toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}

              {selectedNexus._id !== currentNexus._id && selectedNexus.owner?.username !== user?.username && (
                <div className="nexus-actions">
                  {!showAttackForm ? (
                    <div className="nexus-action-buttons">
                      <button
                        className="attack-btn"
                        onClick={() => {
                          setMissionType('attack');
                          setShowAttackForm(true);
                        }}
                      >
                        ⚔️ Send Strike
                      </button>
                      <button
                        className="scout-btn"
                        disabled={reconAvailable <= 0}
                        title={reconAvailable <= 0 ? 'Requires at least 1 Recon Operative' : undefined}
                        onClick={() => {
                          if (reconAvailable <= 0) {
                            return;
                          }
                          setMissionType('scout');
                          setAttackTroops({
                            lancerDrone: 0,
                            assaultTrooper: 0,
                            breakerUnit: 0,
                            reconOperative: 1,
                            skimmerBike: 0,
                            siegeMech: 0,
                            bulwarkGuard: 0,
                            suppressorTeam: 0,
                            disruptorUnit: 0,
                            interceptorBike: 0,
                            annihilatorPlatform: 0,
                            overseer: 0,
                          });
                          setShowAttackForm(true);
                        }}
                      >
                        🔍 Scout {reconAvailable <= 0 ? '(No Recon Operatives)' : ''}
                      </button>
                    </div>
                  ) : (
                    <div className="attack-form">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4>{missionType === 'scout' ? 'Scout Mission' : 'Select Troops'}</h4>
                        <button
                          onClick={() => {
                            const allTroops: any = {};
                            Object.keys(attackTroops).forEach((type) => {
                              allTroops[type] =
                                missionType === 'scout'
                                  ? type === 'reconOperative'
                                    ? currentNexus.troops[type as keyof typeof currentNexus.troops]
                                    : 0
                                  : currentNexus.troops[type as keyof typeof currentNexus.troops];
                            });
                            setAttackTroops(allTroops);
                          }}
                          className="send-all-btn"
                          style={{
                            padding: '5px 10px',
                            fontSize: '12px',
                            backgroundColor: '#4a9eff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          📦 Send All
                        </button>
                      </div>
                      <div className="troop-selector">
                        {Object.entries(attackTroops).map(([type, amount]) => {
                          if (missionType === 'scout' && type !== 'reconOperative') {
                            return null;
                          }
                          const available = currentNexus.troops[type as keyof typeof currentNexus.troops];
                          return (
                            <div key={type} className="troop-select-row">
                              <span className="troop-type">{TROOP_LABELS[type] || type}</span>
                              <input
                                type="number"
                                min="0"
                                max={available}
                                value={amount}
                                onChange={(e) =>
                                  setAttackTroops({
                                    ...attackTroops,
                                    [type]: Math.min(parseInt(e.target.value) || 0, available),
                                  })
                                }
                              />
                              <span className="troop-available">/ {available}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="attack-form-actions">
                        <button onClick={handleSendAttack} className="send-btn">
                          {missionType === 'scout' ? 'Send Scout' : 'Send Strike'}
                        </button>
                        <button onClick={() => setShowAttackForm(false)} className="cancel-btn">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <p>Click on a nexus to view details</p>
              <p className="legend">
                🏛️ = Your nexus
                <br />
                🏘️ = Other nexuses
              </p>
            </div>
          )}

          {(incomingAttacks.length > 0 || outgoingAttacks.length > 0) && (
            <div className="attacks-panel">
              {incomingAttacks.length > 0 && (
                <div className="attacks-section">
                  <h4>🛡️ Incoming ({incomingAttacks.length})</h4>
                  {incomingAttacks.map((attack) => (
                    <div key={attack._id} className="attack-item incoming">
                      <div className="attack-from">From: {attack.attacker.nexus.name}</div>
                      <div className="attack-time">{formatTime(attack.arrivesAt)}</div>
                    </div>
                  ))}
                </div>
              )}

              {outgoingAttacks.length > 0 && (
                <div className="attacks-section">
                  <h4>⚔️ Outgoing ({outgoingAttacks.length})</h4>
                  {outgoingAttacks.map((attack) => (
                    <div key={attack._id} className="attack-item outgoing">
                      <div className="attack-to">To: {attack.defender.nexus.name}</div>
                      <div className="attack-time">{formatTime(attack.arrivesAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Map;
