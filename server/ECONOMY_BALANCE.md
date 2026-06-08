# Vexara — Economy & Progression Balance (v0.22)

**Status:** _implemented. Both combat-overlap items closed — striker-elite ratios
resolved by softening (§8.2), anvil re-pricing dropped (§8.1)._ Companion to
[COMBAT_BALANCE.md](./COMBAT_BALANCE.md). Where that doc is authoritative for the
combat triangle, this one is authoritative for **resource generation, storage,
population, building progression, and unit resource-cost** — every economic
surface that combat deliberately did **not** touch.

**Source of truth for numbers:** [`utils/economy.ts`](./utils/economy.ts)
(`getResourceProduction`, `getMaxStorage`, `calculatePoints`),
[`utils/gameConstants.ts`](./utils/gameConstants.ts) (`BUILDING_COSTS`,
`TROOP_COSTS`, `COST_SCALING`, building per-level helpers) and
[`utils/population.ts`](./utils/population.ts). The client mirrors
([`client/src/realtime/economy.shared.ts`](../client/src/realtime/economy.shared.ts),
[`client/src/realtime/gameConstants.shared.ts`](../client/src/realtime/gameConstants.shared.ts))
and the codex ([`client/src/data/gameDocs.ts`](../client/src/data/gameDocs.ts))
must move in the same commit as any change here. This doc explains the *intent*;
the code is the *fact*.

**Hard boundary with combat:** this rework changes only the **economic** axis. It
does **not** touch any of these combat-locked stat surfaces: `TROOP_STATS`
(attack/defense/speed/carry), unit `time` (train time), the counter triangle,
loss/loot math, Shield Grid %, or Armory %. Those belong to
[COMBAT_BALANCE.md](./COMBAT_BALANCE.md) and stay frozen.

Two surfaces are **shared** between economy and combat and may move here, each
under its own guard:

- **Unit resource cost** (biomass/alloy/ore) — re-tuned *to reinforce* the combat
  tier invariant, never to alter a stat (§3.4). Does not feed any combat sim.
- **Unit population cost** — population is the *denominator* every COMBAT_BALANCE
  §2 invariant is measured in (atk-per-pop, turtle-crack thresholds, army size).
  Any population change therefore **must pass a re-run of the COMBAT_BALANCE §2
  sims before it ships** (§3.6, §5.6). The audit (§3.6) found pop is already
  well-shaped — only a single anomaly is proposed for change.

---

## 1. The diagnosis (why a rework at all)

Combat is impeccable. The economy underneath it had three structural faults,
each measured against the live code, not guessed:

### Fault A — resources are a non-binding constraint at the high end

COMBAT_BALANCE §3 already names this: *"Training time is the real bottleneck —
not resources… a mid-late nexus gathers a turtle's worth of resources in ~1 hour
but needs ~50+ hours of train queue."* Measured: a Lv15 economy funded a full
endgame army in ~96h of gathering against ~1,492h of train queue. Resources were
**decorative** past the early game. Every farm you upgraded improved the thing
that wasn't the constraint. A "best of the century" RTS needs **two** binding
economic axes (resources *and* time), not one with a vestigial twin.

### Fault B — storage out-scales production, so one resource building is a decoy

Production grew `1.32^L`; storage grew `1.5^L`. The ratio diverges with level, so
time-to-fill ran away from 2.8h (Lv1) to **31.9h (Lv20)**. Consequence: Storage
Vault was a strictly dominant building and Farms could never keep vaults full
from output alone. Two buildings, one of them a trap.

### Fault C — the cost curve fights the combat tier invariant

COMBAT_BALANCE §2.5 fought to make T1 atk-per-resource sit *below* T2/T3. But by
**resource** cost (not the population yardstick combat measures), the flagship
elite **Siege Colossus was the least resource-efficient striker in the game
(41.7 atk/1k-res) — below a T1 Sentinel Lancer (56.0).** Massing cheap units was
resource-cheaper than teching to the hammer; only the population cap rescued the
design. The cost curve worked *against* combat instead of with it.

---

## 2. The model (what "remarkable" means here)

### Two binding axes, by design

