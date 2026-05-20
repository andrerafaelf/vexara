// Cinematic, deterministic Canvas2D renderer for the battle replay.
//
// Architecture:
//   - All visual state is derived from `SimResult` + `playhead` (0..1).
//   - The simulator output is treated as the ground truth; we never "make up"
//     casualties, we just animate the transition between rounds.
//   - Units are rendered as small chevron sprites with a faction-tinted glow.
//   - Round transitions produce particle bursts, screen shake, floating damage
//     numbers and a kill-feed entry, all keyed off the deterministic seed so
//     identical replays look identical.
//
// Performance: single canvas, requestAnimationFrame, ~200 particles max,
// device-pixel-ratio aware. Stays at 60fps comfortably on a phone.

'use client';

import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import {
  CLASS_COUNTERS,
  TROOP_CLASS,
  TROOP_KEYS,
  TROOP_STATS,
  mulberry32,
  type CombatHit,
  type Force,
  type SimResult,
  type TroopKey,
} from '../utils/combatSim';

// ─── Tunables ────────────────────────────────────────────────────────────
const TARGET_DURATION_S = 22; // total replay length (excluding fixed 4s outro)
const OUTRO_DURATION_S = 4;
const MAX_UNIT_DOTS_PER_SIDE = 220;  // cap dot count for performance on huge battles
const PARTICLE_BUDGET = 240;
const TROOP_COLORS: Record<TroopKey, string> = {
  // Light, cyan
  breakerUnit: '#74E0FF', skimmerBike: '#46B5E8', interceptorBike: '#2A8FCC', voidStalker: '#A0F2FF',
  // Heavy, orange/amber
  assaultTrooper: '#FFB05A', bulwarkGuard: '#E67D2F', siegeMech: '#C25A12',
  // Ranged, magenta/violet
  lancerDrone: '#D484F0', suppressorTeam: '#B85CDD', disruptorUnit: '#9038C0',
  annihilatorPlatform: '#7022A8', plasmaTurret: '#5915A0',
  // Special, pale gold
  reconOperative: '#E8E4A8', overseer: '#FFD700',
};

const TROOP_GLYPHS: Record<TroopKey, string> = {
  lancerDrone: '◇', assaultTrooper: '▲', breakerUnit: '◆', reconOperative: '◉',
  skimmerBike: '◀', bulwarkGuard: '■', suppressorTeam: '▽', disruptorUnit: '◐',
  interceptorBike: '◣', siegeMech: '⬢', annihilatorPlatform: '⬣',
  voidStalker: '✦', plasmaTurret: '◯', overseer: '★',
};

const TROOP_NAMES_SHORT: Record<TroopKey, string> = {
  lancerDrone: 'Lancer', assaultTrooper: 'Assault', breakerUnit: 'Breaker',
  reconOperative: 'Recon', skimmerBike: 'Skimmer', bulwarkGuard: 'Bulwark',
  suppressorTeam: 'Suppressor', disruptorUnit: 'Disruptor', interceptorBike: 'Interceptor',
  siegeMech: 'Siege', annihilatorPlatform: 'Annihilator',
  voidStalker: 'Void Stalker', plasmaTurret: 'Plasma', overseer: 'Overseer',
};

// ─── Public props & ref API ──────────────────────────────────────────────
export interface BattlefieldCanvasProps {
  sim: SimResult;
  attackerLabel: string;
  defenderLabel: string;
  onProgress?: (playhead: number) => void;
  onComplete?: () => void;
  className?: string;
}

export interface BattlefieldHandle {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (playhead: number) => void;       // 0..1
  setSpeed: (speed: number) => void;      // 0.5, 1, 2, 4
  isPlaying: () => boolean;
}

