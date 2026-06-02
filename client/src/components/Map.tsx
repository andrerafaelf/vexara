import { useNow } from '@/hooks/useNow';
import {
	AlertTriangle,
	Clock,
	Crosshair,
	Info,
	Minus,
	Plus,
	Shield,
	Sparkles,
	Star,
	Swords,
	Waves,
	Zap
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useToast } from '../context/ToastContext';
import { useGameSocket } from '../hooks/useGameSocket';
import { useMapCamera } from '../hooks/useMapCamera';
import { MapCell, type CellKind, type MapCellData } from './MapCell';
import {
	getGalaxyEvents,
	getIncomingAttacks,
	getMapArea,
	getMyNexuses,
	getNexusHistory,
	getNexusInfo,
	getOutgoingAttacks,
	markFactionTarget,
	relocateNexus,
	sendAttack,
	sendTroops,
	transferResources,
	unmarkFactionTarget
} from '../services/api';
import '../styles/Map.css';
import { Nexus } from '../types/game';
import { formatDateTime, formatTimeOfDay } from '../utils/date';
import { transferTravelMinutes, travelMinutes } from '../utils/travel';
import { Countdown } from './Countdown';
import Username from './Username';
import WavePlanner from './WavePlanner';

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
	isFactionTarget?: boolean;
}

// NPC nexuses are identified by name prefix (the server names them by type).
const NPC_NAME_FRAGMENTS = [
	'Resource Depot',
	'Military Outpost',
	'Supply Cache',
	'Abandoned Base',
	'Neutral Settlement'
];
const isNpcNexusName = (name: string) => NPC_NAME_FRAGMENTS.some((f) => name.includes(f));

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
	overseer: 'Overseer'
};

const OFFENSE_TROOPS = new Set([
	'breakerUnit',
	'skimmerBike',
	'suppressorTeam',
	'disruptorUnit',
	'interceptorBike',
	'annihilatorPlatform',
	'voidStalker',
	'overseer'
]);

// Stationing troops at another nexus - an ally's (support) or your own
// (transfer) - is one operation and accepts DEFENSIVE units only. Offensive
// units, Overseers, Recon, and the stationary Plasma Turret are excluded.
// Mirrors the server's STATIONABLE_TROOPS; the server is the authoritative gate.
const STATIONABLE_TROOPS = new Set([
	'assaultTrooper',
	'lancerDrone',
	'siegeMech',
	'bulwarkGuard'
]);

// Must match the `range` the server's /map/area endpoint returns around the
// requested center (mapController.getArea). The client fetches this radius and
// reuses it as a pan buffer, only refetching when the viewport nears its edge.
const SERVER_FETCH_RANGE = 10;
const MAP_SIZE = 50;
const MAP_MAX_INDEX = MAP_SIZE - 1;
const MOBILE_BREAKPOINT = 768;

// ── Camera model ──────────────────────────────────────────────────────────
// One cell is CELL_PX CSS pixels at zoom 1; the camera scales this layer with a
// GPU transform, so zoom is a cheap compositing op (no DOM rebuild, no refetch).
// Tactical view: zoomed all the way out you see a local sector (~±9 cells), and
// the hook enforces a viewport-derived min-zoom floor so you can never scroll
// past the rendered/fetched window on any screen size.
const CELL_PX = 72;
const MIN_ZOOM = 0.55; // nominal lower bound (hook clamps tighter per viewport)
const MAX_ZOOM = 2.4; // close-in detail
const ZOOM_STEP = 0.18; // keyboard / button nudge
// The rendered cell window is centred on the last fetched sector and matches the
// server's returned radius, so the camera can pan freely over it without a
// refetch or a DOM rebuild until the centre drifts toward the window edge.
const RENDER_RADIUS = SERVER_FETCH_RANGE;

