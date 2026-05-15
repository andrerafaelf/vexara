import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, Square } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/BattleReplay.css';
import type { Attack } from '../types/game';
import { deriveReplay, type CombatReplay, type CombatRound } from '../utils/combatReplay';
import ResourceIcon from './ResourceIcon';

interface BattleReplayProps {
  report: Attack;
  isMyAttack: boolean;
}

const TROOP_NAMES: Record<string, string> = {
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

const TROOP_SHORT: Record<string, string> = {
  lancerDrone: 'Lancer',
  assaultTrooper: 'Assault',
  breakerUnit: 'Breaker',
  reconOperative: 'Recon',
  skimmerBike: 'Skimmer',
  siegeMech: 'Siege Mech',
  bulwarkGuard: 'Bulwark',
  suppressorTeam: 'Suppressor',
  disruptorUnit: 'Disruptor',
  interceptorBike: 'Interceptor',
  annihilatorPlatform: 'Annihilator',
  overseer: 'Overseer',
};

function PowerBar({ current, max, side }: { current: number; max: number; side: 'attacker' | 'defender' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="replay-power-bar-track">
      <div
        className={`replay-power-bar-fill replay-power-bar-fill--${side}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TroopRow({
  type,
  initial,
  current,
  lostThisRound,
  side,
}: {
  type: string;
  initial: number;
  current: number;
  lostThisRound: number;
  side: 'attacker' | 'defender';
}) {
  const pct = initial > 0 ? Math.max(0, (current / initial) * 100) : 0;
  const isDepleted = current <= 0;

  return (
    <div className={`replay-troop-row ${isDepleted ? 'replay-troop-row--depleted' : ''}`}>
      <span className="replay-troop-name">{TROOP_SHORT[type] ?? type}</span>
      <div className="replay-troop-bar-wrap">
        <div
          className={`replay-troop-bar-fill replay-troop-bar-fill--${side}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`replay-troop-count ${lostThisRound > 0 ? 'replay-troop-count--losing' : ''}`}>
        {current}
        {lostThisRound > 0 && <span className="replay-troop-loss">-{lostThisRound}</span>}
      </span>
    </div>
  );
}

function RoundLog({ rounds, currentRound }: { rounds: CombatRound[]; currentRound: number }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('.replay-log-entry--active');
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentRound]);

  return (
    <div className="replay-log" ref={listRef}>
      {rounds.map((r) => {
        const aTotal = Object.values(r.attackerLostThisRound).reduce((s, n) => s + n, 0);
        const dTotal = Object.values(r.defenderLostThisRound).reduce((s, n) => s + n, 0);
        const isCurrent = r.round === currentRound + 1;
        const isPast = r.round <= currentRound;

        return (
          <div
            key={r.round}
            className={`replay-log-entry ${isCurrent ? 'replay-log-entry--active' : ''} ${isPast && !isCurrent ? 'replay-log-entry--past' : ''}`}
          >
            <span className="replay-log-round">R{r.round}</span>
            <span className="replay-log-losses replay-log-losses--attacker">-{aTotal} atk</span>
            <span className="replay-log-losses replay-log-losses--defender">-{dTotal} def</span>
            {r.event && <span className="replay-log-event">{r.event}</span>}
          </div>
        );
      })}
    </div>
  );
}