- **Time axis** (combat-owned, frozen): train-time and build-time gate *how fast*
  you can field/rebuild. Anti-snowball. Untouched.
- **Resource axis** (this rework): resources gate *how much* you can commit at
  once and *how deep* a war chest you can build. Re-tuned to bind at the high end
  so the gather/raid loop matters end-to-end.

A decision is "remarkable" when both axes are live: you choose *what* to spend
limited resources on **and** *what* to spend limited queue-time on, and the two
choices interact. That is the texture combat has and the economy lacked.

### Three pillars

1. **Re-tuned curves** — production, storage, and unit resource-cost re-shaped so
   resources bind and the tier ladder is monotonic by resource-efficiency.
2. **Progression texture** — each building level is a *spend with a stated
   payoff*, surfaced in the codex; milestone levels are unlock *moments*, not
   silent taxes.
3. **Raiding stays the pressure valve** — storage still out-paces production by a
   bounded margin, so a full vault is always partly raid-fed. We narrow the gap;
   we do **not** close it (closing it would kill the raid economy combat depends
   on).

---

## 3. Proposed numbers

All values modelled before being written here (validation in §6). Splits across
biomass/alloy/ore keep each unit/building's current *ratio*; only totals move.

### 3.1 Resource production — growth `1.32 → 1.35`

`getResourceProduction`: `800 * GROWTH^(level-1) * typeMult * stormMult`.

| Farm Lv | Current (1.32) | Proposed (1.35) |
|--------:|---------------:|----------------:|
| 1  | 800       | 800       |
| 5  | 2,429     | 2,657     |
| 10 | 9,733     | 11,915    |
| 15 | 39,005    | 53,427    |
| 20 | 156,313   | 239,570   |

Base 800 unchanged (early game identical). The lift concentrates where the
resource axis needs to start binding — the mid-late window where it was inert.

**Why 1.35 and not higher (the history point):** an *earlier* build of the game
ran a flat `1.35` and players complained of **too much production**. That
complaint does **not** transfer to this rework, and the reason is the surrounding
system: back then storage ran away (`1.5^L`) and there was **no binding resource
sink**, so 1.35 production just piled into capped, partly-wasted vaults — "too
much" because nothing consumed it. This pass adds two real sinks (the storage
flatten in §3.2 and the unit-cost re-tune in §3.4), so 1.35 now *feeds* an economy
that consumes it. We also tested `1.36`: it overshoots invariant #2 (it drops the
elite-army gather at a Lv20 economy to ~12.4h, starting to re-trivialize the
resource axis), whereas `1.35` keeps it at ~14.3h and lands Lv20 fill-time right at
the ≤~15h bound (invariant #4). 1.35 is the disciplined ceiling, not a compromise.

### 3.2 Storage cap — growth `1.5 → 1.48`

`getMaxStorage`: `1500 * GROWTH^level * typeMult`. A small flatten, not a cut to
identity.

| Vault Lv | Current (1.5) | Proposed (1.48) |
|---------:|--------------:|----------------:|
| 1  | 2,250     | 2,219     |
| 10 | 86,498    | 73,300    |
| 15 | 656,841   | 525,000   |
| 20 | 4,987,885 | 3,710,000 |

### 3.3 The combined effect: bounded, near-flat fill-time

Time to fill the vault from empty at matching farm/vault level (prod 1.35 /
storage 1.48) — the single clearest health metric for the resource economy:

| Level | Current | Proposed |
|------:|--------:|---------:|
| 1  | 2.8h  | 2.8h  |
| 10 | 8.9h  | 6.3h  |
| 15 | 16.8h | 10.1h |
| 20 | **31.9h** | **15.9h** |

Runaway gap → bounded ~3–16h, with Lv20 sitting right at the ≤~15h target band.
Storage still leads production at every level (raiding still pays), but Farms are
now a real lever instead of a decoy, and late-game vaults are fillable within a
play session or two of active gathering.

### 3.4 Unit resource-cost re-tune (fixes Fault C)

**Stats, population, and train-time are NOT touched.** Only **striker**
biomass/alloy/ore totals move, to land atk-per-1k-resource in rising tier bands.
Splits keep each unit's current resource *ratio*. (Anvils were left at pre-rework
values — see the held-anvil note below.)

