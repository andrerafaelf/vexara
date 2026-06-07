# Vexara — Coordinated Assault Design

**Status:** design contract, pre-implementation. Authoritative for the
attacker-concentration mechanic that addresses the offense/defense asymmetry
documented below. Companion to [COMBAT_BALANCE.md](./COMBAT_BALANCE.md), which
governs the per-battle math; this doc governs how multiple attacker forces are
*grouped* before a battle is resolved.

**Source of truth for numbers (once built):** the merged-resolution path in
[`utils/combat.ts`](./utils/combat.ts). This doc explains the *intent*; the
code will be the *fact*.

---

## 1. The problem (data-confirmed)

In a conquest game the defender can *concentrate force* and the attacker
cannot. This is structural, not a tuning issue:

- **Defense aggregates.** `resolveCombat` merges the garrison with **every**
  stationed support transfer (and in-flight support that lands first) into one
  `mergedDefenderForce`. N allies defending = one combined wall.
- **Offense does not.** `processArrivedAttacks` resolves each `Attack` row
  **individually and sequentially**. N attacking waves = N separate duels, each
  against the *full* merged wall. There is no combined-arms attack.
- **Attrition doesn't rescue it.** Overseer control drain requires
  `attackerWins` per wave (`overseerCanAct = attackerWins && ...`). Waves that
  can't individually crack the wall don't drain control — they feed it one army
  at a time.

### The coordination tools already exist — the engine ignores them

Vexara already ships two surfaces where players declare coordinated offense:

- **WavePlanner** (solo): one player schedules multiple waves from their own
  nexuses against one target, synchronized to a shared arrival. Persisted as
  `ScheduledAttack` rows that fire into `Attack` rows at launch time.
- **WarRoom** (multi-player): multiple players claim `WarOperationSlot`s under
  one `WarOperation` against one target, with a shared `arrivalAt` and an
  explicit `planning → locked → launched` lifecycle. Each slot fires an
  `Attack` row tagged with `sentAttackId`.

Both surfaces fully capture the coordination *intent* in the schema. The
engine then **throws that intent away** at resolution time — every resulting
`Attack` row enters `processArrivedAttacks` as if it were a solo strike, with
no awareness it belongs to a declared coordination. This is the bug.

### What the live data showed (alpha 0.22, ~2 weeks)

Two read-only queries against `Attack` / `TroopTransfer`:

1. **Players already coordinate offense, heavily, and get nothing for it.**
   Same-target waves landing in the same minute are common: one nexus took
   **8 waves in a single minute**, others took 7, 5, and many 3–4 wave
   landings across the alpha. Every one fought the wall *individually and
   sequentially*. Players are doing the hard coordination work — through
   WavePlanner *and* WarRoom — and the engine discards it.
2. **The turtle is held by REACTIVE support, not pre-stationed walls.**
   `support_pre_stationed` was ~0 across ~100 resolved attacks. The clearest
   turtle case (nexus 232) was defended by **5 support waves that landed
   *inside* the attacker's travel window** — the defender saw the committed,
   visible attack and flew the wall in to land just before it.

**Conclusion:** the fix is to honor the coordination intent the schema already
records. Waves that came from a declared coordination (WavePlanner plan or
WarRoom operation) merge at resolution. Loose same-minute dogpiles that did
*not* go through a coordination object stay sequential — coordination must be
deliberate, not accidental.

---

## 2. The mechanic — honor declared coordination at resolution

**The rule, in one sentence:** when multiple `Attack` rows landing on the same
target belong to the same declared coordination — a WavePlanner plan or a
launched WarOperation — they resolve as ONE combat, not N.

| Property              | Defender (today, unchanged) | Attacker coordination (new)                  |
|-----------------------|-----------------------------|----------------------------------------------|
| Force concentration   | Automatic (support merges)  | **Opt-in** — must use WavePlanner or WarRoom |
| Visibility            | Sees incoming ETAs          | **Defender sees the multi-player coordination** (per-wave ETAs unchanged for solo) |
| Commitment            | Survivors recall freely     | **Troops lock once coordination locks**      |
| Resolution            | One merged combat           | **All waves in the coordination resolve as ONE combat** |

### Chosen rules (decided 2026-06-07)

- **Opt-in only.** Merging happens *only* inside a declared coordination
  (WavePlanner plan or WarRoom op). Loose same-minute dogpiles outside these
  tools stay sequential. The skill of timing waves is preserved; the *payoff*
  is added.
- **Both surfaces, same rule.** Solo via WavePlanner and multi-player via
  WarRoom resolve under the same merge logic. A solo three-wave plan is just a
  one-contributor coordination — same merge math as a five-contributor op.
