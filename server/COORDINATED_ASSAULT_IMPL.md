# Coordinated Assault — Implementation Plan

**Companion to** [COORDINATED_ASSAULT.md](./COORDINATED_ASSAULT.md) (design contract).
This doc is the build spec: decisions, schema, server flow, UI scope, rollout.
Decisions here are made — they're not options. Push back on any of them before
code lands, but assume they're settled unless a counter-argument appears.

---

## 1. Architecture decision

**Two coordination surfaces, one merge rule, minimum schema delta.**

- `WarOperation` / `WarOperationWave` / `WarOperationSlot` stays the multi-player
  coordination surface. **No refactor.**
- WavePlanner stays its own surface backed by `ScheduledAttack` → `Attack`.
  **No backend refactor.**
- A new lightweight `WavePlan` row groups a solo player's waves against one
  target into a single coordination object — mirroring what `WarOperationWave`
  already is for the multi-player case.
- Both surfaces stamp the resulting `Attack` row with **one** of two nullable
  coordination pointers; the resolver merges by those pointers.

### Why not unify on `WarOperation`

I considered backing WavePlanner onto a single-contributor `WarOperation`
under the hood. Rejected. WarOperation carries faction-scoped concepts
(faction-id ownership, message threads, slot claiming by other players, the
`MAX_ACTIVE_OPS_PER_FACTION` budget) that don't apply to a solo plan, and
WavePlanner has its own well-tested `ScheduledAttack` lifecycle. Forcing them
into one model creates more surface area for bugs than it removes. **One
model, two backends, one merge rule at resolution** is the correct cut.

### Why not auto-merge same-target-same-tick waves

Rejected explicitly in the design contract — would reward sloppy dogpiles and
flatten the genre's coordination skill. The opt-in is "did the wave originate
from a coordination object." Without that anchor, the engine can't tell
deliberate concentration from accidental clustering.

---

## 2. Schema changes

Migration: `add_wave_plan_and_attack_coordination`.

```prisma
model WavePlan {
  id             Int      @id @default(autoincrement())
  userId         Int
  galaxyId       Int
  targetNexusId  Int
  createdAt      DateTime @default(now())

  user           User           @relation(...)
  galaxy         Galaxy         @relation(...)
  targetNexus    Nexus          @relation(...)
  scheduledAttacks ScheduledAttack[]
  attacks        Attack[]

  @@index([userId, galaxyId, targetNexusId])
}

// On ScheduledAttack
wavePlanId  Int?
wavePlan    WavePlan? @relation(...)

// On Attack
wavePlanId          Int?
wavePlan            WavePlan?          @relation(...)
warOperationWaveId  Int?
warOperationWave    WarOperationWave?  @relation(...)

@@index([arrivesAt, status, wavePlanId])
@@index([arrivesAt, status, warOperationWaveId])
```

**Invariant:** an `Attack` carries **at most one** of `wavePlanId` /
`warOperationWaveId`. Enforced by a partial check constraint:

```sql
ALTER TABLE "Attack"
  ADD CONSTRAINT attack_one_coordination
  CHECK (NUM_NONNULLS("wavePlanId", "warOperationWaveId") <= 1);
```

The two indexes above are the resolver's hot path — they let
`processArrivedAttacks` pull arriving attacks grouped by coordination key
without a full scan.

---

## 3. WavePlan lifecycle (solo)

- **Create on first schedule.** When the player schedules their first wave
  against a target from WavePlanner, the server creates a `WavePlan` for
  `(userId, galaxyId, targetNexusId)` and stamps its id on the resulting
  `ScheduledAttack`.
- **Reuse the active plan within the session.** Subsequent scheduled waves
  against the same target in the same WavePlanner session reuse the same
  `WavePlan.id`. "Same session" = the most recent `WavePlan` for that
  `(userId, targetNexusId)` whose latest scheduled wave has not yet arrived or
  been cancelled. If the player closes WavePlanner and reopens against the
  same target, they get a new plan (clean session boundary).
- **At launch (`processScheduledAttacks`).** The `wavePlanId` propagates from
  `ScheduledAttack` to the created `Attack` row.
- **At resolution.** Attacks sharing a `(wavePlanId, arrivesAt)` bucket merge.
  Different `arrivesAt` values inside the same plan stay separate (staggered
  waves resolve as separate strikes — same as a multi-wave `WarOperation`).

**No new player-facing concept.** A WavePlan is invisible UI-side; it's just
the server-side glue that makes "schedule three waves to arrive together"
behave as one strike.

---

## 4. WarOperation hookup (multi-player)

- **At slot fire (`markWarRoomSlotSent`).** When a slot's attack is launched
  (already happens in `warRoomController` ~line 828), additionally stamp the
  resulting `Attack.warOperationWaveId = slot.waveId`.
- **At resolution.** Attacks sharing `(warOperationWaveId)` merge. The
  operation's `arrivalAt + wave.arrivalOffsetMs` already guarantees they share
  an `arrivesAt`, so no time-bucketing needed here.
