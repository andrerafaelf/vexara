# Vexara - Diplomacy Balance & Build Plan (Diplomacy Teeth)

**Status:** DESIGN, not yet implemented. This doc locks the intent and the
numbers for giving the existing diplomacy layer mechanical teeth. No game code
has been changed yet. Phase 1 ships on the `beta` branch post-launch; Phase 2
follows after Phase 1 is live and beta data confirms factions are forming.

**Background.** The diplomacy data layer already exists: `FactionTreaty` (types
`nap` / `trade` / `vassal`), `FactionWar`, `DiplomacyMessage`, shared treasury,
shared targets. Only `trade` currently has mechanical teeth (it waives the
cross-faction transfer tax in [`controllers/nexusController.ts`](./controllers/nexusController.ts)
and the market commission in [`services/marketService.ts`](./services/marketService.ts)).
`nap` and `vassal` are signed, stored, notified, and grant battle-pass XP, but
no combat, win, or vision seam reads them. This plan fixes that.

**Source of truth for numbers (once implemented):**
[`utils/gameConstants.ts`](./utils/gameConstants.ts) for the NAP constants,
[`utils/dominance.ts`](./utils/dominance.ts) for the vassal credit constants,
and [`utils/economy.ts`](./utils/economy.ts) for vassal loot protection. This
doc explains the *intent*; the code is the *fact*. The NAP constants are
**server-only and NOT mirrored** (same class as `STANDING_ORDER_*`); the client
receives server-computed timestamps, never the raw constant.

---

## Phasing

- **Phase 1 - NAP enforcement + ally shared vision.** Self-contained. Never
  touches the win threshold or conservation. Safe to ship first.
- **Phase 2 - vassal dominance credit + vassal loot protection.** Touches the
  real win threshold in `dominance.ts` and the loot path in `combat.ts` /
  `economy.ts` (the loot change carries a `combatSim.ts` client-mirror
  obligation). Separate ticket, separate QA + security pass, after Phase 1.

---

## 1. NAP enforcement (Phase 1)

### Intent

A NAP you cannot break is boring; a NAP that does nothing is pointless. So:
breakable, but betrayal is costly and loud. While a NAP is active the server
blocks new attack launches between the two factions. To go to war, a faction
leader or officer must formally break the pact, which opens a warning window
during which attacks still cannot land and the victim is alerted instantly.

### Numbers

| Constant | Value | Reasoning |
|---|---|---|
| `NAP_BREAK_NOTICE_MS` | 60 min, divided by `galaxy.speedMultiplier` | A wall-clock reaction floor independent of how close the aggressor pre-positioned. A fast mobile strike from a forward base (~10 distance) already lands in ~40 min with zero warning; 60 min guarantees one full check-in / notification cycle and sits strictly above `STANDING_ORDER_COOLDOWN_MS` (30 min) so the defender's automated defense fires once inside the window. **Flat, never scaled by travel/galaxy size** - a per-pair window is gameable: the aggressor would pick the nearest source nexus to shrink the victim's warning. |
| `NAP_RESIGN_COOLDOWN_MS` | 24 h, divided by `galaxy.speedMultiplier` | The same two factions cannot sign a new NAP for 24 h after a break. Kills the sign -> break -> sign griefing loop. Reconciles with the 1-day minimum treaty `durationDays`. |
| Gate scope | `attack` missions only | Scout and support remain allowed. Blocking scout would turn the pact into a free intel blackout (and contradicts the shared-vision section); blocking support would stop you reinforcing your own partner. |

### Penalties beyond the window

Two lightweight penalties, no numeric standing system:

1. **Public faction event + diplomacy-board mark.** Galaxy-visible
   ("[TAG] broke its NAP with [TAG]") via the existing `FactionEvent`
   (`nap_broken` / `nap_broken_received`, mirroring the `war_declared` pattern).
   The organic cost: serial pact-breakers become un-trustable server-wide. Zero
   new balance constants.
2. **The 24 h re-sign cooldown** above.

Rejected: any resource / influence / standing hit. No standing system exists,
and a flat numeric penalty is itself a snowball hazard (a strong faction shrugs
it off, a weak one is crippled). The social cost scales naturally with how much
the breaker valued its word.

### Anti-exploit invariants (load-bearing)

- **Gate at launch only, never at resolution.** The check lives in
  `launchAttack`. Attacks launched *before* a NAP went active MUST still land.
  Running the check at resolution time would let a NAP signed after a wave fires
  retroactively shield the defender, voiding a paid-for mission (a conservation
  break) - the NAP-as-retroactive-shield exploit.
