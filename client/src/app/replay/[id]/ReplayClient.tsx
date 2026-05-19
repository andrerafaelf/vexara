'use client';

import { useMemo } from 'react';
import BattleReplay from '@/components/BattleReplay';
import { simulateBattle, type Force, type TroopKey } from '@/utils/combatSim';

interface ReplayPayload {
  id: string;
  attacker: { username: string | null; nexusName: string | null; x: number | null; y: number | null };
  defender: { username: string | null; nexusName: string | null; x: number | null; y: number | null };
  attackerInitial: Record<string, number>;
  defenderInitial: Record<string, number>;
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  attackerPower: number | null;
  defenderPower: number | null;
  victory: boolean;
  conquered: boolean;
  resourcesStolen: { biomass: number; alloy: number; ore: number };
  combatSeed: number;
  createdAt: string;
}

function clean(force: Record<string, number>): Force {
  const out: Force = {};
  for (const [k, v] of Object.entries(force || {})) {
    if (typeof v === 'number' && v > 0) out[k as TroopKey] = v;
  }
  return out;
}

export default function ReplayClient({ data }: { data: ReplayPayload }) {
  const sim = useMemo(() => simulateBattle({
    attackerInitial: clean(data.attackerInitial),
    defenderInitial: clean(data.defenderInitial),
    attackerLosses: clean(data.attackerLosses),
    defenderLosses: clean(data.defenderLosses),
    seed: data.combatSeed,
    victory: data.victory,
    conquered: data.conquered,
  }), [data]);

  const attackerLabel = data.attacker.username || 'Unknown';
  const defenderLabel = data.defender.username || 'Unknown';

  const shareUrl = typeof window !== 'undefined' ? window.location.href : `/replay/${data.id}`;

  const outcomeChip = data.conquered
    ? { text: 'NEXUS CONQUERED', color: '#F85149' }
    : data.victory
      ? { text: 'ATTACKER VICTORY', color: '#FF9E3D' }
      : { text: 'DEFENSE HELD', color: '#56D364' };

  const totalAttackers = Object.values(data.attackerInitial).reduce((a, b) => a + b, 0);
  const totalDefenders = Object.values(data.defenderInitial).reduce((a, b) => a + b, 0);
  const date = new Date(data.createdAt);

  return (
    <div className="public-replay-root">
      <header className="public-replay-header">
        <a href="/" className="public-replay-brand" aria-label="Vexara home">
          <span className="public-replay-brand-mark">▲</span>
          <span className="public-replay-brand-name">VEXARA</span>
        </a>
        <span
          className="public-replay-outcome-chip"
          style={{ background: outcomeChip.color, color: '#0D1117' }}
        >
          {outcomeChip.text}
        </span>
        <a href="/" className="public-replay-cta">Play Vexara →</a>
      </header>

      <main className="public-replay-main">
        <div className="public-replay-meta">
          <div className="public-replay-meta-row">
            <div className="public-replay-side public-replay-side--attacker">
              <span className="public-replay-side-label">ATTACKER</span>
              <span className="public-replay-side-name">{attackerLabel}</span>
              {data.attacker.nexusName && (
                <span className="public-replay-side-detail">
                  {data.attacker.nexusName}
                  {data.attacker.x != null && ` (${data.attacker.x}|${data.attacker.y})`}
                </span>
              )}
              <span className="public-replay-side-stat">{totalAttackers} units · {data.attackerPower ? data.attackerPower.toLocaleString() : '—'} atk</span>
            </div>
            <span className="public-replay-vs">VS</span>
            <div className="public-replay-side public-replay-side--defender">
              <span className="public-replay-side-label">DEFENDER</span>
              <span className="public-replay-side-name">{defenderLabel}</span>
              {data.defender.nexusName && (
                <span className="public-replay-side-detail">
                  {data.defender.nexusName}
                  {data.defender.x != null && ` (${data.defender.x}|${data.defender.y})`}
                </span>
              )}
              <span className="public-replay-side-stat">{totalDefenders} units · {data.defenderPower ? data.defenderPower.toLocaleString() : '—'} def</span>
            </div>
          </div>
        </div>

        <div className="public-replay-stage">
          <BattleReplay
            sim={sim}
            attackerLabel={attackerLabel}
            defenderLabel={defenderLabel}
            resourcesStolen={data.resourcesStolen}
            shareUrl={shareUrl}
          />
        </div>

        <div className="public-replay-footer">
          <span>Battle ID #{data.id} · {date.toLocaleString()}</span>
          <span>Deterministic seed {data.combatSeed} · Same seed always replays identically</span>
        </div>
      </main>

      <style>{`
        body { margin: 0; }
        .public-replay-root {
          min-height: 100vh;
          background: linear-gradient(180deg, #0D1117 0%, #08090C 100%);
          color: #C9D1D9;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          display: flex;
          flex-direction: column;
        }
        .public-replay-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 22px;
          border-bottom: 1px solid #1C232C;
          background: rgba(8,9,12,0.7);
          backdrop-filter: blur(8px);
        }
        .public-replay-brand {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: #F0F6FC;
          font-weight: 800;
          letter-spacing: 0.12em;
        }
        .public-replay-brand-mark {
          color: #FF9E3D;
          font-size: 20px;
        }
        .public-replay-brand-name { font-size: 14px; }
        .public-replay-outcome-chip {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          border-radius: 3px;
        }
        .public-replay-cta {
          margin-left: auto;
          color: #FF9E3D;
          text-decoration: none;
          font-weight: 700;
          font-size: 13px;
          border: 1px solid rgba(255,158,61,0.45);
          padding: 6px 12px;
          border-radius: 3px;
          transition: background 0.15s ease;
        }
        .public-replay-cta:hover {
          background: rgba(255,158,61,0.12);
        }
        .public-replay-main {
          max-width: 1100px;
          width: 100%;
          margin: 0 auto;
          padding: 24px 22px 40px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          flex: 1;
        }
        .public-replay-meta {
          background: rgba(22,27,34,0.6);
          border: 1px solid #1C232C;
          border-radius: 8px;
          padding: 16px 20px;
        }
        .public-replay-meta-row {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 16px;
          align-items: center;
        }
        .public-replay-side {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .public-replay-side--defender {
          align-items: flex-end;
          text-align: right;
        }
        .public-replay-side-label {
          font-size: 10px;
          letter-spacing: 0.12em;
          color: #6E7681;
          font-weight: 700;
        }
        .public-replay-side--attacker .public-replay-side-label { color: #FF9E3D; }
        .public-replay-side--defender .public-replay-side-label { color: #4A9EB0; }
        .public-replay-side-name {
          font-size: 22px;
          font-weight: 800;
          color: #F0F6FC;
          letter-spacing: 0.02em;
        }
        .public-replay-side-detail {
          font-size: 12px;
          color: #8B949E;
        }
        .public-replay-side-stat {
          font-size: 11px;
          color: #6E7681;
          font-variant-numeric: tabular-nums;
          margin-top: 2px;
        }
        .public-replay-vs {
          font-weight: 800;
          color: #444C56;
          letter-spacing: 0.16em;
          font-size: 14px;
        }
        .public-replay-stage { width: 100%; }
        .public-replay-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 11px;
          color: #6E7681;
          font-variant-numeric: tabular-nums;
          padding-top: 8px;
          border-top: 1px solid #1C232C;
        }
        @media (max-width: 640px) {
          .public-replay-meta-row { grid-template-columns: 1fr; gap: 12px; }
          .public-replay-side--defender { align-items: flex-start; text-align: left; }
          .public-replay-vs { display: none; }
          .public-replay-side-name { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
