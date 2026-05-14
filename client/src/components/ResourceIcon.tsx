import { Box, Cog, Gem, Sprout, Users } from 'lucide-react';
import React from 'react';

type ResourceKind = 'biomass' | 'alloy' | 'ore' | 'population' | 'storage';

interface ResourceIconProps {
  kind: ResourceKind;
  size?: number;
  className?: string;
}

const ICON: Record<ResourceKind, React.ComponentType<{ size?: number }>> = {
  biomass: Sprout,
  alloy: Cog,
  ore: Gem,
  population: Users,
  storage: Box,
};

const ResourceIcon: React.FC<ResourceIconProps> = ({ kind, size = 14, className }) => {
  const Icon = ICON[kind];
  return (
    <span className={className} aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <Icon size={size} />
    </span>
  );
};

export default ResourceIcon;