// ─── Internal: derived unit dots ─────────────────────────────────────────
interface UnitDot {
  side: 'attacker' | 'defender';
  type: TroopKey;
  // Represents `weight` real troops. Larger battles compress into fewer dots
  // so the playfield doesn't become unreadable.
  weight: number;
  // Anchor formation slot (grid position in [0..1] x [0..1] within team rect)
  slotX: number;
  slotY: number;
  // PRNG-derived offsets so dots wobble independently
  jitterX: number;
  jitterY: number;
  // Birth time within the replay (0..1), used for staggered death anims
  deathAt: number | null;     // playhead at which this dot is destroyed
}

interface BattleScript {
  dots: UnitDot[];
  // Per-round metadata for triggering FX
  roundEvents: Array<{
    round: number;
    startPlayhead: number;
    endPlayhead: number;
    hits: CombatHit[];
    event: string | null;
    phase: 'engage' | 'clash' | 'rout' | 'final';
    attackerLost: Force;
    defenderLost: Force;
  }>;
}

function totalUnits(f: Force) {
  let t = 0;
  for (const k of TROOP_KEYS) t += f[k] || 0;
  return t;
}

// Build a "battle script": list of dots with deterministic positions and the
// playhead at which each dot dies. We assign deaths by iterating the rounds
// and selecting losers stably (same seed → same dot dies).
function buildBattleScript(sim: SimResult): BattleScript {
  const rand = mulberry32(sim.seed ^ 0x9e3779b9);
  const dots: UnitDot[] = [];

  const buildSide = (side: 'attacker' | 'defender', initial: Force) => {
    const totalReal = totalUnits(initial);
    if (totalReal === 0) return;
    const dotCount = Math.min(MAX_UNIT_DOTS_PER_SIDE, Math.max(1, totalReal));
    const weight = totalReal / dotCount;

    // Build pool of (type, count) and emit dots proportionally
    const types: TroopKey[] = [];
    const counts: number[] = [];
    for (const k of TROOP_KEYS) {
      const n = initial[k] || 0;
      if (n > 0) { types.push(k); counts.push(n); }
    }
    // Heavy troops get larger dots, render-time concern, not assignment.
    // Distribute dotCount across types proportionally to count.
    let assigned = 0;
    const perType = counts.map((c) => Math.floor((c / totalReal) * dotCount));
    const remainder = dotCount - perType.reduce((a, b) => a + b, 0);
    // Distribute remainder to highest-count types
    const order = perType.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
    for (let i = 0; i < remainder; i++) perType[order[i % order.length]]++;

    // Place dots in a hex-ish grid filling the team's half
    const grid = Math.ceil(Math.sqrt(dotCount * 1.4));
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      for (let n = 0; n < perType[i]; n++) {
        const idx = assigned++;
        const gx = idx % grid;
        const gy = Math.floor(idx / grid);
        const slotX = (gx + 0.5) / grid;
        const slotY = (gy + 0.5) / Math.ceil(dotCount / grid);
        dots.push({
          side, type, weight,
          slotX, slotY,
          jitterX: (rand() - 0.5) * 0.6,
          jitterY: (rand() - 0.5) * 0.6,
          deathAt: null,
        });
      }
    }
  };

  buildSide('attacker', sim.attackerInitial);
  buildSide('defender', sim.defenderInitial);

  // Assign deaths per round, per type. Within each (side, type) group, we
  // pick dots in deterministic order weighted by jitter (so deaths look
  // scattered, not sequential by index).
  const totalReplay = TARGET_DURATION_S / (TARGET_DURATION_S + OUTRO_DURATION_S);

  const roundEvents: BattleScript['roundEvents'] = [];

  const cumulativeKilled: Record<'attacker' | 'defender', Record<TroopKey, number>> = {
    attacker: {} as Record<TroopKey, number>,
    defender: {} as Record<TroopKey, number>,
  };
  for (const k of TROOP_KEYS) {
    cumulativeKilled.attacker[k] = 0;
    cumulativeKilled.defender[k] = 0;
  }

  for (let r = 0; r < sim.rounds.length; r++) {
    const round = sim.rounds[r];
    const startPh = (r / sim.rounds.length) * totalReplay;
    const endPh = ((r + 1) / sim.rounds.length) * totalReplay;

    for (const side of ['attacker', 'defender'] as const) {
      const losses = side === 'attacker' ? round.attackerLost : round.defenderLost;
      for (const [type, lostCount] of Object.entries(losses) as [TroopKey, number][]) {
        if (!lostCount || lostCount <= 0) continue;
        const initialCount = (side === 'attacker' ? sim.attackerInitial[type] : sim.defenderInitial[type]) || 0;
        if (initialCount <= 0) continue;
        const alreadyKilled = cumulativeKilled[side][type];
        const totalKilledAfter = alreadyKilled + lostCount;
        // Real-units → dot count mapping
        const liveDots = dots.filter((d) => d.side === side && d.type === type && d.deathAt === null);
        if (liveDots.length === 0) continue;
        const dotWeight = liveDots[0].weight;
        // Compute how many *dots* should be dead by end of this round
        const dotsDeadAfter = Math.min(liveDots.length + alreadyKilled / dotWeight, totalKilledAfter / dotWeight);
        const dotsToKillThisRound = Math.max(0, Math.floor(dotsDeadAfter - alreadyKilled / dotWeight));

        // Pick which dots die, deterministically. Sort by a stable jitter key.
        const sorted = liveDots.slice().sort((a, b) => a.jitterX - b.jitterX || a.jitterY - b.jitterY);
        const toKill = sorted.slice(0, dotsToKillThisRound);
        for (let i = 0; i < toKill.length; i++) {
          const dot = toKill[i];
          // Stagger deaths across the round duration
          const t = i / Math.max(1, toKill.length - 1);
          dot.deathAt = startPh + (endPh - startPh) * (0.15 + 0.75 * t);
        }
        cumulativeKilled[side][type] = totalKilledAfter;
      }
    }

    roundEvents.push({
      round: round.round,
      startPlayhead: startPh,
      endPlayhead: endPh,
      hits: round.hits,
      event: round.event,
      phase: round.phase,
      attackerLost: round.attackerLost,
      defenderLost: round.defenderLost,
    });
  }

  return { dots, roundEvents };
}

