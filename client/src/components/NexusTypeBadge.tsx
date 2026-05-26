import { Hammer, PackagePlus, Shield, Zap } from 'lucide-react';
import React from 'react';

interface NexusTypeBadgeProps {
  type?: string | null;
  doubled?: boolean;
  size?: number;
}

const TYPE_META: Record<string, {
  Icon: React.ComponentType<{ size?: number }>;
  tooltip: string;
  tooltipDoubled: string;
}> = {
  'Resource Depot':    { Icon: Zap,        tooltip: 'Resource Depot · 2x Production',                     tooltipDoubled: 'Resource Depot · 3x Production' },
  'Supply Cache':      { Icon: PackagePlus, tooltip: 'Supply Cache · 2x Storage, 40% Loot Protection',     tooltipDoubled: 'Supply Cache · 3x Storage, 60% Loot Protection' },
  'Military Outpost':  { Icon: Shield,      tooltip: 'Military Outpost · +100% Shield, 2x Training Speed', tooltipDoubled: 'Military Outpost · +200% Shield, 4x Training Speed' },
  'Reclaimed Outpost': { Icon: Hammer,      tooltip: 'Reclaimed Outpost · 20% Faster Construction',         tooltipDoubled: 'Reclaimed Outpost · 36% Faster Construction' },
};

const NexusTypeBadge: React.FC<NexusTypeBadgeProps> = ({ type, doubled = false, size = 12 }) => {
  if (!type) return null;
  const meta = TYPE_META[type];
  if (!meta) return null;
  const { Icon } = meta;
  const tooltip = doubled ? meta.tooltipDoubled : meta.tooltip;
  return (
    <span className="nexus-type-badge" title={tooltip} aria-label={tooltip}>
      <Icon size={size} />
    </span>
  );
};

export default NexusTypeBadge;
