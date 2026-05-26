import { AlertTriangle, Building, Home, Info, Shield, Sparkles, Star, Swords, Waves, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useGameSocket } from '../hooks/useGameSocket';
import WavePlanner from './WavePlanner';
import Username from './Username';
import {
  getGalaxyEvents,
  getIncomingAttacks,
  getMapArea,
  getMyNexuses,
  getNexusHistory,
  getNexusInfo,
  getOutgoingAttacks,
  sendAttack,
  sendTroops,
  transferResources,
} from '../services/api';
import '../styles/Map.css';
import { Nexus } from '../types/game';
import { formatDateTime } from '../utils/date';

interface GalaxyEvent {
  id: number;
  type: string;
  title: string;
  description: string;
  x?: number | null;
  y?: number | null;
  nexusId?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  meta?: {
    resource?: string;
    resources?: string[];
    multiplier?: number;
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
  } | null;
}

interface MapProps {
  currentNexus: Nexus;
  onRefresh: () => void;
  mode?: 'normal' | 'espionage';
  onSelectSpyTarget?: (nexus: MapNexus) => void;
  espionageHint?: string;
}

export interface MapNexus {
  _id: string;
  name: string;
  x: number;
  y: number;
  owner: {
    username: string;
    isSupporter?: boolean;
    supporterTier?: string | null;
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
  newbieProtectionEndsAt?: string | null;
  isFriendly?: boolean;
  /**
   * 'faction' = same faction as the viewer.
   * 'friend'  = on the viewer's friends list but not in the same faction.
   * Used by the map to colour these owners distinctly from neutrals/enemies.
   */
  relation?: 'faction' | 'friend' | null;
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
  voidStalker: 'Void Stalker',
  overseer: 'Overseer',
};

const OFFENSE_TROOPS = new Set([
  'breakerUnit',
  'skimmerBike',
  'suppressorTeam',
  'disruptorUnit',
  'interceptorBike',
  'annihilatorPlatform',
  'voidStalker',
  'overseer',
]);

const VISIBLE_RANGE = 5;
const MIN_VISIBLE_RANGE = 2;
const MAX_VISIBLE_RANGE = 10;
const MAP_SIZE = 35;
const MAP_MAX_INDEX = MAP_SIZE - 1;
const MOBILE_BREAKPOINT = 768;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

interface CrosshairPosition {
  left: number;
  top: number;
}

const Map: React.FC<MapProps> = ({ currentNexus, onRefresh, mode = 'normal', onSelectSpyTarget, espionageHint }) => {
  const { user } = useAuth();
  const toast = useToast();
  const isMobile = useIsMobile();
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
    voidStalker: 0,
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
  const [showWavePlanner, setShowWavePlanner] = useState(false);
  const [attackMissionType, setAttackMissionType] = useState<'attack' | 'support'>('attack');
  const [galaxyEvents, setGalaxyEvents] = useState<GalaxyEvent[]>([]);
  const [eventsStartAt, setEventsStartAt] = useState<string | null>(null);
  const [showEventsPanel, setShowEventsPanel] = useState(false);
  const [nexusHistory, setNexusHistory] = useState<any[]>([]);

  // currentNexus.troops is already the server-authoritative post-deduction
  // count (the server deducts on send). Subtracting outgoing attacks on top
  // would double-deduct troops that are already gone from the nexus snapshot.
  const availableTroops = useMemo(() => {
    const base: Record<string, number> = {};
    for (const key of Object.keys(TROOP_LABELS)) {
      base[key] = Number((currentNexus.troops as any)?.[key] || 0);
    }
    return base;
  }, [currentNexus.troops]);
  const currentTimeRef = useRef(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [targetX, setTargetX] = useState(String(currentNexus.x));
  const [targetY, setTargetY] = useState(String(currentNexus.y));
  const [crosshairPosition, setCrosshairPosition] = useState<CrosshairPosition | null>(null);
  const [visibleRange, setVisibleRange] = useState(VISIBLE_RANGE);
  const mapGridWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapGridRef = useRef<HTMLDivElement | null>(null);
  const touchDraggedRef = useRef(false);
  const touchDistanceRef = useRef(0);
  const prevRangeRef = useRef(VISIBLE_RANGE);
  const rangeRef = useRef(VISIBLE_RANGE);

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
      return 'Military Outpost: 2x Shield Efficiency, 2x Training Speed - Heavily defended. Difficult to conquer.';
    } else if (nodeName.includes('Supply Cache')) {
      return 'Supply Cache: 2x Storage, 40% Loot Protection - Large stockpile, but raiding it yields less.';
    } else if (nodeName.includes('Abandoned Base')) {
      return 'Abandoned Base: 30% Troops - Lightly defended ruins. Easy conquest for beginners.';
    } else if (nodeName.includes('Neutral Settlement')) {
      return 'Neutral Settlement: Standard resources and defenses. Balanced expansion target.';
    }
    return 'Unknown nexus type';
  };

