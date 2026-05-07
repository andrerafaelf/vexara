import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getIncomingAttacks,
  getMapArea,
  getMyNexuses,
  getNexusInfo,
  getOutgoingAttacks,
  sendAttack,
  sendTroops,
  transferResources,
} from '../services/api';
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

const OFFENSE_TROOPS = new Set([
  'breakerUnit',
  'skimmerBike',
  'suppressorTeam',
  'disruptorUnit',
  'interceptorBike',
  'annihilatorPlatform',
  'overseer',
]);

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
  const [ownNexuses, setOwnNexuses] = useState<Nexus[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmounts, setTransferAmounts] = useState({ biomass: '', alloy: '', ore: '' });
  const [transferring, setTransferring] = useState(false);
  const [showTroopSend, setShowTroopSend] = useState(false);
  const [troopSendAmounts, setTroopSendAmounts] = useState<Record<string, string>>({});
  const [sendingTroops, setSendingTroops] = useState(false);

  const availableTroops = useMemo(() => {
    const base: Record<string, number> = {};
    for (const key of Object.keys(TROOP_LABELS)) {
      base[key] = Number((currentNexus.troops as any)?.[key] || 0);
    }
    for (const attack of outgoingAttacks) {
      const t = attack.troops as Record<string, number> | undefined;
      if (t) {
        for (const [type, count] of Object.entries(t)) {
          if (type in base) base[type] = Math.max(0, base[type] - Number(count));
        }
      }
    }
    return base;
  }, [currentNexus.troops, outgoingAttacks]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [targetX, setTargetX] = useState(String(currentNexus.x));
  const [targetY, setTargetY] = useState(String(currentNexus.y));
  const [crosshairPosition, setCrosshairPosition] = useState<CrosshairPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const mapGridWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapGridRef = useRef<HTMLDivElement | null>(null);
  const touchDraggedRef = useRef(false);
  const touchDistanceRef = useRef(0);
  const prevZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const visibleRange = VISIBLE_RANGE;

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

  // Keyboard navigation and zoom
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

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const el = mapGridRef.current;
    if (!el) return;

    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const zoomDelta = e.deltaY > 0 ? 0.95 : 1.05;
      const newZoom = Math.max(0.5, Math.min(3, zoomRef.current * zoomDelta));
      zoomRef.current = newZoom;
      setZoom(newZoom);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchDistanceRef.current = getTouchDistance(e.touches);
        prevZoomRef.current = zoomRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchDistanceRef.current > 0) {
        e.preventDefault();
        e.stopPropagation();
        const newDistance = getTouchDistance(e.touches);
        const zoomDelta = newDistance / touchDistanceRef.current;
        if (Math.abs(zoomDelta - 1) > 0.005) {
          const newZoom = Math.max(0.5, Math.min(3, prevZoomRef.current * zoomDelta));
          zoomRef.current = newZoom;
          setZoom(newZoom);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchDistanceRef.current = 0;
        prevZoomRef.current = zoomRef.current;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
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

  useEffect(() => {
    getMyNexuses().then((r) => setOwnNexuses(r.data)).catch(() => {});
  }, [currentNexus._id]);

  const handleTransferResources = async () => {
    if (!selectedNexus) return;
    const biomass = parseInt(transferAmounts.biomass) || 0;
    const alloy = parseInt(transferAmounts.alloy) || 0;
    const ore = parseInt(transferAmounts.ore) || 0;
    if (biomass === 0 && alloy === 0 && ore === 0) return;
    setTransferring(true);
    try {
      await transferResources(currentNexus._id, selectedNexus._id, biomass, alloy, ore);
      setTransferAmounts({ biomass: '', alloy: '', ore: '' });
      setShowTransfer(false);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const handleMapSendTroops = async () => {
    if (!selectedNexus) return;
    const troops: Record<string, number> = {};
    for (const [k, v] of Object.entries(troopSendAmounts)) {
      troops[k] = parseInt(v) || 0;
    }
    setSendingTroops(true);
    try {
      await sendTroops(currentNexus._id, selectedNexus._id, troops);
      setTroopSendAmounts({});
      setShowTroopSend(false);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to send troops');
    } finally {
      setSendingTroops(false);
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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchDraggedRef.current = false;
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setDragOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 2) {
      setIsDragging(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      return;
    }
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      touchDraggedRef.current = true;
    }

    setDragOffset({ x: deltaX, y: deltaY });

    const dragThreshold = 55;
    const cellsX = Math.round(-deltaX / dragThreshold);
    const cellsY = Math.round(deltaY / dragThreshold);

    if (cellsX !== 0 || cellsY !== 0) {
      setCenterX((prev) => Math.max(0, Math.min(MAP_MAX_INDEX, prev + cellsX)));
      setCenterY((prev) => Math.max(0, Math.min(MAP_MAX_INDEX, prev + cellsY)));
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

  const handleVillageClick = async (nexus: MapNexus, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Don't process clicks if we were dragging (mouse or touch)
    if (touchDraggedRef.current || isDragging || Math.abs(dragOffset.x) > 5 || Math.abs(dragOffset.y) > 5) {
      return;
    }
    try {
      const response = await getNexusInfo(nexus._id);
      setSelectedNexus(response.data);
      setShowAttackForm(false);
      setShowTransfer(false);
      setShowTroopSend(false);
      setTransferAmounts({ biomass: '', alloy: '', ore: '' });
      setTroopSendAmounts({});
    } catch (err) {
      console.error('Error loading nexus:', err);
    }
  };

  const handleSendAttack = async () => {
    if (!selectedNexus) return;

    if (selectedNexus.control !== undefined && selectedNexus.control <= 0) {
      alert('Cannot attack a conquered nexus!');
      return;
    }

    const totalTroops = Object.values(attackTroops).reduce((a, b) => a + b, 0);
    if (totalTroops === 0) {
      alert('Select at least one troop!');
      return;
    }

    const onlyRecon =
      attackTroops.reconOperative > 0 &&
      Object.entries(attackTroops).every(([type, amount]) => type === 'reconOperative' || Number(amount) === 0);
    const resolvedType = onlyRecon ? 'scout' : 'attack';

    try {
      await sendAttack(currentNexus._id, selectedNexus._id, attackTroops, resolvedType);
      alert(resolvedType === 'scout' ? 'Recon mission sent!' : 'Strike sent!');
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

  const handleSendAllTroops = () => {
    setAttackTroops((prev) => {
      const next = { ...prev };
      for (const [type, count] of Object.entries(availableTroops)) {
        if (OFFENSE_TROOPS.has(type)) {
          (next as Record<string, number>)[type] = type === 'overseer' ? Math.min(Number(count), 1) : Number(count);
        }
      }
      return next;
    });
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
        const isOwnNexus = nexus ? ownNexuses.some((n) => n._id === nexus._id) : false;

        row.push(
          <div
            key={`${x}-${y}`}
            className={`map-cell ${isOutOfBounds ? 'out-of-bounds' : ''} ${nexus ? 'has-nexus' : ''} ${
              isCurrent ? 'current-nexus' : ''
            } ${isOwnNexus && !isCurrent ? 'own-nexus' : ''} ${selectedNexus?._id === nexus?._id ? 'selected' : ''}`}
            onClick={(e) => !isOutOfBounds && nexus && handleVillageClick(nexus, e)}
            title={isOutOfBounds ? 'Out of bounds' : nexus ? `${nexus.name} (${nexus.x}|${nexus.y})` : `(${x}|${y})`}
            data-x={x}
            data-y={y}
          >
            {nexus && (
              <div className={`nexus-marker ${isCurrent ? 'nexus-marker-current' : isOwnNexus ? 'nexus-marker-own' : 'nexus-marker-enemy'}`}>
                {isCurrent ? '⭐' : isOwnNexus ? '🏛️' : '🏘️'}
              </div>
            )}
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

  const renderNexusContent = () => {
    if (!selectedNexus) {
      return (
        <div className="no-selection">
          <p>Select a nexus on the map to view its details</p>
          <div className="legend">
            <div>⭐ Active Nexus</div>
            <div>🏛️ Your Other Nexus</div>
            <div>🏘️ Enemy / NPC Nexus</div>
          </div>
        </div>
      );
    }

    const isOwn = selectedNexus.owner?.username === user?.username;
    const isConquered = selectedNexus.control !== undefined && selectedNexus.control <= 0;
    const hasIntel = selectedNexus.intelLevel === 'scouted' || selectedNexus.intelLevel === 'owned';
    const isNpc =
      selectedNexus.name.includes('Resource Depot') ||
      selectedNexus.name.includes('Military Outpost') ||
      selectedNexus.name.includes('Supply Cache') ||
      selectedNexus.name.includes('Abandoned Base') ||
      selectedNexus.name.includes('Neutral Settlement');

    const attackTroopRows = Object.entries(availableTroops);
    const attackAvailableTroopTotal = attackTroopRows.reduce((sum, [, count]) => sum + Number(count || 0), 0);

    return (
      <div className="nexus-details">
        <h3>
          {selectedNexus.name}
          {isNpc && (
            <span className="nexus-info-icon" title={getNodeTypeInfo(selectedNexus.name)}>
              ℹ️
            </span>
          )}
        </h3>
        {isNpc && (
          <p className="nexus-node-type-info">{getNodeTypeInfo(selectedNexus.name)}</p>
        )}

        <div className="detail-line">
          <span>Owner</span>
          <span>{selectedNexus.owner?.username}</span>
        </div>
        <div className="detail-line">
          <span>Points</span>
          <span>{selectedNexus.points?.toLocaleString()}</span>
        </div>
        <div className="detail-line">
          <span>Coordinates</span>
          <span>
            ({selectedNexus.x}|{selectedNexus.y})
          </span>
        </div>
        {selectedNexus.controlLevel !== undefined && (
          <div className="detail-line">
            <span>Control</span>
            <span>
              {selectedNexus.control?.toFixed(1)}% (Lv {selectedNexus.controlLevel})
            </span>
          </div>
        )}

        {hasIntel && selectedNexus.resources && (
          <>
            <div className="detail-line">
              <span>Biomass</span>
              <span>{Math.floor(selectedNexus.resources.biomass).toLocaleString()}</span>
            </div>
            <div className="detail-line">
              <span>Alloy</span>
              <span>{Math.floor(selectedNexus.resources.alloy).toLocaleString()}</span>
            </div>
            <div className="detail-line">
              <span>Ore</span>
              <span>{Math.floor(selectedNexus.resources.ore).toLocaleString()}</span>
            </div>
          </>
        )}

        {hasIntel && selectedNexus.population && (
          <div className="detail-line">
            <span>Population</span>
            <span>
              {selectedNexus.population.current}/{selectedNexus.population.max}
            </span>
          </div>
        )}

        {hasIntel && selectedNexus.buildings?.shieldGrid !== undefined && (
          <div className="detail-line">
            <span>Shield Grid</span>
            <span>Lv {selectedNexus.buildings.shieldGrid}</span>
          </div>
        )}

        {hasIntel && selectedNexus.troops && (
          <div className="detail-line">
            <span>Troops</span>
            <span>
              {Object.values(selectedNexus.troops)
                .reduce((a, b) => a + b, 0)
                .toLocaleString()}
            </span>
          </div>
        )}

        {selectedNexus.intelLevel === 'scouted' && selectedNexus.scoutedAt && (
          <div className="intel-warning intel-timestamp">
            <span>🔍 Scouted: </span>
            <span>{new Date(selectedNexus.scoutedAt).toLocaleString()}</span>
          </div>
        )}

        {selectedNexus.intelLevel === 'public' && !isOwn && (
          <div className="intel-warning">No intel — send a scout to reveal resources and troops.</div>
        )}

        {!isOwn && (
          <div className="nexus-actions">
            {!showAttackForm ? (
              <button
                className="attack-btn"
                onClick={() => setShowAttackForm(true)}
                disabled={isConquered}
                title={isConquered ? 'Nexus already conquered' : 'Launch attack'}
              >
                ⚔️ {isConquered ? 'Conquered' : 'Attack'}
              </button>
            ) : (
              <div className="attack-form">
                <h4>⚔️ Launch Attack</h4>
                <div className="troop-selector">
                  {attackTroopRows.map(([type, available]) => {
                    const effectiveMax = type === 'overseer' ? Math.min(Number(available), 1) : Number(available);
                    return (
                      <div key={type} className="troop-select-row">
                        <span className="troop-type">{TROOP_LABELS[type] || type}</span>
                        <input
                          type="number"
                          min={0}
                          max={effectiveMax}
                          value={attackTroops[type as keyof typeof attackTroops]}
                          disabled={effectiveMax <= 0}
                          onChange={(e) =>
                            setAttackTroops((prev) => ({
                              ...prev,
                              [type]: Math.min(Number(e.target.value), effectiveMax),
                            }))
                          }
                        />
                        <span
                          className={`troop-available${effectiveMax > 0 ? ' troop-available-clickable' : ''}`}
                          onClick={() => {
                            if (effectiveMax > 0) {
                              setAttackTroops((prev) => ({ ...prev, [type]: effectiveMax }));
                            }
                          }}
                        >
                          /{available}{type === 'overseer' && Number(available) > 1 ? ' (max 1)' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="attack-form-actions">
                  <button
                    className="send-all-btn"
                    onClick={handleSendAllTroops}
                    disabled={attackAvailableTroopTotal <= 0}
                    title="Fill all available troops"
                  >
                    Send All
                  </button>
                  <button
                    className="send-btn"
                    onClick={handleSendAttack}
                    disabled={attackAvailableTroopTotal <= 0}
                  >
                    Send Attack
                  </button>
                  <button className="cancel-btn" onClick={() => setShowAttackForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isOwn && selectedNexus._id !== currentNexus._id && (
          <div className="nexus-own-actions">
            <div className="transfer-section">
              <button
                type="button"
                className="transfer-toggle-btn"
                onClick={() => { setShowTransfer((v) => !v); setShowTroopSend(false); }}
              >
                📦 Send Resources {showTransfer ? '▲' : '▼'}
              </button>
              {showTransfer && (
                <div className="transfer-panel">
                  <p className="transfer-from-label">From: <strong>{currentNexus.name}</strong> → <strong>{selectedNexus.name}</strong></p>
                  <div className="transfer-inputs">
                    {(['biomass', 'alloy', 'ore'] as const).map((res) => {
                      const available = Math.floor(currentNexus.resources[res]);
                      return (
                        <div key={res} className="transfer-input-row">
                          <label>{res === 'biomass' ? '🌿 Biomass' : res === 'alloy' ? '🔩 Alloy' : '⛏️ Ore'}</label>
                          <input
                            type="number"
                            min={0}
                            max={available}
                            placeholder="0"
                            value={transferAmounts[res]}
                            onChange={(e) => setTransferAmounts((a) => ({ ...a, [res]: e.target.value }))}
                          />
                          <span className="transfer-available">/ {available.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="transfer-send-btn"
                    disabled={transferring}
                    onClick={handleTransferResources}
                  >
                    {transferring ? 'Sending…' : 'Send'}
                  </button>
                </div>
              )}
            </div>

            <div className="transfer-section">
              <button
                type="button"
                className="transfer-toggle-btn"
                onClick={() => { setShowTroopSend((v) => !v); setShowTransfer(false); }}
              >
                🚀 Send Troops {showTroopSend ? '▲' : '▼'}
              </button>
              {showTroopSend && (
                <div className="transfer-panel">
                  <p className="transfer-from-label">From: <strong>{currentNexus.name}</strong> → <strong>{selectedNexus.name}</strong></p>
                  <div className="transfer-inputs">
                    {Object.entries(currentNexus.troops as Record<string, number>)
                      .filter(([, count]) => Number(count) > 0)
                      .map(([type, count]) => (
                        <div key={type} className="transfer-input-row">
                          <label>{TROOP_LABELS[type] || type}</label>
                          <input
                            type="number"
                            min={0}
                            max={Number(count)}
                            placeholder="0"
                            value={troopSendAmounts[type] || ''}
                            onChange={(e) => setTroopSendAmounts((a) => ({ ...a, [type]: e.target.value }))}
                          />
                          <span className="transfer-available">/ {count}</span>
                        </div>
                      ))}
                    {Object.values(currentNexus.troops as Record<string, number>).every((c) => Number(c) === 0) && (
                      <p className="map-empty-state">No troops available to send.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="transfer-send-btn"
                    disabled={sendingTroops}
                    onClick={handleMapSendTroops}
                  >
                    {sendingTroops ? 'Sending…' : 'Send Troops'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAttacksPanel = () => {
    if (incomingAttacks.length === 0 && outgoingAttacks.length === 0) return null;

    return (
      <div className="attacks-panel">
        {incomingAttacks.length > 0 && (
          <div className="attacks-section">
            <h4>⚠️ Incoming ({incomingAttacks.length})</h4>
            {incomingAttacks.map((attack: any) => (
              <div key={attack._id} className="attack-item incoming">
                <div className="attack-from">
                  From: <strong>{attack.attackerNexus?.name || 'Unknown'}</strong>
                </div>
                <div className="attack-time">Arrives: {formatTime(attack.arrivesAt)}</div>
              </div>
            ))}
          </div>
        )}
        {outgoingAttacks.length > 0 && (
          <div className="attacks-section">
            <h4>🚀 Outgoing ({outgoingAttacks.length})</h4>
            {outgoingAttacks.map((attack: any) => (
              <div key={attack._id} className="attack-item outgoing">
                <div className="attack-to">
                  To: <strong>{attack.defenderNexus?.name || 'Unknown'}</strong>
                </div>
                <div className="attack-time">Arrives: {formatTime(attack.arrivesAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="map-container">
      <div className="map-header">
        <h2>World Map</h2>
        <div className="map-info">
          <span>
            Viewing: ({centerX}|{centerY}) | Map Size: {MAP_SIZE}x{MAP_SIZE} ({MAP_SIZE * MAP_SIZE} hexes)
          </span>
          <span className="map-hint">💡 Drag or swipe to pan • Ctrl+scroll or pinch to zoom</span>
        </div>
        <div className="map-controls">
          <button onClick={handleResetMap}>🏠 Reset Map</button>
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
            ref={mapGridRef}
            className="map-grid"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={(e) => handleMouseUp(e)}
            onMouseLeave={(e) => handleMouseUp(e)}
            onDragStart={(e) => e.preventDefault()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', transform: `scale(${zoom})`, transformOrigin: 'center' }}
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
          {renderNexusContent()}
          {renderAttacksPanel()}
        </div>

        {selectedNexus && (
          <div
            className="map-mobile-modal-overlay"
            onClick={() => {
              setSelectedNexus(null);
              setShowAttackForm(false);
            }}
          >
            <div className="map-mobile-modal" onClick={(e) => e.stopPropagation()}>
              <div className="map-mobile-modal-header">
                <h3>{selectedNexus.name}</h3>
                <button
                  className="map-mobile-modal-close"
                  onClick={() => {
                    setSelectedNexus(null);
                    setShowAttackForm(false);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="map-mobile-modal-body">
                {renderNexusContent()}
                {renderAttacksPanel()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Map;
