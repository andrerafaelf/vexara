import React, { useEffect, useState } from 'react';
import { Nexus } from '@/types/game';
import ResourceIcon from './ResourceIcon';

interface HeaderResourceStripProps {
  nexus: Nexus | null;
}

const BASE_PRODUCTION = 600;
const PRODUCTION_GROWTH = 1.35;
const NEXUS_PRODUCTION_MULTIPLIERS: Record<string, number> = { 'Resource Depot': 2 };
const STORAGE_BASE = 1000;
const STORAGE_GROWTH = 1.5;

function calcProduction(nexus: Nexus) {
  const mult = NEXUS_PRODUCTION_MULTIPLIERS[nexus.nexusType ?? ''] ?? 1;
  return {
    biomass: Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.biomassFarm - 1) * mult),
    alloy:   Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.alloyForge - 1) * mult),
    ore:     Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.oreExtractor - 1) * mult),
  };
}

function calcStorage(nexus: Nexus) {
  return Math.floor(STORAGE_BASE * Math.pow(STORAGE_GROWTH, nexus.buildings.storageVault));
}

function fmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return Math.floor(v).toString();
}

function fmtRate(v: number): string {
  if (v >= 10_000) return `+${(v / 1000).toFixed(1)}k/h`;
  if (v >= 1000) return `+${(v / 1000).toFixed(2)}k/h`;
  return `+${v}/h`;
}

const HeaderResourceStrip: React.FC<HeaderResourceStripProps> = ({ nexus }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!nexus) return null;

  const production = calcProduction(nexus);
  const storage = calcStorage(nexus);
  const anchor = nexus.lastResourceUpdate ? new Date(nexus.lastResourceUpdate).getTime() : now;
  const elapsedHours = Math.max(0, (now - anchor) / 3600000);

  const live = {
    biomass: Math.min(storage, nexus.resources.biomass + production.biomass * elapsedHours),
    alloy:   Math.min(storage, nexus.resources.alloy   + production.alloy   * elapsedHours),
    ore:     Math.min(storage, nexus.resources.ore     + production.ore     * elapsedHours),
  };

  const fillCls = (cur: number) => {
    const r = cur / storage;
    return r >= 0.98 ? 'hrs-full' : r >= 0.85 ? 'hrs-near' : '';
  };

  const tiles: { kind: 'biomass' | 'alloy' | 'ore'; val: number; cap: number; rate: number }[] = [
    { kind: 'biomass', val: live.biomass, cap: storage, rate: production.biomass },
    { kind: 'alloy',   val: live.alloy,   cap: storage, rate: production.alloy   },
    { kind: 'ore',     val: live.ore,     cap: storage, rate: production.ore     },
  ];

  return (
    <div className="hrs-strip" aria-label="Current nexus resources">
      {tiles.map(({ kind, val, cap, rate }) => (
        <div key={kind} className={`hrs-tile hrs-tile-${kind} ${fillCls(val)}`}>
          <span className="hrs-icon"><ResourceIcon kind={kind} size={15} /></span>
          <div className="hrs-body">
            <span className="hrs-value">
              {fmt(val)}<span className="hrs-cap">/{fmt(cap)}</span>
            </span>
            <span className="hrs-rate">{fmtRate(rate)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HeaderResourceStrip;