- **Known/accepted behavior:** a *scheduled* wave (not yet launched) that fires
  after a NAP activates IS blocked at fire time, because `launchAttack`
  re-validates at fire. This is fine: the attacker's own faction leadership
  accepted that NAP.
- **The window is mutual.** Neither side can land attacks during the window;
  both open simultaneously at expiry. The breaker gets no first-land advantage
  from the act of breaking, only the legitimate advantage of choosing the timing
  - which the warning offsets.
- **Garrison stays scout-gated even for allies** (see shared vision). This
  closes "sign NAP -> read defenses free -> break -> alpha-strike."
- **Vassal does NOT imply NAP.** (Superseded by the Phase 2 loot design.) The
  overlord can attack and raid its own vassal: vassal loot protection in section
  3 deliberately excepts the overlord, so an overlord disciplining or taxing its
  vassal by force is intended. The launch gate is NAP-only and a vassal bond
  carries no betrayal window; a faction that wants a non-aggression guarantee
  from its overlord signs a separate NAP. (Earlier drafts said "vassal implies
  NAP"; that predated the loot model and is intentionally not enforced.)

### Implementation pointers (Phase 1)

- **Schema:** `FactionTreatyStatus` += `broken`; `FactionTreaty` +=
  `brokenAt DateTime?`, `betrayalEndsAt DateTime?`, `brokenByUserId Int?`. Real
  columns, not `meta` JSON - the combat gate queries them on the attack hot
  path. Additive/nullable migration, safe online. No advisory lock.
- **Gate:** `launchAttack` in [`services/attackService.ts`](./services/attackService.ts),
  after the newbie-protection block, for `attackType === 'attack'` against an
  owned defender. Derive both factions from `factionMember`; early-out if either
  is factionless. Block if an active `nap` exists between them OR a `broken` nap
  with `betrayalEndsAt > now`. Covers HTTP and scheduled-wave paths for free
  (both route through `launchAttack`).
- **No background job.** `block if active-nap OR (broken-nap AND betrayalEndsAt
  > now)` stops blocking the moment `betrayalEndsAt` passes, with zero cron. No
  `JOB_LOCKS` entry.
- **Break endpoint:** `POST /treaties/:treatyId/break` (leader/officer of either
  signatory). Sets `broken` + the timestamps, notifies the victim's leaders via
  `notifyDiplomacyLeaders` + `NOTIF.FACTION_DIPLOMACY`, logs the faction events.
- **`proposeTreaty`** rejects a new `nap` between a pair whose `brokenAt` is
  within `NAP_RESIGN_COOLDOWN_MS / speedMultiplier`.
- **Client:** treaty payload carries `status` + `betrayalEndsAt`; "Break NAP"
  button for leaders/officers; countdown rendered with `useNow()` /
  `serverNow()`, never raw `Date.now()`. No constant mirrored.

---

## 2. Ally shared vision (Phase 1)

### Intent

Active treaty partners coordinate. Add a `'ally'` tier to
[`utils/scouting.ts`](./utils/scouting.ts) `FriendlyRelation`
(`'faction' | 'friend' | 'ally' | null`; faction/friend keep priority) for
factions with an active `nap` OR `trade` treaty (vassal sits at the same tier).

### Scope

"Limited" vision = position + owner + nexus name + nexus type + live presence
("active" dot) + **shared inbound-attack pings on the ally's nexuses** (today
owner-only via `getIncomingAttacks`). Garrison, resources, building levels, and
control level **REMAIN scout-gated**.

The genuinely new, coordination-flavored value is (1) the ally's empire
auto-reveals on your map/fog and (2) you see attacks inbound to allied nexuses,
so a coalition can coordinate defense. Both are threat/awareness value, not
target-intel value. Keeping garrison scout-gated is the load-bearing exploit fix
- it preserves the Recon intel economy and blocks the x-ray-then-betray play.
Shared vision is strictly between the two allied factions' own nexuses; it does
not relay either ally's scout reports of third parties.

---

## 3. Vassal teeth (Phase 2, deferred)

### Direction convention

Store the relationship **explicitly** in `FactionTreaty.meta` as
`{ overlordFactionId, vassalFactionId }`, set from a UI role field at accept
time. Do not rely on implicit proposer/target ordering.

### Dominance credit

The overlord's dominance count gains `floor(0.25 × vassalOwnedNexusCount)` per
qualifying vassal, touching the REAL threshold in `dominance.ts` (a true
diplomatic path to victory), under hard guardrails. A quarter keeps a vassal
worth far more conquered (1.0 toward your count) than vassalized (0.25), so
vassalizing is never strictly better than conquering.

