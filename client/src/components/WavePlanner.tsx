'use client';

import { Clock, Plus, Send, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { serverNow } from '../realtime/serverClock';
import {
	cancelScheduledAttack,
	getMyNexuses,
	getScheduledAttacks,
	scheduleAttack,
	sendAttack
} from '../services/api';
import '../styles/WavePlanner.css';
import type { Nexus } from '../types/game';
import { formatDuration, hasOnlyRecon, travelMinutes } from '../utils/travel';

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

// Per-wave hard cap. Mirrors the server rule in
// server/services/attackService.ts (`Maximum 1 Overseer per strike`).
// Each wave sends one army, so the server limit IS the per-wave limit.
// Capping in the UI prevents the player from staging an invalid wave
// that would only fail at submission time.
const MAX_OVERSEERS_PER_WAVE = 1;

function perWaveTroopCap(troopType: string, available: number): number {
	if (troopType === 'overseer') return Math.min(available, MAX_OVERSEERS_PER_WAVE);
	return available;
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
	overseer: 'Overseer'
};

type TroopMap = Record<string, number>;

interface Wave {
	id: string;
	requestId: string;
	nexusId: string;
	troops: TroopMap;
	sending: boolean;
	// Server-side scheduled wave id, set once the wave is queued on the backend.
	scheduledId: number | null;
	scheduledLaunchAt: number | null;
	sent: boolean;
	error: string | null;
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

	// Load any waves already scheduled server-side for this target so they show up
	// (and stay cancellable) even after a reload / on another device.
	const refreshScheduled = useCallback(async () => {
		try {
			const res = await getScheduledAttacks();
			const rows: Array<{
				id: number;
				fromNexusId: number;
				toNexusId: number;
				troops: TroopMap;
				launchAt: string;
			}> = res.data?.scheduled ?? [];
			const forTarget = rows
				.filter((r) => String(r.toNexusId) === target._id)
				.sort(
					(a, b) => new Date(a.launchAt).getTime() - new Date(b.launchAt).getTime()
				);
			setWaves((prev) => {
				// Keep locally-edited (not-yet-scheduled) waves; replace the scheduled set.
				const local = prev.filter((w) => w.scheduledId == null && !w.sent);
				const scheduled: Wave[] = forTarget.map((r) => ({
					id: `sched-${r.id}`,
					requestId: `sched-${r.id}`,
					nexusId: String(r.fromNexusId),
					troops: r.troops,
					sending: false,
					scheduledId: r.id,
					scheduledLaunchAt: new Date(r.launchAt).getTime(),
					sent: false,
					error: null
				}));
				return [...local, ...scheduled];
			});
		} catch {
			/* non-fatal: planner still works for ad-hoc sends */
		}
	}, [target._id]);

	useEffect(() => {
		void refreshScheduled();
	}, [refreshScheduled]);

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
				scheduledId: null,
				scheduledLaunchAt: null,
				sent: false,
				error: null
			}
		]);
	}, [myNexuses]);

	const cancelScheduledWave = async (wave: Wave) => {
		if (wave.scheduledId == null) {
			setWaves((prev) => prev.filter((w) => w.id !== wave.id));
			return;
		}
		try {
			await cancelScheduledAttack(wave.scheduledId);
			setWaves((prev) => prev.filter((w) => w.id !== wave.id));
			toast('Scheduled wave cancelled', 'info');
		} catch (err: any) {
			const msg = err.response?.data?.error || 'Failed to cancel wave';
			toast(msg, 'error');
			// Resync in case it already launched.
			void refreshScheduled();
		}
	};

	const removeWave = (wave: Wave) => {
		void cancelScheduledWave(wave);
	};

	const updateWaveTroop = (waveId: string, troopType: string, value: number) => {
		setWaves((prev) => {
			const next = prev.map((w) => {
				if (w.id !== waveId) return w;
				const available =
					(
						myNexuses.find((n) => n._id === w.nexusId)?.troops as
							| Record<string, number>
							| undefined
					)?.[troopType] ?? 0;
				const cap = perWaveTroopCap(troopType, available);
				return {
					...w,
					troops: {
						...w.troops,
						[troopType]: Math.min(cap, Math.max(0, value))
					}
				};
			});

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
						const available = (selected.troops as Record<string, number>)[key] ?? 0;
						troops[key] = Math.min(troops[key] ?? 0, perWaveTroopCap(key, available));
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
		// Compared against the server clock so a skewed local clock doesn't
		// mis-decide send-now vs. schedule.
		const delay = launchMs - serverNow();

		setWaves((prev) =>
			prev.map((w) => (w.id !== wave.id ? w : { ...w, sending: true, error: null }))
		);

		// Within ~1 min of launch: just send it now (no point round-tripping the
		// scheduler). Otherwise persist a server-side scheduled wave that fires at
		// launchMs even if this tab is closed.
		if (delay <= 60_000) {
			try {
				await sendAttack(nexus._id, target._id, wave.troops, mission, wave.requestId);
				setWaves((prev) =>
					prev.map((w) =>
						w.id !== wave.id ? w : { ...w, sending: false, sent: true, scheduledLaunchAt: null }
					)
				);
				toast(`Wave from ${nexus.name} sent`, 'success');
			} catch (err: any) {
				const msg = err.response?.data?.error || 'Failed to send wave';
				setWaves((prev) =>
					prev.map((w) => (w.id !== wave.id ? w : { ...w, sending: false, error: msg }))
				);
				toast(msg, 'error');
			}
			return;
		}

		try {
			const res = await scheduleAttack({
				fromNexusId: nexus._id,
				toNexusId: target._id,
				troops: wave.troops,
				type: mission,
				launchAt: new Date(launchMs).toISOString(),
				clientRequestId: wave.requestId
			});
			const scheduledId: number | null = res.data?.scheduled?.id ?? null;
			setWaves((prev) =>
				prev.map((w) =>
					w.id !== wave.id
						? w
						: { ...w, sending: false, scheduledId, scheduledLaunchAt: launchMs }
				)
			);
			toast(
				`Wave from ${nexus.name} scheduled. Launches in ${formatTimeUntil(launchMs)}`,
				'info'
			);
		} catch (err: any) {
			const msg = err.response?.data?.error || 'Failed to schedule wave';
			setWaves((prev) =>
				prev.map((w) => (w.id !== wave.id ? w : { ...w, sending: false, error: msg }))
			);
			toast(msg, 'error');
		}
	};

	const sendAllWaves = async () => {
		const unsent = waves.filter((w) => !w.sent && w.scheduledId == null);
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
						Scheduled waves launch on the server — you can close this tab
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
						const scheduled = wave.scheduledId != null;
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
										disabled={wave.sent || scheduled}
									>
										{myNexuses.map((n) => (
											<option key={n._id} value={n._id}>
												{n.name} ({n.x}|{n.y})
											</option>
										))}
										{/* A scheduled wave's source nexus may not be in the current
										    list (e.g. loaded from the server). Keep it selectable. */}
										{scheduled && !myNexuses.some((n) => n._id === wave.nexusId) && (
											<option value={wave.nexusId}>Nexus #{wave.nexusId}</option>
										)}
									</select>

									{travelMin > 0 && (
										<span
											className={`wplanner-travel-time ${isPast ? 'wplanner-travel-time--past' : ''}`}
										>
											{formatDuration(travelMin)} travel
										</span>
									)}

									{!wave.sent && !scheduled && (
										<button
											className="wplanner-remove-btn"
											onClick={() => removeWave(wave)}
											title="Remove wave"
										>
											<Trash2 size={14} />
										</button>
									)}
									{scheduled && (
										<button
											className="wplanner-remove-btn"
											onClick={() => cancelScheduledWave(wave)}
											title="Cancel scheduled wave"
										>
											<X size={14} />
										</button>
									)}
									{wave.sent && <span className="wplanner-sent-badge">Sent</span>}
									{scheduled && <span className="wplanner-sent-badge">Scheduled</span>}
								</div>

								{scheduled && wave.scheduledLaunchAt && (
									<div className="wplanner-countdown">
										Scheduled - launches in {formatTimeUntil(wave.scheduledLaunchAt)}
									</div>
								)}

								{launchCountdown && !wave.sent && !scheduled && (
									<div className={`wplanner-countdown ${isPast ? 'wplanner-countdown--past' : ''}`}>
										{launchCountdown}
										{isPast && ' - sends now'}
									</div>
								)}

								{wave.error && <div className="wplanner-wave-error">{wave.error}</div>}

								{!wave.sent && !scheduled && (
									<div className="wplanner-troop-grid">
										{TROOP_KEYS.filter((k) => (nexus?.troops as any)?.[k] > 0).map((troopType) => {
											const available = (nexus?.troops as any)?.[troopType] ?? 0;
											const cap = perWaveTroopCap(troopType, available);
											const current = wave.troops[troopType] ?? 0;
											return (
												<div key={troopType} className="wplanner-troop-row">
													<span className="wplanner-troop-label">{TROOP_LABELS[troopType]}</span>
													<input
														type="number"
														min={0}
														max={cap}
														value={current || ''}
														placeholder="0"
														className="wplanner-troop-input"
														onChange={(e) =>
															updateWaveTroop(wave.id, troopType, parseInt(e.target.value) || 0)
														}
													/>
													<span className="wplanner-troop-avail">/{cap}</span>
												</div>
											);
										})}
										{nexus && TROOP_KEYS.every((k) => !((nexus.troops as any)?.[k] > 0)) && (
											<span className="wplanner-no-troops">No troops at this nexus</span>
										)}
									</div>
								)}

								{!wave.sent && !scheduled && (
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
					{waves.filter((w) => !w.sent && w.scheduledId == null).length > 1 && (
						<button className="wplanner-send-all-btn" onClick={sendAllWaves} disabled={sendingAll}>
							<Send size={14} />
							{sendingAll
								? 'Sending all...'
								: `Send all ${waves.filter((w) => !w.sent && w.scheduledId == null).length} waves`}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default WavePlanner;
