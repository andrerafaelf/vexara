'use client';

import { Clock, Plus, Send, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { getMyNexuses, sendAttack } from '../services/api';
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
  'lancerDrone','assaultTrooper','breakerUnit','reconOperative','skimmerBike',
  'siegeMech','bulwarkGuard','suppressorTeam','disruptorUnit','interceptorBike',
  'annihilatorPlatform','overseer',
] as const;

const TROOP_LABELS: Record<string, string> = {
  lancerDrone:'Lancer Drone', assaultTrooper:'Assault Trooper', breakerUnit:'Breaker Unit',
  reconOperative:'Recon Operative', skimmerBike:'Skimmer Bike', siegeMech:'Siege Mech',
  bulwarkGuard:'Bulwark Guard', suppressorTeam:'Suppressor Team', disruptorUnit:'Disruptor Unit',
  interceptorBike:'Interceptor Bike', annihilatorPlatform:'Annihilator Platform', overseer:'Overseer',
};

const TROOP_SPEED: Record<string, number> = {
  lancerDrone:20, assaultTrooper:18, breakerUnit:16, reconOperative:25,
  skimmerBike:22, siegeMech:10, bulwarkGuard:12, suppressorTeam:15,
  disruptorUnit:17, interceptorBike:28, annihilatorPlatform:8, overseer:6,
};

type TroopMap = Record<string, number>;

interface Wave {
  id: string;
  nexusId: string;
  troops: TroopMap;
  sending: boolean;
  sent: boolean;
  error: string | null;
}

function computeTravelMinutes(from: { x: number; y: number }, to: { x: number; y: number }, troops: TroopMap): number {
  const dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
  let minSpeed = Infinity;
  for (const [type, count] of Object.entries(troops)) {
    if (count > 0 && TROOP_SPEED[type]) {
      minSpeed = Math.min(minSpeed, TROOP_SPEED[type]);
    }
  }
  if (!isFinite(minSpeed)) return 0;
  return dist * (4 + (28 - minSpeed) / 10);
}

