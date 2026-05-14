import { Hammer, PackagePlus, Shield, Zap } from 'lucide-react';
import React from 'react';

interface NexusTypeBadgeProps {
  type?: string | null;
  size?: number;
}

const TYPE_META: Record<string, { Icon: React.ComponentType<{ size?: number }>; tooltip: string }> = {
  'Resource Depot': { Icon: Zap, tooltip: 'Resource Depot — 2x Production' },
  'Supply Cache': { Icon: PackagePlus, tooltip: 'Supply Cache — 2x Storage' },
  'Military Outpost': {
    Icon: Shield,
    tooltip: 'Military Outpost — +50% Shield, 25% Faster Training',
  },
  'Reclaimed Outpost': { Icon: Hammer, tooltip: 'Reclaimed Outpost — 20% Faster Construction' },
};

const NexusTypeBadge: React.FC<NexusTypeBadgeProps> = ({ type, size = 12 }) => {
  if (!type) return null;
  const meta = TYPE_META[type];
  if (!meta) return null;
  const { Icon, tooltip } = meta;
  return (
    <span className="nexus-type-badge" title={tooltip} aria-label={tooltip}>
      <Icon size={size} />
    </span>
  );
};

export default NexusTypeBadge;
