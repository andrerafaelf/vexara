# Neon Dominion - Buildings Guide

## Overview

Neon Dominion currently features 8 building types. Buildings define your nexus economy, population capacity, troop access, defense, and overall progression.

Building upgrades use a build queue with a maximum of **5 queued upgrades** per nexus.

---

## Core Rules

- Upgrades consume **Biomass**, **Alloy**, and **Ore** immediately when construction starts.
- Upgrade time is tracked in **seconds** on the server.
- Each building has a growth factor, so every new level costs more than the last one.
- A nexus can queue up to 5 building upgrades.
- Completed upgrades are applied when the build queue is checked by the game.

## Upgrade Requirements (Enforced)

Building upgrades now validate prerequisites against the next target level, including unlock and milestone thresholds.

- Command Core: max 20, no unlock, milestones at Lv4 (Life Support Lv2), Lv6 (Shield Grid Lv2), Lv10 (Storage Vault Lv5)
- Recruitment Core: max 15, unlock Command Core Lv2, milestones at Lv4 (Biomass Farm Lv2), Lv6 (Alloy Forge Lv2), Lv10 (Life Support Lv5)
- Life Support: max 20, unlock Command Core Lv2, milestones at Lv4 (Biomass Farm Lv2), Lv8 (Storage Vault Lv4)
- Storage Vault: max 20, unlock Command Core Lv2, milestones at Lv4 (Ore Extractor Lv2), Lv6 (Alloy Forge Lv2), Lv10 (Command Core Lv8)
- Biomass Farm: max 20, unlock Life Support Lv1, milestones at Lv6 (Recruitment Core Lv2), Lv10 (Life Support Lv5)
- Alloy Forge: max 15, unlock Ore Extractor Lv2, milestones at Lv6 (Command Core Lv4), Lv10 (Ore Extractor Lv8)
- Ore Extractor: max 20, unlock Command Core Lv1, milestones at Lv8 (Alloy Forge Lv4)
- Shield Grid: max 15, unlock Command Core Lv3, milestones at Lv4 (Storage Vault Lv3), Lv8 (Alloy Forge Lv5)

### Upgrade Cost Formula

For a building upgrading from level $L$ to $L+1$, staged multipliers are used:

- Target levels 1-5: cost multiplier 1.5, time multiplier 1.25
- Target levels 6-10: cost multiplier 1.65, time multiplier 1.35
- Target levels 11+: cost multiplier 1.8, time multiplier 1.45

The price for each upgrade step is calculated cumulatively from base values.

For target level $T$:

$$
	ext{value}(T)=\left\lfloor \text{base value} \times \prod_{i=2}^{T}m(i) \right\rfloor
$$

where $m(i)$ is selected from the staged multipliers above.

---

## Building Types

### 1. Command Core

**Role:** Strategic progression building

**Description:** Central command structure of the nexus. It contributes strong point value and is required by several advanced troop unlocks.

**Base Upgrade Cost:**

- Biomass: 90
- Alloy: 80
- Ore: 70
- Time: 180 seconds
- Growth Factor: 1.26

**In-Game Impact:**

- Used as a requirement for advanced troop types such as Suppressor Team, Annihilator Platform, and Overseer.
- Adds **10 points per level** to nexus score.

**Starting Level:** 1

---

### 2. Recruitment Core

**Role:** Military production building

**Description:** Enables troop training and acts as the main building gate for most military progression.

**Base Upgrade Cost:**

- Biomass: 200
- Alloy: 170
- Ore: 90
- Time: 300 seconds
- Growth Factor: 1.28

**In-Game Impact:**

- Required to train troops at all.
- Many troop unlocks depend on Recruitment Core level.
- Adds **16 points per level** to nexus score.

**Starting Level:** 0

---

### 3. Life Support

**Role:** Population capacity building

**Description:** Expands the population limit of a nexus, allowing more troops to be supported.

**Base Upgrade Cost:**

- Biomass: 80
- Alloy: 100
- Ore: 70
- Time: 240 seconds
- Growth Factor: 1.30

**In-Game Impact:**

- Recalculates maximum population with this formula:

