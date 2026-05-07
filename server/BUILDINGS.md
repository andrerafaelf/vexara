# Neon Dominion - Buildings Guide

## Overview

Neon Dominion has 8 core buildings. Buildings control economy, population, defense, and unlock progression.

- Build queue cap: 5 upgrades per nexus
- Costs are paid when queued
- Upgrade completion is applied when queues are checked

## Upgrade Scaling

Per-upgrade costs and times are calculated from base values with staged multipliers:

- Target levels 1-5: cost x1.5, time x1.25
- Target levels 6-10: cost x1.65, time x1.35
- Target levels 11+: cost x1.8, time x1.45

## Command Core Build-Time Reduction

Each level of Command Core multiplies all building upgrade times (including
Command Core's own next upgrade) by 0.95. The reduction stacks compoundingly:

- Lv0: 100% (base time)
- Lv5: ~77%
- Lv10: ~60%
- Lv20: ~36%

## Building Catalog

### Command Core

- Role: Main progression gate
- Base cost: Biomass 90, Alloy 80, Ore 70, Time 45s
- Max level: 20
- Unlock: none
- Milestones:
  - Lv4 requires Life Support Lv2
  - Lv6 requires Shield Grid Lv2
  - Lv10 requires Storage Vault Lv5

### Recruitment Core (recruitmentCore)

- Role: Troop production and military unlock gate
- Base cost: Biomass 200, Alloy 170, Ore 90, Time 75s
- Max level: 15
- Unlock: Command Core Lv2
- Milestones:
  - Lv4 requires Biomass Farm Lv2
  - Lv6 requires Alloy Forge Lv2
  - Lv10 requires Life Support Lv5

### Life Support

- Role: Population cap scaling
- Base cost: Biomass 80, Alloy 100, Ore 70, Time 60s
- Max level: 20
- Unlock: Command Core Lv2
- Milestones:
  - Lv4 requires Biomass Farm Lv2
  - Lv8 requires Storage Vault Lv4
- Impact:
  - Population max formula: floor(100 \* 1.27^level)

### Storage Vault

- Role: Resource cap scaling
- Base cost: Biomass 60, Alloy 50, Ore 40, Time 45s
- Max level: 20
- Unlock: Command Core Lv2
- Milestones:
  - Lv4 requires Ore Extractor Lv2
  - Lv6 requires Alloy Forge Lv2
  - Lv10 requires Command Core Lv8
- Impact:
  - Storage formula: floor(1000 \* 1.5^level)

### Biomass Farm

- Role: Biomass production
- Base cost: Biomass 50, Alloy 60, Ore 40, Time 45s
- Max level: 20
- Unlock: Life Support Lv1
- Milestones:
  - Lv6 requires Recruitment Core Lv2
  - Lv10 requires Life Support Lv5
- Impact:
  - Production scales as floor(600 \* 1.35^(level-1))

### Alloy Forge

- Role: Alloy production
- Base cost: Biomass 65, Alloy 40, Ore 40, Time 45s
- Max level: 15
- Unlock: Ore Extractor Lv2
- Milestones:
  - Lv6 requires Command Core Lv4
  - Lv10 requires Ore Extractor Lv8
- Impact:
  - Production scales as floor(600 \* 1.35^(level-1))

### Ore Extractor

- Role: Ore production
- Base cost: Biomass 75, Alloy 65, Ore 70, Time 60s
- Max level: 20
- Unlock: Command Core Lv1
- Milestones:
  - Lv8 requires Alloy Forge Lv4
- Impact:
  - Production scales as floor(600 \* 1.35^(level-1))

### Shield Grid

- Role: Defensive multiplier
- Base cost: Biomass 50, Alloy 100, Ore 20, Time 75s
- Max level: 15
- Unlock: Command Core Lv3
- Milestones:
  - Lv4 requires Storage Vault Lv3
  - Lv8 requires Alloy Forge Lv5
- Impact:
  - Grants +2% total defense per level during combat

## Starting Levels

New nexuses start with:

- Command Core: 0
- Recruitment Core: 0
- Life Support: 1
- Storage Vault: 1
- Biomass Farm: 1
- Alloy Forge: 1
- Ore Extractor: 1
- Shield Grid: 0

_Last Updated: May 2026_
