# Vexara - Troops Guide

## Overview

Vexara features 14 troop types across 4 unit classes. Units are trained in the Recruitment Core and consume population capacity.

## Unit Classes & Counter System

Every unit belongs to a class. Classes form a counter triangle:

| Attacker Class | Counters | Multiplier |
|---------------|----------|------------|
| Mobile        | Armor    | ×1.35 dmg  |
| Armor         | Fire     | ×1.35 dmg  |
| Fire          | Mobile   | ×1.35 dmg  |
| (any)         | Countered-by class | ×0.75 dmg |

The **Armory** building amplifies counter bonuses by +1.5% per level (max +30% at Lv20). Mixed compositions that match your counters against the enemy's class split are optimal.

## Core Combat Notes

- Attack Power = class-weighted sum of (unit attack × unit count × counter multiplier vs defender composition)
- Defense Power = sum of (unit defense × unit count), boosted by Shield Grid
- Shield Grid provides +2% total defense per level
- Casualties scale with power ratio; variance is smaller for large stacks (±4%) than small (<20 units, ±15%)
- **Survival rate is shaped by two factors on a winning engagement:** unit defense stat (higher = lower loss rate, with a meaningful spread between glass cannons like Breaker Unit and tanks like Siege Mech) and class matchup against the opposing force (advantage = ~0.85x loss rate, disadvantage = ~1.15x). Losers always lose 100% of their non-Overseer units.
- All losses are seeded deterministically per battle, replays are reproducible
- Overseers reduce enemy control by 34 on a successful attack if they survive and the defending force is cleared

## Stat Identity

Units are designed with a clear offense/defense identity — not all-rounders:

- **Offensive units** (Mobile/Fire focused): high attack, low defense. They deal damage but take disproportionate casualties when caught in the open.
- **Defensive units** (Armor focused): high defense, reduced attack. They survive sustained fire and hold lines, relying on escort damage dealers.
- **Mixed units**: moderate in both — typically represent early-tier flexible generalists before specialization becomes available.

## Recruitment Core Training-Time Reduction

Each level of Recruitment Core multiplies training time by 0.91 (compounding)
for every troop **except Overseer**, which always trains in 4h. The Overseer
also has its own independent training queue, so non-Overseer training does not
wait behind it (and vice versa).

- Lv1: ~92%
- Lv5: ~66%
- Lv10: ~43%
- Lv15: ~28% (max)

## Troop Catalog

_Ordered weakest → strongest by overall combat value._

### Lancer Drone

- Role: Fire interceptor, counters Mobile units
- Class: Fire
- Stats: Attack 3, Defense 22, Speed 20, Carry 30
- Cost: Biomass 150, Alloy 150, Ore 200
- Population: 1
- Training Time: 53s
- Requirements: Recruitment Core Lv2

### Assault Trooper

- Role: Armor frontline infantry, counters Fire units
- Class: Armor
- Stats: Attack 5, Defense 45, Speed 18, Carry 60
- Cost: Biomass 150, Alloy 150, Ore 350
- Population: 1
- Training Time: 1m 19s
- Requirements: Recruitment Core Lv1

### Breaker Unit

- Role: Mobile assault breacher, counters Armor units
- Class: Mobile
- Stats: Attack 35, Defense 3, Speed 16, Carry 40
- Cost: Biomass 250, Alloy 150, Ore 300
- Population: 1
- Training Time: 2m 40s
- Requirements:
  - Recruitment Core Lv3
  - Ore Extractor Lv3

### Recon Operative

- Role: Scout / support unit (Special class, no counter bonus)
- Class: Special
- Stats: Attack 1, Defense 20, Speed 25, Carry 10
- Cost: Biomass 400, Alloy 150, Ore 400
- Population: 1
- Training Time: 3m 0s
- Requirements:
  - Recruitment Core Lv4
  - Command Core Lv3
- Notes:
  - Primary scouting unit

### Suppressor Team

- Role: Fire support, counters Mobile units
- Class: Fire
- Stats: Attack 65, Defense 8, Speed 15, Carry 20
- Cost: Biomass 450, Alloy 400, Ore 450
- Population: 2
- Training Time: 9m 0s
- Requirements:
  - Recruitment Core Lv7
  - Command Core Lv6

### Skimmer Bike

- Role: Fast mobile raider, counters Armor units
- Class: Mobile
- Stats: Attack 80, Defense 10, Speed 22, Carry 80
- Cost: Biomass 625, Alloy 500, Ore 750
- Population: 3
- Training Time: 12m 0s
- Requirements:
  - Recruitment Core Lv5
  - Alloy Forge Lv4