- **Operation status transition.** When the final slot in a wave fires, the
  operation moves to `launched` (already exists). At resolution, the resolver
  doesn't care about the op's status — it cares about the `warOperationWaveId`
  on the Attack rows, which were stamped at fire time.

---

## 5. Resolver changes (`processArrivedAttacks`)

Current shape (verbatim from `server/utils/combat.ts`):

```ts
for (const attack of sorted) {
  await resolveCombat(attack as AttackWithNexuses);
}
```

New shape:

1. Partition the arriving attacks:
   - `supportArrivals` (resolved first, unchanged).
   - `mergedGroups: Map<groupKey, AttackWithNexuses[]>` keyed by
     `wavePlanId-${id}-${arrivesAt}` or `warOpWave-${id}`. Solo Attacks land
     in their own singleton group keyed by `solo-${attack.id}`.
2. For each group: if size == 1, call `resolveCombat(attack)` (existing path,
   zero behavior change for uncoordinated waves). If size > 1, call new
   `resolveCoordinatedCombat(attacks)`.

`resolveCoordinatedCombat` is a thin shell over `resolveCombat`:

- Sum each participant's `troops` into one `mergedAttackTroops`.
- Sum `attackerTargetingCoreLevel` weighted by force share (or take the max —
  see §7 for that decision).
- Run the same core combat math against `mergedDefenderForce`. This is **the
  same math, same constants, same invariants** — only the attacker input is a
  merged force instead of one wave's force.
- Split outcomes back (§6).

**One Overseer per merged combat:** if multiple participating attacks each
brought an Overseer (UI prevents this for WarRoom and WavePlanner, but enforce
server-side), reject the merge with a soft fail: log, skip merge, resolve
each Attack individually as today. This is a safety hatch that can never
cause a worse outcome than current behavior.

---

## 6. Split-back math (the conservation rules)

These are the rules that make the merge a *grouping* and not a *new combat
mechanic*. Sum-of-participants must equal the merged result.

### Losses

For each troop type k, the merged combat returns a total loss `L_k`. Each
participant absorbs losses proportional to their contribution of that type:

```
participant_loss_k = round( L_k * (participant.troops[k] / merged.troops[k]) )
```

After rounding, distribute the remainder (`L_k - sum(participant_loss_k)`)
**to the participants with the largest fractional remainder first** (largest
remainder method). This guarantees `sum(participant_loss_k) == L_k` exactly,
with no troop creation or destruction.

Per-participant losses are then applied via the existing per-Attack result
write path — each Attack gets its own `attackerLosses` reflecting *its*
participation, not the merged total. Each participant's combat-log entry
reads cleanly as their own contribution.

### Loot

Loot is distributed by **share of surviving carry capacity**, not initial
force size — participants who took heavier losses carry less home, naturally.

```
participant_carry = Σ ( surviving_troops_k * TROOP_STATS[k].carry )
participant_loot_k = floor( total_loot_k * (participant_carry / sum_carry) )
```

Remainder (≤ N-1 units per resource) goes to the largest-carry participant.

### Control drain

Drains **once**, against the merged `powerRatio`, per the existing tiers
(50/34/15). The Overseer's owning Attack records the drain in its result;
other participants' results record `controlDrain: 0` with a `mergedWith: id`
pointer for the combat log.

### Building damage

Computed once on the merged `attackPower` per the existing
`BUILDING_DAMAGE_MIN_ATTACK_POWER` / `BUILDING_DAMAGE_FULL_OVERFLOW` rules.
Recorded on the Overseer's Attack (or, if no Overseer, the largest
contributor's Attack).

### The conservation test

Property test (added to `test/economy-combat.test.js`): for a randomly
generated merged combat with N participants, assert that
`sum(participant_losses)`, `sum(participant_loot)`, and `controlDrain`
exactly equal what the same merged force would produce as a single Attack.
**This is invariant #3 from the design doc, and it must be a test, not a
hope.**

---

## 7. The small judgment calls (decided, with rationale)

These are the calls a senior makes once and documents — not re-litigated.

- **Targeting Core (Armory) level for merged combat:** use the
  **maximum** `targetingCore` across participating attacker nexuses, not the
  weighted average. Rationale: the Armory amplifies counter bonuses; in a
  coordinated strike, the player with the best Armory is providing fire
  direction for the merged force. This rewards investment without inflating
  the benefit linearly with participant count.
- **Time-bucket tolerance for WavePlan merge:** **exact `arrivesAt` match
  only.** Both Attacks land in `processArrivedAttacks` after `arrivesAt <=
  NOW()`; if they were scheduled with different arrival times they're not in
  the same merge bucket, full stop. No fuzzy windowing — fuzziness invites
  bugs and removes the player's control over the merge.
