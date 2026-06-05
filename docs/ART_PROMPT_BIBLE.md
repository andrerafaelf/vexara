# VEXARA — IMAGE GENERATION PROMPT BIBLE

> **Art direction (house style):** Industrial military sci-fi. Gunmetal base, amber
> HUD primary, flat surfaces, sharp corners, no neon glows. *(Sourced from the
> game's design tokens — `client/src/app/globals.css`.)*

This bible exists so every troop and building image **blends into one faction**.
Each prompt has two layers:

1. A **MASTER STYLE BLOCK** — pasted byte-identical into *every* generation. This
   is the single most important blend cue.
2. A **per-asset block** — the silhouette, color channel, and detail that makes
   each unit/building distinct.

---

## Brand palette (locked from the game)

| Token | Hex | Use |
|---|---|---|
| App background (deepest) | `#08090c` | gradient floor |
| Page background | `#0d1117` | — |
| Primary surface (gunmetal) | `#161b22` | gradient top / base material |
| Borders (steel) | `#30363d` | panel seams |
| **Amber brand accent** | `#ff9e3d` | **the faction "uniform thread" — on every asset** |
| Steel-teal secondary | `#4a9eb0` | special units, defensive infra |

### Class color identity (from the in-game training-lane colors)

| Class | Hex | Silhouette language |
|---|---|---|
| **Mobile** | `#38bdf8` (cyan) | lean, swept, aerodynamic, hovering, bladed |
| **Armor** | `#7c93b3` (steel-blue) | blocky, heavy plate, wide stance, bunkered |
| **Fire** | `#f59e3d` (amber) | barreled, vented, emitter-heavy, angular |
| **Special** | `#4a9eb0` (steel-teal) | utilitarian, antennae/optics, non-combatant |

---

## How to use this

- Keep the **master block byte-identical** across a class. Only the unit-specific
  line changes — that is what makes the roster blend.
- **Generate one class per session with a fixed seed family** so lighting, grain,
  and framing match across all units of that class.
- **Anvils must look tougher than strikers** of the same class (so players read a
  defender by silhouette). The prompts bake this in — keep the contrast on iteration.
- **Tier escalation is a silhouette story:** T1 lean/sparse → T3 dense/massive. If a
  T1 looks as armored as a T3, regenerate — the tech-up read is a gameplay tell.
- **Buildings never look like units:** they always sit on a hex foundation pad with
  human-scale catwalks; units never do.
- **Hard NO list:** no neon glow, no bloom, no magic energy, no glossy chrome, no
  rounded cartoon shapes, no fantasy ornamentation.

---

# ███ TROOP MASTER STYLE BLOCK ███

*Paste this verbatim before every troop's specific line, then append the CLASS line
and TIER line.*

```
Industrial military sci-fi unit portrait for a hard sci-fi conquest strategy game.
Single subject, 3/4 front hero angle, full unit visible, centered, grounded.
Material language: brushed gunmetal and raw alloy plating, exposed bolts, weld
seams, hazard stencils, scuffed matte paint, riveted panels — used, functional,
never chrome or glossy. Flat directional studio lighting from upper-left, soft
ambient fill, NO neon glow, NO lens flare, NO magical FX. Background: seamless
dark gunmetal gradient #161b22 to #08090c, faint blueprint grid, subtle volumetric
haze, slight vignette — empty, no scenery, no horizon. Restrained amber #ff9e3d
HUD-accent detailing (running lights, stencil numbers, warning chevrons) shared
across the whole roster. Cinematic, weighty, semi-realistic concrete-and-steel
render, fine surface grain, sharp edges, high detail, 4k, neutral color grade.
```

## CLASS LINE (append per class)

- **Mobile:** `CLASS=MOBILE: lean swept aerodynamic frame, hover/thruster propulsion, bladed forward silhouette, cyan #38bdf8 as the unit's signature accent channel (sensor strips, thruster glow-trim, panel piping) layered over the shared amber stencils.`
- **Armor:** `CLASS=ARMOR: blocky heavy fortress build, thick layered ablative plate, wide planted stance, bunker-like mass, steel-blue #7c93b3 as the unit's signature accent channel (plate trim, pauldron edging, optic visor) over the shared amber stencils.`
- **Fire:** `CLASS=FIRE: barrel-and-emitter heavy frame, prominent vents and heat-sinks, angular weapon-platform silhouette, amber #f59e3d as the unit's signature accent channel (muzzle housings, coolant trim, warning bands) intensifying the shared amber language.`
- **Special:** `CLASS=SPECIAL: utilitarian non-combatant frame, sensor masts, optics and antennae, no heavy weaponry, steel-teal #4a9eb0 as the unit's signature accent channel (scanner lenses, data-link trim) over muted amber stencils.`

## TIER LINE (append per tier)

- **Tier 1:** `TIER=1: compact, lightly-built, fewer panels, conscript-grade hardware, slightly worn.`
- **Tier 2:** `TIER=2: mid-weight, more armor segmentation, refined hardware, mission-marked.`
- **Tier 3:** `TIER=3: massive elite endgame hardware, dense greebling, layered armor, command-grade finish, imposing scale.`

---

# THE 16 UNITS

## 🟦 MOBILE class (cyan `#38bdf8`)

**Vanguard Breaker** — *T1 mobile striker*
```
UNIT: "Vanguard Breaker" — a fast single-pilot light strike skimmer, open-frame
agile assault bike/walker hybrid, twin forward lances, glass-fragile exposed
cockpit, built for speed not survival. Cheap conscript opener. (Class=Mobile, Tier=1)
```

**Wraith Skimmer** — *T2 mobile raider, high carry*
```
UNIT: "Wraith Skimmer" — a low stealth hovercraft raider, flat angular ground-
hugging hull, broad cargo/loot panniers, muffled hover-fans, hunched aggressive
profile, matte radar-absorbent plating. A thief, not a tank. (Class=Mobile, Tier=2)
```

**Aegis Skirmisher** — *T2 mobile ANVIL (defensive)*
```
UNIT: "Aegis Skirmisher" — the mobile-class defender: a fast interceptor with a
deployable forward barrier shield, reinforced front plate, planted-but-mobile
stance, defensive bulwark on a hover chassis. Visibly tougher and broader than the
striker skimmers — reads as a wall that can move. (Class=Mobile, Tier=2)
```

**Phantom Lance** — *T2 mobile raider striker, best carry of tier*
```
UNIT: "Phantom Lance" — a razor-thin high-speed lance-tipped raider, swept dagger
silhouette, oversized rear thrusters, large slung loot containers, blurred-motion
aggressive forward rake. Strike-and-withdraw glass cannon. (Class=Mobile, Tier=2)
```

**Void Stalker** — *T3 mobile striker, FASTEST unit in game*
```
UNIT: "Void Stalker" — the fastest unit in the roster: an elite predatory strike
craft, sleek arrowhead hull, quad afterburner thrusters, retractable energy lances,
menacing apex-hunter silhouette, command-grade dark finish. Endgame mobile half,
pairs with the Annihilator. (Class=Mobile, Tier=3)
```

## 🔩 ARMOR class (steel-blue `#7c93b3`)

**Assault Trooper** — *T1 armor ANVIL, cheapest garrison*
```
UNIT: "Assault Trooper" — heavy armored frontline infantry exo-suit, thick riveted
chest plate, full helmet with steel-blue visor slit, wide braced stance, ballistic
shield slung on arm, durable conscript-grade. Holds the line, barely attacks.
(Class=Armor, Tier=1)
```

**Bulwark Guard** — *T2 armor ANVIL, mid-game anchor*
```
UNIT: "Bulwark Guard" — a massive armored sentinel in fortress-plate exo-armor,
tower-shield built into the left arm, hunched immovable bracing posture, layered
overlapping plates, minimal weaponry. The wall of a mid-game garrison.
(Class=Armor, Tier=2)
```

**Siege Mech** — *T3 armor ANVIL, "the great wall"*
```
UNIT: "Siege Mech" — a towering bipedal armored fortress-walker, enormous layered
ablative plating, squat planted hydraulic legs, a single heavy short-range cannon,
hull like a mobile bunker, slow and immovable. The great wall of the endgame.
Imposing scale. (Class=Armor, Tier=3)
```

**Siege Colossus** — *T3 armor STRIKER, "the siege hammer", slowest unit*
```
UNIT: "Siege Colossus" — the siege hammer: a colossal elite armored assault-walker,
city-cracking forward ram/hammer arm, heavy siege cannon, dense battle-scarred
plate, deliberately ponderous immense slow profile, the largest silhouette in the
roster. Built to break fortresses. (Class=Armor, Tier=3)
```

## 🔥 FIRE class (amber `#f59e3d`)

**Sentinel Lancer** — *T1 fire striker, cheap opener*
```
UNIT: "Sentinel Lancer" — a light tracked/legged fire-support platform, single long
suppression beam-lance barrel, exposed coolant lines, minimal armor, lean conscript
emplacement-on-the-move. Cheap anti-mobile opener. (Class=Fire, Tier=1)
```

**Pyre Suppressor** — *T2 fire striker, pins mobile*
```
UNIT: "Pyre Suppressor" — an aggressive mid-game incendiary suppression platform,
multi-barrel flame/plasma projectors, prominent venting heat-sinks, blackened scorch
marks, hunched forward firing stance. High attack, fragile — keep it behind the
anvils. (Class=Fire, Tier=2)
```

**Arc Disruptor** — *T2 fire ANVIL (EMP), defensive*
```
UNIT: "Arc Disruptor" — the fire-class defender: a static-leaning EMP interceptor
emplacement, large dish/coil EMP emitter, heavy grounded base, reinforced defensive
housing, arcing capacitor banks (no glow — physical coils and contacts). Built to
hold the wall against mobile raiders. (Class=Fire, Tier=2)
```

**Plasma Turret** — *T3 fire ANVIL, STATIC emplacement, highest defense*
```
UNIT: "Plasma Turret" — a fully immobile heavy defensive emplacement bolted to a
fortified concrete-and-steel base, massive twin plasma cannons, thick bunker armor
skirt, no legs or wheels — permanently rooted. The heaviest anti-mobile anchor;
never leaves its nexus. (Class=Fire, Tier=3, STATIONARY — no propulsion of any kind)
```

**Annihilator Platform** — *T3 fire artillery STRIKER, highest attack in game*
```
UNIT: "Annihilator Platform" — top-end siege artillery: a huge tracked self-propelled
artillery platform, single colossal long-range cannon dominating the silhouette,
massive recoil bracing, ammunition gantries and loot panniers, command-grade elite
finish. Highest single-unit firepower in the game. Endgame fire half, pairs with the
Void Stalker. (Class=Fire, Tier=3)
```

## 🛰️ SPECIAL class (steel-teal `#4a9eb0` — these do NOT fight)

**Recon Operative** — *scout / intel*
```
UNIT: "Recon Operative" — a lightly-armed nimble reconnaissance drone-scout, tall
sensor mast, cluster of optics and scanning dishes, fold-out antennae, slim
unarmored utilitarian frame, steel-teal scanner lenses. An intel-gatherer, not a
fighter — no visible weapons. (Class=Special, Tier=1)
```

**Overseer** — *conquest / command unit, extremely high value*
```
UNIT: "Overseer" — a rare high-value command-and-control administrator unit: an
imposing tall hovering monolithic control-spire/sentinel, banks of authority
antennae and a single dominant central optic, austere bureaucratic-menacing
presence, dark command-grade plating with steel-teal authority trim and restrained
amber seals. It administers and conquers — it does NOT carry weapons. Reads as
expensive and singular. (Class=Special, Tier=3-grade finish)
```

---

# 🏛️ BUILDINGS

Buildings get a **different** master block — bigger, architectural, environmental,
with a hero camera. They should read as landmarks, not units. Each carries a subtle
color cue matching the class/role it serves; economy buildings stay neutral gunmetal.

# ███ BUILDING MASTER STYLE BLOCK ███

*Paste verbatim before every building's specific line.*

```
Industrial military sci-fi STRUCTURE for a hard sci-fi conquest strategy game —
a remarkable hero landmark building, isometric 3/4 architectural view, full
structure on a hexagonal alloy foundation pad, grounded with cast shadow.
Material language: massive brushed gunmetal and poured-alloy construction, exposed
structural trusses, riveted mega-panels, hazard stencils, industrial pipework,
scaffolding, vents and antennae — monumental, functional, lived-in, weathered, NEVER
glossy or ornamental. Flat cinematic key light from upper-left, soft ambient fill,
NO neon glow, NO magic FX, NO lens flare. Background: seamless dark gunmetal gradient
#161b22 to #08090c, faint blueprint grid, light volumetric haze, vignette — isolated
on the foundation pad, no terrain, no sky. Restrained amber #ff9e3d HUD-accent
detailing (status strips, warning chevrons, beacon lights, stencil signage) shared
across every building in the set for a unified faction language. Imposing scale cues
(tiny maintenance catwalks, hatches, ladders for human-scale reference). Semi-realistic
concrete-and-steel render, fine surface grain, sharp edges, ultra high detail, 4k,
neutral color grade.
```

## THE 13 BUILDINGS

**Command Core** — *central progression hub (the capital landmark)*
```
STRUCTURE: "Command Core" — the central command capital: a towering multi-tiered HQ
spire crowned with an amber-lit command beacon ring, radar arrays, banks of antennae,
a fortified bunker base, the tallest and most authoritative structure in the set.
Heavy amber HUD signage. The unmistakable heart of the base.
```

**Hangar Bay** — *mobile-class production (cyan cue)*
```
STRUCTURE: "Hangar Bay" — a wide low launch-and-assembly hangar with massive sliding
blast-doors, an open launch apron, fuel gantries, swept aerodynamic roofline echoing
the mobile units it builds, cyan #38bdf8 guidance-strip accents. Fast-craft factory.
```

**Plasma Forge** — *fire-class production (amber cue)*
```
STRUCTURE: "Plasma Forge" — a hulking weapons foundry bristling with smelter stacks,
vented heat-towers, coolant pipework and emitter test-rigs, scorched amber #f59e3d
heat-warning banding. Where fire-class weapons are forged.
```

**Armor Foundry** — *armor-class production (steel-blue cue)*
```
STRUCTURE: "Armor Foundry" — a massive blocky plate-stamping foundry, overhead gantry
cranes, stacks of raw armor plate, heavy press-housings, fortress-like squat profile,
steel-blue #7c93b3 trim. Where armor-class units are built.
```

**Life Support** — *population capacity (neutral, organic-industrial)*
```
STRUCTURE: "Life Support" — a clustered habitat-and-atmospherics complex: ringed
biodome housing pods, oxygen-scrubber towers, water reclamation tanks, connecting
pressurized walkways, faint green agri-glow inside sealed windows. Houses the
population. Neutral gunmetal with amber service signage.
```

**Storage Vault** — *resource cap (neutral, fortified)*
```
STRUCTURE: "Storage Vault" — a heavily fortified bunkered depot: rows of armored
silos and sealed vault-doors, blast-resistant walls, loading gantries, stacked cargo
containers, a thick-walled hardened look. Guards the stockpile. Neutral gunmetal,
amber hazard stencils.
```

**Biomass Farm** — *biomass production (green-tinged)*
```
STRUCTURE: "Biomass Farm" — an industrial agri-processing plant: rows of sealed
hydroponic growth-vats, bioreactor tanks, harvesting conveyors, a faint sickly-green
biomass tint behind reinforced glass, piping and fermentation towers. Produces
biomass. Gunmetal frame, amber control panels.
```

**Alloy Forge** — *alloy production (molten-metal tone)*
```
STRUCTURE: "Alloy Forge" — a smelting works: tall slag-stained foundry chimneys,
ladle gantries, molten-metal channels (physical, no magic glow), cooling-rack yards,
heavy industrial mass. Produces alloy. Gunmetal and rust, amber heat warnings.
```

**Ore Extractor** — *ore production (drilling rig)*
```
STRUCTURE: "Ore Extractor" — a colossal mining derrick driven into the foundation
pad: a central drill-tower, spoil conveyors, ore-hoppers, hydraulic boring rig,
debris and tailings around the base. Extracts ore. Gunmetal, amber rig-warning lights.
```

**Shield Grid** — *defensive multiplier (steel-teal cue)*
```
STRUCTURE: "Shield Grid" — a ring of tall shield-projector pylons around a central
power-conditioning core, heavy cabling, capacitor banks, hardened defensive housing,
steel-teal #4a9eb0 projector accents (physical emitters, no glowing dome). Multiplies
the base's defense. Reads as protective infrastructure.
```

**Targeting Core** — *counter amplifier + elite unlocks (amber, aggressive)*
```
STRUCTURE: "Targeting Core" — a fortified fire-control and weapons-tuning complex:
armored sensor-and-targeting masts, tracking radar dishes, weapon test-ranges,
ammunition magazines, a hardened ballistics-computation bunker, aggressive militarized
profile, strong amber #ff9e3d combat signage. Sharpens your attacks (class-counter
amplifier). The war-tech building.
```

**Stealth Array** — *concealment / hidden vault (dark, low-profile)*
```
STRUCTURE: "Stealth Array" — a low, dark, radar-absorbent facility half-sunk into its
pad: angular faceted stealth panels, phased-array sensor masts, a concealed
sub-surface vault hatch, deliberately matte and shadowed, minimal lighting. Hides
resources and intercepts scouts. The most muted, secretive structure in the set.
```

---

## Quick reference — roster map

### Troops (16)
| Unit | Class | Role | Tier |
|---|---|---|---|
| Vanguard Breaker | Mobile | Striker | 1 |
| Wraith Skimmer | Mobile | Raider striker | 2 |
| Aegis Skirmisher | Mobile | **Anvil** | 2 |
| Phantom Lance | Mobile | Raider striker | 2 |
| Void Stalker | Mobile | Striker (fastest) | 3 |
| Assault Trooper | Armor | **Anvil** | 1 |
| Bulwark Guard | Armor | **Anvil** | 2 |
| Siege Mech | Armor | **Anvil** (great wall) | 3 |
| Siege Colossus | Armor | Striker (siege hammer) | 3 |
| Sentinel Lancer | Fire | Striker | 1 |
| Pyre Suppressor | Fire | Striker | 2 |
| Arc Disruptor | Fire | **Anvil** (EMP) | 2 |
| Plasma Turret | Fire | **Anvil** (static) | 3 |
| Annihilator Platform | Fire | Artillery striker (highest atk) | 3 |
| Recon Operative | Special | Scout | — |
| Overseer | Special | Conquest | — |

### Buildings (13)
| Building | Serves / role | Color cue |
|---|---|---|
| Command Core | Progression hub (capital) | amber |
| Hangar Bay | Mobile production | cyan |
| Plasma Forge | Fire production | amber |
| Armor Foundry | Armor production | steel-blue |
| Life Support | Population cap | green-neutral |
| Storage Vault | Resource cap | neutral |
| Biomass Farm | Biomass production | green |
| Alloy Forge | Alloy production | molten/neutral |
| Ore Extractor | Ore production | neutral |
| Shield Grid | Defense multiplier | steel-teal |
| Targeting Core | Counter amplifier + unlocks | amber |
| Stealth Array | Concealment / hidden vault | dark/muted |