function formatLaunchTime(arrivalMs: number, travelMinutes: number): string {
  const launchMs = arrivalMs - travelMinutes * 60 * 1000;
  const diff = launchMs - Date.now();
  if (diff < 0) return 'Already past';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const label = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return `Launch in ${label}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const WavePlanner: React.FC<WavePlanner_Props> = ({ target, onClose }) => {
  const toast = useToast();
  const [myNexuses, setMyNexuses] = useState<Nexus[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [arrivalTime, setArrivalTime] = useState<string>('');
  const [tick, setTick] = useState(0);
  const [sendingAll, setSendingAll] = useState(false);

  // Tick every second to keep countdown live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Default arrival time: 30 min from now
  useEffect(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    d.setSeconds(0, 0);
    setArrivalTime(d.toISOString().slice(0, 16));
  }, []);

  useEffect(() => {
    getMyNexuses()
      .then((r) => {
        const nexuses: Nexus[] = r.data;
        setMyNexuses(nexuses.filter((n) => n._id !== target._id));
      })
      .catch(() => {});
  }, [target._id]);

  const arrivalMs = arrivalTime ? new Date(arrivalTime).getTime() : 0;

  const addWave = useCallback(() => {
    const nexus = myNexuses[0];
    if (!nexus) return;
    setWaves((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        nexusId: nexus._id,
        troops: Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])),
        sending: false,
        sent: false,
        error: null,
      },
    ]);
  }, [myNexuses]);

  const removeWave = (id: string) => setWaves((prev) => prev.filter((w) => w.id !== id));

  const updateWaveTroop = (waveId: string, troopType: string, value: number) => {
    setWaves((prev) =>
      prev.map((w) => w.id !== waveId ? w : { ...w, troops: { ...w.troops, [troopType]: Math.max(0, value) } }),
    );
  };

  const updateWaveNexus = (waveId: string, nexusId: string) => {
    setWaves((prev) => prev.map((w) => w.id !== waveId ? w : { ...w, nexusId }));
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
    const travelMin = computeTravelMinutes(nexus, target, wave.troops);
    const launchMs = arrivalMs - travelMin * 60 * 1000;
    const delay = launchMs - Date.now();

    setWaves((prev) => prev.map((w) => w.id !== wave.id ? w : { ...w, sending: true, error: null }));

    const doSend = async () => {
      try {
        const onlyRecon =
          wave.troops.reconOperative > 0 &&
          Object.entries(wave.troops).every(([t, n]) => t === 'reconOperative' || n === 0);
        await sendAttack(nexus._id, target._id, wave.troops, onlyRecon ? 'scout' : 'attack');
        setWaves((prev) => prev.map((w) => w.id !== wave.id ? w : { ...w, sending: false, sent: true }));
        toast(`Wave from ${nexus.name} sent`, 'success');
      } catch (err: any) {
        const msg = err.response?.data?.error || 'Failed to send wave';
        setWaves((prev) => prev.map((w) => w.id !== wave.id ? w : { ...w, sending: false, error: msg }));
        toast(msg, 'error');
      }
    };

    if (delay <= 0) {
      await doSend();
    } else {
      setTimeout(doSend, delay);
      toast(`Wave from ${nexus.name} scheduled — launches in ${formatDuration(travelMin)}`, 'info');
      setWaves((prev) => prev.map((w) => w.id !== wave.id ? w : { ...w, sending: false }));
    }
  };

  const sendAllWaves = async () => {
    const unsent = waves.filter((w) => !w.sent);
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
              → {target.name} ({target.x}|{target.y})
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
          <span className="wplanner-arrival-hint">All waves will be timed to arrive at this moment</span>
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
            const travelMin = nexus && totalTroops > 0
              ? computeTravelMinutes(nexus, target, wave.troops)
              : 0;
            const launchCountdown = nexus && arrivalMs && travelMin > 0
              ? formatLaunchTime(arrivalMs, travelMin)
              : null;
            const isPast = arrivalMs > 0 && travelMin > 0 && (arrivalMs - travelMin * 60 * 1000) < Date.now();

            return (
              <div key={wave.id} className={`wplanner-wave ${wave.sent ? 'wplanner-wave--sent' : ''} ${wave.error ? 'wplanner-wave--error' : ''}`}>
                <div className="wplanner-wave-header">
                  <span className="wplanner-wave-num">Wave {idx + 1}</span>

                  <select
                    className="wplanner-nexus-select"
                    value={wave.nexusId}
                    onChange={(e) => updateWaveNexus(wave.id, e.target.value)}
                    disabled={wave.sent}
                  >
                    {myNexuses.map((n) => (
                      <option key={n._id} value={n._id}>
                        {n.name} ({n.x}|{n.y})
                      </option>
                    ))}
                  </select>

                  {travelMin > 0 && (
                    <span className={`wplanner-travel-time ${isPast ? 'wplanner-travel-time--past' : ''}`}>
                      {formatDuration(travelMin)} travel
                    </span>
                  )}

                  {!wave.sent && (
                    <button className="wplanner-remove-btn" onClick={() => removeWave(wave.id)} title="Remove wave">
                      <Trash2 size={14} />
                    </button>
                  )}
                  {wave.sent && <span className="wplanner-sent-badge">Sent</span>}
                </div>

                {launchCountdown && !wave.sent && (
                  <div className={`wplanner-countdown ${isPast ? 'wplanner-countdown--past' : ''}`}>
                    {launchCountdown}
                    {isPast && ' — adjust arrival time'}
                  </div>
                )}

                {wave.error && <div className="wplanner-wave-error">{wave.error}</div>}

                {!wave.sent && (
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
                            onChange={(e) => updateWaveTroop(wave.id, troopType, parseInt(e.target.value) || 0)}
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

                {!wave.sent && (
                  <div className="wplanner-wave-actions">
                    <button
                      className="wplanner-send-wave-btn"
                      onClick={() => sendWave(wave)}
                      disabled={wave.sending || totalTroops === 0 || !arrivalTime}
                    >
                      <Send size={13} />
                      {wave.sending ? 'Sending…' : isPast ? 'Send Now' : 'Schedule'}
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
          {waves.filter((w) => !w.sent).length > 1 && (
            <button className="wplanner-send-all-btn" onClick={sendAllWaves} disabled={sendingAll}>
              <Send size={14} />
              {sendingAll ? 'Sending all…' : `Send all ${waves.filter((w) => !w.sent).length} waves`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WavePlanner;
