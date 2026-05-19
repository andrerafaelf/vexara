// Cinematic battle replay. Wraps BattlefieldCanvas with a transport bar,
// playback speed selector, share controls, and a final outcome panel.
//
// Deterministic: the (seed, initial forces, losses) tuple stored on the
// Attack reproduces the exact same animation every time, on any device.

'use client';

import { Copy, Maximize2, Pause, Play, RotateCcw, Share2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/BattleReplay.css';
import type { Attack } from '../types/game';
import { simulateBattle, type Force, type SimResult, type TroopKey } from '../utils/combatSim';
import BattlefieldCanvas, { type BattlefieldHandle } from './BattlefieldCanvas';
import ResourceIcon from './ResourceIcon';

interface BattleReplayProps {
  /** Existing in-game flow path: derived from a full Attack object. */
  report?: Attack;
  /** Public flow path: pre-built simulation result (from /api/replay endpoint). */
  sim?: SimResult;
  /** Used in both flows; in public flow these come from the API payload. */
  attackerLabel?: string;
  defenderLabel?: string;
  /** Optional resources stolen breakdown for the outcome panel. */
  resourcesStolen?: { biomass: number; alloy: number; ore: number };
  /** Public shareable URL for this replay. If set, the share button appears. */
  shareUrl?: string;
  /** Hide the share button (e.g. embed view). */
  hideShare?: boolean;
  /** Internal in-game flow: called when playback finishes once. */
  onComplete?: () => void;
  /** Auto-play on mount (defaults to true). */
  autoPlay?: boolean;
  /** Compatibility: existing callers pass this; unused in the new renderer. */
  isMyAttack?: boolean;
}

function buildSimFromReport(report: Attack): SimResult | null {
  if (report.type === 'scout' || report.result?.mission === 'scout') return null;
  if (!report.result) return null;

  const seedRaw = (report.result as unknown as { combatSeed?: number }).combatSeed;
  // Fall back to deriving from the attack id if seed missing on older reports.
  const seed = typeof seedRaw === 'number'
    ? seedRaw
    : ((parseInt(report._id, 10) || 1) * 2654435761) >>> 0;

  // Newer reports store the engagement-time defender composition. For
  // legacy reports we degrade gracefully to defender losses (better than
  // nothing — replay will show the destroyed force only).
  const stored = report.result as unknown as {
    attackerInitial?: Force;
    defenderInitial?: Force;
  };

  const attackerInitial: Force = {};
  if (stored.attackerInitial) {
    for (const [k, v] of Object.entries(stored.attackerInitial)) {
      if ((v as number) > 0) attackerInitial[k as TroopKey] = v as number;
    }
  } else {
    for (const [k, v] of Object.entries(report.troops)) {
      if ((v as number) > 0) attackerInitial[k as TroopKey] = v as number;
    }
  }

  const defenderInitial: Force = {};
  if (stored.defenderInitial && Object.keys(stored.defenderInitial).length > 0) {
    for (const [k, v] of Object.entries(stored.defenderInitial)) {
      if ((v as number) > 0) defenderInitial[k as TroopKey] = v as number;
    }
  } else {
    // Legacy fallback: reconstruct from losses only
    for (const [k, v] of Object.entries(report.result.defenderLosses ?? {})) {
      if ((v as number) > 0) defenderInitial[k as TroopKey] = v as number;
    }
  }

  const attackerLosses: Force = {};
  for (const [k, v] of Object.entries(report.result.attackerLosses ?? {})) {
    if ((v as number) > 0) attackerLosses[k as TroopKey] = v as number;
  }
  if (report.result.conquered && (report.troops.overseer ?? 0) > 0 && !attackerLosses.overseer) {
    attackerLosses.overseer = report.troops.overseer;
  }

  const defenderLosses: Force = {};
  for (const [k, v] of Object.entries(report.result.defenderLosses ?? {})) {
    if ((v as number) > 0) defenderLosses[k as TroopKey] = v as number;
  }

  return simulateBattle({
    attackerInitial,
    defenderInitial,
    attackerLosses,
    defenderLosses,
    seed,
    victory: !!report.result.victory,
    conquered: !!report.result.conquered,
  });
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

const BattleReplay: React.FC<BattleReplayProps> = ({
  report,
  sim: providedSim,
  attackerLabel: labelOverrideA,
  defenderLabel: labelOverrideD,
  resourcesStolen: resourcesOverride,
  shareUrl,
  hideShare,
  onComplete,
  autoPlay = true,
}) => {
  const sim = useMemo<SimResult | null>(() => {
    if (providedSim) return providedSim;
    if (report) return buildSimFromReport(report);
    return null;
  }, [report, providedSim]);

  const attackerLabel = labelOverrideA ?? report?.attacker.user?.username ?? 'Attacker';
  const defenderLabel = labelOverrideD ?? report?.defender.user?.username ?? 'Defender';
  const resourcesStolen = resourcesOverride ?? report?.result?.resourcesStolen ?? { biomass: 0, alloy: 0, ore: 0 };

  const canvasRef = useRef<BattlefieldHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [playhead, setPlayhead] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // Auto-play on mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (autoPlay) {
        canvasRef.current?.play();
        setIsPlaying(true);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [autoPlay, sim]);

  const handleProgress = useCallback((p: number) => {
    setPlayhead(p);
  }, []);

  const handleCanvasComplete = useCallback(() => {
    setIsPlaying(false);
    onComplete?.();
  }, [onComplete]);

  const togglePlay = useCallback(() => {
    if (!canvasRef.current) return;
    if (playhead >= 0.999) {
      canvasRef.current.seek(0);
      canvasRef.current.play();
      setIsPlaying(true);
    } else {
      canvasRef.current.togglePlay();
      setIsPlaying(canvasRef.current.isPlaying());
    }
  }, [playhead]);

  const restart = useCallback(() => {
    canvasRef.current?.seek(0);
    canvasRef.current?.play();
    setIsPlaying(true);
  }, []);

  const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const ph = Number(e.target.value) / 1000;
    canvasRef.current?.pause();
    canvasRef.current?.seek(ph);
    setIsPlaying(false);
    setPlayhead(ph);
  }, []);

  const onSpeedChange = useCallback((s: number) => {
    setSpeed(s);
    canvasRef.current?.setSpeed(s);
  }, []);

  const enterFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }, []);

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMsg('Link copied');
      setTimeout(() => setShareMsg(null), 1800);
    } catch {
      setShareMsg('Copy failed');
      setTimeout(() => setShareMsg(null), 1800);
    }
  }, [shareUrl]);

  const shareToTwitter = useCallback(() => {
    if (!shareUrl) return;
    const outcome = sim?.conquered ? 'I just conquered a Nexus' : sim?.victory ? 'Victory at the Nexus' : 'Defended the Nexus';
    const text = `${outcome} on Vexara — watch the replay:`;
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(u, '_blank', 'noopener');
  }, [shareUrl, sim]);

  if (!sim) return null;

  const totalSeconds = 22 + 4; // must match BattlefieldCanvas
  const elapsedSec = Math.min(totalSeconds, playhead * totalSeconds);

  const totalResourcesStolen =
    resourcesStolen.biomass + resourcesStolen.alloy + resourcesStolen.ore;

  return (
    <div ref={containerRef} className="replay-cine-root">
      <div className="replay-cine-stage">
        <BattlefieldCanvas
          ref={canvasRef}
          sim={sim}
          attackerLabel={attackerLabel}
          defenderLabel={defenderLabel}
          onProgress={handleProgress}
          onComplete={handleCanvasComplete}
        />
      </div>

      {/* Transport bar */}
      <div className="replay-cine-transport">
        <button
          type="button"
          className="replay-cine-btn replay-cine-btn--primary"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button
          type="button"
          className="replay-cine-btn"
          onClick={restart}
          aria-label="Restart"
          title="Restart"
        >
          <RotateCcw size={14} />
        </button>

        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(playhead * 1000)}
          onChange={onScrub}
          className="replay-cine-scrub"
          aria-label="Scrub timeline"
        />

        <span className="replay-cine-time">
          {elapsedSec.toFixed(1)}s / {totalSeconds}s
        </span>

        <div className="replay-cine-speeds">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={`replay-cine-speed ${speed === s ? 'replay-cine-speed--active' : ''}`}
              aria-label={`Playback speed ${s}x`}
            >
              {s}×
            </button>
          ))}
        </div>

        {!hideShare && shareUrl && (
          <div className="replay-cine-share">
            <button
              type="button"
              className="replay-cine-btn"
              onClick={() => setShareOpen((v) => !v)}
              aria-label="Share replay"
              title="Share replay"
            >
              <Share2 size={14} />
            </button>
            {shareOpen && (
              <div className="replay-cine-share-pop" role="dialog">
                <div className="replay-cine-share-row">
                  <input
                    className="replay-cine-share-input"
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button type="button" className="replay-cine-btn" onClick={copyShareLink} title="Copy link">
                    <Copy size={14} />
                  </button>
                </div>
                <button type="button" className="replay-cine-share-twitter" onClick={shareToTwitter}>
                  Share on X / Twitter
                </button>
                {shareMsg && <div className="replay-cine-share-msg">{shareMsg}</div>}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="replay-cine-btn"
          onClick={enterFullscreen}
          aria-label="Fullscreen"
          title="Fullscreen"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Outcome strip — only when finished */}
      {playhead >= 0.999 && (
        <div
          className={`replay-cine-outcome ${
            sim.conquered ? 'replay-cine-outcome--conquest'
            : sim.victory ? 'replay-cine-outcome--victory'
            : 'replay-cine-outcome--defeat'
          }`}
        >
          <span className="replay-cine-outcome-text">
            {sim.conquered ? 'Nexus conquered. Control transferred.'
              : sim.victory ? 'Attacker wins the engagement.'
              : 'Defense holds. Raid repelled.'}
          </span>
          {totalResourcesStolen > 0 && (
            <span className="replay-cine-outcome-loot">
              <ResourceIcon kind="biomass" size={13} /> {resourcesStolen.biomass}
              <ResourceIcon kind="alloy" size={13} /> {resourcesStolen.alloy}
              <ResourceIcon kind="ore" size={13} /> {resourcesStolen.ore}
              <span className="replay-cine-outcome-loot-label">plundered</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default BattleReplay;