  useEffect(() => {
    const timeInterval = setInterval(() => {
      currentTimeRef.current = new Date();
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  const mapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
    mapDebounceRef.current = setTimeout(() => {
      loadMapArea();
    }, 450);
    return () => {
      if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
    };
  }, [centerX, centerY]);

  // Pre-select current nexus on mount (desktop only, on mobile this would
  // immediately pop the modal open before the user has interacted)
  useEffect(() => {
    if (isMobile) return;
    const selectCurrentNexus = async () => {
      try {
        const response = await getNexusInfo(currentNexus._id);
        setSelectedNexus(response.data);
      } catch (err) {
        console.error('Error loading current nexus:', err);
      }
    };
    selectCurrentNexus();
  }, [currentNexus._id, isMobile]);

  useEffect(() => {
    setTargetX(String(centerX));
    setTargetY(String(centerY));
  }, [centerX, centerY]);

  // Keyboard navigation and zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
    rangeRef.current = visibleRange;
  }, [visibleRange]);

  useEffect(() => {
    const el = mapGridRef.current;
    if (!el) return;

    const clampRange = (r: number) =>
      Math.max(MIN_VISIBLE_RANGE, Math.min(MAX_VISIBLE_RANGE, Math.round(r)));

    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Two-listener split so plain wheel never blocks page scroll:
    //  - passive listener performs the zoom calc on ctrl/meta+wheel
    //  - non-passive listener calls preventDefault only on ctrl/meta+wheel
    //    to suppress the browser's native page-zoom gesture
    // Without ctrl/meta both handlers no-op, so wheel events bubble freely to
    // whatever ancestor scrolls (e.g. .main-content on the espionage tab).
    const onWheelZoom = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const delta = e.deltaY > 0 ? 1 : -1;
      const newRange = clampRange(rangeRef.current + delta);
      if (newRange !== rangeRef.current) {
        rangeRef.current = newRange;
        setVisibleRange(newRange);
      }
    };
    const onWheelPrevent = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
    };

