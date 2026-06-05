## Vexara - Alpha Patch Notes v0.2

Round-two cleanup from live-galaxy observations: smoothing combat fairness,
making raids actually pay off in the opening hours, and fixing UI gaps that
made it hard to tell what was happening.

---

### Combat & strikes

- **Influence no longer drops the moment you send a strike.** Previously,
  deducting troops from your nexus immediately reduced your nexus point
  total and dropped your galaxy influence , even though the troops weren't
  *lost*, just away from home. Troops in flight on a traveling strike now
  contribute to your influence as if they were still garrisoned. Influence
  only falls when combat resolves, in proportion to actual casualties.
- **Outgoing strike card** in the nexus overview now shows the target
  nexus name, coordinates, and the troops you sent , instead of just `?`.
  Same fix applied to incoming-strike rendering (now shows source nexus
  coordinates).

### Early-game raiding viability

The early raiding loop was nearly pointless because the first three
trainable units could only carry single-digit loot per body. Buffed:

- **Assault Trooper** carry **15 → 60** (now the workhorse hauler)
- **Lancer Drone** carry **20 → 30**
- **Breaker Unit** carry **10 → 50**

Skimmer/Interceptor/Siege/Annihilator already had healthy carry stats and
were not touched. We considered adding a dedicated transport unit but
rejected it , beefing the existing tier-1 units keeps the unit roster small
and means players can raid with the troops they already have.

### Espionage UI

- **Active Embedded Operatives** now renders **above** Recent Mission
  Results , the actionable surface (Refresh Intel / Recall) is at the top
  where you reach for it.
- **Recent Mission Results** are **collapsed by default** with a per-row
  `+` / `−` toggle. Opening the Espionage tab gives you a clean view; the
  full intel dump only expands when you ask for it. The fresh "Intel
  Updated" panel from pressing Refresh Intel still shows immediately so
  you can read the new report without clicking around.

### Market

- **Listing a resource no longer "refunds" itself on the next tick.** When
  you created a listing the offer resource was deducted, but other state
  (the other two resources and `lastResourceUpdate`) wasn't refreshed in
  the same write , so the next production tick replayed accumulation from
  the stale timestamp and effectively gave back what you'd just spent.
  Same shape of bug existed on listing cancel, listing buy, and system
  buy; all four paths now persist a refreshed resource snapshot
  atomically.

### Galaxy density

- **Neutral nexus spawn rate cut.** With 32 players in a galaxy the
  pool target was 128 neutrals (`NEUTRALS_PER_PLAYER = 4`), which
  together with player nexuses pushed the map past 160 nexuses in 24h ,
  far too dense. Multiplier dropped to **1.5/player** and the daily
  growth job from **6 → 3**, with a small floor (24) so empty galaxies
  don't feel barren. At 32 players the target is now ~48 neutrals.

### Codex / docs

- **Unit class is now visible on every troop entry** (LIGHT / HEAVY /
  RANGED / SPECIAL) with the counter-by relationship in a hover tooltip.
- **New "Class counters" panel** at the top of the Troops dossier
  explains the rock-paper-scissors damage triangle that the in-game
  armory and combat code already used but the codex never documented:

  - Light beats Heavy (×1.35)
  - Heavy beats Special (×1.35)
  - Ranged beats Light (×1.35)
  - The countered side takes a 20–25% damage reduction
  - Armory level amplifies the gap (+1.5% per level, cap +30% at Lv20)
- **`CRY` stat renamed to `CRG`** (cargo) and given a hover tooltip
  explaining it's the per-unit raid loot capacity. `CRY` was a holdover
  abbreviation that read like a typo.
- **Codex completeness pass.** Two units , **Void Stalker** and **Plasma
  Turret** , and two buildings , **Armory** and **Stealth Array** , were
  shipped but never made it into the codex. All four are now in. Every
  existing troop's stats and the Overseer's cost have also been resynced
  against `combatMath.ts`, which is the actual source of truth used by the
  combat engine. Codex header bumped to 14 units / 10 buildings.
- **Void Stalker description was backwards.** Both the in-nexus tooltip
  and the codex blurb described the Stalker as a "hard counter to ranged
  emplacements." It's the opposite , the Stalker is a Light unit, so it
  counters Heavy and is itself hard-countered by Ranged (Suppressor,
  Lancer, Disruptor, Annihilator, **Plasma Turret**). Wording corrected
  in both places.

### Balance

- **Plasma Turret population cost 4 → 2.** The turret is locked to its
  home nexus and can't be redeployed, transferred, or sent on raids , it
  was paying the same pop tax as a Siege Mech without any of the
  flexibility. Cutting to 2 (matching Bulwark Guard, the closest
  pure-defensive analogue) makes turret-heavy defenses an actual option
  instead of a luxury. Existing turrets keep their old pop charge; only
  newly-trained ones pay the lower cost.

---

See you in the dark. - André