- **No-recall lock.** Once a coordination is committed (WavePlanner: once a
  wave's `Attack` row exists; WarRoom: once the op is `locked`), the troops in
  it cannot be recalled or re-tasked before resolution. This is the entire
  cost of concentration — it mirrors the attacker's existing all-or-nothing
  loss. No leader/Overseer gate; the risk is the gate.
- **Defense unchanged.** Defenders keep free reactive support and full
  information. We are *adding* a capability to offense, not removing one from
  defense. (See §4 — this is the #1 playtest risk, with a pre-agreed trigger.)
- **One conquest strike per coordination.** Exactly one Overseer per
  coordination (reuse `validateOverseerAttackCap` semantics across the merged
  force). A coordination is one concentrated conquest attempt.

### Resolution

At each `processArrivedAttacks` tick, arriving `Attack` rows are grouped by
their owning coordination. For each group:

1. Sum all participants' `troops` into a single `attackTroops`.
2. Run the existing `resolveCombat` against `mergedDefenderForce`.
3. Split outcomes back to participants by force share:
   - **Losses** — proportional to each participant's contribution per troop
     type.
   - **Loot** — proportional to each participant's surviving carry capacity.
   - **Control drain** — happens **once** for the coordination, per the
     existing `powerRatio` tiers.

No new combat math — the per-battle model in COMBAT_BALANCE.md is untouched;
only the *grouping* before it changes.

### Two coordinations on the same target

If two distinct coordinations (e.g. a WavePlanner plan and a separate WarRoom
op) land on the same nexus at overlapping times, they resolve as **two
separate combats** in arrival order — merging is per-coordination, not
per-target. This is consistent with "opt-in only": only the players who joined
the same coordination object pool force.

---

## 3. Design invariants

Properties the implementation must preserve. Verify after build.

1. **Coordination never out-performs the same troops sent solo against an
   *empty* nexus.** Concentration helps only against a force that would beat
   the waves individually — it must not be a free damage multiplier vs. an
   undefended target.
2. **No-recall is real.** Once committed, no participating wave can be
   recalled, re-tasked, or removed before resolution. A bug that lets a wave
   leak out breaks the whole risk/reward justification.
3. **Loot/control/casualty split-back is conservative.** Sum of participant
   payouts/losses == the single-combat result. No duplication, no rounding
   that creates or destroys troops/resources.
4. **One coordination = one Overseer strike.** Control drains once per merged
   resolution, per the existing `powerRatio` tiers — not once per joined wave.
5. **Defense math is byte-for-byte unchanged.** Garrison + support
   aggregation, shield, counter triangle all resolve exactly as today.
6. **Per-coordination merge, not per-target.** Two unrelated coordinations
   hitting one nexus do not merge with each other.

---

## 4. Known risk / open question (read before shipping)

**The "free reactive defense" assumption may not hold.** We deliberately chose
*not* to constrain the defender — they keep full information and unlimited
reactive support. But the data's clearest turtle (nexus 232) was won precisely
by reactive support landing in-window. After this change:

> The defender still sees the incoming waves *and their landing times* and can
> stack N reactive walls to arrive just before. The attacker has committed
> harder (no-recall) while the defender keeps every advantage. The stalemate
> could move to attackers, not break.

This is accepted *for the first iteration* to keep defense un-nerfed and
avoid defender-rage. **Pre-agreed escape hatch** (do not relitigate under
fire):

- **Trigger:** conquest rate stays dead AND post-launch logs show reactive
  support consistently landing inside the coordination's arrival window on
  failed merged strikes.
- **First lever:** fog the *landing time* of a locked coordination (show a
  window, not a number) so the defender can't perfectly time the
  counter-stack. This constrains defender *information*, not defender *force*
  — consistent with "don't nerf defense."
- **Not the first lever:** capping or locking support. That's the wrong side
  of the equation (offense lacked concentration; support was never the cause).

---

## 5. Playtest signals

Instrument before treating the mechanic as settled.

| # | Signal | Healthy | Concerning |
|---|--------|---------|------------|
| 1 | **Coordination adoption** | More attacks flow through WavePlanner / WarRoom; loose dogpiles fall as a share of total | Players still dogpile outside the tools; coordination unused (friction too high / payoff unclear) |
| 2 | **Conquest rate** | Coordinated strikes crack turtles that solo waves couldn't | Still stalemate → §4 trigger fires |
| 3 | **Reactive-support-in-window rate** | Falls, or coordinated strikes win despite it | Stays high AND coordinations lose → §4 trigger fires |
| 4 | **Merged vs unmerged win-rate** | Coordinated merge clearly out-performs equal force sent as separate uncoordinated waves | No difference → resolution/merge is broken (invariant 1 or 3) |
| 5 | **Solo vs multi-player coordination** | Both WavePlanner and WarRoom show the payoff; neither is a dead surface | One surface dominates absolutely → adoption friction asymmetry, not a balance bug |

---

_Last updated: 2026-06-07 (design contract, pre-implementation). Decisions:
opt-in only, applies to BOTH WavePlanner (solo) and WarRoom (multi-player),
no-recall lock, defense unchanged, one Overseer per coordination._