| Unit | Tier/role | atk | cur res → new res | cur eff → new eff |
|------|-----------|----:|------------------:|------------------:|
| Sentinel Lancer  | T1 fire striker  | 28  | 500 → 650   | 56.0 → 43.1 |
| Vanguard Breaker | T1 mobile striker| 32  | 700 → 700   | 45.7 → 45.7 |
| Pyre Suppressor  | T2 fire striker  | 80  | 1,300 → 1,500 | 61.5 → 53.3 |
| Wraith Skimmer   | T2 mobile striker| 105 | 1,875 → 1,950 | 56.0 → 53.8 |
| Phantom Lance    | T2 mobile raider | 125 | 2,250 → 2,350 | 55.6 → 53.2 |
| Void Stalker     | T3 mobile striker| 215 | 3,400 → 3,450 | 63.2 → 62.3 |
| Annihilator Plat.| T3 fire artillery| 360 | 6,750 → 6,400 | 53.3 → 56.3 |
| Siege Colossus   | T3 armor elite   | 300 | 7,200 → 6,200 | 41.7 → 48.4 |

Result for the **pure** strikers: **T1 (~43–46) < T2 (~53–54) < T3 (62.3 /
56.3)**, monotonic. **Siege Colossus is the deliberate exception at 48.4** — it
sits just under the pure-striker T2 line on *attack*-per-resource because it is a
*durable* striker (def 130 vs Void Stalker's 36): a chunk of its cost buys
survivability, not attack. On **combined (attack+defense)-per-resource it is
cleanly T3**, above every T2 (the test asserts this). Its cost was set at 6,200
(not the first 5,150 draft) specifically to restore the COMBAT_BALANCE §2.1
colossus→aegis ratio to ~0.50 (the 5,150 draft pushed it to 0.63); same softening
took Annihilator to 6,400. See §8.

The headline Fault C is fixed for every striker: **no elite is cheaper-per-attack
than a T1 opener** (Colossus 48.4 > Vanguard 45.7). Cheap-unit spam is now
resource-inefficient *as well as* population-inefficient — the cost curve reinforces
combat's tier invariant instead of fighting it.

**Anvil resource pricing (defense-per-resource) — ⛔ HELD FOR COMBAT-TEAM REVIEW,
NOT SHIPPED.** Anvils trade attack for defense, so atk/res is the wrong yardstick;
the *proposed* re-pricing put them on **def-per-1k-res** in monotonic tier bands
(the defensive mirror of the striker ladder), defense stats frozen, ratios
preserved. The proposed numbers were:

| Anvil | Tier | def | cur res → proposed | cur def/1k-res → proposed |
|-------|-----:|----:|-------------------:|--------------------------:|
| Assault Trooper | T1 | 30  | 650 → 400   | 46.2 → 75.0 |
| Aegis Skirmisher| T2 | 64  | 1,500 → 750 | 42.7 → 85.3 |
| Bulwark Guard   | T2 | 90  | 1,500 → 1,000 | 60.0 → 90.0 |
| Arc Disruptor   | T2 | 95  | 1,950 → 1,050 | 48.7 → 90.5 |
| Siege Mech      | T3 | 215 | 4,250 → 2,000 | 50.6 → 107.5 |
| Plasma Turret   | T3 | 340 | 5,200 → 3,050 | 65.4 → 111.5 |

**Why held:** the combat re-sim (§5.6) showed this cut moves the *canonical
equal-resource ratios COMBAT_BALANCE §2.1 documents* — anvils get cheaper, so you
field more per resource, so defense-per-resource strengthens (e.g.
voidStalker→plasmaTurret r≈0.54→0.30). Every directional invariant still held
(this is the *safe* direction per combat §4), but the magnitude shift lands inside
combat's documented equilibrium. **Decision: hand this to the combat team rather
than ship it in an economy PR.** The shipped roster keeps anvils at their
pre-rework values. See §7 handoff.

### 3.6 Population cost — senior audit + one proposed change

Population is the combat denominator, so it was audited against the same tier
ladders combat uses, **not** re-tuned wholesale. The finding is the good kind: the
combat team already shaped pop well. Full audit data below.

**Striker atk-per-pop ladder** (must rise T1 < T2 < T3, per COMBAT_BALANCE §2.5):

| Tier | Units (atk/pop) | Verdict |
|------|-----------------|---------|
| T1 | Sentinel 28, Vanguard 32 | ✅ |
| T2 | Wraith 35, Pyre 40, Phantom 42 | ✅ |
| T3 | **Colossus 60**, Void 72, Annihilator 90 | ⚠️ Colossus is the *weakest* T3 striker per-pop |

**Anvil def-per-pop ladder** (should also rise with tier):

| Tier | Units (def/pop) | Verdict |
|------|-----------------|---------|
| T1 | Assault 30 | ✅ |
| T2 | Aegis 32, Bulwark 45, Arc 48 | ✅ (Aegis low — see note) |
| T3 | Siege Mech 54, Plasma Turret 113 | ✅ |

**Findings:**

1. **Siege Colossus is mis-priced on BOTH axes (the only clear anomaly).** It was
   already the worst T3 striker by *resource*-efficiency (Fault C, fixed in §3.4)
   **and** it is the worst T3 striker by *population*-efficiency (atk/pop 60, below
   Void Stalker's 72). The elite armor hammer is pop-taxed into a niche. **Change:
   `population 5 → 4`.** This lifts atk/pop to 75 (above Void Stalker, below
   Annihilator — coherent placement for the heaviest single unit) and lets it be
   massed as a real elite line rather than a pop-starved curiosity. **GATE PASSED
   (§5.6):** combat resolution math is *pop-blind* — population only drives housing
   (`computeNexusPopulation`), never engagement outcome (`combatMath.ts` reads no
   population). The Colossus proper-counter matchup (vs Aegis mobile anvil) still
   holds the §2.1 invariant (r=0.63, anvil wins). **Shipped.**

2. **Aegis Skirmisher def/pop (32) sits at T1 level despite being T2** — but this
   reads as *deliberate*: the mobile anvil trades raw wall-strength for speed and
   the ability to intercept/redeploy (its design note in `gameDocs.ts` says exactly
   this). **No change**; recommend a one-line acknowledgement in COMBAT_BALANCE so
   it's recorded as intentional, not an oversight.

3. **Every other unit's pop cost holds both ladders.** No change. A senior audit
   that finds the existing work is sound is a feature, not a null result — it means
   we change one number with confidence instead of churning fifteen.

### 3.5 Progression texture (Pillar 2)

Pure **codex/feedback** changes — no component changes, no combat math touched
(building `impact` strings are already rendered as a bullet list in
`app/buildings/page.tsx` and the Codex, so this is content-only).

**SHIPPED — both text pieces:**

- **Every building level states its delta in the codex.** Each `impact` array in
  `gameDocs.ts` now leads with the per-level growth multiplier *and* a worked
  example showing the concrete jump (e.g. Farms: "Lv10 = 11,914/h, +3,089/h over
  Lv9; Lv20 = 239,570/h, +62,111/h over Lv19"). A level-up reads as a
  spend-for-payoff, not an opaque tax. Numbers verified against the live formulas.
- **Milestone levels read as unlock moments.** Added "⚡ unlocks ___" lines naming
  what each gate grants: the three class buildings list their per-level unit
  unlocks (verified against server `TROOP_REQUIREMENTS`), Armory lists Void
  Stalker / Plasma Turret / Siege Colossus, Command Core lists its Special-unit and
  tier gates, Life Support / Farms note their scaling-milestone gates.

**NOT shipped (flagged, separate decision):**

- **Resource-building specialization** — a late milestone letting a Farm trade some
  output for a cross-resource trickle. Held: it changes economy math and stacks with
  the derelict/storm multipliers, so it needs its own modelling pass, not a text
  pass. User confirmed "text pieces only" for this round.

The macro-curve changes (§3.1–3.4) were the load-bearing part; §3.5 is the shipped
polish layer on top.

---

## 4. Design invariants (must hold after any tuning)

Re-derive these (or re-run §6's model) after any number change. If one breaks, the
change is wrong.

1. **Resources bind at the high end** — fielding a full-population *elite* army
   costs a meaningful multi-hour gather at a maxed economy (modelled ~12–58h
   depending on tech), so resources are a real co-constraint, not decoration.
2. **Train-time stays a co-bottleneck** — the resource lift must **not** make
   resources so cheap that train-time is the *only* gate again. Both axes bind.
   (This is the mirror risk of Fault A; over-correcting recreates it.)
3. **Storage still leads production** — fill-time > 1× at every level, so a full
   vault is always partly raid-fed. Raiding stays rewarding (combat depends on it).
4. **Fill-time is bounded** — no runaway; max-level fill stays in a single-session
   band (target ≤ ~15h), so late economies aren't permanently starved.
5. **Resource-efficiency rises by tier** — T1 atk/1k-res < T2 < T3 for the *pure*
   strikers; **no elite unit is cheaper-per-attack than a T1 opener** (the actual
   Fault C). Siege Colossus is the one allowed exception on pure atk/res (durable
   striker — it's T3 on combined attack+defense/res). This is the economic half of
   COMBAT_BALANCE §2.5.
6. **Early game is unchanged** — base production (800), base storage (1500), base
   pop (100), and the spawn experience are identical. The rework lands in mid-late
   levels where the faults lived.
7. **Combat surfaces are byte-identical** — `TROOP_STATS`, unit pop, unit train
   time, counter triangle, Shield Grid %, Armory %, loss/loot math: untouched.
   `git diff` on `combatMath.ts`/`combat.ts` is empty.

Server tests that must stay green: `economy-combat.test.js` (overseer cost,
life-support cost rescale, `calculatePoints`, loot/loss math),
`population.test.js`, `stealth-vault.test.js`. New economy assertions are added in
§5's plan, not retrofitted onto combat tests.

---

## 5. Implementation plan (lockstep, mirrors how combat shipped)

1. **Server constants** — `economy.ts` (production/storage growth), `gameConstants.ts`
   (`TROOP_COSTS` resource totals + the single Colossus `population` change from
   §3.6). The Life Support population *formula* (`population.ts`) is untouched —
   only one unit's `population` field moves.
2. **Client mirrors** — `economy.shared.ts`, `gameConstants.shared.ts` byte-for-byte
   matching the server, same commit.
3. **Codex** — `gameDocs.ts`: updated cost numbers, production/storage formulas,
   and the per-level "impact" strings (Pillar 2).
4. **Tests** — extend `economy-combat.test.js` (or a new `economy-curves.test.js`)
   with the §4 invariants as executable assertions: monotonic tier efficiency,
   bounded fill-time, storage-leads-production, combat-surface-unchanged guard.
5. **Patch notes + codex changelog** — player-facing summary (per project
   convention: patch notes always accompany balance changes).
6. **Re-run the combat sims** from COMBAT_BALANCE §2 — **a hard gate. RESULT:**
   - Colossus pop 5→4: **PASS** (resolution is pop-blind; proper-counter matchup
     holds). Shipped.
   - Striker resource re-tune: **PASS on the binding invariant** — every striker
     still loses to its *proper* class anvil at equal resources (r<1 across all
     counter-pairs). Two documented r-*values* drifted ~+0.13 (annihilator→siegeMech
     0.51→0.64, colossus→aegis 0.50→0.63) because cheaper elites mean more per
     resource; anvil still wins, fight is closer. Logged for the combat-team handoff
     (§7) alongside the held anvil change, since both touch combat's documented
     numbers.
   - Anvil resource re-tune: **HELD** — shifts the §2.1 ratios materially; handed to
     combat team, NOT shipped (§3.4, §7).

---

## 6. Validation performed (final)

- **Fill-time** flattened from 2.8→31.9h to 2.8→15.9h across Lv1–20 (§3.3). ✓
- **Resource-tier efficiency** (pure strikers) rises by tier: T1 ~43–46 < T2
  ~53–54 < T3 (Void 62.3 / Annihilator 56.3); Siege Colossus 48.4 is the
  documented durable-striker exception (T3 on combined atk+def/res). No elite is
  cheaper-per-attack than a T1 (§3.4). ✓
- **Population-tier ladders audited** (§3.6): striker atk/pop and anvil def/pop both
  rise with tier; one anomaly (Colossus) fixed (pop 5→4). ✓
- **Both axes bind:** full elite army (Siege Colossus) costs ~10.2M res → ~64h
  gather at a Lv15 economy / ~14.3h at Lv20 (prod 1.35), while train-time stays the
  per-chain co-bottleneck. Resources are a genuine gate again without erasing time.
  ✓
- **Combat re-sim (§5.6):** Colossus pop change PASS; striker re-tune PASS on the
  binding anvil-holds invariant; anvil re-tune HELD for combat team.
- **Server/client mirror parity:** `TROOP_COSTS`, production growth, storage growth
  verified byte-identical server↔client; codex (`gameDocs.ts`) costs verified ==
  constants.

Shipped this pass: production 1.35, storage 1.48, striker resource re-tune, Colossus
pop 5→4. **Not shipped (held for combat team):** anvil resource re-tune (§7).

---

## 7. Open questions / honest trade-offs

- **Production 1.35 is the disciplined ceiling.** Higher (we tested 1.36) starts
  re-trivializing the resource axis at the top end (invariant 2); lower lets Fault A
  creep back. 1.35 also respects the historical "too much production" complaint
  while noting *why* that complaint no longer applies (§3.1: the old build had no
  resource sink). First knob to revisit on playtest data — and if anything, the
  pressure from history is to test 1.34/1.33, not to go higher.
- **Storage flatten (1.5→1.48) is mild on purpose.** It mostly serves the
  fill-time invariant; if late vaults feel too small as war chests, raise toward
  1.49 rather than reverting production.
- **Pillar 2 (texture) is deliberately deferred behind the curves.** Shipping the
  math first lets us measure the curve change cleanly before layering perks that
  would muddy the signal.

---

## 8. Combat-overlap items: one RESOLVED, one DROPPED

Two items in this rework touched the **canonical equal-resource ratios documented
in COMBAT_BALANCE §2.1**. Both are now closed (no open handoff remains); recorded
here so the reasoning survives.

**1. Anvil resource re-pricing — DROPPED.** A proposed def-per-resource re-pricing
(§3.4) would have made anvils cheaper. Modelling proved anvil cost and the §2.1
ratio trade off directly — even a modest cut (plasmaTurret 5,200→4,800) crashes
voidStalker→plasmaTurret from r≈0.54 to 0.45; the full cut hit 0.30. There is **no
version that meaningfully cuts anvils while preserving combat's documented
equilibrium**, and anvils were not a fault (they passed both the def/pop and
resource-saturation checks). Dropped entirely; anvils ship at pre-rework values.

**2. Striker-elite cost cut side-effect — RESOLVED (softened).** The striker
re-tune (needed for Fault C) first cut Annihilator 6750→6000 and Colossus
7200→5150, which nudged two §2.1 ratios up ~+0.13 (annihilator→siegeMech 0.51→0.64,
colossus→aegis 0.50→0.63). Rather than edit COMBAT_BALANCE's numbers, we found the
sweet spot that satisfies **both** invariants and applied it: **Annihilator 6,400**
(eff 56.3, Fault C still fixed; r back to 0.51) and **Colossus 6,200** (eff 48.4,
Fault C still fixed; r back to **0.50**). The §2.1 canonical ratios are now restored
to their documented values exactly (0.54 / 0.51 / 0.50) — **no COMBAT_BALANCE edit
needed.** The only residual is that Colossus's atk/res (48.4) now sits just under
the pure-striker T2s; that's the documented durable-striker exception (§3.4) and is
backed by its combined-stat and def/pop placement. Repro: `node --import tsx/esm`
sim against `combatMath.js` at 30k res / shield 8.

COMBAT_BALANCE.md was **not** edited by this economy pass.

Either way, **COMBAT_BALANCE.md is the combat team's source of truth and was not
edited by this economy pass** — these are requests, not unilateral changes.

---

_v0.22 economy overhaul, June 2026. Economy axis implemented; §8 items handed to
combat. Keep this doc and the code constants in §3 in lockstep, exactly as
COMBAT_BALANCE.md and its knobs are kept._