- **Mixed coordinations on one target:** explicitly do *not* merge across a
  WavePlan and a WarOperationWave even if they share `arrivesAt`. Two
  separate combats, in `attack.id` order. (Design invariant #6.)
- **Defender notification for forming WarOps:** add a push +
  `notifyAttackUpdate` when an operation moves to `launched` and targets a
  player-owned nexus. **Do not** notify on `planning` or `locked` — those
  are pre-flight states the defender shouldn't see (operational security for
  the attacker is part of the WarRoom mechanic today; we don't undo it).
  Per-wave `ATTACK_INCOMING` pushes continue to fire as each slot's Attack
  is launched, unchanged.
- **No new defender visibility for solo WavePlans.** The defender already
  gets one push per inbound wave; that's the existing tell. Solo
  coordination doesn't change the defender's information surface.

---

## 8. Lock enforcement audit

Before shipping, verify and (if missing) close:

- [ ] `releaseWarRoomSlot` rejects when `operation.status === 'launched'`
  (and ideally `'locked'` too — release after lock breaks the commitment).
- [ ] `deleteWarRoomWave` rejects when the wave has any slot with
  `sentAttackId != null`.
- [ ] `cancelScheduledAttack` continues to allow cancel **before launch**
  (this is correct — `ScheduledAttack` cancel is pre-commit, not recall).
  Verify it cannot be called on a row whose `Attack` row already exists.

The "no-recall" rule in the design contract is enforced by the existing
attack-already-flying invariant; the audit is to make sure no slot/wave
escape hatches subvert it.

---

## 9. UI changes (minimum viable)

- **WavePlanner:** no UI change required. Internally calls
  `scheduleAttack` with an optional `wavePlanId` field — the server creates
  /reuses the plan transparently.
- **WarRoom:** no UI change required for the merge to work. The merged
  combat-log presentation falls out of the existing per-slot combat reports
  (each participant sees their own losses/loot; a "merged with N others"
  banner is a nice-to-have for v2).
- **Combat log (`Reports.tsx` / `BattleReplay.tsx`):** add a small "merged
  strike" label when a report's Attack has a coordination pointer, plus a
  link to the sibling participants' reports. Two-line change in the report
  card; a real merged-replay view is v2.
- **Defender's incoming-attack view (`ScoutIntelCard` / nexus inbox):** show
  a single "Coordinated assault inbound (N waves)" entry instead of N
  separate inbound rows when the inbound attacks share a coordination id and
  the defender has scouted the target nexus. **v2** — ship merge first, add
  this once we see uptake.

---

## 10. Rollout

Single-shot ship — owner call (2026-06-07). The originally-planned
three-PR / env-flag staged rollout was discarded as overkill for the
risk; if the merged path misbehaves in prod we revert via code, not
config.

1. **Schema + plumbing.** Add `WavePlan`, add `wavePlanId` /
   `warOperationWaveId` columns + check constraint + indexes, stamp
   them at schedule/fire time on both surfaces (Wave Planner +
   War Room).
2. **Merged resolution.** Add `resolveCoordinatedCombat` and the
   group-by logic in `processArrivedAttacks`. Conservation property
   test ships alongside.
3. **Docs + patch notes.** Codex section, how-to-play step + FAQ,
   v0.23 patch notes lead with the feature.

All three land together. No env flag, no opt-in deployment stage —
the merged path runs from first deploy. Players experience the
feature with the patch notes that describe it.

**Revert path (if needed).** If something is wrong in prod, the
escape hatch is a one-line change in `processArrivedAttacks` to
force every group to a singleton — e.g. replacing
`partitionByCoordination(...)` with `nonSupports.map((a) => [a])`.
Ship that as a hotfix; the stamps on existing rows stay (they are
harmless metadata) and resolution falls back to per-Attack
exactly like pre-PR2. Faster to write than to debate a flag flip.

---

## 11. Test matrix (must-have before PR 3)

- Solo: 3 WavePlanner waves same arrival → 1 merged combat, conservation
  holds.
- Solo: 3 WavePlanner waves staggered arrivals → 3 separate combats.
- Multi: 5 WarOperation slots, 1 wave → 1 merged combat.
- Multi: 2-wave WarOperation → 2 separate merged combats at the two
  arrival times.
- Mixed: WavePlan + WarOperationWave same target same `arrivesAt` → 2
  separate combats (no cross-coordination merge).
- Edge: merged force loses → losses split correctly, Overseers lost,
  control drain = 0.
- Edge: merged force narrowly wins (powerRatio > 0.66) → 15 control drain
  once, Overseer survives.
- Edge: empty defender → merged combat doesn't synthesize building damage
  beyond the existing `BUILDING_DAMAGE_MIN_ATTACK_POWER` floor.
- Edge: two Overseers brought into one merge → soft-fail, individual
  resolution.
- Conservation: random fuzz, N participants, assert
  sum-of-parts == merged-whole for losses, loot, control, building damage.

---

_Last updated: 2026-06-07. Calls made: two backends + one merge rule, new
`WavePlan` table, max-Targeting-Core for merged Armory, exact-arrival merge
only, no defender visibility change for solo, flag-gated rollout in three
PRs._
