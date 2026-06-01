'use client';

import { Clock, Plus, Send, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { getMyNexuses, sendAttack } from '../services/api';
import { serverNow } from '../realtime/serverClock';
import { formatDuration, hasOnlyRecon, travelMinutes } from '../utils/travel';
import '../styles/WavePlanner.css';
import type { Nexus } from '../types/game';

interface TargetNexus {
	_id: string;
	name: string;
	x: number;
	y: number;
}

interface WavePlanner_Props {
	target: TargetNexus;
	onClose: () => void;
}

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

type TroopMap = Record<string, number>;

interface Wave {
	id: string;
	requestId: string;
	nexusId: string;
	troops: TroopMap;
	sending: boolean;
	scheduled: boolean;
	scheduledLaunchAt: number | null;
	sent: boolean;
	error: string | null;
}

interface ScheduledWaveRecord {
	id: string;
	requestId: string;
	target: TargetNexus;
	nexusId: string;
	troops: TroopMap;
	scheduledLaunchAt: number;
}

const scheduledWaveRecords = new Map<string, ScheduledWaveRecord>();
const scheduledWaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scheduledWaveSubscribers = new Set<() => void>();

function getScheduledWavesForTarget(targetId: string): Wave[] {
	return Array.from(scheduledWaveRecords.values())
		.filter((record) => record.target._id === targetId)
		.sort((a, b) => a.scheduledLaunchAt - b.scheduledLaunchAt)
		.map((record) => ({
			id: record.id,
			requestId: record.requestId,
			nexusId: record.nexusId,
			troops: record.troops,
			sending: false,
			scheduled: true,
			scheduledLaunchAt: record.scheduledLaunchAt,
			sent: false,
			error: null
		}));
}

function notifyScheduledWaveSubscribers() {
	for (const cb of scheduledWaveSubscribers) cb();
}

function subscribeToScheduledWaves(cb: () => void) {
	scheduledWaveSubscribers.add(cb);
	return () => {
		scheduledWaveSubscribers.delete(cb);
	};
}

function cancelStoredScheduledWave(id: string) {
	const timer = scheduledWaveTimers.get(id);
	if (timer) clearTimeout(timer);
	scheduledWaveTimers.delete(id);
	scheduledWaveRecords.delete(id);
	notifyScheduledWaveSubscribers();
}

function armStoredScheduledWave(record: ScheduledWaveRecord) {
	const existing = scheduledWaveTimers.get(record.id);
	if (existing) clearTimeout(existing);

	const delay = record.scheduledLaunchAt - serverNow();
	const launch = async () => {
		const current = scheduledWaveRecords.get(record.id);
		if (!current) return;

		try {
			await sendAttack(
				current.nexusId,
				current.target._id,
				current.troops,
				missionForTroops(current.troops),
				current.requestId
			);
		} finally {
			scheduledWaveTimers.delete(current.id);
			scheduledWaveRecords.delete(current.id);
			notifyScheduledWaveSubscribers();
		}
	};

	if (delay <= 0) {
		void launch();
	} else {
		scheduledWaveTimers.set(record.id, setTimeout(launch, delay));
	}
}

function storeScheduledWave(record: ScheduledWaveRecord) {
	scheduledWaveRecords.set(record.id, record);
	armStoredScheduledWave(record);
	notifyScheduledWaveSubscribers();
}

function formatLaunchTime(arrivalMs: number, travelMinutes: number): string {
	const launchMs = arrivalMs - travelMinutes * 60 * 1000;
	// arrivalMs is a server-anchored target; compare against the server clock.
	const diff = launchMs - serverNow();
	if (diff < 0) return 'Already past';
	const h = Math.floor(diff / 3600000);
	const m = Math.floor((diff % 3600000) / 60000);
	const s = Math.floor((diff % 60000) / 1000);
	const label = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
	return `Launch in ${label}`;
}

function formatTimeUntil(targetMs: number): string {
	const diff = targetMs - serverNow();
	if (diff < 0) return 'launching soon';
	const h = Math.floor(diff / 3600000);
	const m = Math.floor((diff % 3600000) / 60000);
	const s = Math.floor((diff % 60000) / 1000);
	return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function toLocalDatetimeValue(ms: number): string {
	const date = new Date(ms);
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyTroops(): TroopMap {
	return Object.fromEntries(TROOP_KEYS.map((k) => [k, 0]));
}

function missionForTroops(troops: TroopMap): 'scout' | 'attack' {
	return hasOnlyRecon(troops) ? 'scout' : 'attack';
}

const WavePlanner: React.FC<WavePlanner_Props> = ({ target, onClose }) => {
	const toast = useToast();
	const [myNexuses, setMyNexuses] = useState<Nexus[]>([]);
	const [waves, setWaves] = useState<Wave[]>([]);
	const [arrivalTime, setArrivalTime] = useState<string>('');
	const [now, setNow] = useState(() => serverNow());
	const [sendingAll, setSendingAll] = useState(false);

	// Tick `now` every second so countdowns + isPast checks stay live without calling
	// Date.now() from inside render (react-hooks/purity).
	useEffect(() => {
		const id = setInterval(() => setNow(serverNow()), 1000);
		return () => clearInterval(id);
	}, []);

	// Default arrival time: 30 min from now
	useEffect(() => {
		setArrivalTime(toLocalDatetimeValue(serverNow() + 30 * 60 * 1000));
	}, []);

	useEffect(() => {
		const syncScheduled = () => {
			const scheduled = getScheduledWavesForTarget(target._id);
			const scheduledIds = new Set(scheduled.map((w) => w.id));
			setWaves((prev) => [
				...prev.filter((w) => !w.scheduled && !scheduledIds.has(w.id)),
				...scheduled
			]);
		};

		syncScheduled();
		return subscribeToScheduledWaves(syncScheduled);
	}, [target._id]);

	useEffect(() => {
		getMyNexuses()
			.then((r) => {
				const nexuses: Nexus[] = r.data;
				setMyNexuses(
					nexuses
						.filter((n) => n._id !== target._id)
						.sort((a, b) => {
							const da = (target.x - a.x) ** 2 + (target.y - a.y) ** 2;
							const db = (target.x - b.x) ** 2 + (target.y - b.y) ** 2;
							return da - db;
						})
				);
			})
			.catch(() => {});
	}, [target._id, target.x, target.y]);

	const arrivalMs = arrivalTime ? new Date(arrivalTime).getTime() : 0;

	const addWave = useCallback(() => {
		const nexus = myNexuses[0];
		if (!nexus) return;
		setWaves((prev) => [
			...prev,
			{
				id: `${Date.now()}-${Math.random()}`,
				requestId: `wave:${Date.now()}:${Math.random().toString(36).slice(2)}`,
				nexusId: nexus._id,
				troops: emptyTroops(),
				sending: false,
				scheduled: false,
				scheduledLaunchAt: null,
				sent: false,
				error: null
			}
		]);
	}, [myNexuses]);

	const cancelScheduledWave = (id: string) => {
		cancelStoredScheduledWave(id);
		setWaves((prev) =>
			prev.map((w) =>
				w.id !== id ? w : { ...w, scheduled: false, scheduledLaunchAt: null, sending: false }
			)
		);
	};

	const removeWave = (id: string) => {
		cancelScheduledWave(id);
		setWaves((prev) => prev.filter((w) => w.id !== id));
	};

	const updateWaveTroop = (waveId: string, troopType: string, value: number) => {
		setWaves((prev) => {
			const next = prev.map((w) =>
				w.id !== waveId
					? w
					: {
							...w,
							troops: {
								...w.troops,
								[troopType]: Math.min(
									(
										myNexuses.find((n) => n._id === w.nexusId)?.troops as
											| Record<string, number>
											| undefined
									)?.[troopType] ?? value,
									Math.max(0, value)
								)
							}
						}
			);

			// After updating troops, check if the current arrival time is still
			// reachable. If the slowest unit in this wave now needs more travel time
			// than there is before the current arrival, bump the arrival to the
			// earliest feasible moment (travel + 1 min buffer, rounded to the minute).
			const updatedWave = next.find((w) => w.id === waveId);
			if (updatedWave) {
				const nexus = myNexuses.find((n) => n._id === updatedWave.nexusId);
				if (nexus) {
					const travelMin = travelMinutes(
						nexus,
						target,
						updatedWave.troops,
						missionForTroops(updatedWave.troops)
					);
					if (travelMin > 0) {
						const minArrivalMs = serverNow() + travelMin * 60 * 1000 + 60_000;
						setArrivalTime((prev) => {
							const currentMs = prev ? new Date(prev).getTime() : 0;
							if (currentMs < minArrivalMs) {
								return toLocalDatetimeValue(minArrivalMs);
							}
							return prev;
						});
					}
				}
			}

			return next;
		});
	};

	const updateWaveNexus = (waveId: string, nexusId: string) => {
		setWaves((prev) => {
			const selected = myNexuses.find((n) => n._id === nexusId);
			const next = prev.map((w) => {
				if (w.id !== waveId) return w;
				const troops = { ...w.troops };
				if (selected) {
					for (const key of TROOP_KEYS) {
						troops[key] = Math.min(
							troops[key] ?? 0,
							(selected.troops as Record<string, number>)[key] ?? 0
						);
					}
				}
				return { ...w, nexusId, troops };
			});
			const updatedWave = next.find((w) => w.id === waveId);
			if (updatedWave) {
				const nexus = myNexuses.find((n) => n._id === nexusId);
				if (nexus) {
					const travelMin = travelMinutes(
						nexus,
						target,
						updatedWave.troops,
						missionForTroops(updatedWave.troops)
					);
					if (travelMin > 0) {
						const minArrivalMs = serverNow() + travelMin * 60 * 1000 + 60_000;
						setArrivalTime((prev) => {
							const currentMs = prev ? new Date(prev).getTime() : 0;
							if (currentMs < minArrivalMs) {
								return toLocalDatetimeValue(minArrivalMs);
							}
							return prev;
						});
					}
				}
			}
			return next;
		});
	};

	const getWaveNexus = (nexusId: string) => myNexuses.find((n) => n._id === nexusId);

	const sendWave = async (wave: Wave) => {
		const nexus = getWaveNexus(wave.nexusId);
		if (!nexus) return;
		const totalTroops = Object.values(wave.troops).reduce((s, n) => s + n, 0);
		if (totalTroops === 0) {
			toast('Add at least one troop to the wave', 'error');
			return;
		}
		if (!arrivalTime) {
			toast('Set an arrival time first', 'error');
			return;
		}
		const mission = missionForTroops(wave.troops);
		const travelMin = travelMinutes(nexus, target, wave.troops, mission);
		const launchMs = arrivalMs - travelMin * 60 * 1000;
		// The setTimeout delay must be measured against the server clock, otherwise
		// a skewed local clock fires the launch early or late.
		const delay = launchMs - serverNow();

		cancelScheduledWave(wave.id);
		setWaves((prev) =>
			prev.map((w) => (w.id !== wave.id ? w : { ...w, sending: true, error: null }))
		);

		const doSend = async () => {
			try {
				await sendAttack(nexus._id, target._id, wave.troops, mission, wave.requestId);
				setWaves((prev) =>
					prev.map((w) =>
						w.id !== wave.id
							? w
							: { ...w, sending: false, scheduled: false, scheduledLaunchAt: null, sent: true }
					)
				);
				toast(`Wave from ${nexus.name} sent`, 'success');
			} catch (err: any) {
				const msg = err.response?.data?.error || 'Failed to send wave';
				setWaves((prev) =>
					prev.map((w) =>
						w.id !== wave.id
							? w
							: { ...w, sending: false, scheduled: false, scheduledLaunchAt: null, error: msg }
					)
				);
				toast(msg, 'error');
			}
		};

		if (delay <= 0) {
			await doSend();
		} else {
			storeScheduledWave({
				id: wave.id,
				requestId: wave.requestId,
				target,
				nexusId: nexus._id,
				troops: wave.troops,
				scheduledLaunchAt: launchMs
			});
			toast(`Wave from ${nexus.name} scheduled. Launches in ${formatTimeUntil(launchMs)}`, 'info');
			setWaves((prev) =>
				prev.map((w) =>
					w.id !== wave.id
						? w
						: { ...w, sending: false, scheduled: true, scheduledLaunchAt: launchMs }
				)
			);
		}
	};

	const sendAllWaves = async () => {
		const unsent = waves.filter((w) => !w.sent && !w.scheduled);
		if (unsent.length === 0) return;
		setSendingAll(true);
		for (const wave of unsent) {
			await sendWave(wave);
		}
		setSendingAll(false);
	};

	return (
		<div className="wplanner-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="wplanner-modal">
				{/* Header */}
				<div className="wplanner-header">
					<div className="wplanner-title-row">
						<Clock size={16} className="wplanner-header-icon" />
						<span className="wplanner-title">Wave Planner</span>
						<span className="wplanner-target">
							to {target.name} ({target.x}|{target.y})
						</span>
					</div>
					<button className="wplanner-close" onClick={onClose} aria-label="Close">
						<X size={18} />
					</button>
				</div>

				{/* Arrival time */}
				<div className="wplanner-arrival-row">
					<label className="wplanner-arrival-label" htmlFor="wp-arrival">
						Target Arrival Time
					</label>
					<input
						id="wp-arrival"
						type="datetime-local"
						className="wplanner-arrival-input"
						value={arrivalTime}
						onChange={(e) => setArrivalTime(e.target.value)}
					/>
					<span className="wplanner-arrival-hint">
						All waves will be timed to arrive at this moment
					</span>
				</div>

				{/* Waves */}
				<div className="wplanner-waves">
					{waves.length === 0 && (
						<div className="wplanner-empty">
							No waves added yet. Add a wave below to start planning.
						</div>
					)}

					{waves.map((wave, idx) => {
						const nexus = getWaveNexus(wave.nexusId);
						const totalTroops = Object.values(wave.troops).reduce((s, n) => s + n, 0);
						const travelMin =
							nexus && totalTroops > 0
								? travelMinutes(nexus, target, wave.troops, missionForTroops(wave.troops))
								: 0;
						const launchCountdown =
							nexus && arrivalMs && travelMin > 0 ? formatLaunchTime(arrivalMs, travelMin) : null;
						const isPast =
							arrivalMs > 0 && travelMin > 0 && arrivalMs - travelMin * 60 * 1000 < now;

						return (
							<div
								key={wave.id}
								className={`wplanner-wave ${wave.sent ? 'wplanner-wave--sent' : ''} ${wave.error ? 'wplanner-wave--error' : ''}`}
							>
								<div className="wplanner-wave-header">
									<span className="wplanner-wave-num">Wave {idx + 1}</span>

									<select
										className="wplanner-nexus-select"
										value={wave.nexusId}
										onChange={(e) => updateWaveNexus(wave.id, e.target.value)}
										disabled={wave.sent || wave.scheduled}
									>
										{myNexuses.map((n) => (
											<option key={n._id} value={n._id}>
												{n.name} ({n.x}|{n.y})
											</option>
										))}
									</select>

									{travelMin > 0 && (
										<span
											className={`wplanner-travel-time ${isPast ? 'wplanner-travel-time--past' : ''}`}
										>
											{formatDuration(travelMin)} travel
										</span>
									)}

									{!wave.sent && !wave.scheduled && (
										<button
											className="wplanner-remove-btn"
											onClick={() => removeWave(wave.id)}
											title="Remove wave"
										>
											<Trash2 size={14} />
										</button>
									)}
									{wave.scheduled && (
										<button
											className="wplanner-remove-btn"
											onClick={() => cancelScheduledWave(wave.id)}
											title="Cancel scheduled wave"
										>
											<X size={14} />
										</button>
									)}
									{wave.sent && <span className="wplanner-sent-badge">Sent</span>}
									{wave.scheduled && <span className="wplanner-sent-badge">Scheduled</span>}
								</div>

								{wave.scheduled && wave.scheduledLaunchAt && (
									<div className="wplanner-countdown">
										Scheduled - launches in {formatTimeUntil(wave.scheduledLaunchAt)}
									</div>
								)}

								{launchCountdown && !wave.sent && !wave.scheduled && (
									<div className={`wplanner-countdown ${isPast ? 'wplanner-countdown--past' : ''}`}>
										{launchCountdown}
										{isPast && ' - adjust arrival time'}
									</div>
								)}

								{wave.error && <div className="wplanner-wave-error">{wave.error}</div>}

								{!wave.sent && !wave.scheduled && (
									<div className="wplanner-troop-grid">
										{TROOP_KEYS.filter((k) => (nexus?.troops as any)?.[k] > 0).map((troopType) => {
											const available = (nexus?.troops as any)?.[troopType] ?? 0;
											const current = wave.troops[troopType] ?? 0;
											return (
												<div key={troopType} className="wplanner-troop-row">
													<span className="wplanner-troop-label">{TROOP_LABELS[troopType]}</span>
													<input
														type="number"
														min={0}
														max={available}
														value={current || ''}
														placeholder="0"
														className="wplanner-troop-input"
														onChange={(e) =>
															updateWaveTroop(wave.id, troopType, parseInt(e.target.value) || 0)
														}
													/>
													<span className="wplanner-troop-avail">/{available}</span>
												</div>
											);
										})}
										{nexus && TROOP_KEYS.every((k) => !((nexus.troops as any)?.[k] > 0)) && (
											<span className="wplanner-no-troops">No troops at this nexus</span>
										)}
									</div>
								)}

								{!wave.sent && !wave.scheduled && (
									<div className="wplanner-wave-actions">
										<button
											className="wplanner-send-wave-btn"
											onClick={() => sendWave(wave)}
											disabled={wave.sending || totalTroops === 0 || !arrivalTime}
										>
											<Send size={13} />
											{wave.sending ? 'Sending...' : isPast ? 'Send Now' : 'Schedule'}
										</button>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* Footer actions */}
				<div className="wplanner-footer">
					<button className="wplanner-add-btn" onClick={addWave} disabled={myNexuses.length === 0}>
						<Plus size={14} /> Add Wave
					</button>
					{waves.filter((w) => !w.sent && !w.scheduled).length > 1 && (
						<button className="wplanner-send-all-btn" onClick={sendAllWaves} disabled={sendingAll}>
							<Send size={14} />
							{sendingAll
								? 'Sending all...'
								: `Send all ${waves.filter((w) => !w.sent && !w.scheduled).length} waves`}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default WavePlanner;
