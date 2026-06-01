'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	AlertCircle,
	Crosshair,
	GripVertical,
	Lock,
	Plus,
	Radar,
	Radio,
	Send,
	Target,
	Trash2,
	Unlock,
	Users,
	X,
	Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import InlineBackButton from './InlineBackButton';
import Username from './Username';
import { useToast } from '../context/ToastContext';
import { useWarRoomSocket, type WarRoomEvent } from '../hooks/useWarRoomSocket';
import {
	addWarRoomWave,
	claimWarRoomSlot,
	createWarRoomOperation,
	deleteWarRoomOperation,
	deleteWarRoomWave,
	getMyNexuses,
	getWarRoomOperation,
	listWarRoomOperations,
	markWarRoomSlotSent,
	postWarRoomThreadMessage,
	releaseWarRoomSlot,
	sendAttack,
	updateWarRoomOperation
} from '../services/api';
import { serverNow } from '../realtime/serverClock';
import { travelMinutes } from '../utils/travel';
import '../styles/WarRoom.css';
import type { Nexus } from '../types/game';
import StarfieldMap, { type MapNexus } from './Map';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface OperationSummary {
	id: number;
	name: string;
	status: 'planning' | 'locked' | 'launched' | 'completed' | 'cancelled';
	targetNexusId: number;
	targetName: string;
	targetX: number;
	targetY: number;
	arrivalAt: string;
	waveCount: number;
	contributorCount: number;
	rev: number;
	updatedAt: string;
	createdByUserId: number;
}

interface Slot {
	id: number;
	userId: number;
	username: string;
	isSupporter?: boolean;
	supporterTier?: string | null;
	fromNexusId: number;
	fromNexusName: string;
	fromNexusX: number | null;
	fromNexusY: number | null;
	fromNexusType?: string | null;
	fromNexusTypeDoubled?: boolean;
	troops: Record<string, number>;
	note: string | null;
	sentAttackId: number | null;
	claimedAt: string;
}

interface Wave {
	id: number;
	ordinal: number;
	label: string;
	arrivalOffsetMs: number;
	troops: Record<string, number>;
	slots: Slot[];
}

interface ThreadMessage {
	id: number;
	userId: number;
	username: string;
	isSupporter?: boolean;
	supporterTier?: string | null;
	content: string;
	kind: string;
	createdAt: string;
}

interface Operation {
	id: number;
	factionId: number;
	name: string;
	status: 'planning' | 'locked' | 'launched' | 'completed' | 'cancelled';
	targetNexusId: number;
	targetX: number;
	targetY: number;
	targetName: string;
	arrivalAt: string;
	rev: number;
	createdByUserId: number;
	createdByUsername: string;
	createdAt: string;
	updatedAt: string;
	waves: Wave[];
	thread: ThreadMessage[];
}

