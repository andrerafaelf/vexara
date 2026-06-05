## Vexara - Alpha Patch Notes v0.3

Player-reported combat accuracy and UI clarity pass. Priority was fixing
lopsided fight outcomes, the attack menu desyncing troop counts, and
making sure every unit shows up where it should.

---

### Combat balance (server)

**Winner loss rate rebalanced , attackers were dying too much on victories.**

The previous formula caused winning attackers to lose ~30–50% of their
troops regardless of how dominant the win was. That made stomping an
undefended nexus feel painful and made clean victories feel hollow.

- **Winning losses now scale with how close the fight was.** If the
  defender had 0 troops (empty nexus), the attacker loses 0. At 50%
  power ratio (well-matched win), winners lose up to ~18%. Previously
  the floor was ~15% regardless of the power gap.
- **Variance tightened for large stacks.** Small squads (<20 units)
  still see ±10% swing; large armies (>200) drop to ±3%. Prevents the
  absurd case where 56 Breakers lose half their number to 7 defenders.
- **Loser survivability corrected.** Higher-defense units (Bulwark
  Guard, Siege Mech) now correctly take fewer losses on a losing side
  than fragile units , the old formula accidentally inverted this for
  part of the range.
- **Single-troop attacks against empty nexuses no longer kill the
  attacker.** Sending 1 Breaker at a nexus with 0 garrison now returns
  that Breaker unharmed. Previously the winner formula set a baseline
  loss rate that could kill even the attacking force.

---

### Attack menu (client)

**Troop counts no longer double-deduct after sending a strike.**

When you sent troops, the server deducted them from your nexus, then
the client fetched the updated nexus *and* added the new attack to the
outgoing list , the `availableTroops` memo subtracted both, cutting the
displayed count in half. The fix: `availableTroops` now reads directly
from the server-authoritative nexus snapshot (already reflects all
in-flight deductions) without a secondary subtraction. The count in the
attack menu now matches the build menu count and stays correct across
multiple sequential attacks.

---

### combat logs (client)

**Report now shows all participating unit types, not just the first three.**

The `troopNames` lookup table in the combat log was missing Void
Stalker and Plasma Turret. Any report involving either unit silently
dropped those rows from the table. Both are now mapped, so all 14 unit
types render correctly.

---

### Unit info modal (client)

**The (i) info modal no longer gets clipped when the page is scrolled.**

The overlay was already `position: fixed` but had no max-height or
overflow handling, and a low z-index could let scrolled content overlap
it on some layouts. Fixed:

- `z-index` raised to `9999` to guarantee it floats above all other
  layers.
- `max-height: 90vh` + `overflow-y: auto` added to the modal so long
  descriptions scroll inside the box rather than clipping off-screen.
- `padding: 16px` added to the overlay so the modal never touches the
  viewport edge on small screens.

---

### Spy reports (server + client)

**Coordinates are now snapshotted at scout time , renaming a nexus no
longer obscures its identity in older reports.**

Previously the scout intel blob stored resources, troops, and buildings
but not the target's name or coordinates. If the target was renamed
after the scout landed, older reports would display the new name with
no way to cross-reference the correct location. Now `buildDetailedScoutIntel`
captures `nexusName`, `nexusX`, and `nexusY` at the moment of scouting.
The intel card uses those snapshotted values (falling back to the live
DB join for older reports that predate this patch).

---

### Codex (client)

**Defense mechanics now fully documented.**

The Shield Grid entry now explains exactly how defense resolves in
combat: each defender's Defense stat sums into a pool, that pool is
multiplied by `(1 + shieldGrid × 0.02)`, and it's compared against the
attacker's class-weighted attack power. The winner/loser loss rate
ranges, Military Outpost shield efficiency bonus, and allied support
troop stacking are all documented.

**Overseer usage clarified end-to-end.**

The Overseer entry now explains the full conquest loop:
- Deals no combat damage; survives failed attacks unless its entire
  escort is wiped.
- Each successful strike with a surviving Overseer reduces target
  Control by 50.
- Two successful strikes conquer any nexus.
- **On conquest, the Overseer is consumed** , it does not return home.
- The conquered nexus keeps its building levels and nexus type.
- Conquering a special NPC nexus (non-Neutral Settlement) permanently
  doubles all its type bonuses.

---

See you in the dark. - André
