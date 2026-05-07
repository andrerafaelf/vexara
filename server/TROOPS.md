# Neon Dominion - Troops Guide

## Overview

Neon Dominion features 12 troop types. Units are trained in the Recruitment Core and consume population capacity.

## Core Combat Notes

- Attack Power = sum of (unit attack × unit count)
- Defense Power = sum of (unit defense × unit count)
- Shield Grid provides +2% total defense per level
- Casualties are ratio-based with a random factor
- Overseers reduce enemy control by 50 on a successful attack if they survive

## Recruitment Core Training-Time Reduction

Each level of Recruitment Core multiplies training time by 0.92 (compounding)
for every troop **except Overseer**, which always trains in 4h. The Overseer
also has its own independent training queue, so non-Overseer training does not
wait behind it (and vice versa).

- Lv1: ~92%
- Lv5: ~66%
- Lv10: ~43%
- Lv15: ~28% (max)

## Troop Catalog

### Assault Trooper

- Role: Defensive frontline infantry
- Stats: Attack 30, Defense 40, Speed 18, Carry 15
- Cost: Biomass 150, Alloy 150, Ore 350
- Population: 1
- Training Time: 1m 19s
- Requirements: Recruitment Core Lv1

### Lancer Drone

- Role: Early defensive interceptor
- Stats: Attack 15, Defense 25, Speed 20, Carry 20
- Cost: Biomass 250, Alloy 150, Ore 50
- Population: 1
- Training Time: 53s
- Requirements: Recruitment Core Lv2

### Breaker Unit

- Role: Heavy breacher
- Stats: Attack 50, Defense 15, Speed 16, Carry 10
- Cost: Biomass 300, Alloy 150, Ore 200
- Population: 1
- Training Time: 1m 14s
- Requirements:
  - Recruitment Core Lv3
  - Ore Extractor Lv3

### Recon Operative

- Role: Scout / support unit
- Stats: Attack 5, Defense 20, Speed 25, Carry 10
- Cost: Biomass 500, Alloy 150, Ore 300
- Population: 1
- Training Time: 3m 0s
- Requirements:
  - Recruitment Core Lv4
  - Command Core Lv3
- Notes:
  - Primary scouting unit

### Skimmer Bike

- Role: Fast raider
- Stats: Attack 80, Defense 70, Speed 22, Carry 60
- Cost: Biomass 625, Alloy 500, Ore 750
- Population: 3
- Training Time: 10m 0s
- Requirements:
  - Recruitment Core Lv5
  - Alloy Forge Lv4

### Bulwark Guard

- Role: Elite defensive infantry
- Stats: Attack 20, Defense 120, Speed 12, Carry 25
- Cost: Biomass 400, Alloy 600, Ore 500
- Population: 2
- Training Time: 8m 0s
- Requirements:
  - Recruitment Core Lv5
  - Life Support Lv5

### Suppressor Team

- Role: Ranged assault support
- Stats: Attack 60, Defense 50, Speed 15, Carry 20
- Cost: Biomass 450, Alloy 400, Ore 450
- Population: 2
- Training Time: 8m 0s
- Requirements:
  - Recruitment Core Lv7
  - Command Core Lv6

### Disruptor Unit

- Role: Anti-armor assault unit
- Stats: Attack 70, Defense 60, Speed 17, Carry 25
- Cost: Biomass 550, Alloy 750, Ore 650
- Population: 2
- Training Time: 11m 0s
- Requirements:
  - Recruitment Core Lv7
  - Ore Extractor Lv6

### Interceptor Bike

- Role: Rapid-response cavalry
- Stats: Attack 90, Defense 80, Speed 28, Carry 50
- Cost: Biomass 750, Alloy 600, Ore 900
- Population: 3
- Training Time: 15m 0s
- Requirements:
  - Recruitment Core Lv8
  - Alloy Forge Lv7

### Siege Mech

- Role: Heavy defensive anchor
- Stats: Attack 150, Defense 200, Speed 10, Carry 80
- Cost: Biomass 1250, Alloy 1000, Ore 2000
- Population: 4
- Training Time: 1h 0m
- Requirements:
  - Recruitment Core Lv10
  - Ore Extractor Lv9
  - Command Core Lv8

### Annihilator Platform

- Role: Heavy artillery
- Stats: Attack 200, Defense 150, Speed 8, Carry 100
- Cost: Biomass 2000, Alloy 1750, Ore 3000
- Population: 5
- Training Time: 2h 0m
- Requirements:
  - Recruitment Core Lv12
  - Command Core Lv10
  - Shield Grid Lv10

### Overseer

- Role: Conquest / control unit
- Stats: Attack 0, Defense 30, Speed 15, Carry 0
- Cost: Biomass 12000, Alloy 10000, Ore 8000
- Population: 5
- Training Time: 4h 0m
- Requirements:
  - Recruitment Core Lv14
  - Command Core Lv14
  - Shield Grid Lv13
- Limits:
  - Maximum 3 per nexus
  - Maximum 1 per strike
- Notes:
  - Does not contribute attack damage
  - If all non-overseer units are destroyed, the overseer is destroyed as well
  - Each successful overseer strike reduces enemy control by 50
  - Overseers are consumed when a conquest is completed (enemy control reaches 0)

## Conquest Flow

1. Train an Overseer
2. Send the Overseer with escort troops
3. Win the battle while the Overseer survives
4. Enemy control is reduced by 50
5. At 0 control, ownership transfers

## Quick Recommendations

- Early Defense:
  - Lancer Drone + Assault Trooper

- Mid Defense:
  - Bulwark Guard + Siege Mech

- Fast Raiding:
  - Skimmer Bike + Recon Operative

- Heavy Assault:
  - Siege Mech + Annihilator Platform + escort support

_Last Updated: May 2026_
