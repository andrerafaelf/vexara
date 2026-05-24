# Vexara - Troops Guide

## Overview

Vexara features 14 troop types across 4 unit classes. Units are trained in the Recruitment Core and consume population capacity.

## Unit Classes & Counter System

Every unit belongs to a class. Classes form a counter triangle:

| Attacker Class | Counters | Multiplier |
|---------------|----------|------------|
| Light         | Heavy    | ×1.35 dmg  |
| Heavy         | Special  | ×1.35 dmg  |
| Ranged        | Light    | ×1.35 dmg  |
| (any)         | Countered-by class | ×0.70–0.80 dmg |

The **Armory** building amplifies counter bonuses by +1.5% per level (max +30% at Lv20). Mixed compositions that match your counters against the enemy's class split are optimal.

## Core Combat Notes

- Attack Power = class-weighted sum of (unit attack × unit count × counter multiplier vs defender composition)
- Defense Power = sum of (unit defense × unit count), boosted by Shield Grid
- Shield Grid provides +2% total defense per level
- Casualties scale with power ratio; variance is smaller for large stacks (±4%) than small (<20 units, ±15%)
- All losses are seeded deterministically per battle, replays are reproducible
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

- Role: Heavy frontline infantry, counters Special units
- Class: Heavy
- Stats: Attack 30, Defense 45, Speed 18, Carry 60
- Cost: Biomass 150, Alloy 150, Ore 350
- Population: 1
- Training Time: 1m 19s
- Requirements: Recruitment Core Lv1

### Lancer Drone

- Role: Ranged interceptor, counters Light units
- Class: Ranged
- Stats: Attack 15, Defense 28, Speed 20, Carry 30
- Cost: Biomass 150, Alloy 150, Ore 200
- Population: 1
- Training Time: 53s
- Requirements: Recruitment Core Lv2

### Breaker Unit

- Role: Light assault breacher, counters Heavy units
- Class: Light
- Stats: Attack 55, Defense 15, Speed 16, Carry 50
- Cost: Biomass 250, Alloy 150, Ore 300
- Population: 1
- Training Time: 1m 14s
- Requirements:
  - Recruitment Core Lv3
  - Ore Extractor Lv3

### Recon Operative

- Role: Scout / support unit (Special class, no counter bonus)
- Class: Special
- Stats: Attack 5, Defense 20, Speed 25, Carry 10
- Cost: Biomass 400, Alloy 150, Ore 400
- Population: 1
- Training Time: 3m 0s
- Requirements:
  - Recruitment Core Lv4
  - Command Core Lv3
- Notes:
  - Primary scouting unit

### Skimmer Bike

- Role: Fast light raider, counters Heavy units
- Class: Light
- Stats: Attack 80, Defense 65, Speed 22, Carry 60
- Cost: Biomass 625, Alloy 500, Ore 750
- Population: 3
- Training Time: 10m 0s
- Requirements:
  - Recruitment Core Lv5
  - Alloy Forge Lv4

### Bulwark Guard

- Role: Elite heavy defender, counters Special units
- Class: Heavy
- Stats: Attack 20, Defense 130, Speed 12, Carry 25
- Cost: Biomass 400, Alloy 600, Ore 500
- Population: 2
- Training Time: 8m 0s
- Requirements:
  - Recruitment Core Lv5
  - Life Support Lv5

### Suppressor Team

- Role: Ranged suppressor, counters Light units
- Class: Ranged
- Stats: Attack 65, Defense 45, Speed 15, Carry 20
- Cost: Biomass 450, Alloy 400, Ore 450
- Population: 2
- Training Time: 8m 0s
- Requirements:
  - Recruitment Core Lv7
  - Command Core Lv6

### Disruptor Unit

- Role: Ranged anti-armor, counters Light units
- Class: Ranged
- Stats: Attack 75, Defense 55, Speed 17, Carry 25
- Cost: Biomass 550, Alloy 750, Ore 650
- Population: 2
- Training Time: 11m 0s
- Requirements:
  - Recruitment Core Lv7
  - Ore Extractor Lv6

### Interceptor Bike

- Role: Light rapid-response cavalry, counters Heavy units
- Class: Light
- Stats: Attack 95, Defense 75, Speed 28, Carry 50
- Cost: Biomass 750, Alloy 600, Ore 900
- Population: 3
- Training Time: 15m 0s
- Requirements:
  - Recruitment Core Lv8
  - Alloy Forge Lv7

### Siege Mech

- Role: Heavy siege anchor, counters Special units
- Class: Heavy
- Stats: Attack 150, Defense 210, Speed 10, Carry 80
- Cost: Biomass 1250, Alloy 1000, Ore 2000
- Population: 4
- Training Time: 1h 0m
- Requirements:
  - Recruitment Core Lv10
  - Ore Extractor Lv9
  - Command Core Lv8

### Annihilator Platform

- Role: Heavy ranged artillery, counters light units
- Class: Ranged
- Stats: Attack 210, Defense 140, Speed 8, Carry 100
- Cost: Biomass 2000, Alloy 1750, Ore 3000
- Population: 5
- Training Time: 2h 0m
- Requirements:
  - Recruitment Core Lv12
  - Command Core Lv10
  - Shield Grid Lv10

### Void Stalker

- Role: Ultra-fast light cavalry, counters Heavy units (and is itself countered by Ranged)
- Class: Light
- Stats: Attack 110, Defense 50, Speed 32, Carry 40
- Cost: Biomass 900, Alloy 700, Ore 1100
- Population: 3
- Training Time: 20m 0s
- Requirements:
  - Recruitment Core Lv9
  - Alloy Forge Lv8
  - Armory Lv3
- Notes:
  - Fastest unit in the game (speed 32)
  - Excellent counter vs Suppressor Team, Lancer Drone, Disruptor Unit, Annihilator Platform

### Plasma Turret

- Role: Immobile ranged emplacement, cannot attack, defends nexus only
- Class: Ranged
- Stats: Attack 180, Defense 90, Speed 0, Carry 0
- Cost: Biomass 1500, Alloy 1200, Ore 2500
- Population: 2 (lighter pop tax than mobile units — turret can't transfer between nexuses)
- Training Time: 1h 30m
- Requirements:
  - Recruitment Core Lv11
  - Command Core Lv9
  - Armory Lv5
- Notes:
  - Speed 0, cannot be sent on attacks or transfers; stripped from raiding armies
  - Remains on nexus and participates in defense when attacked
  - Counters light cavalry (Void Stalker, Skimmer Bike, Interceptor Bike, Breaker Unit)

### Overseer

- Role: Conquest / control unit
- Stats: Attack 0, Defense 30, Speed 15, Carry 0
- Cost: Biomass 180000, Alloy 140000, Ore 120000
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