| Guardrail | Value | Purpose |
|---|---|---|
| `VASSAL_MIN_NEXUSES_TO_COUNT` | 4 | A vassal with < 4 nexuses credits 0. Doubles as the near-dead exclusion (a collapsing vassal drops below 4 and stops counting). |
| `VASSAL_MAX_COUNTED` | 3 | Beyond 3 vassals, further ones get protection but 0 dominance credit. Kills the puppet-swarm auto-win. |
| `VASSAL_CREDIT_CAP_VS_OWN` | 0.5 | Total credited vassal nexuses <= 50% of the overlord's own owned-nexus count. You must command the dominant plurality yourself; diplomacy is the final margin, not the bulk. |
| Anti-collusion | directional + exclusive | An overlord cannot simultaneously be a vassal (no chains/rings/transitive laundering); a faction is a vassal of at most one overlord (unique active-vassal per `(vassalFactionId, galaxy)`). |
| `minFactions` gate | unchanged (>= 4) | Counts vassals as independent factions, so a diplomatic win still requires a multipolar galaxy. Tuning dial: if diplomatic wins feel too easy, switch to counting only non-vassal factions. |

**Conservation note:** this is a scoring overlay, not resource/troop
conservation. Credited nexuses still physically belong to the vassal and still
count for the vassal everywhere else; the overlord gets a bounded virtual credit
toward its winning share only. Shares may sum > 1.0, harmless because only the
leader crossing 0.65 matters and the cap bounds the inflation. Nothing is
minted.

### Loot protection

Vassal nexuses take 25% less third-party loot (`lootProtection += 0.25` for any
attacker that is neither the vassal's faction nor the overlord's), folded under
the existing `Math.min(0.8, ...)` doubled-cap clamp in `economy.ts`.
Deliberately weaker than a Supply Cache's building-earned 0.40 - diplomacy is
cheaper to obtain, so it must be weaker than a dedicated building slot.
Conservation holds exactly like existing `lootProtection`: unlooted resources
stay on the defender. **Mirror obligation:** if `combatSim.ts` predicts loot,
the vassal reduction appears there too in the same commit, or the client
over-predicts loot against a vassal.

### Rejected (do not build)

- **Vassal -> overlord resource pipe.** Textbook snowball accelerant; bleeds the
  weaker side and kills the protector fantasy.
- **Vassal protection reducing troop losses or blocking conquest.** Manufactures
  unkillable puppet states and freezes the map - violates `COMBAT_BALANCE.md`
  invariants 3 and 4. Vassal protection is resource-loot only.

---

## 4. Metrics to watch

- **NAP:** break-to-first-land time distribution (should cluster at ~60 min,
  never below); NAP-break frequency per faction (serial breakers = the social
  penalty working). NAPs signed minutes before an inbound wave = peace-buying
  (acceptable); signed-then-broken in < 2 h = tempo-griefing (tighten
  `NAP_RESIGN_COOLDOWN_MS`).
- **Vassal:** share of galaxy wins that are diplomatic. Healthy: a minority,
  overlord owned >= 0.55 outright. Concerning: any win where the overlord owned
  < 0.50 outright (cap too loose - drop `VASSAL_CREDIT_CAP_VS_OWN` toward 0.33).
- **Shared vision:** scout-mission volume after launch. A material drop in Recon
  training means the ally tier leaked too much; confirm it is only fog-reveal +
  attack pings.

---

## 5. Player-facing copy (drafted, for patch notes + codex)

- **NAP:** "Non-Aggression Pacts now have teeth. While a NAP is active, neither
  faction can launch attacks at the other. To go to war, a leader or officer
  must formally break the pact, which opens a 60-minute warning window (your
  target is alerted the instant you break, and no attack can land until it
  ends). Attacks already in flight when a NAP is signed still land. Breaking a
  pact is logged publicly, and the two factions can't re-sign a NAP for 24
  hours."
- **Vassal:** "Vassalage now matters. An overlord counts a quarter of each
  qualifying vassal's territory toward galaxy dominance (a true diplomatic path
  to victory), capped so you must still command the largest share yourself.
  Vassals gain a visible protector and take 25% less loot from outside raiders.
  You still have to fight: vassalage never stops a nexus from being conquered."
- **Shared vision:** "Active treaty partners now share limited vision: you'll
  see each other's nexuses on the map and any attacks inbound to allied
  territory, so coalitions can coordinate defense. Garrison strength, resources,
  and buildings stay hidden until you scout: intel is still earned."

Patch notes are three coordinated edits per CLAUDE.md section 6; codex lives in
[`client/src/data/gameDocs.ts`](../client/src/data/gameDocs.ts).