const BattleReplay: React.FC<BattleReplayProps> = ({ report, isMyAttack }) => {
  const replay = React.useMemo<CombatReplay | null>(() => deriveReplay(report), [report]);

  const [currentRound, setCurrentRound] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxPower = React.useMemo(() => {
    if (!replay) return 1;
    return Math.max(
      ...replay.rounds.map((r) => r.attackPower),
      ...replay.rounds.map((r) => r.defensePower),
      1,
    );
  }, [replay]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (!replay) return;
    if (currentRound >= replay.totalRounds - 1) {
      setCurrentRound(0);
    }
    setIsPlaying(true);
  }, [replay, currentRound]);

  useEffect(() => {
    if (!replay) return;
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentRound((prev) => {
          if (prev >= replay.totalRounds - 1) {
            stop();
            return prev;
          }
          return prev + 1;
        });
      }, 900);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, replay, stop]);

  // Reset on report change
  useEffect(() => {
    stop();
    setCurrentRound(0);
  }, [report._id, stop]);

  if (!replay) return null;

  const round = replay.rounds[currentRound];
  const attackerLabel = report.attacker.user?.username ?? 'Attacker';
  const defenderLabel = report.defender.user?.username ?? 'Defender';
  const allTroopTypes = Array.from(
    new Set([...Object.keys(replay.attackerInitial), ...Object.keys(replay.defenderInitial)]),
  );

  const totalResourcesStolen =
    replay.resourcesStolen.biomass + replay.resourcesStolen.alloy + replay.resourcesStolen.ore;

  return (
    <div className="replay-root">
      <div className="replay-header">
        <span className="replay-title">Battle Replay</span>
        <span className="replay-subtitle">
          Round {currentRound + 1} of {replay.totalRounds}
        </span>
      </div>

      {/* Power meters */}
      <div className="replay-power-section">
        <div className="replay-power-side replay-power-side--attacker">
          <span className="replay-power-label">{attackerLabel}</span>
          <PowerBar current={round.attackPower} max={maxPower} side="attacker" />
          <span className="replay-power-value">{Math.round(round.attackPower).toLocaleString()}</span>
        </div>
        <div className="replay-power-vs">VS</div>
        <div className="replay-power-side replay-power-side--defender">
          <span className="replay-power-label">{defenderLabel}</span>
          <PowerBar current={round.defensePower} max={maxPower} side="defender" />
          <span className="replay-power-value">{Math.round(round.defensePower).toLocaleString()}</span>
        </div>
      </div>

      {/* Event banner */}
      <div className={`replay-event-banner ${round.event ? 'replay-event-banner--visible' : ''} ${round.event === 'NEXUS CONQUERED' ? 'replay-event-banner--conquest' : ''}`}>
        {round.event ?? ' '}
      </div>

      {/* Troop grids */}
      <div className="replay-forces">
        <div className="replay-force-col replay-force-col--attacker">
          <div className="replay-force-heading">
            <span className="replay-force-name">{attackerLabel}</span>
            <span className="replay-force-role">Attacker</span>
          </div>
          <div className="replay-troop-list">
            {Object.keys(replay.attackerInitial).map((type) => (
              <TroopRow
                key={type}
                type={type}
                initial={replay.attackerInitial[type]}
                current={round.attackerForce[type] ?? 0}
                lostThisRound={round.attackerLostThisRound[type] ?? 0}
                side="attacker"
              />
            ))}
            {Object.keys(replay.attackerInitial).length === 0 && (
              <span className="replay-force-empty">No data</span>
            )}
          </div>
        </div>

        <div className="replay-force-col replay-force-col--defender">
          <div className="replay-force-heading">
            <span className="replay-force-name">{defenderLabel}</span>
            <span className="replay-force-role">Defender</span>
          </div>
          <div className="replay-troop-list">
            {Object.keys(replay.defenderInitial).map((type) => (
              <TroopRow
                key={type}
                type={type}
                initial={replay.defenderInitial[type]}
                current={round.defenderForce[type] ?? 0}
                lostThisRound={round.defenderLostThisRound[type] ?? 0}
                side="defender"
              />
            ))}
            {Object.keys(replay.defenderInitial).length === 0 && (
              <span className="replay-force-empty">No enemy losses recorded</span>
            )}
          </div>
        </div>
      </div>

      {/* Round log */}
      <RoundLog rounds={replay.rounds} currentRound={currentRound} />

      {/* Controls */}
      <div className="replay-controls">
        <button
          className="replay-btn"
          onClick={() => { stop(); setCurrentRound(0); }}
          disabled={currentRound === 0 && !isPlaying}
          title="First round"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          className="replay-btn"
          onClick={() => { stop(); setCurrentRound((p) => Math.max(0, p - 1)); }}
          disabled={currentRound === 0 && !isPlaying}
          title="Previous round"
        >
          <ChevronLeft size={16} />
        </button>

        {isPlaying ? (
          <button className="replay-btn replay-btn--primary" onClick={stop} title="Stop">
            <Square size={16} />
          </button>
        ) : (
          <button
            className="replay-btn replay-btn--primary"
            onClick={play}
            disabled={currentRound >= replay.totalRounds - 1}
            title="Play"
          >
            <Play size={16} />
          </button>
        )}

        <button
          className="replay-btn"
          onClick={() => { stop(); setCurrentRound((p) => Math.min(replay.totalRounds - 1, p + 1)); }}
          disabled={currentRound >= replay.totalRounds - 1}
          title="Next round"
        >
          <ChevronRight size={16} />
        </button>
        <button
          className="replay-btn"
          onClick={() => { stop(); setCurrentRound(replay.totalRounds - 1); }}
          disabled={currentRound >= replay.totalRounds - 1}
          title="Last round"
        >
          <ChevronsRight size={16} />
        </button>
      </div>

      {/* Final outcome strip (only visible on last round) */}
      {currentRound === replay.totalRounds - 1 && (
        <div className={`replay-outcome ${replay.victory ? 'replay-outcome--victory' : 'replay-outcome--defeat'}`}>
          {replay.conquered ? (
            <span>Nexus conquered — control transferred</span>
          ) : replay.victory ? (
            <span>Attacker wins the engagement</span>
          ) : (
            <span>Defense holds — raid repelled</span>
          )}
          {totalResourcesStolen > 0 && (
            <div className="replay-outcome-loot">
              <ResourceIcon kind="biomass" size={13} /> {replay.resourcesStolen.biomass}
              <ResourceIcon kind="alloy" size={13} /> {replay.resourcesStolen.alloy}
              <ResourceIcon kind="ore" size={13} /> {replay.resourcesStolen.ore}
              <span className="replay-outcome-loot-label">plundered</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BattleReplay;