const useIsMobile = () => {
	const [isMobile, setIsMobile] = useState(() =>
		typeof window !== 'undefined'
			? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
			: false
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

const Map: React.FC<MapProps> = ({
	currentNexus,
	onRefresh,
	mode = 'normal',
	onSelectSpyTarget,
	espionageHint
}) => {
	const { user } = useAuth();
	const { currentStep, advance: advanceOnboarding } = useOnboarding();
	const toast = useToast();
	const isMobile = useIsMobile();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [nexuses, setVillages] = useState<MapNexus[]>([]);
	const [selectedNexus, setSelectedNexus] = useState<MapNexus | null>(null);
	const [showAttackForm, setShowAttackForm] = useState(false);
	const EMPTY_ATTACK_TROOPS = {
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
		overseer: 0
	};
	const [attackTroops, setAttackTroops] = useState(EMPTY_ATTACK_TROOPS);
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
	const [factionTargeting, setFactionTargeting] = useState(false);
	const [relocating, setRelocating] = useState(false);
	const [mapLoading, setMapLoading] = useState(false);
	useNow(); // keep component ticking for Countdown leaves
	const isSendAttackOnboarding = currentStep?.id === 'send_attack';

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
	const [targetX, setTargetX] = useState(String(currentNexus.x));
	const [targetY, setTargetY] = useState(String(currentNexus.y));

	// Continuous pixel-space camera. The hook works in SCREEN-ROW space (row 0 at
	// the top), but the game's y axis grows upward, so we flip y at the boundary:
	// row = MAP_MAX_INDEX - mapY. Cells are laid out the same way, so the camera
	// and the grid agree. centerX/centerY/zoom are the *settled* values (updated
	// only at rest); live pan/zoom is written straight to the layer transform in
	// the hook's rAF loop, so neither a pan nor a zoom re-renders the grid.
	const {
		layerRef,
		viewportRef,
		centerX,
		centerY: centerRow,
		zoom,
		isPanning,
		moveTo: moveToRow,
		zoomBy
	} = useMapCamera({
		cellPx: CELL_PX,
		maxIndex: MAP_MAX_INDEX,
		initialCenterX: currentNexus.x,
		initialCenterY: MAP_MAX_INDEX - currentNexus.y,
		minZoom: MIN_ZOOM,
		maxZoom: MAX_ZOOM,
		renderRadius: RENDER_RADIUS,
		// Espionage selects targets by tapping; leave single-finger touch to the
		// browser there so the page still scrolls. Pinch-zoom always works.
		allowTouchPan: mode === 'normal'
	});
	const centerY = MAP_MAX_INDEX - centerRow;
	const moveTo = useCallback(
		(mapX: number, mapY: number) => moveToRow(mapX, MAP_MAX_INDEX - mapY),
		[moveToRow]
	);

	// Latest settled centre, read by event handlers (keyboard) without stale closures.
	const camCenterRef = useRef({ x: centerX, y: centerY });
	useEffect(() => {
		camCenterRef.current = { x: centerX, y: centerY };
	}, [centerX, centerY]);

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
		moveTo(nextX, nextY);
		setTargetX(String(nextX));
		setTargetY(String(nextY));
		const nexusAtCoords = nexusLookup[`${nextX},${nextY}`];
		if (nexusAtCoords) handleVillageClick(nexusAtCoords);
	};

	const handleResetMap = () => {
		moveTo(currentNexus.x, currentNexus.y);
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
	// Center of the most recently fetched area. The server returns a SERVER_FETCH_RANGE
	// radius around it, so as long as the visible window stays inside that buffer we
	// can pan without refetching — the nexuses are already in state. This is what
	// makes panning feel instant instead of blanking + reloading every cell move.
	const lastFetchRef = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		// Refetch only when the settled centre drifts far enough from the last
		// fetched sector that the rendered window would expose un-fetched cells.
		// Zoom does NOT enter this calc — the camera scales the same rendered
		// window, so zooming never refetches. The render window (RENDER_RADIUS)
		// is sized to cover the widest viewport at min zoom, and the buffer keeps
		// a margin so the edge is refreshed before it scrolls into view.
		const last = lastFetchRef.current;
		const buffer = Math.max(2, SERVER_FETCH_RANGE - RENDER_RADIUS / 2);
		const needsFetch =
			!last || Math.abs(centerX - last.x) > buffer || Math.abs(centerY - last.y) > buffer;

		if (!needsFetch) return;

		if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
		// Short debounce: long enough to coalesce a fast drag, short enough that the
		// fetch feels responsive when you stop. The buffer above already absorbs most
		// small pans, so this only fires on meaningful viewport moves.
		mapDebounceRef.current = setTimeout(() => {
			loadMapArea();
		}, 180);
		return () => {
			if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [centerX, centerY]);

	// Pre-select current nexus on mount (desktop only, on mobile this would
	// immediately pop the modal open before the user has interacted)
	useEffect(() => {
		if (mode !== 'normal') return;
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
	}, [currentNexus._id, isMobile, mode]);

	// When arriving with ?attack=<nexusId> (from Reports / Espionage "Attack Again"),
	// jump to that target, select it, and open the attack form.
	useEffect(() => {
		if (mode !== 'normal') return;
		const attackId = searchParams?.get('attack');
		if (!attackId) return;
		let cancelled = false;
		(async () => {
			try {
				const r = await getNexusInfo(attackId);
				if (cancelled || !r.data) return;
				setSelectedNexus(r.data);
				moveTo(r.data.x, r.data.y);
				setAttackMissionType('attack');
				setAttackTroops(EMPTY_ATTACK_TROOPS);
				setShowAttackForm(true);
			} catch {
				toast('Could not load target nexus', 'error');
			} finally {
				// Clear the param so a refresh doesn't re-trigger.
				const nextParams = new URLSearchParams(searchParams.toString());
				nextParams.delete('attack');
				const query = nextParams.toString();
				router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, pathname, searchParams]);

	// When arriving with ?cx=N&cy=N (e.g. from a troop-movement link), center
	// the map on those coordinates and clear the params so a refresh doesn't re-fire.
	useEffect(() => {
		if (mode !== 'normal') return;
		const rawCx = searchParams?.get('cx');
		const rawCy = searchParams?.get('cy');
		if (rawCx == null && rawCy == null) return;
		moveTo(
			rawCx != null ? clampCoordinate(rawCx, centerX) : centerX,
			rawCy != null ? clampCoordinate(rawCy, centerY) : centerY
		);
		const nextParams = new URLSearchParams(searchParams.toString());
		nextParams.delete('cx');
		nextParams.delete('cy');
		const query = nextParams.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, pathname, searchParams]);

	useEffect(() => {
		setTargetX(String(centerX));
		setTargetY(String(centerY));
	}, [centerX, centerY]);

	// Keyboard navigation: arrows pan by a few cells, +/- zoom. All gesture
	// input (drag, wheel, pinch) is owned by the camera hook on the viewport.
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			const step = 5;
			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					moveTo(camCenterRef.current.x, camCenterRef.current.y + step);
					break;
				case 'ArrowDown':
					e.preventDefault();
					moveTo(camCenterRef.current.x, camCenterRef.current.y - step);
					break;
				case 'ArrowLeft':
					e.preventDefault();
					moveTo(camCenterRef.current.x - step, camCenterRef.current.y);
					break;
				case 'ArrowRight':
					e.preventDefault();
					moveTo(camCenterRef.current.x + step, camCenterRef.current.y);
					break;
				case '+':
				case '=':
					e.preventDefault();
					zoomBy(ZOOM_STEP);
					break;
				case '-':
				case '_':
					e.preventDefault();
					zoomBy(-ZOOM_STEP);
					break;
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const loadMapArea = async () => {
		const fetchX = centerX;
		const fetchY = centerY;
		setMapLoading(true);
		try {
			const response = await getMapArea(fetchX, fetchY);
			// Keep old markers on screen until the new ones arrive (no blank flash),
			// then record the fetched center so the pan buffer knows what's covered.
			setVillages(response.data);
			lastFetchRef.current = { x: fetchX, y: fetchY };
		} catch (err) {
			console.error('Error loading map:', err);
		} finally {
			setMapLoading(false);
		}
	};

	const loadAttacks = useCallback(async () => {
		try {
			const [incoming, outgoing] = await Promise.all([
				getIncomingAttacks(currentNexus._id),
				getOutgoingAttacks(currentNexus._id)
			]);
			setIncomingAttacks(incoming.data);
			setOutgoingAttacks(outgoing.data);
		} catch (err) {
			console.error('Error loading attacks:', err);
		}
	}, [currentNexus._id]);

	useEffect(() => {
		if (mode !== 'normal') return;
		loadAttacks();
	}, [loadAttacks, mode]);

	useGameSocket({
		onAttacksRefresh: () => {
			if (mode === 'normal') loadAttacks();
		}
	});

	// Poll every 2s while any outgoing attack is past its arrival time but not yet resolved,
	// so the UI clears within ~2s instead of waiting up to 10s for the next server push.
	useEffect(() => {
		const now = Date.now();
		const hasPending = outgoingAttacks.some(
			(a) => a.status === 'traveling' && new Date(a.arrivesAt).getTime() <= now
		);
		if (!hasPending) return;
		const id = setInterval(() => {
			void loadAttacks();
		}, 2000);
		return () => clearInterval(id);
	}, [outgoingAttacks, loadAttacks]);

	useEffect(() => {
		getMyNexuses()
			.then((r) => setOwnNexuses(r.data))
			.catch(() => {});
	}, [currentNexus._id]);

	useEffect(() => {
		const apply = (
			data: { events?: GalaxyEvent[]; eventsStartAt?: string | null } | GalaxyEvent[]
		) => {
			// Backward-compat: older server build returned a bare array.
			if (Array.isArray(data)) {
				setGalaxyEvents(data);
				setEventsStartAt(null);
				return;
			}
			setGalaxyEvents(data.events ?? []);
			setEventsStartAt(data.eventsStartAt ?? null);
		};
		getGalaxyEvents()
			.then((r) => apply(r.data))
			.catch(() => {});
		const interval = setInterval(
			() => {
				getGalaxyEvents()
					.then((r) => apply(r.data))
					.catch(() => {});
			},
			5 * 60 * 1000
		);
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
			const res = await transferResources(currentNexus._id, selectedNexus._id, biomass, alloy, ore);
			setTransferAmounts({ biomass: '', alloy: '', ore: '' });
			setShowTransfer(false);
			// The server clamps to the destination's remaining storage; warn if some
			// was held back rather than silently dropping it.
			if (res?.data?.clamped) {
				toast(`Partly sent to ${selectedNexus.name} — its storage was nearly full.`, 'info');
			} else {
				toast(`Resources sent to ${selectedNexus.name}`, 'success');
			}
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

	const handleRelocate = async () => {
		if (!selectedNexus) return;
		const ok = window.confirm(
			`Relocate your nexus to the nearest open tile beside ${selectedNexus.name} (${selectedNexus.x}|${selectedNexus.y})?\n\n` +
				'This is a one-time move. The token expires when your newbie protection ends, ' +
				'and you cannot relocate while troops or attacks are in transit.'
		);
		if (!ok) return;
		setRelocating(true);
		try {
			await relocateNexus(selectedNexus._id);
			toast('Nexus relocated.', 'success');
			setSelectedNexus(null);
			onRefresh();
		} catch (err: any) {
			toast(err.response?.data?.error || 'Relocation failed', 'error');
		} finally {
			setRelocating(false);
		}
	};

	// Distinguish a tap/click (select a nexus) from a drag (pan). The camera hook
	// moves the map; here we only track how far the pointer travelled between
	// down and up so a pan doesn't also register as a click. Hit-testing still
	// rides the cell DOM's data-x/data-y, which works through the CSS transform.
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	const movedTooFarRef = useRef(false);
	const CLICK_SLOP = 6; // px of travel allowed before a click becomes a drag

	const handlePointerDownCapture = (e: React.PointerEvent) => {
		pointerDownRef.current = { x: e.clientX, y: e.clientY };
		movedTooFarRef.current = false;
	};
	const handlePointerMoveCapture = (e: React.PointerEvent) => {
		const start = pointerDownRef.current;
		if (!start) return;
		if (Math.abs(e.clientX - start.x) > CLICK_SLOP || Math.abs(e.clientY - start.y) > CLICK_SLOP) {
			movedTooFarRef.current = true;
		}
	};

	const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
		// Suppress the click that follows a drag/flick.
		if (movedTooFarRef.current || isPanning) return;
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
		// Don't process clicks that were really the end of a pan gesture.
		if (movedTooFarRef.current || isPanning) {
			return;
		}
		try {
			const [infoRes, historyRes] = await Promise.all([
				getNexusInfo(nexus._id),
				getNexusHistory(nexus._id).catch(() => ({ data: [] }))
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
			if (isSendAttackOnboarding && attackMissionType === 'attack') {
				advanceOnboarding();
			}
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
				overseer: 0
			});
			onRefresh();
			loadAttacks();
		} catch (err: any) {
			toast(err.response?.data?.error || 'Error sending strike', 'error');
		}
	};

	const handleToggleFactionTarget = async () => {
		if (!selectedNexus) return;
		setFactionTargeting(true);
		try {
			if (selectedNexus.isFactionTarget) {
				await unmarkFactionTarget(selectedNexus._id);
				setSelectedNexus((prev) => (prev ? { ...prev, isFactionTarget: false } : prev));
				// update the map cell too
				setVillages((prev) =>
					prev.map((n) => (n._id === selectedNexus._id ? { ...n, isFactionTarget: false } : n))
				);
				toast('Faction target removed', 'info');
			} else {
				await markFactionTarget(selectedNexus._id);
				setSelectedNexus((prev) => (prev ? { ...prev, isFactionTarget: true } : prev));
				setVillages((prev) =>
					prev.map((n) => (n._id === selectedNexus._id ? { ...n, isFactionTarget: true } : n))
				);
				toast('Marked as faction target', 'success');
			}
		} catch (err: any) {
			toast(err.response?.data?.error || 'Error updating faction target', 'error');
		} finally {
			setFactionTargeting(false);
		}
	};

	const handleSendAllTroops = () => {
		setAttackTroops((prev) => {
			const next = { ...prev };
			for (const [type, count] of Object.entries(availableTroops)) {
				if (attackMissionType === 'support') {
					if (STATIONABLE_TROOPS.has(type)) {
						(next as Record<string, number>)[type] = Number(count);
					}
				} else if (OFFENSE_TROOPS.has(type)) {
					(next as Record<string, number>)[type] =
						type === 'overseer' ? Math.min(Number(count), 1) : Number(count);
				}
			}
			return next;
		});
	};

	const estimateTravelTime = (): { duration: string; arrivesAt: Date } | null => {
		if (!selectedNexus) return null;
		const totalTroops = Object.values(attackTroops).reduce((a, b) => a + b, 0);
		if (totalTroops === 0) return null;
		const mins = travelMinutes(currentNexus, selectedNexus, attackTroops, attackMissionType);
		if (mins <= 0) return null;
		const arrivesAt = new Date(Date.now() + mins * 60_000);
		return { duration: formatTravelMinutes(mins), arrivesAt };
	};

	const estimateTroopTransferTime = (): { duration: string; arrivesAt: Date } | null => {
		if (!selectedNexus) return null;
		const totalTroops = Object.values(troopSendAmounts).reduce(
			(sum, value) => sum + (parseInt(value, 10) || 0),
			0
		);
		if (totalTroops === 0) return null;
		const mins = transferTravelMinutes(currentNexus, selectedNexus);
		if (mins <= 0) return null;
		const arrivesAt = new Date(Date.now() + mins * 60_000);
		return { duration: formatTravelMinutes(mins), arrivesAt };
	};

	const formatTravelMinutes = (mins: number): string => {
		if (mins < 1) return '< 1m';
		const h = Math.floor(mins / 60);
		const m = Math.floor(mins % 60);
		const s = Math.floor((mins * 60) % 60);
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
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

	const hasVisibleOnboardingAttackTarget = useMemo(
		() =>
			nexuses.some(
				(nexus) =>
					isNpcNexusName(nexus.name) &&
					nexus._id !== currentNexus._id &&
					!ownNexusIds.has(nexus._id) &&
					Math.abs(nexus.x - centerX) <= RENDER_RADIUS &&
					Math.abs(nexus.y - centerY) <= RENDER_RADIUS
			),
		[nexuses, currentNexus._id, ownNexusIds, centerX, centerY]
	);

	// Storm zones rarely change; precompute the active rectangles once per events
	// update so per-cell classification is a cheap point-in-rect test.
	const stormRects = useMemo(
		() =>
			galaxyEvents
				.filter((ev) => ev.type === 'resource_storm' && ev.meta?.xMin != null)
				.map((ev) => ({
					xMin: ev.meta!.xMin!,
					xMax: ev.meta!.xMax!,
					yMin: ev.meta!.yMin!,
					yMax: ev.meta!.yMax!
				})),
		[galaxyEvents]
	);

	// Build the stable cell window. It is centred on the SETTLED centre (which
	// only changes at rest, when a refetch is also triggered), so this list is
	// rebuilt on data/selection changes — never during a pan or zoom. The camera
	// hook slides/scales the parent layer over these world-positioned cells.
	const cells = useMemo<MapCellData[]>(() => {
		const out: MapCellData[] = [];
		const selId = selectedNexus?._id ?? null;
		for (let y = centerY - RENDER_RADIUS; y <= centerY + RENDER_RADIUS; y++) {
			if (y < 0 || y > MAP_MAX_INDEX) continue;
			for (let x = centerX - RENDER_RADIUS; x <= centerX + RENDER_RADIUS; x++) {
				if (x < 0 || x > MAP_MAX_INDEX) continue;
				const nexus = nexusLookup[`${x},${y}`] ?? null;
				const isCurrent = nexus?._id === currentNexus._id;
				const isOwn = nexus ? ownNexusIds.has(nexus._id) : false;
				const isNpc = nexus ? isNpcNexusName(nexus.name) : false;
				const isEnemy = !!nexus && !isCurrent && !isOwn && !isNpc;

				let kind: CellKind = 'empty';
				if (nexus) {
					if (isCurrent) kind = 'current';
					else if (isOwn) kind = 'own';
					else if (isEnemy && nexus.relation === 'faction') kind = 'faction';
					else if (isEnemy && nexus.relation === 'friend') kind = 'ally';
					else if (isEnemy) kind = 'enemy';
					else kind = 'npc';
				}

				const isFactionTarget = !!nexus?.isFactionTarget && !isCurrent && !isOwn;
				const isInStormZone = stormRects.some(
					(r) => x >= r.xMin && x <= r.xMax && y >= r.yMin && y <= r.yMax
				);
				const isSpyTarget = isEspionage && !!nexus && !isCurrent;
				const ownerLabel =
					isEspionage && nexus && !isCurrent ? (nexus.owner?.username ?? null) : null;

				const protectedNow =
					nexus?.newbieProtectionEndsAt &&
					new Date(nexus.newbieProtectionEndsAt) > currentTimeRef.current;
				const title = nexus
					? protectedNow
						? `${nexus.name} (${nexus.x}|${nexus.y}) · Protected`
						: isFactionTarget
							? `${nexus.name} (${nexus.x}|${nexus.y}) · Faction Target`
							: `${nexus.name} (${nexus.x}|${nexus.y})`
					: `(${x}|${y})`;

				const onboarding =
					isSendAttackOnboarding &&
					!selectedNexus &&
					mode === 'normal' &&
					hasVisibleOnboardingAttackTarget &&
					isNpc &&
					!isCurrent &&
					!isOwn;

				out.push({
					x,
					y,
					// World space: y grows DOWNWARD in screen space, but the map's
					// y axis grows upward, so flip y for layout. The camera works in
					// this same flipped world space.
					worldLeft: x * CELL_PX,
					worldTop: (MAP_MAX_INDEX - y) * CELL_PX,
					cellPx: CELL_PX,
					nexus,
					kind,
					isSelected: !!selId && nexus?._id === selId,
					isFactionTarget,
					isInStormZone,
					isSpyTarget,
					ownerLabel,
					title,
					onboarding
				});
			}
		}
		return out;
	}, [
		nexusLookup,
		ownNexusIds,
		centerX,
		centerY,
		currentNexus._id,
		isEspionage,
		isSendAttackOnboarding,
		mode,
		selectedNexus,
		hasVisibleOnboardingAttackTarget,
		stormRects
	]);

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
						<div className="legend-row legend-row-faction-target">Faction Target</div>
					</div>
				</div>
			);
		}

		const isOwn = selectedNexus.owner?.username === user?.username;
		const isConquered = selectedNexus.control !== undefined && selectedNexus.control <= 0;
		const hasIntel = selectedNexus.intelLevel === 'scouted' || selectedNexus.intelLevel === 'owned';
		const isNewbieProtected =
			!!selectedNexus.newbieProtectionEndsAt &&
			new Date(selectedNexus.newbieProtectionEndsAt) > currentTimeRef.current;
		const isNpc = isNpcNexusName(selectedNexus.name);
		// While the attacker's OWN nexus is under newbie protection it may only act
		// offensively against NPCs, never against other players (mirrors the server
		// rule in attackController). Target is a player when it has an owner / isn't NPC.
		const targetIsPlayer = !isNpc && !!selectedNexus.owner;
		const myNexusProtected =
			!!currentNexus.newbieProtectionEndsAt &&
			new Date(currentNexus.newbieProtectionEndsAt) > currentTimeRef.current;
		const blockedByMyProtection = myNexusProtected && targetIsPlayer;

		// One-time newbie relocation: offered while the viewer still holds a single,
		// still-protected nexus with the token, and is inspecting some OTHER nexus to
		// use as the relocation anchor. The server re-validates everything (single
		// nexus, token unused, protection live, nothing in transit); this is just the
		// affordance.
		const canRelocate =
			!isOwn &&
			ownNexuses.length <= 1 &&
			!!currentNexus.relocationTokenAvailable &&
			!currentNexus.relocationTokenUsedAt &&
			myNexusProtected;

		const attackTroopRows = Object.entries(availableTroops).filter(([type]) => {
			if (type === 'reconOperative' || type === 'plasmaTurret') return false;
			if (attackMissionType === 'support') return STATIONABLE_TROOPS.has(type);
			return true;
		});
		const attackAvailableTroopTotal = attackTroopRows.reduce(
			(sum, [, count]) => sum + Number(count || 0),
			0
		);

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
				{isNpc && <p className="nexus-node-type-info">{getNodeTypeInfo(selectedNexus.name)}</p>}

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
					<Username
						name={selectedNexus.owner?.username ?? ''}
						isSupporter={selectedNexus.owner?.isSupporter}
						supporterTier={selectedNexus.owner?.supporterTier as any}
						linkToProfile
					/>
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
					<div className="intel-warning">
						No intel. Send a scout to reveal resources and troops.
					</div>
				)}

				{nexusHistory.length > 0 && (
					<div className="nexus-history">
						<div className="nexus-history-title">Recent Attacks</div>
						{nexusHistory.map((h: any) => (
							<div key={h.id} className="nexus-history-row">
								<span
									className={`nexus-history-result${h.victory === true ? ' win' : h.victory === false ? ' loss' : ''}`}
								>
									{h.isScout
										? '🔭'
										: h.conquered
											? '⚑'
											: h.victory === true
												? '✓'
												: h.victory === false
													? '✗'
													: '?'}
								</span>
								<span className="nexus-history-names">
									{h.attackerNexus} → {h.defenderNexus}
								</span>
							</div>
						))}
					</div>
				)}

				{!isOwn && !isNpc && (
					<div className="faction-target-action">
						<button
							className={`faction-target-btn${selectedNexus.isFactionTarget ? ' faction-target-btn--active' : ''}`}
							onClick={handleToggleFactionTarget}
							disabled={factionTargeting}
							title={
								selectedNexus.isFactionTarget
									? 'Remove faction target'
									: 'Mark as faction target for your faction'
							}
						>
							<Crosshair size={13} aria-hidden="true" />
							{selectedNexus.isFactionTarget ? 'Unmark Target' : 'Mark as Target'}
						</button>
					</div>
				)}

				{!isOwn && (
					<div className="nexus-actions">
						{!showAttackForm ? (
							<div className="nexus-action-buttons">
								<button
									className="attack-btn"
									onClick={() => {
										setAttackMissionType('attack');
										setAttackTroops(EMPTY_ATTACK_TROOPS);
										setShowAttackForm(true);
									}}
									disabled={isConquered || isNewbieProtected || blockedByMyProtection}
									{...(isSendAttackOnboarding &&
									!isConquered &&
									!isNewbieProtected &&
									!blockedByMyProtection
										? { 'data-onboarding': 'send-attack' }
										: {})}
									title={
										isConquered
											? 'Nexus already conquered'
											: isNewbieProtected
												? `Protected by newbie shield · ${formatTime(new Date(selectedNexus.newbieProtectionEndsAt!))} remaining`
												: blockedByMyProtection
													? 'While under newbie protection you can only attack NPC nexuses, not other players.'
													: 'Launch attack'
									}
								>
									<Swords size={14} aria-hidden="true" />{' '}
									{isConquered ? 'Conquered' : isNewbieProtected ? 'Protected' : 'Attack'}
								</button>
								{selectedNexus.isFriendly && selectedNexus.owner && (
									<button
										className="support-btn"
										onClick={() => {
											setAttackMissionType('support');
											setAttackTroops(EMPTY_ATTACK_TROOPS);
											setShowAttackForm(true);
										}}
										title="Send troops to reinforce this ally's nexus"
									>
										<Shield size={14} aria-hidden="true" /> Support
									</button>
								)}
								{!isConquered &&
									!isNewbieProtected &&
									!blockedByMyProtection &&
									ownNexuses.length > 1 && (
										<button
											className="wave-planner-btn"
											onClick={() => setShowWavePlanner(true)}
											title="Open Wave Planner. Coordinate multiple attacks to arrive simultaneously"
										>
											<Waves size={14} aria-hidden="true" /> Wave Planner
										</button>
									)}
								{canRelocate && (
									<button
										className="relocate-btn"
										onClick={handleRelocate}
										disabled={relocating}
										title="One-time newbie move: warp your nexus to the nearest open tile beside this one. Expires when your protection ends."
									>
										<Sparkles size={14} aria-hidden="true" />{' '}
										{relocating ? 'Relocating…' : 'Relocate Here'}
									</button>
								)}
							</div>
						) : (
							<div className="attack-form">
								<h4>{attackMissionType === 'support' ? 'Send Support' : 'Launch Attack'}</h4>
								{(() => {
									const travel = estimateTravelTime();
									return travel ? (
										<div className="attack-travel-estimate">
											<Clock size={12} aria-hidden="true" />
											<span>
												ETA: <strong>{travel.duration}</strong> @{' '}
												<strong>{formatTimeOfDay(travel.arrivesAt, true)}</strong>
											</span>
										</div>
									) : (
										<div className="attack-travel-estimate attack-travel-estimate--empty">
											<Clock size={12} aria-hidden="true" />
											<span>Select troops to preview ETA</span>
										</div>
									);
								})()}
								<div className="troop-selector">
									{attackTroopRows.map(([type, available]) => {
										const effectiveMax =
											type === 'overseer' ? Math.min(Number(available), 1) : Number(available);
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
															[type]: Math.min(Number(e.target.value), effectiveMax)
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
													/{available}
													{type === 'overseer' && Number(available) > 1 ? ' (max 1)' : ''}
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
										{...(isSendAttackOnboarding &&
										attackMissionType === 'attack' &&
										attackAvailableTroopTotal > 0
											? { 'data-onboarding': 'send-attack' }
											: {})}
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
								onClick={() => {
									setShowTransfer((v) => !v);
									setShowTroopSend(false);
								}}
							>
								Send Resources {showTransfer ? '▲' : '▼'}
							</button>
							{showTransfer && (
								<div className="transfer-panel">
									<p className="transfer-from-label">
										From: <strong>{currentNexus.name}</strong> →{' '}
										<strong>{selectedNexus.name}</strong>
									</p>
									<div className="transfer-inputs">
										{(['biomass', 'alloy', 'ore'] as const).map((res) => {
											const available = Math.floor(currentNexus.resources[res]);
											return (
												<div key={res} className="transfer-input-row">
													<label>
														{res === 'biomass' ? 'Biomass' : res === 'alloy' ? 'Alloy' : 'Ore'}
													</label>
													<input
														type="number"
														min={0}
														max={available}
														placeholder="0"
														value={transferAmounts[res]}
														onChange={(e) =>
															setTransferAmounts((a) => ({ ...a, [res]: e.target.value }))
														}
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
								onClick={() => {
									setShowTroopSend((v) => !v);
									setShowTransfer(false);
								}}
							>
								Send Troops {showTroopSend ? '▲' : '▼'}
							</button>
							{showTroopSend && (
								<div className="transfer-panel">
									<p className="transfer-from-label">
										From: <strong>{currentNexus.name}</strong> →{' '}
										<strong>{selectedNexus.name}</strong>
									</p>
									<div className="transfer-inputs">
										{Object.entries(currentNexus.troops as Record<string, number>)
											.filter(([type, count]) => Number(count) > 0 && STATIONABLE_TROOPS.has(type))
											.map(([type, count]) => (
												<div key={type} className="transfer-input-row">
													<label>{TROOP_LABELS[type] || type}</label>
													<input
														type="number"
														min={0}
														max={Number(count)}
														placeholder="0"
														value={troopSendAmounts[type] || ''}
														onChange={(e) =>
															setTroopSendAmounts((a) => ({ ...a, [type]: e.target.value }))
														}
													/>
													<span
														className={`transfer-available${Number(count) > 0 ? ' troop-available-clickable' : ''}`}
														onClick={() => {
															if (Number(count) > 0)
																setTroopSendAmounts((a) => ({ ...a, [type]: String(count) }));
														}}
													>
														/ {count}
													</span>
												</div>
											))}
										{Object.entries(currentNexus.troops as Record<string, number>).every(
											([type, c]) => Number(c) === 0 || !STATIONABLE_TROOPS.has(type)
										) && (
											<p className="map-empty-state">
												No defensive troops available to send. Only defensive units (Assault
												Trooper, Lancer Drone, Siege Mech, Bulwark Guard) can be stationed at
												another nexus.
											</p>
										)}
									</div>
									{(() => {
										const travel = estimateTroopTransferTime();
										return travel ? (
											<div className="attack-travel-estimate">
												<Clock size={12} aria-hidden="true" />
												<span>
													ETA: <strong>{travel.duration}</strong> @{' '}
													<strong>{formatTimeOfDay(travel.arrivesAt, true)}</strong>
												</span>
											</div>
										) : null;
									})()}
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
		const returning = outgoingAttacks.filter((a: any) => a.status === 'returning');
		const traveling = outgoingAttacks.filter((a: any) => a.status !== 'returning');
		const allIncoming = [...incomingAttacks, ...returning];

		if (allIncoming.length === 0 && traveling.length === 0) return null;

		return (
			<div className="attacks-panel">
				{incomingAttacks.length > 0 && (
					<div className="attacks-section">
						<h4>Incoming ({incomingAttacks.length})</h4>
						{incomingAttacks.map((attack: any) => {
							const isSupport = attack.type === 'support';
							const fromLabel = isSupport
								? 'Support from:'
								: attack.type === 'scout'
									? 'Scout from:'
									: 'From:';
							return (
								<div
									key={attack._id}
									className={`attack-item incoming${isSupport ? ' support-mission' : ''}`}
								>
									<div className="attack-from">
										{fromLabel} <strong>{attack.attacker?.nexus?.name || 'Unknown'}</strong>
										{attack.attacker?.user?.username && (
											<span className="attack-username"> ({attack.attacker.user.username})</span>
										)}
									</div>
									<div className="attack-time">
										Arrives: <Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" /> @{' '}
										{formatTimeOfDay(attack.arrivesAt, true)}
									</div>
								</div>
							);
						})}
					</div>
				)}
				{returning.length > 0 && (
					<div className="attacks-section">
						<h4>Your returning troops ({returning.length})</h4>
						{returning.map((attack: any) => {
							const isSupport = attack.type === 'support';
							return (
								<div
									key={attack._id}
									className={`attack-item incoming returning${isSupport ? ' support-mission' : ''}`}
								>
									<div className="attack-from">
										{isSupport ? 'Support returning from:' : 'Returning from:'}{' '}
										<strong>{attack.defender?.nexus?.name || 'Unknown'}</strong>
									</div>
									<div className="attack-time">
										Returns: <Countdown endAt={attack.returnsAt} completedLabel="Arriving…" /> @{' '}
										{formatTimeOfDay(attack.returnsAt, true)}
									</div>
								</div>
							);
						})}
					</div>
				)}
				{traveling.length > 0 && (
					<div className="attacks-section">
						<h4>Your outgoing troops ({traveling.length})</h4>
						{traveling.map((attack: any) => {
							const isSupport = attack.type === 'support';
							const toLabel = isSupport
								? 'Supporting:'
								: attack.type === 'scout'
									? 'Scouting:'
									: 'Attacking:';
							return (
								<div
									key={attack._id}
									className={`attack-item outgoing${isSupport ? ' support-mission' : ''}`}
								>
									<div className="attack-to">
										{toLabel}{' '}
										<strong>
											{attack.defender?.nexus?.name
												? `${attack.defender.nexus.name} (${attack.defender.nexus.x}|${attack.defender.nexus.y})`
												: 'Unknown'}
										</strong>
									</div>
									<div className="attack-time">
										Arrives: <Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" /> @{' '}
										{formatTimeOfDay(attack.arrivesAt, true)}
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
			const label =
				days > 0
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
					<span>
						{galaxyEvents.length} galaxy event{galaxyEvents.length !== 1 ? 's' : ''}
					</span>
					<span className="galaxy-events-chevron">{showEventsPanel ? '▲' : '▼'}</span>
				</button>
				{showEventsPanel && (
					<div className="galaxy-events-panel">
						{galaxyEvents.map((ev) => {
							const EventIcon =
								ev.type === 'resource_storm' ? Zap : ev.type === 'rogue_ai' ? AlertTriangle : Star;
							return (
								<div key={ev.id} className={`galaxy-event-card galaxy-event-card--${ev.type}`}>
									<div className="galaxy-event-card-header">
										<EventIcon size={13} aria-hidden="true" />
										<strong>{ev.title}</strong>
										{ev.x != null && ev.y != null && (
											<button
												className="galaxy-event-goto"
												onClick={() => moveTo(ev.x!, ev.y!)}
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
			{mode === 'normal' && (
				<div className="map-header">
					<div className="map-info">
						<span className="map-viewing">
							({centerX}|{centerY})
							{mapLoading && <span className="map-loading-dot" aria-label="Loading sector" />}
						</span>
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
						<button onClick={handleResetMap} className="map-reset-btn">
							Reset
						</button>
					</div>
				</div>
			)}
			{mode === 'espionage' && (
				<div className="map-header map-header--espionage">
					<span className="map-hint">
						{espionageHint ?? 'Click a nexus to select it as your spy target'}
					</span>
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
				</div>
			)}

			<div className="map-content">
				<div className="map-content-mobile-events">{renderGalaxyEventsPanel()}</div>
				<div
					className={`map-viewport${isEspionage ? ' map-viewport--espionage' : ''}${
						isPanning ? ' is-panning' : ''
					}${zoom < 0.8 ? ' map-viewport--lod' : ''}`}
					ref={viewportRef}
					onClickCapture={handleGridClick}
					onPointerDownCapture={handlePointerDownCapture}
					onPointerMoveCapture={handlePointerMoveCapture}
					onDragStart={(e) => e.preventDefault()}
					{...(isSendAttackOnboarding &&
					!selectedNexus &&
					mode === 'normal' &&
					!hasVisibleOnboardingAttackTarget
						? { 'data-onboarding': 'send-attack' }
						: {})}
				>
					<div ref={layerRef} className="map-layer">
						{cells.map((c) => (
							<MapCell key={`${c.x}-${c.y}`} data={c} />
						))}
					</div>
					<div className="map-zoom-controls">
						<button
							type="button"
							className="map-zoom-btn"
							onClick={() => zoomBy(ZOOM_STEP)}
							aria-label="Zoom in"
							title="Zoom in"
						>
							<Plus size={16} />
						</button>
						<button
							type="button"
							className="map-zoom-btn"
							onClick={() => zoomBy(-ZOOM_STEP)}
							aria-label="Zoom out"
							title="Zoom out"
						>
							<Minus size={16} />
						</button>
					</div>
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
						target={{
							_id: selectedNexus._id,
							name: selectedNexus.name,
							x: selectedNexus.x,
							y: selectedNexus.y
						}}
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
