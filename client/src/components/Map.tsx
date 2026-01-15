import React, { useEffect, useState } from 'react';
import { getIncomingAttacks, getMapArea, getOutgoingAttacks, getVillageInfo, sendAttack } from '../services/api';
import '../styles/Map.css';
import { Village } from '../types/game';

interface MapProps {
  currentVillage: Village;
  onRefresh: () => void;
}

interface MapVillage {
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
}

const Map: React.FC<MapProps> = ({ currentVillage, onRefresh }) => {
  const [villages, setVillages] = useState<MapVillage[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<MapVillage | null>(null);
  const [centerX, setCenterX] = useState(currentVillage.x);
  const [centerY, setCenterY] = useState(currentVillage.y);
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

  // Helper function to get node type information
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
    return 'Unknown node type';
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

  // Pre-select current node on mount
  useEffect(() => {
    const selectCurrentVillage = async () => {
      try {
        const response = await getVillageInfo(currentVillage._id);
        setSelectedVillage(response.data);
      } catch (err) {
        console.error('Error loading current node:', err);
      }
    };
    selectCurrentVillage();
  }, [currentVillage._id]);

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
        getIncomingAttacks(currentVillage._id),
        getOutgoingAttacks(currentVillage._id),
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

  const handleVillageClick = async (village: MapVillage, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Don't process clicks if we were dragging
    if (isDragging || Math.abs(dragOffset.x) > 5 || Math.abs(dragOffset.y) > 5) {
      return;
    }
    try {
      const response = await getVillageInfo(village._id);
      setSelectedVillage(response.data);
      setShowAttackForm(false);
    } catch (err) {
      console.error('Error loading village:', err);
    }
  };

  const handleSendAttack = async () => {
    if (!selectedVillage) return;

    const totalTroops = Object.values(attackTroops).reduce((a, b) => a + b, 0);
    if (totalTroops === 0) {
      alert('Select at least one troop!');
      return;
    }

    try {
      await sendAttack(currentVillage._id, selectedVillage._id, attackTroops);
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

        const village = !isOutOfBounds ? villages.find((v) => v.x === x && v.y === y) : null;
        const isCurrent = village?._id === currentVillage._id;

        row.push(
          <div
            key={`${x}-${y}`}
            className={`map-cell ${isOutOfBounds ? 'out-of-bounds' : ''} ${village ? 'has-village' : ''} ${
              isCurrent ? 'current-village' : ''
            } ${selectedVillage?._id === village?._id ? 'selected' : ''}`}
            onClick={(e) => !isOutOfBounds && village && handleVillageClick(village, e)}
            title={
              isOutOfBounds ? 'Out of bounds' : village ? `${village.name} (${village.x}|${village.y})` : `(${x}|${y})`
            }
            data-x={x}
            data-y={y}
          >
            {village && <div className="village-marker">{isCurrent ? '🏛️' : '🏘️'}</div>}
            <div className="cell-coords">{isOutOfBounds ? '—' : `${x}|${y}`}</div>
          </div>
        );
      }
      grid.push(
        <div key={y} className="map-row">
          {row}
        </div>
      );
    }

    return grid;
  };

  const getCrosshairPosition = () => {
    if (!selectedVillage) return null;

    const range = 5;
    // Calculate cell position relative to the grid
    const relX = selectedVillage.x - (centerX - range);
    const relY = centerY + range - selectedVillage.y;

    // Check if selected village is within visible range
    if (relX < 0 || relX > range * 2 || relY < 0 || relY > range * 2) {
      return null; // Don't show crosshair if selected village is off-screen
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
              setCenterX(currentVillage.x);
              setCenterY(currentVillage.y);
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
          {selectedVillage && getCrosshairPosition() && (
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
          {selectedVillage ? (
            <div className="village-details">
              <h3>
                {selectedVillage.name}
                {!selectedVillage.owner && (
                  <span className="node-info-icon" title={getNodeTypeInfo(selectedVillage.name)}>
                    ℹ️
                  </span>
                )}
              </h3>
              <div className="detail-line">
                <span>Owner:</span>
                <span>{selectedVillage.owner?.username || 'Neutral'}</span>
              </div>
              <div className="detail-line">
                <span>Location:</span>
                <span>
                  ({selectedVillage.x}|{selectedVillage.y})
                </span>
              </div>
              <div className="detail-line">
                <span>Points:</span>
                <span>{selectedVillage.points}</span>
              </div>
              {selectedVillage.buildings && (
                <div className="detail-line">
                  <span>Shield Grid:</span>
                  <span>Level {selectedVillage.buildings.wall}</span>
                </div>
              )}

              {selectedVillage._id !== currentVillage._id && (
                <div className="village-actions">
                  {!showAttackForm ? (
                    <button className="attack-btn" onClick={() => setShowAttackForm(true)}>
                      ⚔️ Send Strike
                    </button>
                  ) : (
                    <div className="attack-form">
                      <h4>Select Troops</h4>
                      <div className="troop-selector">
                        {Object.entries(attackTroops).map(([type, amount]) => {
                          const available = currentVillage.troops[type as keyof typeof currentVillage.troops];
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
              <p>Click on a node to view details</p>
              <p className="legend">
                🏛️ = Your node
                <br />
                🏘️ = Other nodes
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
                      <div className="attack-from">From: {attack.attacker.village.name}</div>
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
                      <div className="attack-to">To: {attack.defender.village.name}</div>
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
