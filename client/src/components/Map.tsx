import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getIncomingAttacks, getMapArea, getOutgoingAttacks, getNexusInfo, sendAttack } from '../services/api';
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
  buildings?: { wall: number };
  control?: number;
}

const Map: React.FC<MapProps> = ({ currentNexus, onRefresh }) => {
  const { user } = useAuth();
  const [nexuses, setVillages] = useState<MapNexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<MapNexus | null>(null);
  const [centerX, setCenterX] = useState(currentNexus.x);
  const [centerY, setCenterY] = useState(currentNexus.y);
  const [showAttackForm, setShowAttackForm] = useState(false);
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const step = 5;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setCenterY((prev) => Math.min(99, prev + step));
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
          setCenterX((prev) => Math.min(99, prev + step));
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

      // Update map position in real-time during drag (increased threshold for slower movement)
      const cellsX = Math.round(-deltaX / 90);
      const cellsY = Math.round(deltaY / 90);

      if (cellsX !== 0 || cellsY !== 0) {
        setCenterX((prev) => Math.max(0, Math.min(99, prev + cellsX)));
        setCenterY((prev) => Math.max(0, Math.min(99, prev + cellsY)));
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

    try {
      await sendAttack(currentNexus._id, selectedNexus._id, attackTroops);
      alert('Strike sent!');
      setShowAttackForm(false);
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
    const range = 5;

    for (let y = centerY + range; y >= centerY - range; y--) {
      const row = [];
      for (let x = centerX - range; x <= centerX + range; x++) {
        // Check if coordinates are outside the valid map range (0-99)
        const isOutOfBounds = x < 0 || x > 99 || y < 0 || y > 99;

        const nexus = !isOutOfBounds ? nexuses.find((v) => v.x === x && v.y === y) : null;
        const isCurrent = nexus?._id === currentNexus._id;

        row.push(
          <div
            key={`${x}-${y}`}
            className={`map-cell ${isOutOfBounds ? 'out-of-bounds' : ''} ${nexus ? 'has-nexus' : ''} ${
              isCurrent ? 'current-nexus' : ''
            } ${selectedNexus?._id === nexus?._id ? 'selected' : ''}`}
            onClick={(e) => !isOutOfBounds && nexus && handleVillageClick(nexus, e)}
            title={
              isOutOfBounds ? 'Out of bounds' : nexus ? `${nexus.name} (${nexus.x}|${nexus.y})` : `(${x}|${y})`
            }
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

  const getCrosshairPosition = () => {
    if (!selectedNexus) return null;

    const range = 5;
    // Calculate cell position relative to the grid
    const relX = selectedNexus.x - (centerX - range);
    const relY = centerY + range - selectedNexus.y;

    // Check if selected nexus is within visible range
    if (relX < 0 || relX > range * 2 || relY < 0 || relY > range * 2) {
      return null; // Don't show crosshair if selected nexus is off-screen
    }

    const cellSize = 60; // matches .map-cell width/height
    const gridBorder = 2; // .map-grid border width
    const gridSize = (range * 2 + 1) * cellSize + gridBorder * 2; // 11 cells * 60px + borders

    // Position relative to centered grid, accounting for border
    const left = `calc(50% - ${gridSize / 2}px + ${relX * cellSize + cellSize / 2 + gridBorder}px)`;
    const top = `calc(50% - ${gridSize / 2}px + ${relY * cellSize + cellSize / 2 + gridBorder}px)`;

    return { left, top };
  };

  return (
    <div className="map-container">
      <div className="map-header">
        <h2>World Map</h2>
        <div className="map-info">
          <span>
            Viewing: ({centerX}|{centerY}) | Map Size: 100x100 (10,000 hexes)
          </span>
          <span className="map-hint">💡 Drag to pan • Arrow keys to navigate</span>
        </div>
        <div className="map-controls">
          <button onClick={() => setCenterY(Math.min(99, centerY + 5))}>⬆️ North</button>
          <button onClick={() => setCenterX(Math.max(0, centerX - 5))}>⬅️ West</button>
          <button
            onClick={() => {
              setCenterX(currentNexus.x);
              setCenterY(currentNexus.y);
            }}
          >
            🏠 Center
          </button>
          <button onClick={() => setCenterX(Math.min(99, centerX + 5))}>➡️ East</button>
          <button onClick={() => setCenterY(Math.max(0, centerY - 5))}>⬇️ South</button>
        </div>
      </div>

      <div className="map-content">
        <div className="map-grid-wrapper">
          <div
            className="map-grid"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={(e) => handleMouseUp(e)}
            onMouseLeave={(e) => handleMouseUp(e)}
            onDragStart={(e) => e.preventDefault()}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
          >
            {renderGrid()}
          </div>
          {selectedNexus && getCrosshairPosition() && (
            <div
              className="map-crosshair"
              style={{
                left: getCrosshairPosition()!.left,
                top: getCrosshairPosition()!.top,
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
              {selectedNexus.buildings && (
                <div className="detail-line">
                  <span>Shield Grid:</span>
                  <span>Level {selectedNexus.buildings.wall}</span>
                </div>
              )}

              {selectedNexus._id !== currentNexus._id && selectedNexus.owner?.username !== user?.username && (
                <div className="nexus-actions">
                  {!showAttackForm ? (
                    <button className="attack-btn" onClick={() => setShowAttackForm(true)}>
                      ⚔️ Send Strike
                    </button>
                  ) : (
                    <div className="attack-form">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4>Select Troops</h4>
                        <button
                          onClick={() => {
                            const allTroops: any = {};
                            Object.keys(attackTroops).forEach((type) => {
                              allTroops[type] = currentNexus.troops[type as keyof typeof currentNexus.troops];
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
                          const available = currentNexus.troops[type as keyof typeof currentNexus.troops];
                          return (
                            <div key={type} className="troop-select-row">
                              <span className="troop-type">{type}</span>
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
                          Send Strike
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