$$
	ext{population max} = \lfloor 100 \times 1.27^{\text{Life Support level}} \rfloor
$$

- Adds **5 points per level** to nexus score.
- Used as a troop requirement for Bulwark Guard.

**Starting Level:** 1

---

### 4. Storage Vault

**Role:** Resource capacity building

**Description:** Increases how many resources the nexus can hold before production stops accumulating.

**Base Upgrade Cost:**

- Biomass: 60
- Alloy: 50
- Ore: 40
- Time: 180 seconds
- Growth Factor: 1.27

**In-Game Impact:**

- Sets maximum resource storage using:

$$
\text{max storage} = 1000 \times 1.3^{\text{Storage Vault level}}
$$

- Adds **6 points per level** to nexus score.

**Starting Level:** 1

---

### 5. Biomass Farm

**Role:** Biomass production building

**Description:** Generates Biomass over time.

**Base Upgrade Cost:**

- Biomass: 50
- Alloy: 60
- Ore: 40
- Time: 180 seconds
- Growth Factor: 1.25

**In-Game Impact:**

- Biomass production uses:

$$
\text{biomass per hour} = 30 \times 1.2^{(\text{Biomass Farm level} - 1)}
$$

- Adds **6 points per level** to nexus score.

**Starting Level:** 1

---

### 6. Alloy Forge

**Role:** Alloy production building

**Description:** Generates Alloy over time.

**Base Upgrade Cost:**

- Biomass: 65
- Alloy: 40
- Ore: 40
- Time: 180 seconds
- Growth Factor: 1.25

**In-Game Impact:**

- Alloy production uses:

$$
\text{alloy per hour} = 30 \times 1.2^{(\text{Alloy Forge level} - 1)}
$$

- Adds **6 points per level** to nexus score.
- Used as a troop requirement for Skimmer Bike.

**Starting Level:** 1

---

### 7. Ore Extractor

**Role:** Ore production building

**Description:** Generates Ore over time.

**Base Upgrade Cost:**

- Biomass: 75
- Alloy: 65
- Ore: 70
- Time: 240 seconds
- Growth Factor: 1.25

**In-Game Impact:**

- Ore production uses:

$$
\text{ore per hour} = 30 \times 1.2^{(\text{Ore Extractor level} - 1)}
$$

- Adds **6 points per level** to nexus score.
- Used as a troop requirement for Breaker Unit and Siege Mech.

**Starting Level:** 1

---

### 8. Shield Grid

**Role:** Defensive building

**Description:** Strengthens the defending nexus during combat.

**Base Upgrade Cost:**

- Biomass: 50
- Alloy: 100
- Ore: 20
- Time: 300 seconds
- Growth Factor: 1.32

**In-Game Impact:**

- Grants a **2% defense bonus per level** during combat.
- Combat formula:

$$
\text{defense power} = \text{base defense power} \times (1 + 0.02 \times \text{Shield Grid level})
$$

- Adds **8 points per level** to nexus score.
- Used as a requirement for Overseer.

**Starting Level:** 0

---

## Starting Building Levels

New nexuses begin with:

- Command Core: 1
- Recruitment Core: 0
- Life Support: 1
- Storage Vault: 1
- Biomass Farm: 1
- Alloy Forge: 1
- Ore Extractor: 1
- Shield Grid: 0

---

## Practical Progression Notes

- Build **Recruitment Core** early if you want to start training troops.
- Upgrade **Life Support** when population becomes a bottleneck.
- Upgrade **Storage Vault** if resources are capping while offline.
- Upgrade **resource buildings** steadily to support troop and building costs.
- Upgrade **Shield Grid** if the nexus is frequently defending against attacks.
- Upgrade **Command Core** and **Recruitment Core** to unlock stronger troop tiers.

---

## Building Point Values

Each building contributes to total nexus points:

- Command Core: 10 points per level
- Recruitment Core: 16 points per level
- Life Support: 5 points per level
- Storage Vault: 6 points per level
- Biomass Farm: 6 points per level
- Alloy Forge: 6 points per level
- Ore Extractor: 6 points per level
- Shield Grid: 8 points per level
