# Vexara — Combat Balance & Playtest Plan (v0.22)

**Status:** authoritative for the v0.22 symmetric-triangle combat rework.
This doc supersedes the combat/stat sections of [TROOPS.md](./TROOPS.md),
which predates the rework and is kept only as a historical reference.

**Source of truth for numbers:** [`utils/combatMath.ts`](./utils/combatMath.ts)
(`TROOP_STATS`, `CLASS_COUNTERS`, `DEF_COUNTER_*`) and
[`utils/combat.ts`](./utils/combat.ts) (`resolveCombat`). This doc explains the
*intent*; the code is the *fact*. The client mirrors
([`client/src/utils/combatSim.ts`](../client/src/utils/combatSim.ts) and the
codex in [`client/src/data/gameDocs.ts`](../client/src/data/gameDocs.ts)) must
move in the same commit as any change here.

---

## 1. The model

### Symmetric counter triangle

Mobile → beats Armor → beats Fire → beats Mobile. Special (Recon, Overseer) is
neutral everywhere. **The counter applies to BOTH attack and defense** — this is
the core of the v0.22 rework. Before v0.22 only attack was class-weighted;
defense was raw, so the best garrison was always "stack the highest-defense
unit." Now:

- **Attack power** = Σ (unit attack × count × counter-vs-defender-composition).
  Advantage ×1.35, disadvantage ×0.75, amplified by Armory (+1.5%/level, cap
  +30%).
- **Defense power** = Σ (unit defense × count × counter-vs-attacker-composition),
  then × Shield Grid (1 + 0.015 × level). Advantage ×1.25, disadvantage ×0.80.
  Defense does **not** take the Armory bonus (Armory is an offensive building).

The defensive spread (1.25/0.80) is deliberately milder than the attack spread
(1.35/0.75) so the attacker keeps a small initiative and a defender can't win a
mirror just by sitting still. These four numbers
(`DEF_COUNTER_ADVANTAGE`/`DEF_COUNTER_DISADVANTAGE` and the two attack values in
`CLASS_COUNTERS`) are the primary balance knobs.

### Strikers and anvils

Every class has both:

- **Strikers** — high attack, low defense. Offensive units. Send them on
  attacks, where their attack stat and their counter both pay off.
- **Anvils** — high defense, low attack. Garrison units. The triangle amplifies
  their defense against the class they counter.

| Class  | Strikers                                          | Anvils                                  |
|--------|---------------------------------------------------|-----------------------------------------|
| Mobile | Vanguard Breaker, Wraith Skimmer, Phantom Lance, Void Stalker | Aegis Skirmisher              |
| Armor  | Siege Colossus                                    | Assault Trooper, Bulwark Guard, Siege Mech |
| Fire   | Sentinel Lancer, Pyre Suppressor, Annihilator Platform | Arc Disruptor (EMP), Plasma Turret  |

A glass-cannon striker left on defense contributes only its tiny defense stat
**and** can be class-countered on top of that, so a striker garrison folds fast.
Garrison with anvils, attack with strikers, scout so you bring the counter.

**Stationing (support + transfer) is anvils-only:** Assault Trooper, Bulwark
Guard, Siege Mech, Aegis Skirmisher, Arc Disruptor. (`STATIONABLE_TROOPS` in
`utils/gameConstants.ts`.)

### Tiering

Attack-per-population **and** attack-per-resource both rise with tier, so massing
the cheapest unit is never the optimal army. T1 strikers were intentionally
trimmed in v0.22 (Vanguard Breaker 40→32, Sentinel Lancer 34→28) so teching up
beats spamming openers even in the resource-rich early game — see §3.

---

## 2. Design invariants (validated against live `combatMath.ts`)

These are the properties the tuning must preserve. Re-run a sim against the
exported functions after any stat/knob change; if one breaks, the change is
wrong.

1. **Every striker loses to its proper class anvil at equal resources** — clean
   rock-paper-scissors (Void Stalker→Plasma Turret r≈0.54, Annihilator→Siege
   Mech r≈0.51, Siege Colossus→Aegis r≈0.50 at 30k res / shield 8).
