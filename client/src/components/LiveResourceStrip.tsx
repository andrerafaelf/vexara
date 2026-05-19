'use client';

import React from 'react';
import { useNow } from '@/hooks/useNow';

interface LiveResourceStripProps {
  baseResources: { biomass: number; alloy: number; ore: number };
  /** Per-hour production rates for each resource. */
  production: { biomass: number; alloy: number; ore: number };
  /** Storage capacity for each resource (assumed identical across all three here). */
  storageCapacity: number;
  /** Timestamp of the last server-side resource snapshot (anchor for interpolation). */
  lastResourceUpdate?: string | Date | null;
}

function fmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.floor(v).toString();
}

function fmtRate(v: number): string {
  if (v >= 1_000) return `+${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k/h`;
  return `+${v}/h`;
}

/**
 * Interpolates live resource amounts at 1Hz against a server-anchored baseline. Subscribes only
 * itself to the shared clock — the header that contains it stays stable across ticks.
 */
function LiveResourceStripInner({
  baseResources,
  production,
  storageCapacity,
  lastResourceUpdate,
}: LiveResourceStripProps) {
  const now = useNow();
  const anchorMs = lastResourceUpdate
    ? (lastResourceUpdate instanceof Date ? lastResourceUpdate.getTime() : new Date(lastResourceUpdate).getTime())
    : now;
  const elapsedHours = Math.max(0, (now - anchorMs) / 3600000);
  const live = {
    biomass: baseResources.biomass + production.biomass * elapsedHours,
    alloy: baseResources.alloy + production.alloy * elapsedHours,
    ore: baseResources.ore + production.ore * elapsedHours,
  };
  const entries = [
    { key: 'biomass', label: 'BIOMASS', val: Math.min(storageCapacity, live.biomass), rate: production.biomass },
    { key: 'alloy', label: 'ALLOY', val: Math.min(storageCapacity, live.alloy), rate: production.alloy },
    { key: 'ore', label: 'ORE', val: Math.min(storageCapacity, live.ore), rate: production.ore },
  ] as const;
  return (
    <div className="header-resource-strip">
      {entries.map(({ key, label, val, rate }) => {
        const ratio = val / storageCapacity;
        const fullCls = ratio >= 0.98 ? 'header-res-full' : ratio >= 0.85 ? 'header-res-near' : '';
        return (
          <div key={key} className={`header-res header-res-${key} ${fullCls}`}>
            <span className="header-res-label">{label}</span>
            <span className="header-res-value">
              {fmt(val)}
              <span style={{ fontSize: '0.65em', opacity: 0.6, fontWeight: 400 }}>/{fmt(storageCapacity)}</span>
            </span>
            <span className="header-res-rate">{fmtRate(rate)}</span>
          </div>
        );
      })}
    </div>
  );
}

export const LiveResourceStrip = React.memo(LiveResourceStripInner);