interface Props {
	factionId: number;
	myRole: 'leader' | 'officer' | 'member';
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const TROOP_KEYS = [
	'lancerDrone',
	'assaultTrooper',
	'breakerUnit',
	'reconOperative',
	'skimmerBike',
	'siegeMech',
	'bulwarkGuard',
	'suppressorTeam',
	'disruptorUnit',
	'interceptorBike',
	'annihilatorPlatform',
	'voidStalker',
	'overseer'
] as const;

const TROOP_LABELS: Record<string, string> = {
	lancerDrone: 'Lancer',
	assaultTrooper: 'Trooper',
	breakerUnit: 'Breaker',
	reconOperative: 'Recon',
	skimmerBike: 'Skimmer',
	siegeMech: 'Siege',
	bulwarkGuard: 'Bulwark',
	suppressorTeam: 'Suppressor',
	disruptorUnit: 'Disruptor',
	interceptorBike: 'Interceptor',
	annihilatorPlatform: 'Annihilator',
	voidStalker: 'Stalker',
	overseer: 'Overseer'
};

function formatCountdown(ms: number): string {
	if (ms < 0) return 'past';
	const totalSec = Math.floor(ms / 1000);
	const d = Math.floor(totalSec / 86400);
	const h = Math.floor((totalSec % 86400) / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (d > 0) return `${d}d ${h}h ${m}m`;
	if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
	if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
	return `${s}s`;
}

function fmtTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString([], {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function fmtShortTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toLocalDatetimeValue(ms: number): string {
	const date = new Date(ms);
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function colorForUser(userId: number): string {
	// Stable HSL hue from user id, used for presence avatars + cursor labels.
	const h = (userId * 137.508) % 360;
	return `hsl(${h}, 70%, 60%)`;
}

function initials(username: string): string {
	const parts = username
		.replace(/[^a-zA-Z0-9]/g, ' ')
		.trim()
		.split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function WarRoom({ factionId, myRole }: Props) {
	const { user: authUser } = useAuth();
	const toast = useToast();
	const currentUserId = authUser ? parseInt(authUser.id, 10) : 0;
	const canManage = myRole === 'leader' || myRole === 'officer';

	const [operations, setOperations] = useState<OperationSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
	const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
	const [opLoading, setOpLoading] = useState(false);
	const [now, setNow] = useState(serverNow());
	const [myNexuses, setMyNexuses] = useState<Nexus[]>([]);
	const [showCreate, setShowCreate] = useState(false);
	// On narrow viewports the board and thread can't both fit, so they share
	// space via this tab. Ignored on desktop (CSS shows both panes).
	const [mobileTab, setMobileTab] = useState<'board' | 'thread'>('board');

	const socket = useWarRoomSocket(true);
	const selectedOpIdRef = useRef<number | null>(null);
	selectedOpIdRef.current = selectedOpId;
	const mainPaneRef = useRef<HTMLDivElement>(null);
	// Stable refs for the socket methods. The `socket` object's identity
	// changes whenever peers/cursors/typing update (presence broadcasts arrive
	// constantly), but the methods themselves are useCallback-stable. Pinning
	// them via ref lets effects below depend on nothing but real triggers.
	const setFocus = socket.setFocus;
	const subscribe = socket.subscribe;

	// tick every second for countdowns
	useEffect(() => {
		const id = setInterval(() => setNow(serverNow()), 1000);
		return () => clearInterval(id);
	}, []);

	// initial load
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [opsRes, nexRes] = await Promise.all([listWarRoomOperations(), getMyNexuses()]);
				if (cancelled) return;
				const ops: OperationSummary[] = opsRes.data?.operations ?? [];
				setOperations(ops);
				setMyNexuses(nexRes.data ?? []);
				if (ops.length > 0 && selectedOpIdRef.current === null) {
					setSelectedOpId(ops[0].id);
				}
				setLoading(false);
			} catch (err) {
				if (!cancelled) {
					setError((err as Error).message);
					setLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [factionId]);

	const refreshList = useCallback(async () => {
		try {
			const res = await listWarRoomOperations();
			setOperations(res.data?.operations ?? []);
		} catch {}
	}, []);

	const loadOperation = useCallback(async (opId: number) => {
		setOpLoading(true);
		try {
			const res = await getWarRoomOperation(opId);
			setSelectedOp(res.data?.operation ?? null);
		} catch {
			setSelectedOp(null);
		} finally {
			setOpLoading(false);
		}
	}, []);

	// Debounce timers for socket-driven refreshes. With 5+ officers active in
	// one op, op:update broadcasts can fire many times per second; without a
	// wide debounce + jitter every client refetches in lockstep and hammers
	// the limiter. 800ms feels live (socket already pushed the trigger; this
	// GET only hydrates details) and jitter staggers the herd.
	const refreshListTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadOpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const debouncedRefreshList = useCallback(() => {
		if (refreshListTimerRef.current) clearTimeout(refreshListTimerRef.current);
		refreshListTimerRef.current = setTimeout(() => refreshList(), 800 + Math.random() * 400);
	}, [refreshList]);

	const debouncedLoadOperation = useCallback(
		(opId: number) => {
			if (loadOpTimerRef.current) clearTimeout(loadOpTimerRef.current);
			loadOpTimerRef.current = setTimeout(() => loadOperation(opId), 800 + Math.random() * 400);
		},
		[loadOperation]
	);

	// load full op when selection changes
	useEffect(() => {
		if (selectedOpId == null) {
			setSelectedOp(null);
			return;
		}
		loadOperation(selectedOpId);
		setFocus(selectedOpId);
	}, [selectedOpId, loadOperation, setFocus]);

	// socket event handler, keep list + selected op in sync without polling
	useEffect(() => {
		const unsub = subscribe((e: WarRoomEvent) => {
			if (e.type === 'op:deleted') {
				setOperations((prev) => prev.filter((o) => o.id !== e.operationId));
				if (selectedOpIdRef.current === e.operationId) {
					setSelectedOpId(null);
					setSelectedOp(null);
				}
				return;
			}
			if (e.type === 'op:update') {
				debouncedRefreshList();
				if (selectedOpIdRef.current === e.operationId) {
					debouncedLoadOperation(e.operationId);
				}
				return;
			}
			if (e.type === 'thread:message') {
				if (selectedOpIdRef.current === e.operationId) {
					setSelectedOp((prev) => {
						if (!prev || prev.id !== e.operationId) return prev;
						const msg = e.message as ThreadMessage;
						if (prev.thread.some((m) => m.id === msg.id)) return prev;
						return { ...prev, thread: [...prev.thread, msg] };
					});
				}
			}
		});
		return unsub;
	}, [subscribe, debouncedRefreshList, debouncedLoadOperation]);

	const handleCreate = async (data: { name: string; targetNexusId: number; arrivalAt: string }) => {
		try {
			const res = await createWarRoomOperation(data);
			const op = res.data?.operation as Operation;
			setShowCreate(false);
			setSelectedOpId(op.id);
			toast(`Operation "${op.name}" opened`, 'success');
			refreshList();
		} catch (err) {
			const msg =
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
				'Failed to create';
			toast(msg, 'error');
		}
	};

	const handleDelete = async (opId: number) => {
		if (!confirm('Delete this operation? All wave commitments will be lost.')) return;
		try {
			await deleteWarRoomOperation(opId);
			toast('Operation deleted', 'info');
		} catch (err) {
			const msg =
				(err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed';
			toast(msg, 'error');
		}
	};

	const handleStatusChange = async (
		opId: number,
		status: 'planning' | 'locked' | 'cancelled' | 'completed'
	) => {
		try {
			await updateWarRoomOperation(opId, { status });
		} catch (err) {
			const msg =
				(err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed';
			toast(msg, 'error');
		}
	};

	// ── render ─────────────────────────────────────────────────────────────────

	if (loading) {
		return null;
	}
	if (error) {
		return (
			<div className="warroom warroom--error">
				<AlertCircle size={16} /> {error}
			</div>
		);
	}

	return (
		<div className="warroom">
			<WarRoomHeader
				peers={socket.peers}
				connected={socket.connected}
				currentUserId={currentUserId}
			/>

			<div className={`warroom-body warroom-body--tab-${mobileTab}`}>
				<OperationsRail
					operations={operations}
					selectedOpId={selectedOpId}
					now={now}
					onSelect={(id) => {
						setSelectedOpId(id);
						setMobileTab('board');
						mainPaneRef.current?.scrollTo({ top: 0 });
					}}
					onCreate={() => setShowCreate(true)}
					canManage={canManage}
					peers={socket.peers}
				/>

				{selectedOp && (
					<div className="warroom-mobile-tabs" role="tablist">
						<button
							role="tab"
							aria-selected={mobileTab === 'board'}
							className={`warroom-mobile-tab ${mobileTab === 'board' ? 'is-active' : ''}`}
							onClick={() => setMobileTab('board')}
						>
							<Radar size={13} /> Board
						</button>
						<button
							role="tab"
							aria-selected={mobileTab === 'thread'}
							className={`warroom-mobile-tab ${mobileTab === 'thread' ? 'is-active' : ''}`}
							onClick={() => setMobileTab('thread')}
						>
							<Crosshair size={13} /> Thread
							{selectedOp.thread.length > 0 && (
								<span className="warroom-mobile-tab-badge">{selectedOp.thread.length}</span>
							)}
						</button>
					</div>
				)}

				<div className="warroom-main" ref={mainPaneRef}>
					{selectedOpId == null ? (
						<EmptyState canManage={canManage} onCreate={() => setShowCreate(true)} />
					) : opLoading || !selectedOp ? null : (
						<OperationBoard
							op={selectedOp}
							now={now}
							myNexuses={myNexuses}
							currentUserId={currentUserId}
							canManage={canManage}
							peers={socket.peers.filter((p) => p.focusOpId === selectedOp.id)}
							onChangeStatus={(s) => handleStatusChange(selectedOp.id, s)}
							onDelete={() => handleDelete(selectedOp.id)}
							onReload={() => loadOperation(selectedOp.id)}
							onBack={() => {
								setSelectedOpId(null);
								setSelectedOp(null);
							}}
						/>
					)}
				</div>

				{selectedOp && (
					<ThreadPanel
						op={selectedOp}
						currentUserId={currentUserId}
						socket={socket}
						onPostMessage={async (text) => {
							await postWarRoomThreadMessage(selectedOp.id, text);
						}}
					/>
				)}
			</div>

			{showCreate && (
				<CreateOperationModal
					myNexuses={myNexuses}
					onClose={() => setShowCreate(false)}
					onSubmit={handleCreate}
				/>
			)}
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Header, presence stack + connection state
// ────────────────────────────────────────────────────────────────────────────

function WarRoomHeader({
	peers,
	connected,
	currentUserId
}: {
	peers: { userId: number; username: string; focusOpId: number | null }[];
	connected: boolean;
	currentUserId: number;
}) {
	const others = peers.filter((p) => p.userId !== currentUserId);
	return (
		<div className="warroom-header">
			<div className="warroom-header-left">
				<div className="warroom-title">
					<Radar size={16} />
					<span>War Room</span>
				</div>
				<div
					className={`warroom-conn ${connected ? 'warroom-conn--live' : 'warroom-conn--offline'}`}
				>
					<span className="warroom-conn-dot" />
					{connected ? 'LIVE' : 'OFFLINE'}
				</div>
			</div>

			<div className="warroom-header-right">
				<div className="warroom-presence">
					<Users size={13} />
					<span className="warroom-presence-count">
						{peers.length} {peers.length === 1 ? 'officer' : 'officers'} planning
					</span>
					<div className="warroom-presence-stack">
						{others.slice(0, 6).map((p) => (
							<div
								key={p.userId}
								className="warroom-avatar"
								style={{ background: colorForUser(p.userId) }}
								title={p.username}
							>
								{initials(p.username)}
							</div>
						))}
						{others.length > 6 && (
							<div className="warroom-avatar warroom-avatar--more">+{others.length - 6}</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Left rail, operations list
// ────────────────────────────────────────────────────────────────────────────

function OperationsRail({
	operations,
	selectedOpId,
	now,
	onSelect,
	onCreate,
	canManage,
	peers
}: {
	operations: OperationSummary[];
	selectedOpId: number | null;
	now: number;
	onSelect: (id: number) => void;
	onCreate: () => void;
	canManage: boolean;
	peers: { userId: number; focusOpId: number | null }[];
}) {
	const sorted = [...operations].sort(
		(a, b) => new Date(a.arrivalAt).getTime() - new Date(b.arrivalAt).getTime()
	);

	return (
		<aside className="warroom-rail">
			<div className="warroom-rail-head">
				<span className="warroom-rail-label">Operations</span>
				{canManage && (
					<button className="warroom-rail-new" onClick={onCreate} title="Open new operation">
						<Plus size={14} /> New
					</button>
				)}
			</div>

			<div className="warroom-rail-list">
				{sorted.length === 0 && <div className="warroom-rail-empty">No active operations.</div>}
				{sorted.map((op) => {
					const arrivalMs = new Date(op.arrivalAt).getTime();
					const ttArrive = arrivalMs - now;
					const focusedHere = peers.filter((p) => p.focusOpId === op.id).length;
					return (
						<button
							key={op.id}
							className={`warroom-rail-item ${selectedOpId === op.id ? 'warroom-rail-item--active' : ''} warroom-rail-item--${op.status}`}
							onClick={() => onSelect(op.id)}
						>
							<div className="warroom-rail-item-top">
								<span className="warroom-rail-item-name">{op.name}</span>
								<span className={`warroom-rail-item-status warroom-rail-item-status--${op.status}`}>
									{op.status === 'planning' && 'PLAN'}
									{op.status === 'locked' && 'LOCK'}
									{op.status === 'launched' && 'LIVE'}
									{op.status === 'completed' && 'DONE'}
									{op.status === 'cancelled' && 'X'}
								</span>
							</div>
							<div className="warroom-rail-item-target">
								<Target size={11} />
								<span>{op.targetName}</span>
								<span className="warroom-rail-item-coords">
									{op.targetX}|{op.targetY}
								</span>
							</div>
							<div className="warroom-rail-item-meta">
								<span
									className={`warroom-rail-item-eta ${ttArrive < 0 ? 'warroom-rail-item-eta--past' : ''}`}
								>
									{ttArrive < 0 ? 'arrived' : `T-${formatCountdown(ttArrive)}`}
								</span>
								<span className="warroom-rail-item-stats">
									<span title="waves">{op.waveCount}w</span>
									<span className="dot">/</span>
									<span title="contributors">{op.contributorCount} pledged</span>
								</span>
							</div>
							{focusedHere > 0 && (
								<div className="warroom-rail-item-focus">
									<span className="warroom-pulse-dot" />
									{focusedHere} viewing
								</div>
							)}
						</button>
					);
				})}
			</div>
		</aside>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────

function EmptyState({ canManage, onCreate }: { canManage: boolean; onCreate: () => void }) {
	return (
		<div className="warroom-empty">
			<Radar size={42} />
			<h3>No operation selected</h3>
			<p>
				Officers open shared operations against a target. The whole faction sees the same board in
				real-time and pledges their share of the assault. Each operation has its own thread.
			</p>
			{canManage && (
				<button className="warroom-primary-btn" onClick={onCreate}>
					<Plus size={14} /> Open Operation
				</button>
			)}
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Operation board (centre pane)
// ────────────────────────────────────────────────────────────────────────────

function OperationBoard({
	op,
	now,
	myNexuses,
	currentUserId,
	canManage,
	peers,
	onChangeStatus,
	onDelete,
	onReload,
	onBack
}: {
	op: Operation;
	now: number;
	myNexuses: Nexus[];
	currentUserId: number;
	canManage: boolean;
	peers: { userId: number; username: string; focusOpId: number | null }[];
	onChangeStatus: (s: 'planning' | 'locked' | 'cancelled' | 'completed') => void;
	onDelete: () => void;
	onReload: () => void;
	onBack: () => void;
}) {
	const arrivalMs = new Date(op.arrivalAt).getTime();
	const ttArrive = arrivalMs - now;

	const otherViewers = peers.filter((p) => p.userId !== currentUserId);

	return (
		<div className="warroom-board">
			<div className="warroom-board-header">
				<div className="warroom-board-title">
					<InlineBackButton onBack={onBack} label="Operations" className="warroom-board-back" />
					<h2>{op.name}</h2>
					<span className={`warroom-status-pill warroom-status-pill--${op.status}`}>
						{op.status}
					</span>
					{otherViewers.length > 0 && (
						<span className="warroom-viewing-here">
							<span className="warroom-pulse-dot" />
							{otherViewers.length === 1
								? `${otherViewers[0].username} is here`
								: `${otherViewers.length} officers here`}
						</span>
					)}
				</div>
				<div className="warroom-board-target">
					<Target size={14} />
					<span className="warroom-board-target-name">{op.targetName}</span>
					<span className="warroom-board-target-coords">
						{op.targetX}|{op.targetY}
					</span>
				</div>
				<div className="warroom-board-actions">
					{canManage && op.status === 'planning' && (
						<button
							className="warroom-ghost-btn"
							onClick={() => onChangeStatus('locked')}
							title="Lock plan"
						>
							<Lock size={13} /> Lock
						</button>
					)}
					{canManage && op.status === 'locked' && (
						<button
							className="warroom-ghost-btn"
							onClick={() => onChangeStatus('planning')}
							title="Unlock plan"
						>
							<Unlock size={13} /> Unlock
						</button>
					)}
					{canManage && (op.status === 'planning' || op.status === 'locked') && (
						<button className="warroom-ghost-btn" onClick={() => onChangeStatus('completed')}>
							Mark Done
						</button>
					)}
					{canManage && (
						<button
							className="warroom-ghost-btn warroom-ghost-btn--danger"
							onClick={onDelete}
							title="Delete"
						>
							<Trash2 size={13} />
						</button>
					)}
				</div>
			</div>

			<ArrivalCountdown ttArrive={ttArrive} arrivalAt={op.arrivalAt} />

			<Timeline op={op} now={now} myNexuses={myNexuses} />

			<div className="warroom-waves">
				{op.waves.length === 0 && (
					<div className="warroom-no-waves">
						No waves planned yet.
						{canManage && ' Officers, add the first wave below.'}
					</div>
				)}
				{op.waves.map((wave) => (
					<WaveCard
						key={wave.id}
						wave={wave}
						op={op}
						now={now}
						myNexuses={myNexuses}
						currentUserId={currentUserId}
						canManage={canManage}
						onReload={onReload}
					/>
				))}
			</div>

			{canManage && (op.status === 'planning' || op.status === 'locked') && (
				<AddWaveForm operationId={op.id} onAdded={onReload} />
			)}
		</div>
	);
}

function ArrivalCountdown({ ttArrive, arrivalAt }: { ttArrive: number; arrivalAt: string }) {
	const past = ttArrive < 0;
	return (
		<div className={`warroom-arrival ${past ? 'warroom-arrival--past' : ''}`}>
			<div className="warroom-arrival-label">Target arrival</div>
			<div className="warroom-arrival-time">
				{past ? 'Arrived' : `T-${formatCountdown(ttArrive)}`}
			</div>
			<div className="warroom-arrival-abs">{fmtTime(arrivalAt)}</div>
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Timeline ribbon, visualizes launch windows for each wave
// ────────────────────────────────────────────────────────────────────────────

function Timeline({ op, now, myNexuses }: { op: Operation; now: number; myNexuses: Nexus[] }) {
	const arrivalMs = new Date(op.arrivalAt).getTime();
	// Each wave has a "launch window", the earliest launch is from the fastest source nexus,
	// the latest from the slowest. We render each wave as a chip placed at its expected launch time.
	const items = op.waves.map((wave) => {
		// Use the fastest of my nexuses as the reference travel time. If none, fall back to a guess.
		let bestTravel = 0;
		if (myNexuses.length > 0 && Object.values(wave.troops).some((n) => n > 0)) {
			bestTravel = Math.min(
				...myNexuses.map((n) => travelMinutes(n, { x: op.targetX, y: op.targetY }, wave.troops))
			);
		}
		const launchMs = arrivalMs + (wave.arrivalOffsetMs ?? 0) - bestTravel * 60 * 1000;
		return { wave, launchMs, travel: bestTravel };
	});

	// window for rendering: from earliest launch (or now, whichever is sooner) to arrival.
	const earliest = items.length > 0 ? Math.min(...items.map((i) => i.launchMs), now) : now;
	const windowEnd = arrivalMs;
	const span = Math.max(60_000, windowEnd - earliest);

	const positionFor = (t: number) => {
		return Math.min(100, Math.max(0, ((t - earliest) / span) * 100));
	};

	return (
		<div className="warroom-timeline">
			<div className="warroom-timeline-axis">
				<span className="warroom-timeline-axis-now" style={{ left: `${positionFor(now)}%` }}>
					<span className="warroom-timeline-axis-now-dot" />
					NOW
				</span>
				<span className="warroom-timeline-axis-end">IMPACT {fmtShortTime(op.arrivalAt)}</span>
			</div>
			<div className="warroom-timeline-bar">
				<div className="warroom-timeline-progress" style={{ width: `${positionFor(now)}%` }} />
				{items.map(({ wave, launchMs, travel }) => {
					const past = launchMs < now;
					return (
						<div
							key={wave.id}
							className={`warroom-timeline-chip ${past ? 'warroom-timeline-chip--past' : ''}`}
							style={{ left: `${positionFor(launchMs)}%` }}
							title={`Wave ${wave.ordinal + 1}. Launch ${fmtShortTime(new Date(launchMs).toISOString())} (${Math.round(travel)}m travel)`}
						>
							<span className="warroom-timeline-chip-dot" />
							<span className="warroom-timeline-chip-label">W{wave.ordinal + 1}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Wave card, quota, claimed slots, claim form
// ────────────────────────────────────────────────────────────────────────────

function WaveCard({
	wave,
	op,
	now,
	myNexuses,
	currentUserId,
	canManage,
	onReload
}: {
	wave: Wave;
	op: Operation;
	now: number;
	myNexuses: Nexus[];
	currentUserId: number;
	canManage: boolean;
	onReload: () => void;
}) {
	const [showClaim, setShowClaim] = useState(false);
	const myClaim = wave.slots.find((s) => s.userId === currentUserId);
	const totalQuota = sumTroops(wave.troops);
	const totalPledged = wave.slots.reduce((acc, s) => acc + sumTroops(s.troops), 0);
	const quotaPct = totalQuota > 0 ? Math.min(100, (totalPledged / totalQuota) * 100) : 0;
	const arrivalMs = new Date(op.arrivalAt).getTime() + (wave.arrivalOffsetMs ?? 0);
	const ttArrive = arrivalMs - now;

	const handleDeleteWave = async () => {
		if (!confirm('Delete this wave?')) return;
		try {
			await deleteWarRoomWave(wave.id);
		} catch {}
	};

	const handleRelease = async (slotId: number) => {
		try {
			await releaseWarRoomSlot(slotId);
		} catch {}
	};

	return (
		<div className="warroom-wave">
			<div className="warroom-wave-head">
				<div className="warroom-wave-num">W{wave.ordinal + 1}</div>
				<div className="warroom-wave-title">
					{wave.label}
					{wave.arrivalOffsetMs !== 0 && (
						<span className="warroom-wave-offset">
							{wave.arrivalOffsetMs > 0 ? '+' : ''}
							{Math.round(wave.arrivalOffsetMs / 1000)}s
						</span>
					)}
				</div>
				<div className="warroom-wave-eta">
					{ttArrive < 0 ? 'arrived' : `T-${formatCountdown(ttArrive)}`}
				</div>
				{canManage && (op.status === 'planning' || op.status === 'locked') && (
					<button className="warroom-icon-btn" onClick={handleDeleteWave} title="Delete wave">
						<Trash2 size={12} />
					</button>
				)}
			</div>

			<div className="warroom-wave-quota">
				<div className="warroom-wave-quota-head">
					<span className="warroom-wave-quota-label">Composition target</span>
					<span className="warroom-wave-quota-counts">
						<strong>{totalPledged.toLocaleString()}</strong>
						<span className="muted"> / {totalQuota.toLocaleString()} pledged</span>
					</span>
				</div>
				<div className="warroom-wave-quota-bar">
					<div className="warroom-wave-quota-bar-fill" style={{ width: `${quotaPct}%` }} />
				</div>
				{totalQuota > 0 && (
					<div className="warroom-wave-quota-chips">
						{TROOP_KEYS.filter((k) => (wave.troops[k] ?? 0) > 0).map((k) => {
							const want = wave.troops[k] ?? 0;
							const got = wave.slots.reduce((a, s) => a + (s.troops[k] ?? 0), 0);
							const pct = want > 0 ? Math.min(100, (got / want) * 100) : 0;
							return (
								<div key={k} className="warroom-troop-chip">
									<span className="warroom-troop-chip-name">{TROOP_LABELS[k]}</span>
									<span className="warroom-troop-chip-counts">
										{got}/{want}
									</span>
									<span className="warroom-troop-chip-bar">
										<span className="warroom-troop-chip-bar-fill" style={{ width: `${pct}%` }} />
									</span>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div className="warroom-slots">
				{wave.slots.length === 0 && (
					<div className="warroom-slot-empty">No pledges yet. Be the first to claim a slot.</div>
				)}
				{wave.slots.map((slot) => (
					<SlotRow
						key={slot.id}
						slot={slot}
						isMine={slot.userId === currentUserId}
						canRelease={slot.userId === currentUserId || canManage}
						onRelease={() => handleRelease(slot.id)}
						target={{ x: op.targetX, y: op.targetY }}
						arrivalMs={arrivalMs}
						now={now}
					/>
				))}
			</div>

			{!myClaim && (op.status === 'planning' || op.status === 'locked') && (
				<>
					{!showClaim ? (
						<button className="warroom-claim-cta" onClick={() => setShowClaim(true)}>
							<Zap size={13} /> Pledge to this wave
						</button>
					) : (
						<ClaimForm
							wave={wave}
							op={op}
							myNexuses={myNexuses}
							onCancel={() => setShowClaim(false)}
							onClaimed={() => {
								setShowClaim(false);
								onReload();
							}}
						/>
					)}
				</>
			)}

			{myClaim &&
				(op.status === 'launched' || op.status === 'planning' || op.status === 'locked') &&
				!myClaim.sentAttackId && (
					<SendNowBar
						op={op}
						wave={wave}
						slot={myClaim}
						now={now}
						myNexuses={myNexuses}
						onSent={onReload}
					/>
				)}
		</div>
	);
}

function SlotRow({
	slot,
	isMine,
	canRelease,
	onRelease,
	target,
	arrivalMs,
	now
}: {
	slot: Slot;
	isMine: boolean;
	canRelease: boolean;
	onRelease: () => void;
	target: { x: number; y: number };
	arrivalMs: number;
	now: number;
}) {
	let launchAt: number | null = null;
	if (slot.fromNexusX != null && slot.fromNexusY != null) {
		const travel = travelMinutes(
			{
				x: slot.fromNexusX,
				y: slot.fromNexusY,
				nexusType: slot.fromNexusType,
				nexusTypeDoubled: slot.fromNexusTypeDoubled
			},
			target,
			slot.troops
		);
		launchAt = arrivalMs - travel * 60 * 1000;
	}
	const past = launchAt != null && launchAt < now;
	const troopSummary = TROOP_KEYS.filter((k) => (slot.troops[k] ?? 0) > 0)
		.map((k) => `${slot.troops[k]} ${TROOP_LABELS[k]}`)
		.join(' / ');

	return (
		<div
			className={`warroom-slot ${isMine ? 'warroom-slot--mine' : ''} ${slot.sentAttackId ? 'warroom-slot--sent' : ''}`}
		>
			<div className="warroom-slot-user">
				<div
					className="warroom-avatar warroom-avatar--sm"
					style={{ background: colorForUser(slot.userId) }}
				>
					{initials(slot.username)}
				</div>
				<div className="warroom-slot-meta">
					<span className="warroom-slot-username">
						<Username
							name={slot.username}
							isSupporter={slot.isSupporter}
							supporterTier={slot.supporterTier as any}
							linkToProfile
						/>
						{isMine && <span className="warroom-you">YOU</span>}
					</span>
					<span className="warroom-slot-nexus">from {slot.fromNexusName}</span>
				</div>
			</div>

			<div className="warroom-slot-troops">
				{troopSummary || <span className="muted">(no troops set)</span>}
			</div>

			<div className="warroom-slot-launch">
				{slot.sentAttackId ? (
					<span className="warroom-slot-sent">
						<Send size={11} /> Sent
					</span>
				) : launchAt != null ? (
					past ? (
						<span className="warroom-slot-launch-past">
							<AlertCircle size={11} /> Launch overdue
						</span>
					) : (
						<>
							<Radio size={11} />
							<span>launch in {formatCountdown(launchAt - now)}</span>
						</>
					)
				) : (
					<span className="muted">.</span>
				)}
			</div>

			{canRelease && !slot.sentAttackId && (
				<button className="warroom-icon-btn" onClick={onRelease} title="Release slot">
					<X size={12} />
				</button>
			)}
		</div>
	);
}

function ClaimForm({
	wave,
	op,
	myNexuses,
	onCancel,
	onClaimed
}: {
	wave: Wave;
	op: Operation;
	myNexuses: Nexus[];
	onCancel: () => void;
	onClaimed: () => void;
}) {
	const toast = useToast();
	const [nexusId, setNexusId] = useState<string>(myNexuses[0]?._id ?? '');
	const [troops, setTroops] = useState<Record<string, number>>({});
	const [note, setNote] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const selectedNexus = myNexuses.find((n) => n._id === nexusId);

	// Pre-fill: suggest pledging the gap between quota and pledged, capped at my available troops.
	useEffect(() => {
		if (!selectedNexus) return;
		const need: Record<string, number> = {};
		for (const k of TROOP_KEYS) {
			const want = wave.troops[k] ?? 0;
			const got = wave.slots.reduce((a, s) => a + (s.troops[k] ?? 0), 0);
			const gap = Math.max(0, want - got);
			const have = (selectedNexus.troops as Record<string, number>)[k] ?? 0;
			const propose = Math.min(gap, have);
			if (propose > 0) need[k] = propose;
		}
		setTroops(need);
	}, [nexusId, wave.id]); // eslint-disable-line react-hooks/exhaustive-deps

	const total = sumTroops(troops);

	// Feasibility check: would these troops physically arrive on time from this nexus?
	// Annihilator/Turret/Overseer move at speed 6-8, so even short distances can be
	// hours of travel - easy to pledge a composition that can never make impact.
	const waveArrivalMs = new Date(op.arrivalAt).getTime() + (wave.arrivalOffsetMs ?? 0);
	const launchAt =
		selectedNexus && total > 0
			? waveArrivalMs -
				travelMinutes(selectedNexus, { x: op.targetX, y: op.targetY }, troops) * 60 * 1000
			: null;
	// launchAt is derived from a server-anchored arrival timestamp, so compare
	// against the server clock - a skewed local clock would otherwise show
	// "too late" warnings for launches that are actually still in time.
	const tooLate = launchAt != null && launchAt < serverNow();
	const lateBy = tooLate && launchAt != null ? serverNow() - launchAt : 0;

	const handleSubmit = async () => {
		if (!selectedNexus) {
			toast('Select a source nexus', 'error');
			return;
		}
		if (total === 0) {
			toast('Pledge at least one troop', 'error');
			return;
		}
		if (tooLate) {
			toast('These troops are too slow to reach impact on time', 'error');
			return;
		}
		setSubmitting(true);
		try {
			await claimWarRoomSlot(wave.id, {
				fromNexusId: parseInt(selectedNexus._id, 10),
				troops,
				note: note.trim() || undefined
			});
			toast('Pledged', 'success');
			onClaimed();
		} catch (err) {
			const msg =
				(err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed';
			toast(msg, 'error');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="warroom-claim-form">
			<div className="warroom-claim-form-row">
				<label className="warroom-field">
					<span className="warroom-field-label">From nexus</span>
					<select
						className="warroom-field-input"
						value={nexusId}
						onChange={(e) => setNexusId(e.target.value)}
						disabled={submitting}
					>
						{myNexuses.length === 0 && <option value="">No owned nexuses</option>}
						{myNexuses.map((n) => (
							<option key={n._id} value={n._id}>
								{n.name} ({n.x}|{n.y})
							</option>
						))}
					</select>
				</label>
				<label className="warroom-field warroom-field--note">
					<span className="warroom-field-label">Note (optional)</span>
					<input
						className="warroom-field-input"
						type="text"
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="e.g. bringing the fast wave"
						maxLength={128}
						disabled={submitting}
					/>
				</label>
			</div>

			<div className="warroom-claim-troops">
				{TROOP_KEYS.filter(
					(k) => (selectedNexus?.troops as Record<string, number> | undefined)?.[k] ?? 0 > 0
				).map((k) => {
					const have = (selectedNexus?.troops as Record<string, number> | undefined)?.[k] ?? 0;
					const cur = troops[k] ?? 0;
					return (
						<div key={k} className="warroom-claim-troop">
							<span className="warroom-claim-troop-label">{TROOP_LABELS[k]}</span>
							<input
								type="number"
								min={0}
								max={have}
								value={cur || ''}
								placeholder="0"
								className="warroom-claim-troop-input"
								onChange={(e) =>
									setTroops((prev) => ({
										...prev,
										[k]: Math.min(have, Math.max(0, parseInt(e.target.value) || 0))
									}))
								}
								disabled={submitting}
							/>
							<span className="warroom-claim-troop-avail">/{have}</span>
						</div>
					);
				})}
			</div>

			<div className="warroom-claim-actions">
				<span className="warroom-claim-total">
					Pledging <strong>{total.toLocaleString()}</strong> troops
				</span>
				<button className="warroom-ghost-btn" onClick={onCancel} disabled={submitting}>
					Cancel
				</button>
				<button
					className="warroom-primary-btn"
					onClick={handleSubmit}
					disabled={submitting || total === 0 || tooLate}
					title={
						tooLate ? `Too slow - would arrive ${formatCountdown(lateBy)} after impact` : undefined
					}
				>
					{submitting ? 'Pledging...' : tooLate ? 'Too slow to make it' : 'Pledge'}
				</button>
			</div>

			{selectedNexus &&
				total > 0 &&
				launchAt != null &&
				(tooLate ? (
					<div className="warroom-claim-launch-hint warroom-claim-launch-hint--late">
						<AlertCircle size={12} />
						Too slow - would arrive <strong>{formatCountdown(lateBy)}</strong> after impact. Try
						faster units or a closer nexus.
					</div>
				) : (
					<div className="warroom-claim-launch-hint">
						<Radio size={12} />
						Launch from {selectedNexus.name} in{' '}
						<strong>{formatCountdown(launchAt - serverNow())}</strong>
					</div>
				))}
		</div>
	);
}

function SendNowBar({
	op,
	wave,
	slot,
	now,
	myNexuses,
	onSent
}: {
	op: Operation;
	wave: Wave;
	slot: Slot;
	now: number;
	myNexuses: Nexus[];
	onSent: () => void;
}) {
	const toast = useToast();
	const [sending, setSending] = useState(false);
	const nexus = myNexuses.find((n) => parseInt(n._id, 10) === slot.fromNexusId);
	if (!nexus) return null;
	const travel = travelMinutes(nexus, { x: op.targetX, y: op.targetY }, slot.troops);
	const launchAt =
		new Date(op.arrivalAt).getTime() + (wave.arrivalOffsetMs ?? 0) - travel * 60 * 1000;
	const ready = launchAt <= now + 30_000; // within 30s of launch window
	// Past the launch window: these troops physically cannot reach impact on time.
	// Block the send so slow units (Annihilator, Turret, Overseer) can't be launched
	// late and miss the coordinated wave.
	const tooLate = launchAt < now;
	const lateBy = tooLate ? now - launchAt : 0;

	const handleSend = async () => {
		if (tooLate) return;
		setSending(true);
		try {
			const res = await sendAttack(
				nexus._id,
				String(op.targetNexusId),
				slot.troops,
				'attack',
				`warroom:${slot.id}`
			);
			const attackId = res.data?.attack?._id ?? res.data?.attack?.id;
			if (attackId) {
				await markWarRoomSlotSent(slot.id, attackId);
			}
			toast('Wave launched', 'success');
			onSent();
		} catch (err) {
			const msg =
				(err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed';
			toast(msg, 'error');
		} finally {
			setSending(false);
		}
	};

	return (
		<button
			className={`warroom-send-now ${ready && !tooLate ? 'warroom-send-now--ready' : ''} ${tooLate ? 'warroom-send-now--late' : ''}`}
			onClick={handleSend}
			disabled={sending || tooLate}
			title={
				tooLate
					? `Too late, these troops would arrive ${formatCountdown(lateBy)} after impact`
					: ready
						? 'Launch your wave now'
						: 'Will be launchable within window'
			}
		>
			<Send size={13} />
			{sending
				? 'Launching...'
				: tooLate
					? `Too late, would miss impact by ${formatCountdown(lateBy)}`
					: ready
						? 'Launch My Wave Now'
						: `Launch in ${formatCountdown(launchAt - now)}`}
		</button>
	);
}

function AddWaveForm({ operationId, onAdded }: { operationId: number; onAdded: () => void }) {
	const toast = useToast();
	const [label, setLabel] = useState('');
	const [offsetSec, setOffsetSec] = useState(0);
	const [troops, setTroops] = useState<Record<string, number>>({});
	const [submitting, setSubmitting] = useState(false);
	const total = sumTroops(troops);

	const handleAdd = async () => {
		if (total <= 0) {
			toast('Add at least one troop to the wave target', 'error');
			return;
		}
		setSubmitting(true);
		try {
			await addWarRoomWave(operationId, {
				label: label.trim() || undefined,
				arrivalOffsetMs: offsetSec * 1000,
				troops
			});
			setLabel('');
			setOffsetSec(0);
			setTroops({});
			toast('Wave added', 'success');
			onAdded();
		} catch (err) {
			const msg =
				(err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed';
			toast(msg, 'error');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="warroom-add-wave">
			<div className="warroom-add-wave-head">
				<GripVertical size={12} />
				<span>New wave</span>
			</div>
			<div className="warroom-add-wave-meta">
				<input
					className="warroom-field-input"
					placeholder="Label (e.g. Crusher wave, Recon screen)"
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					maxLength={48}
					disabled={submitting}
				/>
				<label className="warroom-add-wave-offset">
					<span>Impact offset (sec)</span>
					<input
						className="warroom-field-input warroom-field-input--narrow"
						type="number"
						value={offsetSec}
						onChange={(e) => setOffsetSec(parseInt(e.target.value) || 0)}
						disabled={submitting}
					/>
				</label>
			</div>
			<div className="warroom-add-wave-troops">
				{TROOP_KEYS.map((k) => (
					<div key={k} className="warroom-add-wave-troop">
						<span className="warroom-add-wave-troop-label">{TROOP_LABELS[k]}</span>
						<input
							type="number"
							min={0}
							value={troops[k] ?? ''}
							placeholder="0"
							className="warroom-claim-troop-input"
							onChange={(e) =>
								setTroops((prev) => {
									const v = Math.max(0, parseInt(e.target.value) || 0);
									const next = { ...prev };
									if (v === 0) delete next[k];
									else next[k] = v;
									return next;
								})
							}
							disabled={submitting}
						/>
					</div>
				))}
			</div>
			<div className="warroom-add-wave-actions">
				<button
					className="warroom-primary-btn"
					onClick={handleAdd}
					disabled={submitting || total <= 0}
				>
					{submitting ? 'Adding...' : 'Add Wave'}
				</button>
			</div>
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Thread (right pane)
// ────────────────────────────────────────────────────────────────────────────

function ThreadPanel({
	op,
	currentUserId,
	socket,
	onPostMessage
}: {
	op: Operation;
	currentUserId: number;
	socket: ReturnType<typeof useWarRoomSocket>;
	onPostMessage: (text: string) => Promise<void>;
}) {
	const [draft, setDraft] = useState('');
	const [sending, setSending] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const typingTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [op.thread.length, op.id]);

	const typingPeers = socket.peerTyping
		.filter((p) => p.operationId === op.id && p.userId !== currentUserId)
		.map((p) => p.username);

	const handleSend = async (e: React.FormEvent) => {
		e.preventDefault();
		const text = draft.trim();
		if (!text || sending) return;
		setSending(true);
		try {
			await onPostMessage(text);
			setDraft('');
			socket.setTyping(op.id, false);
		} catch {
			// toast handled upstream
		} finally {
			setSending(false);
		}
	};

	const handleDraftChange = (v: string) => {
		setDraft(v);
		socket.setTyping(op.id, true);
		if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
		typingTimeoutRef.current = window.setTimeout(() => socket.setTyping(op.id, false), 2500);
	};

	return (
		<aside className="warroom-thread">
			<div className="warroom-thread-head">
				<Crosshair size={13} />
				<span>Operation thread</span>
			</div>
			<div className="warroom-thread-messages">
				{op.thread.length === 0 && (
					<div className="warroom-thread-empty">No messages yet. Coordinate the strike here.</div>
				)}
				{op.thread.map((m, i) => {
					const isMine = m.userId === currentUserId;
					const showAuthor = i === 0 || op.thread[i - 1].userId !== m.userId;
					return (
						<div
							key={m.id}
							className={`warroom-thread-msg ${isMine ? 'warroom-thread-msg--mine' : ''}`}
						>
							{showAuthor && (
								<div className="warroom-thread-msg-author">
									<div
										className="warroom-avatar warroom-avatar--xs"
										style={{ background: colorForUser(m.userId) }}
									>
										{initials(m.username)}
									</div>
									<span className="warroom-thread-msg-name">
										<Username
											name={m.username}
											isSupporter={m.isSupporter}
											supporterTier={m.supporterTier as any}
										/>
									</span>
									<span className="warroom-thread-msg-time">{fmtShortTime(m.createdAt)}</span>
								</div>
							)}
							<div className="warroom-thread-msg-bubble">{m.content}</div>
						</div>
					);
				})}
				<div ref={bottomRef} />
			</div>

			{typingPeers.length > 0 && (
				<div className="warroom-typing">
					<span className="warroom-typing-dots">
						<span />
						<span />
						<span />
					</span>
					{typingPeers.length === 1
						? `${typingPeers[0]} is typing...`
						: typingPeers.length === 2
							? `${typingPeers.join(' and ')} are typing...`
							: `${typingPeers.length} officers typing...`}
				</div>
			)}

			<form className="warroom-thread-form" onSubmit={handleSend}>
				<input
					className="warroom-thread-input"
					value={draft}
					onChange={(e) => handleDraftChange(e.target.value)}
					placeholder="Message officers in this op..."
					maxLength={1000}
					disabled={sending}
				/>
				<button
					type="submit"
					className="warroom-primary-btn warroom-thread-send"
					disabled={sending || !draft.trim()}
				>
					<Send size={13} />
				</button>
			</form>
		</aside>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Create operation modal
// ────────────────────────────────────────────────────────────────────────────

function CreateOperationModal({
	myNexuses,
	onClose,
	onSubmit
}: {
	myNexuses: Nexus[];
	onClose: () => void;
	onSubmit: (data: { name: string; targetNexusId: number; arrivalAt: string }) => Promise<void>;
}) {
	const [name, setName] = useState('');
	const [target, setTarget] = useState<MapNexus | null>(null);
	const [arrival, setArrival] = useState(() => toLocalDatetimeValue(serverNow() + 60 * 60 * 1000));
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !target) return;
		setSubmitting(true);
		try {
			await onSubmit({
				name: name.trim(),
				targetNexusId: parseInt(target._id, 10),
				arrivalAt: new Date(arrival).toISOString()
			});
		} finally {
			setSubmitting(false);
		}
	};

	const sourceNexus = myNexuses[0];

	return (
		<div
			className="warroom-modal-overlay"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="warroom-modal warroom-modal--wide">
				<div className="warroom-modal-head">
					<div className="warroom-modal-title">
						<Radar size={15} /> Open Operation
					</div>
					<button className="warroom-icon-btn" onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="warroom-modal-body warroom-modal-body--two-col">
					<div className="warroom-modal-left">
						<label className="warroom-field">
							<span className="warroom-field-label">Operation name</span>
							<input
								className="warroom-field-input"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. Iron Hammer / Crush COBRA-04"
								maxLength={64}
								required
								disabled={submitting}
								autoFocus
							/>
						</label>

						<label className="warroom-field">
							<span className="warroom-field-label">Target arrival time</span>
							<input
								className="warroom-field-input"
								type="datetime-local"
								value={arrival}
								onChange={(e) => setArrival(e.target.value)}
								disabled={submitting}
								required
							/>
						</label>

						<div className="warroom-target-card">
							{target ? (
								<>
									<div className="warroom-target-card-head">
										<Target size={14} />
										<span className="warroom-target-card-label">Selected target</span>
									</div>
									<div className="warroom-target-card-name">{target.name}</div>
									<div className="warroom-target-card-meta">
										{target.owner?.username && (
											<span className="warroom-target-card-owner">
												<Username
													name={target.owner.username}
													isSupporter={target.owner?.isSupporter}
													supporterTier={target.owner?.supporterTier as any}
													linkToProfile
												/>
											</span>
										)}
										<span className="warroom-target-card-points">
											{target.points.toLocaleString()} pts
										</span>
									</div>
								</>
							) : (
								<div className="warroom-target-card-empty">
									<Target size={14} />
									<span>Click a nexus on the map to select a target</span>
								</div>
							)}
						</div>

						<div className="warroom-modal-actions">
							<button
								type="button"
								className="warroom-ghost-btn"
								onClick={onClose}
								disabled={submitting}
							>
								Cancel
							</button>
							<button
								type="submit"
								className="warroom-primary-btn"
								disabled={submitting || !target || !name.trim()}
							>
								{submitting ? 'Opening...' : 'Open Operation'}
							</button>
						</div>
					</div>

					<div className="warroom-modal-right warroom-modal-right--map">
						{sourceNexus ? (
							<StarfieldMap
								currentNexus={sourceNexus}
								onRefresh={() => {}}
								mode="espionage"
								espionageHint="Click a nexus to set it as the operation target"
								onSelectSpyTarget={setTarget}
							/>
						) : null}
					</div>
				</form>
			</div>
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

function sumTroops(t: Record<string, number>): number {
	let total = 0;
	for (const k of TROOP_KEYS) total += t[k] ?? 0;
	return total;
}