// ─── Particles (fire/spark bursts at hits) ───────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; ttl: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'flash';
}

// Floating damage numbers
interface DamageText {
  x: number; y: number;
  text: string;
  life: number; ttl: number;
  color: string;
  large: boolean;
}

// ─── Renderer ────────────────────────────────────────────────────────────
const BattlefieldCanvas = React.forwardRef<BattlefieldHandle, BattlefieldCanvasProps>(
  function BattlefieldCanvas({ sim, attackerLabel, defenderLabel, onProgress, onComplete, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const scriptRef = useRef<BattleScript>(buildBattleScript(sim));
    const playingRef = useRef<boolean>(false);
    const playheadRef = useRef<number>(0);             // 0..1
    const speedRef = useRef<number>(1);
    const lastTsRef = useRef<number | null>(null);
    const particlesRef = useRef<Particle[]>([]);
    const damageTextsRef = useRef<DamageText[]>([]);
    const lastTriggeredRoundRef = useRef<number>(-1);
    const shakeRef = useRef<number>(0);
    const bannerRef = useRef<{ text: string; life: number; ttl: number; critical?: boolean } | null>(null);
    const killFeedRef = useRef<Array<{ text: string; ttl: number; life: number; critical: boolean }>>([]);

    // Rebuild script when sim changes
    useEffect(() => {
      scriptRef.current = buildBattleScript(sim);
      playheadRef.current = 0;
      particlesRef.current = [];
      damageTextsRef.current = [];
      lastTriggeredRoundRef.current = -1;
      shakeRef.current = 0;
      bannerRef.current = null;
      killFeedRef.current = [];
    }, [sim]);

    // ─── Imperative API ───────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      play: () => { playingRef.current = true; lastTsRef.current = null; },
      pause: () => { playingRef.current = false; },
      togglePlay: () => { playingRef.current = !playingRef.current; lastTsRef.current = null; },
      seek: (ph) => {
        playheadRef.current = Math.max(0, Math.min(1, ph));
        // Reset triggered round so we don't re-fire FX when scrubbing forward
        lastTriggeredRoundRef.current = -1;
        particlesRef.current = [];
        damageTextsRef.current = [];
        killFeedRef.current = [];
        bannerRef.current = null;
      },
      setSpeed: (s) => { speedRef.current = s; },
      isPlaying: () => playingRef.current,
    }), []);

    // ─── Trigger FX when crossing a round boundary ────────────────────────
    const triggerRound = useCallback((roundIdx: number, w: number, h: number) => {
      const script = scriptRef.current;
      const evt = script.roundEvents[roundIdx];
      if (!evt) return;

      // Camera shake
      shakeRef.current = evt.phase === 'final' && sim.conquered ? 18 : evt.phase === 'rout' ? 10 : 5;

      // Event banner
      if (evt.event) {
        const critical = evt.event === 'NEXUS CONQUERED';
        bannerRef.current = { text: evt.event, life: 0, ttl: critical ? 2.2 : 1.4, critical };
      }

      const seedRand = mulberry32((sim.seed ^ (roundIdx + 1) * 2654435761) >>> 0);

      // Spawn particle bursts and damage numbers per hit
      for (const hit of evt.hits) {
        // Position particles in the appropriate half of the field
        const targetSide = hit.side === 'attacker' ? 'defender' : 'attacker';
        const x = (targetSide === 'attacker' ? 0.15 : 0.65) * w + seedRand() * w * 0.2;
        const y = 0.3 * h + seedRand() * h * 0.4;

        // Spark burst
        const sparkCount = hit.critical ? 18 : 10;
        for (let s = 0; s < sparkCount; s++) {
          const ang = seedRand() * Math.PI * 2;
          const speed = 60 + seedRand() * 180;
          particlesRef.current.push({
            x, y,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            life: 0, ttl: 0.4 + seedRand() * 0.5,
            size: 1.5 + seedRand() * 2,
            color: hit.critical ? '#FFD27D' : TROOP_COLORS[hit.unit],
            kind: 'spark',
          });
        }
        // Flash
        particlesRef.current.push({
          x, y, vx: 0, vy: 0, life: 0, ttl: 0.2,
          size: hit.critical ? 26 : 16,
          color: hit.critical ? '#FFE3A0' : '#FFFFFF',
          kind: 'flash',
        });
        // Smoke
        for (let s = 0; s < 4; s++) {
          particlesRef.current.push({
            x: x + (seedRand() - 0.5) * 12,
            y: y + (seedRand() - 0.5) * 12,
            vx: (seedRand() - 0.5) * 20, vy: -30 - seedRand() * 30,
            life: 0, ttl: 1.4 + seedRand() * 0.8,
            size: 6 + seedRand() * 6,
            color: 'rgba(60,60,70,0.5)',
            kind: 'smoke',
          });
        }

        // Floating damage number
        damageTextsRef.current.push({
          x, y: y - 6,
          text: `-${hit.count}`,
          life: 0, ttl: hit.critical ? 1.6 : 1.0,
          color: hit.critical ? '#FFD27D' : '#FF6F66',
          large: hit.critical,
        });

        // Kill feed entry
        killFeedRef.current.push({
          text: `${TROOP_NAMES_SHORT[hit.unit]} ${hit.critical ? '✦' : '→'} ${TROOP_NAMES_SHORT[hit.target]}  ×${hit.count}`,
          life: 0, ttl: 5,
          critical: hit.critical,
        });
        if (killFeedRef.current.length > 6) killFeedRef.current.shift();
      }

      // Cap particles
      if (particlesRef.current.length > PARTICLE_BUDGET) {
        particlesRef.current.splice(0, particlesRef.current.length - PARTICLE_BUDGET);
      }
    }, [sim]);

    // ─── Main loop ────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      let raf = 0;
      let cancelled = false;

      const resize = () => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      const totalSeconds = TARGET_DURATION_S + OUTRO_DURATION_S;

      const frame = (ts: number) => {
        if (cancelled) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        const lastTs = lastTsRef.current;
        const dt = lastTs == null ? 0 : Math.min(0.05, (ts - lastTs) / 1000);
        lastTsRef.current = ts;

        if (playingRef.current) {
          playheadRef.current = Math.min(1, playheadRef.current + (dt * speedRef.current) / totalSeconds);
          onProgress?.(playheadRef.current);
          if (playheadRef.current >= 1) {
            playingRef.current = false;
            onComplete?.();
          }
        }

        // Determine current round (only while in the active phase, not outro)
        const script = scriptRef.current;
        const activePh = Math.min(playheadRef.current, TARGET_DURATION_S / totalSeconds);
        let activeRound = -1;
        for (let r = 0; r < script.roundEvents.length; r++) {
          const evt = script.roundEvents[r];
          if (activePh >= evt.startPlayhead && activePh < evt.endPlayhead) { activeRound = r; break; }
        }
        if (activeRound === -1 && activePh >= (script.roundEvents[script.roundEvents.length - 1]?.endPlayhead ?? 1)) {
          activeRound = script.roundEvents.length - 1;
        }

        if (activeRound !== lastTriggeredRoundRef.current && activeRound > lastTriggeredRoundRef.current) {
          // Fire FX once per round forward-progress
          for (let r = lastTriggeredRoundRef.current + 1; r <= activeRound; r++) {
            triggerRound(r, w, h);
          }
          lastTriggeredRoundRef.current = activeRound;
        }

        // Update FX
        shakeRef.current = Math.max(0, shakeRef.current - dt * 30);

        // Particles
        const ps = particlesRef.current;
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          p.life += dt;
          if (p.life >= p.ttl) { ps.splice(i, 1); continue; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.kind === 'spark') { p.vy += 220 * dt; p.vx *= 0.96; }
          if (p.kind === 'smoke') { p.vy -= 18 * dt; p.size += 12 * dt; }
        }

        // Damage texts
        const dts = damageTextsRef.current;
        for (let i = dts.length - 1; i >= 0; i--) {
          const t = dts[i];
          t.life += dt;
          t.y -= dt * 22;
          if (t.life >= t.ttl) dts.splice(i, 1);
        }

        // Kill feed
        for (let i = killFeedRef.current.length - 1; i >= 0; i--) {
          killFeedRef.current[i].life += dt;
          if (killFeedRef.current[i].life >= killFeedRef.current[i].ttl) killFeedRef.current.splice(i, 1);
        }

        // Banner
        if (bannerRef.current) {
          bannerRef.current.life += dt;
          if (bannerRef.current.life >= bannerRef.current.ttl) bannerRef.current = null;
        }

        // ─── DRAW ───────────────────────────────────────────────────
        ctx.save();

        // Camera shake
        if (shakeRef.current > 0.05) {
          const rs = mulberry32(Math.floor(ts) ^ 0xabcd);
          ctx.translate((rs() - 0.5) * shakeRef.current, (rs() - 0.5) * shakeRef.current);
        }

        // Background gradient
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0A0F18');
        bg.addColorStop(0.6, '#0D1320');
        bg.addColorStop(1, '#08090C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Subtle hex grid (cheap pattern, drawn line by line)
        ctx.strokeStyle = 'rgba(74, 158, 176, 0.06)';
        ctx.lineWidth = 1;
        const gridSize = 28;
        for (let x = (-((Date.now() / 60) % gridSize)); x < w; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Centerline (engagement front)
        const centerX = w / 2;
        ctx.strokeStyle = 'rgba(255, 158, 61, 0.18)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(centerX, 30); ctx.lineTo(centerX, h - 30); ctx.stroke();
        ctx.setLineDash([]);

        // ─── Unit dots ───────────────────────────────────────────────
        const ph = playheadRef.current;
        const teamArea = (side: 'attacker' | 'defender') => {
          const padTop = 70, padBottom = 100;
          const padX = 36;
          const x = side === 'attacker' ? padX : centerX + 18;
          const y = padTop;
          const wRect = centerX - padX - 18;
          const hRect = h - padTop - padBottom;
          return { x, y, w: wRect, h: hRect };
        };

        const aRect = teamArea('attacker');
        const dRect = teamArea('defender');

        const marchPct = Math.min(0.4, ph * 0.9);

        const drawDot = (dot: UnitDot) => {
          if (dot.deathAt !== null && ph > dot.deathAt + 0.04) return;

          const rect = dot.side === 'attacker' ? aRect : dRect;
          const baseX = rect.x + (dot.slotX + dot.jitterX * 0.05) * rect.w;
          const baseY = rect.y + (dot.slotY + dot.jitterY * 0.05) * rect.h;

          const advance = (rect.w * 0.5) * marchPct;
          const x = dot.side === 'attacker' ? baseX + advance : baseX - advance;
          const y = baseY;

          let alpha = 1;
          let scale = 1;
          if (dot.deathAt !== null && ph >= dot.deathAt) {
            const t = Math.min(1, (ph - dot.deathAt) / 0.04);
            alpha = 1 - t;
            scale = 1 + t * 0.8;
            if (Math.random() < 0.18 && particlesRef.current.length < PARTICLE_BUDGET) {
              particlesRef.current.push({
                x, y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40,
                life: 0, ttl: 0.35, size: 1.5,
                color: TROOP_COLORS[dot.type], kind: 'spark',
              });
            }
          }

          const baseSize = TROOP_STATS[dot.type].defense > 100 ? 7.5
                          : TROOP_STATS[dot.type].defense > 50 ? 6
                          : 5;
          const size = baseSize * scale;

          ctx.globalAlpha = alpha * 0.5;
          ctx.fillStyle = TROOP_COLORS[dot.type];
          ctx.beginPath();
          ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = alpha;
          ctx.fillStyle = TROOP_COLORS[dot.type];
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = dot.side === 'attacker' ? 'rgba(255,158,61,0.85)' : 'rgba(74,158,176,0.85)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.globalAlpha = 1;
        };

        for (const dot of scriptRef.current.dots) if (dot.side === 'defender') drawDot(dot);
        for (const dot of scriptRef.current.dots) if (dot.side === 'attacker') drawDot(dot);

        // ─── Particles ───────────────────────────────────────────────
        for (const p of ps) {
          const t = p.life / p.ttl;
          if (p.kind === 'flash') {
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 + t * 1.5), 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === 'spark') {
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === 'smoke') {
            ctx.globalAlpha = (1 - t) * 0.35;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;

        // ─── Floating damage numbers ─────────────────────────────────
        for (const t of dts) {
          const a = 1 - Math.pow(t.life / t.ttl, 2);
          ctx.globalAlpha = a;
          ctx.font = `${t.large ? '700 18px' : '600 14px'} ui-sans-serif, system-ui, sans-serif`;
          ctx.fillStyle = t.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 4;
          ctx.fillText(t.text, t.x, t.y);
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // ─── Team labels (top corners) ───────────────────────────────
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,158,61,0.95)';
        ctx.fillText('▶ ' + attackerLabel.toUpperCase(), 14, 22);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(74,158,176,0.95)';
        ctx.fillText(defenderLabel.toUpperCase() + ' ◀', w - 14, 22);

        // ─── Power bars (under labels) ────────────────────────────────
        // Compute live power from current state
        const computePower = (side: 'attacker' | 'defender') => {
          let p = 0;
          for (const dot of scriptRef.current.dots) {
            if (dot.side !== side) continue;
            if (dot.deathAt !== null && ph >= dot.deathAt) continue;
            const stat = side === 'attacker' ? TROOP_STATS[dot.type].attack : TROOP_STATS[dot.type].defense;
            p += stat * dot.weight;
          }
          return p;
        };
        const aPow = computePower('attacker');
        const dPow = computePower('defender');
        const maxPow = Math.max(sim.attackerPowerInitial, sim.defenderPowerInitial, 1);

        const barY = 34;
        const barH = 6;
        const barMaxW = w * 0.34;
        // Attacker (left, fills right)
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(14, barY, barMaxW, barH);
        ctx.fillStyle = '#FF9E3D';
        ctx.fillRect(14, barY, barMaxW * (aPow / maxPow), barH);
        // Defender (right, fills left)
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(w - 14 - barMaxW, barY, barMaxW, barH);
        ctx.fillStyle = '#4A9EB0';
        const dW = barMaxW * (dPow / maxPow);
        ctx.fillRect(w - 14 - dW, barY, dW, barH);

        // Power values text
        ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'left';
        ctx.fillText(Math.round(aPow).toLocaleString() + ' atk', 14, barY + barH + 12);
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(dPow).toLocaleString() + ' def', w - 14, barY + barH + 12);

        // ─── Banner ──────────────────────────────────────────────────
        if (bannerRef.current) {
          const banner = bannerRef.current;
          const t = banner.life / banner.ttl;
          // Slide in fast, hold, fade out
          let alpha = 1;
          if (t < 0.15) alpha = t / 0.15;
          else if (t > 0.75) alpha = 1 - (t - 0.75) / 0.25;
          const cy = h * 0.35;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = banner.critical ? 'rgba(248, 81, 73, 0.92)' : 'rgba(255, 158, 61, 0.92)';
          const text = banner.text;
          ctx.font = `${banner.critical ? '800 28px' : '700 20px'} ui-sans-serif, system-ui, sans-serif`;
          const tw = ctx.measureText(text).width;
          ctx.fillRect(centerX - tw / 2 - 22, cy - 22, tw + 44, 44);
          ctx.fillStyle = '#0D1117';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, centerX, cy);
          ctx.globalAlpha = 1;
        }

        // ─── Kill feed (bottom-left) ─────────────────────────────────
        const feed = killFeedRef.current;
        ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        for (let i = 0; i < feed.length; i++) {
          const entry = feed[feed.length - 1 - i];
          const a = 1 - Math.pow(entry.life / entry.ttl, 3);
          const y = h - 22 - i * 16;
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          const tw = ctx.measureText(entry.text).width;
          ctx.fillRect(10, y - 11, tw + 14, 16);
          ctx.fillStyle = entry.critical ? '#FFD27D' : '#C9D1D9';
          ctx.fillText(entry.text, 17, y + 1);
        }
        ctx.globalAlpha = 1;

        // ─── Outro card (last ~4s) ───────────────────────────────────
        const outroStart = TARGET_DURATION_S / totalSeconds;
        if (ph > outroStart) {
          const t = (ph - outroStart) / (1 - outroStart);
          const cardAlpha = Math.min(1, t * 3);
          ctx.globalAlpha = cardAlpha * 0.6;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = cardAlpha;
          const outcomeColor = sim.conquered ? '#F85149' : sim.victory ? '#FF9E3D' : '#56D364';
          const outcomeText = sim.conquered ? 'NEXUS CONQUERED'
            : sim.victory ? 'ATTACKER VICTORY'
            : 'DEFENSE HOLDS';
          ctx.fillStyle = outcomeColor;
          ctx.font = '800 36px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(outcomeText, w / 2, h / 2 - 14);

          // Casualty summary
          const aTotal = Object.values(sim.attackerLosses).reduce((a, b) => a + (b || 0), 0);
          const dTotal = Object.values(sim.defenderLosses).reduce((a, b) => a + (b || 0), 0);
          ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif';
          ctx.fillStyle = '#C9D1D9';
          ctx.fillText(`${attackerLabel}  −${aTotal}    vs    ${defenderLabel}  −${dTotal}`, w / 2, h / 2 + 20);
          ctx.globalAlpha = 1;
        }

        ctx.restore();

        raf = requestAnimationFrame(frame);
      };

      raf = requestAnimationFrame(frame);

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }, [sim, attackerLabel, defenderLabel, onProgress, onComplete, triggerRound]);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    );
  },
);

export default BattlefieldCanvas;