    let pinchStartRange = rangeRef.current;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchDistanceRef.current = getTouchDistance(e.touches);
        prevRangeRef.current = rangeRef.current;
        pinchStartRange = rangeRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchDistanceRef.current > 0) {
        e.preventDefault();
        e.stopPropagation();
        const newDistance = getTouchDistance(e.touches);
        const ratio = newDistance / touchDistanceRef.current;
        const targetRange = pinchStartRange / ratio;
        const newRange = clampRange(targetRange);
        if (newRange !== rangeRef.current) {
          rangeRef.current = newRange;
          setVisibleRange(newRange);
        }
      } else if (e.touches.length === 1) {
        // Prevent page scroll while panning the map with one finger.
        // This must be in the non-passive listener (passive: false above) —
        // React's synthetic onTouchMove is passive and ignores preventDefault.
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchDistanceRef.current = 0;
        prevRangeRef.current = rangeRef.current;
      }
    };

    el.addEventListener('wheel', onWheelZoom, { passive: true });
    el.addEventListener('wheel', onWheelPrevent, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheelZoom);
      el.removeEventListener('wheel', onWheelPrevent);
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

  const loadAttacks = useCallback(async () => {
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
  }, [currentNexus._id]);

  useEffect(() => {
    loadAttacks();
  }, [loadAttacks]);

  useGameSocket({ onAttacksRefresh: () => loadAttacks() });

  useEffect(() => {
    getMyNexuses().then((r) => setOwnNexuses(r.data)).catch(() => {});
  }, [currentNexus._id]);

  useEffect(() => {
    const apply = (data: { events?: GalaxyEvent[]; eventsStartAt?: string | null } | GalaxyEvent[]) => {
      // Backward-compat: older server build returned a bare array.
      if (Array.isArray(data)) {
        setGalaxyEvents(data);
        setEventsStartAt(null);
        return;
      }
      setGalaxyEvents(data.events ?? []);
      setEventsStartAt(data.eventsStartAt ?? null);
    };
    getGalaxyEvents().then((r) => apply(r.data)).catch(() => {});
    const interval = setInterval(() => {
      getGalaxyEvents().then((r) => apply(r.data)).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
      toast(`Resources sent to ${selectedNexus.name}`, 'success');
      onRefresh();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Transfer failed', 'error');
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
      toast(`Troops sent to ${selectedNexus.name}`, 'success');
      onRefresh();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to send troops', 'error');
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

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (touchDraggedRef.current || isDragging || Math.abs(dragOffset.x) > 5 || Math.abs(dragOffset.y) > 5) {
      return;
    }
    const cellEl = (e.target as HTMLElement).closest<HTMLElement>('.map-cell');
    if (!cellEl) return;
    const xAttr = cellEl.getAttribute('data-x');
    const yAttr = cellEl.getAttribute('data-y');
    if (xAttr == null || yAttr == null) return;
    const cx = Number(xAttr);
    const cy = Number(yAttr);
    const nexus = nexusLookup[`${cx},${cy}`];
    if (!nexus) return;
    if (mode === 'espionage' && nexus._id !== currentNexus._id) {
      onSelectSpyTarget?.(nexus);
      return;
    }
    handleVillageClick(nexus, e);
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
      const [infoRes, historyRes] = await Promise.all([
        getNexusInfo(nexus._id),
        getNexusHistory(nexus._id).catch(() => ({ data: [] })),
      ]);
      setSelectedNexus(infoRes.data);
      setNexusHistory(historyRes.data ?? []);
      setShowAttackForm(false);
      setShowTransfer(false);
      setShowTroopSend(false);
      setShowWavePlanner(false);
      setAttackMissionType('attack');
      setTransferAmounts({ biomass: '', alloy: '', ore: '' });
      setTroopSendAmounts({});
    } catch (err) {
      console.error('Error loading nexus:', err);
    }
  };

  const handleSendAttack = async () => {
    if (!selectedNexus) return;

    if (selectedNexus.control !== undefined && selectedNexus.control <= 0) {
      toast('Cannot attack a conquered nexus', 'error');
      return;
    }

    const totalTroops = Object.values(attackTroops).reduce((a, b) => a + b, 0);
    if (totalTroops === 0) {
      toast('Select at least one troop', 'error');
      return;
    }

    try {
      await sendAttack(currentNexus._id, selectedNexus._id, attackTroops, attackMissionType);
      const missionLabel = attackMissionType === 'support' ? 'Support mission sent' : 'Strike sent';
      toast(missionLabel, 'success');
      setShowAttackForm(false);
      setAttackMissionType('attack');
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
        voidStalker: 0,
        overseer: 0,
      });
      onRefresh();
      loadAttacks();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error sending strike', 'error');
    }
  };

  const handleSendAllTroops = () => {
    setAttackTroops((prev) => {
      const next = { ...prev };
      for (const [type, count] of Object.entries(availableTroops)) {
        if (attackMissionType === 'support') {
          // Support: send all non-overseer troops
          if (type !== 'overseer') {
            (next as Record<string, number>)[type] = Number(count);
          }
        } else if (OFFENSE_TROOPS.has(type)) {
          (next as Record<string, number>)[type] = type === 'overseer' ? Math.min(Number(count), 1) : Number(count);
        }
      }
      return next;
    });
  };

  const formatTime = (date: Date) => {
    const diff = new Date(date).getTime() - currentTimeRef.current.getTime();
    if (diff <= 0) return 'Arriving...';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const nexusLookup = useMemo(() => {
    const m: Record<string, MapNexus> = {};
    for (const n of nexuses) m[`${n.x},${n.y}`] = n;
    return m;
  }, [nexuses]);

  const ownNexusIds = useMemo(() => new Set(ownNexuses.map((n) => n._id)), [ownNexuses]);

  const isEspionage = mode === 'espionage';

  const gridCells = useMemo(() => {
    const grid = [];

    for (let y = centerY + visibleRange; y >= centerY - visibleRange; y--) {
      const row = [];
      for (let x = centerX - visibleRange; x <= centerX + visibleRange; x++) {
        const isOutOfBounds = x < 0 || x > MAP_MAX_INDEX || y < 0 || y > MAP_MAX_INDEX;

        const nexus = !isOutOfBounds ? nexusLookup[`${x},${y}`] ?? null : null;
        const isCurrent = nexus?._id === currentNexus._id;
        const isOwnNexus = nexus ? ownNexusIds.has(nexus._id) : false;
        const isNpcNexus = nexus
          ? nexus.name.includes('Resource Depot') ||
            nexus.name.includes('Military Outpost') ||
            nexus.name.includes('Supply Cache') ||
            nexus.name.includes('Abandoned Base') ||
            nexus.name.includes('Neutral Settlement')
          : false;
        const isEnemyNexus = !!nexus && !isCurrent && !isOwnNexus && !isNpcNexus;

        const isInStormZone = !isOutOfBounds && galaxyEvents.some(
          (ev) =>
            ev.type === 'resource_storm' &&
            ev.meta?.xMin != null &&
            x >= ev.meta.xMin! &&
            x <= ev.meta.xMax! &&
            y >= ev.meta.yMin! &&
            y <= ev.meta.yMax!,
        );

        const isFactionNexus = isEnemyNexus && nexus?.relation === 'faction';
        const isAllyNexus = isEnemyNexus && nexus?.relation === 'friend';

        const cellClasses = ['map-cell'];
        if (isOutOfBounds) cellClasses.push('out-of-bounds');
        if (isInStormZone) cellClasses.push('resource-storm-zone');
        if (nexus) cellClasses.push('has-nexus');
        if (isCurrent) cellClasses.push('current-nexus');
        if (isOwnNexus && !isCurrent) cellClasses.push('own-nexus');
        if (isFactionNexus) cellClasses.push('faction-nexus');
        else if (isAllyNexus) cellClasses.push('ally-nexus');
        else if (isEnemyNexus) cellClasses.push('enemy-nexus');
        if (isEspionage && nexus && !isCurrent) cellClasses.push('spy-target');

        const titleText = isOutOfBounds
          ? 'Out of bounds'
          : nexus
            ? nexus.newbieProtectionEndsAt && new Date(nexus.newbieProtectionEndsAt) > currentTimeRef.current
              ? `${nexus.name} (${nexus.x}|${nexus.y}) · Protected`
              : `${nexus.name} (${nexus.x}|${nexus.y})`
            : `(${x}|${y})`;

        row.push(
          <div
            key={`${x}-${y}`}
            className={cellClasses.join(' ')}
            title={titleText}
            data-x={x}
            data-y={y}
          >
            {nexus && (
              <div
                className={`nexus-marker ${
                  isCurrent
                    ? 'nexus-marker-current'
                    : isOwnNexus
                      ? 'nexus-marker-own'
                      : isFactionNexus
                        ? 'nexus-marker-faction'
                        : isAllyNexus
                          ? 'nexus-marker-ally'
                          : 'nexus-marker-enemy'
                }`}
                aria-hidden="true"
              >
                {isCurrent ? <Star size={14} /> : isOwnNexus ? <Building size={14} /> : <Home size={14} />}
              </div>
            )}
            <div className="cell-coords">{isOutOfBounds ? '.' : `${x}|${y}`}</div>
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
  }, [nexusLookup, ownNexusIds, centerX, centerY, visibleRange, currentNexus._id, isEspionage, galaxyEvents]);

  useEffect(() => {
    if (!selectedNexus) {
      setCrosshairPosition(null);
      return;
    }
    const dx = selectedNexus.x - centerX;
    const dy = centerY - selectedNexus.y;
    if (Math.abs(dx) > visibleRange || Math.abs(dy) > visibleRange) {
      setCrosshairPosition(null);
      return;
    }
    const update = () => {
      const wrapper = mapGridWrapperRef.current;
      const grid = mapGridRef.current;
      if (!wrapper || !grid) {
        setCrosshairPosition(null);
        return;
      }
      const wrapperRect = wrapper.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const cellSize = gridRect.width / (visibleRange * 2 + 1);
      const left = gridRect.left - wrapperRect.left + (dx + visibleRange + 0.5) * cellSize;
      const top = gridRect.top - wrapperRect.top + (dy + visibleRange + 0.5) * cellSize;
      setCrosshairPosition({ left, top });
    };
    const frameId = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', update);
    };
  }, [selectedNexus, centerX, centerY, visibleRange]);

  const renderNexusContent = () => {
    if (!selectedNexus) {
      return (
        <div className="no-selection">
          <p>Select a nexus on the map to view its details</p>
          <div className="legend">
            <div className="legend-row legend-row-current">Active Nexus</div>
            <div className="legend-row legend-row-own">Your Other Nexus</div>
            <div className="legend-row legend-row-faction">Faction Member</div>
            <div className="legend-row legend-row-ally">Ally / Friend</div>
            <div className="legend-row legend-row-enemy">Enemy / NPC Nexus</div>
          </div>
        </div>
      );
    }

    const isOwn = selectedNexus.owner?.username === user?.username;
    const isConquered = selectedNexus.control !== undefined && selectedNexus.control <= 0;
    const hasIntel = selectedNexus.intelLevel === 'scouted' || selectedNexus.intelLevel === 'owned';
    const isNewbieProtected = !!selectedNexus.newbieProtectionEndsAt && new Date(selectedNexus.newbieProtectionEndsAt) > currentTimeRef.current;
    const isNpc =
      selectedNexus.name.includes('Resource Depot') ||
      selectedNexus.name.includes('Military Outpost') ||
      selectedNexus.name.includes('Supply Cache') ||
      selectedNexus.name.includes('Abandoned Base') ||
      selectedNexus.name.includes('Neutral Settlement');

    const attackTroopRows = Object.entries(availableTroops).filter(([type]) => type !== 'reconOperative');
    const attackAvailableTroopTotal = attackTroopRows.reduce((sum, [, count]) => sum + Number(count || 0), 0);

    return (
      <div className="nexus-details">
        <h3>
          {selectedNexus.name}
          {isNpc && (
            <span
              className="nexus-info-icon"
              title={getNodeTypeInfo(selectedNexus.name)}
              aria-label={getNodeTypeInfo(selectedNexus.name)}
            >
              <Info size={14} />
            </span>
          )}
        </h3>
        {isNpc && (
          <p className="nexus-node-type-info">{getNodeTypeInfo(selectedNexus.name)}</p>
        )}

        {isNewbieProtected && (
          <div className="newbie-protection-banner">
            <Shield size={14} className="newbie-protection-icon" aria-hidden="true" />
            <span className="newbie-protection-text">
              Newbie protection &middot; cannot be attacked for{' '}
              {formatTime(new Date(selectedNexus.newbieProtectionEndsAt!))}
            </span>
          </div>
        )}

        <div className="detail-line">
          <span>Owner</span>
          <Username name={selectedNexus.owner?.username ?? ''} isSupporter={selectedNexus.owner?.isSupporter} supporterTier={selectedNexus.owner?.supporterTier as any} linkToProfile />
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
            <span>Scouted: </span>
            <span>{formatDateTime(selectedNexus.scoutedAt)}</span>
          </div>
        )}

        {selectedNexus.intelLevel === 'public' && !isOwn && (
          <div className="intel-warning">No intel. Send a scout to reveal resources and troops.</div>
        )}

        {nexusHistory.length > 0 && (
          <div className="nexus-history">
            <div className="nexus-history-title">Recent Attacks</div>
            {nexusHistory.map((h: any) => (
              <div key={h.id} className="nexus-history-row">
                <span className={`nexus-history-result${h.victory === true ? ' win' : h.victory === false ? ' loss' : ''}`}>
                  {h.isScout ? '🔭' : h.conquered ? '⚑' : h.victory === true ? '✓' : h.victory === false ? '✗' : '?'}
                </span>
                <span className="nexus-history-names">
                  {h.attackerNexus} → {h.defenderNexus}
                </span>
              </div>
            ))}
          </div>
        )}

        {!isOwn && (
          <div className="nexus-actions">
            {!showAttackForm ? (
              <div className="nexus-action-buttons">
                <button
                  className="attack-btn"
                  onClick={() => { setAttackMissionType('attack'); setShowAttackForm(true); }}
                  disabled={isConquered || isNewbieProtected}
                  title={
                    isConquered
                      ? 'Nexus already conquered'
                      : isNewbieProtected
                        ? `Protected by newbie shield · ${formatTime(new Date(selectedNexus.newbieProtectionEndsAt!))} remaining`
                        : 'Launch attack'
                  }
                >
                  <Swords size={14} aria-hidden="true" />{' '}
                  {isConquered ? 'Conquered' : isNewbieProtected ? 'Protected' : 'Attack'}
                </button>
                {selectedNexus.isFriendly && selectedNexus.owner && (
                  <button
                    className="support-btn"
                    onClick={() => { setAttackMissionType('support'); setShowAttackForm(true); }}
                    title="Send troops to reinforce this ally's nexus"
                  >
                    <Shield size={14} aria-hidden="true" /> Support
                  </button>
                )}
                {!isConquered && !isNewbieProtected && ownNexuses.length > 1 && (
                  <button
                    className="wave-planner-btn"
                    onClick={() => setShowWavePlanner(true)}
                    title="Open Wave Planner. Coordinate multiple attacks to arrive simultaneously"
                  >
                    <Waves size={14} aria-hidden="true" /> Wave Planner
                  </button>
                )}
              </div>
            ) : (
              <div className="attack-form">
                <h4>{attackMissionType === 'support' ? 'Send Support' : 'Launch Attack'}</h4>
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
                    {attackMissionType === 'support' ? 'Send Support' : 'Send Attack'}
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
              >Send Resources {showTransfer ? '▲' : '▼'}
              </button>
              {showTransfer && (
                <div className="transfer-panel">
                  <p className="transfer-from-label">From: <strong>{currentNexus.name}</strong> → <strong>{selectedNexus.name}</strong></p>
                  <div className="transfer-inputs">
                    {(['biomass', 'alloy', 'ore'] as const).map((res) => {
                      const available = Math.floor(currentNexus.resources[res]);
                      return (
                        <div key={res} className="transfer-input-row">
                          <label>{res === 'biomass' ? 'Biomass' : res === 'alloy' ? 'Alloy' : 'Ore'}</label>
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
              >Send Troops {showTroopSend ? '▲' : '▼'}
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
            <h4>Incoming ({incomingAttacks.length})</h4>
            {incomingAttacks.map((attack: any) => {
              const isSupport = attack.type === 'support';
              return (
                <div key={attack._id} className={`attack-item incoming${isSupport ? ' support-mission' : ''}`}>
                  <div className="attack-from">
                    {isSupport && <span className="support-mission-badge">Support</span>}
                    From: <strong>{attack.attacker?.nexus?.name || 'Unknown'}</strong>
                  </div>
                  <div className="attack-time">Arrives: {formatTime(attack.arrivesAt)}</div>
                </div>
              );
            })}
          </div>
        )}
        {outgoingAttacks.length > 0 && (
          <div className="attacks-section">
            <h4>Outgoing ({outgoingAttacks.length})</h4>
            {outgoingAttacks.map((attack: any) => {
              const isSupport = attack.type === 'support';
              const isReturning = attack.status === 'returning';
              const label = isSupport ? 'Supporting:' : isReturning ? 'Returning from:' : 'To:';
              const timeLabel = isReturning ? 'Returns:' : 'Arrives:';
              return (
                <div key={attack._id} className={`attack-item outgoing${isSupport ? ' support-mission' : ''}`}>
                  <div className="attack-to">
                    {isSupport && <span className="support-mission-badge">Support</span>}
                    {label}{' '}
                    <strong>
                      {attack.defender?.nexus?.name
                        ? `${attack.defender.nexus.name} (${attack.defender.nexus.x}|${attack.defender.nexus.y})`
                        : `Unknown`}
                    </strong>
                  </div>
                  <div className="attack-time">
                    {timeLabel}{' '}
                    {formatTime(isReturning ? attack.returnsAt : attack.arrivesAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderGalaxyEventsPanel = () => {
    if (mode !== 'normal') return null;

    const startsAtMs = eventsStartAt ? new Date(eventsStartAt).getTime() : null;
    const nowMs = currentTimeRef.current.getTime();
    const isPreStart = startsAtMs != null && startsAtMs > nowMs;

    if (isPreStart) {
      const diff = startsAtMs! - nowMs;
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const label = days > 0
        ? `${days}d ${hours}h ${minutes}m`
        : hours > 0
          ? `${hours}h ${minutes}m`
          : `${minutes}m`;
      return (
        <div className="galaxy-events-section">
          <div className="galaxy-events-toggle galaxy-events-toggle--pre" aria-live="polite">
            <Sparkles size={13} aria-hidden="true" />
            <span>Galaxy events start in {label}</span>
          </div>
        </div>
      );
    }

    if (galaxyEvents.length === 0) return null;
    return (
      <div className="galaxy-events-section">
        <button
          className="galaxy-events-toggle"
          onClick={() => setShowEventsPanel((v) => !v)}
          aria-expanded={showEventsPanel}
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>{galaxyEvents.length} galaxy event{galaxyEvents.length !== 1 ? 's' : ''}</span>
          <span className="galaxy-events-chevron">{showEventsPanel ? '▲' : '▼'}</span>
        </button>
        {showEventsPanel && (
          <div className="galaxy-events-panel">
            {galaxyEvents.map((ev) => {
              const EventIcon = ev.type === 'resource_storm' ? Zap
                : ev.type === 'rogue_ai' ? AlertTriangle
                : Star;
              return (
                <div key={ev.id} className={`galaxy-event-card galaxy-event-card--${ev.type}`}>
                  <div className="galaxy-event-card-header">
                    <EventIcon size={13} aria-hidden="true" />
                    <strong>{ev.title}</strong>
                    {ev.x != null && ev.y != null && (
                      <button
                        className="galaxy-event-goto"
                        onClick={() => {
                          setCenterX(ev.x!);
                          setCenterY(ev.y!);
                        }}
                      >
                        ({ev.x}|{ev.y})
                      </button>
                    )}
                  </div>
                  <p className="galaxy-event-desc">{ev.description}</p>
                  {ev.type === 'resource_storm' && ev.meta?.xMin != null && (
                    <p className="galaxy-event-quadrant">
                      Zone: ({ev.meta.xMin}–{ev.meta.xMax} | {ev.meta.yMin}–{ev.meta.yMax})
                    </p>
                  )}
                  {ev.expiresAt && (
                    <span className="galaxy-event-expires">
                      Expires {new Date(ev.expiresAt).toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="map-container">
      {mode === 'normal' && <div className="map-header">
        <div className="map-info">
          <span className="map-viewing">({centerX}|{centerY})</span>
          <span className="map-hint">Drag to pan · Ctrl+scroll to zoom</span>
        </div>
        <div className="map-controls">
          <div className="map-coordinate-controls">
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
          <button onClick={handleResetMap} className="map-reset-btn">Reset</button>
        </div>
      </div>}
      {mode === 'espionage' && (
        <div className="map-header map-header--espionage">
          <span className="map-hint">{espionageHint ?? 'Click a nexus to select it as your spy target'}</span>
        </div>
      )}

      <div className="map-content">
        <div className="map-content-mobile-events">
          {renderGalaxyEventsPanel()}
        </div>
        <div className="map-grid-wrapper" ref={mapGridWrapperRef}>
          <div
            ref={mapGridRef}
            className={`map-grid${isEspionage ? ' map-grid--espionage' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={(e) => handleMouseUp(e)}
            onMouseLeave={(e) => handleMouseUp(e)}
            onClick={handleGridClick}
            onDragStart={(e) => e.preventDefault()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              ['--map-visible-range' as any]: visibleRange * 2 + 1,
            }}
          >
            {gridCells}
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

        {mode === 'normal' && (
          <div className="map-sidebar">
            {renderGalaxyEventsPanel()}
            {renderNexusContent()}
            {renderAttacksPanel()}
          </div>
        )}

        {mode === 'normal' && showWavePlanner && selectedNexus && (
          <WavePlanner
            target={{ _id: selectedNexus._id, name: selectedNexus.name, x: selectedNexus.x, y: selectedNexus.y }}
            onClose={() => setShowWavePlanner(false)}
          />
        )}

        {mode === 'normal' && isMobile && selectedNexus && (
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
