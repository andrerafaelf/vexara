import React, { useEffect, useState } from 'react';
import { Nexus } from '@/types/game';

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
    alloy: Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.alloyForge - 1) * mult),
    ore: Math.floor(BASE_PRODUCTION * Math.pow(PRODUCTION_GROWTH, nexus.buildings.oreExtractor - 1) * mult),
  };
}

function calcStorage(nexus: Nexus) {
  return Math.floor(STORAGE_BASE * Math.pow(STORAGE_GROWTH, nexus.buildings.storageVault));
}

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}k`;
  return Math.floor(value).toString();
}

function formatRate(value: number): string {
  if (value >= 10_000) return `+${(value / 1000).toFixed(1)}k/h`;
  if (value >= 1000) return `+${(value / 1000).toFixed(2)}k/h`;
  return `+${value}/h`;
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
    alloy: Math.min(storage, nexus.resources.alloy + production.alloy * elapsedHours),
    ore: Math.min(storage, nexus.resources.ore + production.ore * elapsedHours),
  };

  const fullRatio = (cur: number) => cur / storage;
  const cls = (cur: number) =>
    fullRatio(cur) >= 0.98 ? 'header-res-full' : fullRatio(cur) >= 0.85 ? 'header-res-near' : '';

  return (
    <div className="header-resource-strip" aria-label="Current nexus resources">
      <div className={`header-res header-res-biomass ${cls(live.biomass)}`}>
        <span className="header-res-label">BIOMASS</span>
        <span className="header-res-value">{formatAmount(live.biomass)}</span>
        <span className="header-res-rate">{formatRate(production.biomass)}</span>
      </div>
      <div className={`header-res header-res-alloy ${cls(live.alloy)}`}>
        <span className="header-res-label">ALLOY</span>
        <span className="header-res-value">{formatAmount(live.alloy)}</span>
        <span className="header-res-rate">{formatRate(production.alloy)}</span>
      </div>
      <div className={`header-res header-res-ore ${cls(live.ore)}`}>
        <span className="header-res-label">ORE</span>
        <span className="header-res-value">{formatAmount(live.ore)}</span>
        <span className="header-res-rate">{formatRate(production.ore)}</span>
      </div>
    </div>
  );
};

export default HeaderResourceStrip;