2. **A focused counter beats a rainbow** — committing to the class that counters
   the defender's majority strictly out-performs a 3-class blend. The triangle
   is not diluted into raw stats.
3. **No unbreakable garrison** — on the population yardstick, every defense (mono
   or mixed) falls to the correct counter at a fair cost. Mixed defenses are
   *sturdier* (good depth) but not invincible.
4. **Turtles are crackable by committed correct force** — a scouted,
   correctly-countered attack at ~1.5× the turtle's resource value cracks it
   (r≈0.63, a real but survivable cost); 2× is decisive; blind/wrong-class
   attacks bounce regardless of size.
5. **Tier progression holds** — T1 atk-per-1k-res sits clearly below T2/T3
   (post-trim: ~46–50 vs 53–63).

Server tests covering the mechanic live in
[`test/economy-combat.test.js`](./test/economy-combat.test.js) (symmetric-defense
amplification, anvil-vs-striker role separation, empty-attacker = raw defense).

---

## 3. Known trade-offs / open questions

Honest record of where the current numbers are a judgment call rather than a
proven optimum. These are the first things to revisit if playtest data is
unflattering.

- **Defensive spread (1.25/0.80)** is tuned by feel, not derived. Tighter → more
  attacker initiative; wider → more reward for the right garrison.
- **Role flips** (Sentinel Lancer → striker, Arc Disruptor → fire anvil) change
  muscle memory for existing players. They fill a real structural gap (the Fire
  class had no non-static mobile-stopper) but a different approach would add a
  *new* fire anvil instead of repurposing one.
- **Shield Grid 2%→1.5%** was trimmed so a high-shield wall can't stack into
  invincibility on top of class-amplified defense. One-line revert if defense
  ends up too weak in play.
- **Training time is the real bottleneck — not resources.** A mid-late nexus
  gathers a turtle's worth of resources in ~1 hour but needs ~50+ hours of train
  queue (before class-building speedups / parallel chains) to rebuild it. A
  more-decisive triangle converts combat losses into train-time debt faster,
  which **could** make the game swingier. We deliberately did **not** touch train
  times in this pass — they're a separate anti-snowball system — but this is the
  #1 interaction to watch (see §4).

---

## 4. Playtest plan

Simulation confirms internal consistency, not fun or real-world pacing. Before
treating v0.22 combat as settled, instrument and watch these four signals.

| # | Signal | What to measure | Healthy | Concerning |
|---|--------|-----------------|---------|------------|
| 1 | **Comp diversity** | Distribution of built units by class over a galaxy's lifetime | All three classes used; both strikers and anvils appear | One class >60% of all combat units, or anvils never built |
| 2 | **Conquest rate** | Nexuses changing hands per active war per week | Conquests happen; sieges resolve | Stalemate (almost no ownership changes despite active attacks) |
| 3 | **Post-loss recovery** | Wall-clock time from "army wiped" to "fielding a combat army again" | Recoverable within a play session or two | Multi-day dead time → train-time-debt is too punishing |
| 4 | **First-strike win-rate** | Attacker win-rate in approximately-mirror matchups | Near 50–60% (slight initiative) | >70% → attacker initiative too strong; trim `DEF_COUNTER_*` gap |

**Revert / adjust triggers**

- Defense win-rate craters (defenders almost always lose) → raise Shield Grid
  back toward 0.02 and/or widen the defensive counter spread.
- One garrison class dominates (signal 1) → that class's anvil is over-tuned;
  trim its defense or the defensive advantage multiplier.
- Conquest stalemates (signal 2) → revisit control-drain values or the
  turtle-crack threshold (attack-side stats), **not** train times first.
- Recovery dead-time too long (signal 3) → this is the train-time interaction;
  consider class-building speedups or control-regen tuning before touching combat
  stats again.

**Test matchups to seed manually** (don't wait for organic data):
mono-armor turtle vs mobile attacker; rainbow attacker vs each mono defense;
T1-spam vs T3 garrison at equal population; support-stacked multi-nexus defense
vs a solo attacker (the coalition-vs-solo re-turtle case).

---

_Last updated: June 2026 (v0.22 combat rework). Keep this doc and the code knobs
in §1 in lockstep._