### Bulwark Guard

- Role: Elite armor defender, counters Fire units
- Class: Armor
- Stats: Attack 3, Defense 130, Speed 12, Carry 25
- Cost: Biomass 400, Alloy 600, Ore 500
- Population: 2
- Training Time: 12m 0s
- Requirements:
  - Recruitment Core Lv5
  - Life Support Lv5

### Disruptor Unit

- Role: Fire EMP specialist, counters Mobile units
- Class: Fire
- Stats: Attack 75, Defense 9, Speed 17, Carry 25
- Cost: Biomass 550, Alloy 750, Ore 650
- Population: 2
- Training Time: 14m 0s
- Requirements:
  - Recruitment Core Lv7
  - Ore Extractor Lv6

### Interceptor Bike

- Role: Mobile rapid-response cavalry, counters Armor units
- Class: Mobile
- Stats: Attack 95, Defense 13, Speed 28, Carry 100
- Cost: Biomass 750, Alloy 600, Ore 900
- Population: 3
- Training Time: 18m 0s
- Requirements:
  - Recruitment Core Lv8
  - Alloy Forge Lv7

### Void Stalker

- Role: Ultra-fast mobile cavalry, counters Armor units (and is itself countered by Fire)
- Class: Mobile
- Stats: Attack 150, Defense 15, Speed 32, Carry 60
- Cost: Biomass 1100, Alloy 900, Ore 1400
- Population: 3
- Training Time: 27m 0s
- Requirements:
  - Recruitment Core Lv9
  - Alloy Forge Lv8
  - Armory Lv3
- Notes:
  - Fastest unit in the game (speed 32)
  - Hard countered by Fire class (Suppressor Team, Lancer Drone, Disruptor Unit, Annihilator Platform, Plasma Turret)

### Siege Mech

- Role: Armor siege anchor, counters Fire units
- Class: Armor
- Stats: Attack 40, Defense 260, Speed 10, Carry 20
- Cost: Biomass 1250, Alloy 1000, Ore 2000
- Population: 4
- Training Time: 30m 0s
- Requirements:
  - Recruitment Core Lv10
  - Ore Extractor Lv9
  - Command Core Lv8

### Plasma Turret

- Role: Immobile fire emplacement, cannot attack, defends nexus only
- Class: Fire
- Stats: Attack 0, Defense 160, Speed 0, Carry 0
- Cost: Biomass 1500, Alloy 1200, Ore 2500
- Population: 3 (static-defense tax: strong at home, but no longer equal-pop hard-walls siege units)
- Training Time: 45m 0s
- Requirements:
  - Recruitment Core Lv11
  - Command Core Lv9
  - Armory Lv5
- Notes:
  - Speed 0, cannot be sent on attacks or transfers; stripped from raiding armies
  - Remains on nexus and participates in defense when attacked
  - Counters mobile forces (Void Stalker, Skimmer Bike, Interceptor Bike, Breaker Unit)

### Annihilator Platform

- Role: Fire artillery, counters Mobile units
- Class: Fire
- Stats: Attack 320, Defense 35, Speed 8, Carry 250
- Cost: Biomass 2000, Alloy 1750, Ore 3000
- Population: 4
- Training Time: 40m 0s
- Requirements:
  - Recruitment Core Lv12
  - Command Core Lv10
  - Shield Grid Lv10

### Overseer

- Role: Conquest / control unit (Special — no counter in either direction)
- Class: Special
- Stats: Attack 0, Defense 8, Speed 15, Carry 0
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
  - Each successful overseer strike that clears the defending force reduces enemy control by 34; three strikes conquer any nexus
  - On the conquering strike (Control reaches 0), the Overseer is consumed; surviving escort troops are stationed at the captured nexus
  - Follow-up waves that arrive at a nexus the attacker has just conquered bounce back home with no combat — the Overseer is preserved

## Conquest Flow

1. Train an Overseer
2. Send the Overseer with escort troops
3. Win the battle, clear the defending force, and keep the Overseer alive
4. Enemy control is reduced by 34
5. Repeat for a total of three successful strikes; at 0 control, ownership transfers and the Overseer is consumed

## Quick Recommendations

- Early Defense:
  - Lancer Drone + Assault Trooper

- Mid Defense:
  - Bulwark Guard + Siege Mech

- Fast Raiding:
  - Skimmer Bike + Recon Operative

- Heavy Assault:
  - Annihilator Platform + Siege Mech escort

_Last Updated: May 2026_
