## Vexara - Alpha Patch Notes v0.18.1

A tuning pass on the v0.18 endgame: Tier 3 units cost less population so a maxed Life Support actually fields an apex army, Life Support climbs to level 25, and population accounting has been rebuilt so the "insufficient capacity" bug can't come back.

---

### Why this patch exists

v0.18 promoted the Void Stalker to Tier 3 and made the Annihilator
Platform feel apex. The stats landed well , but the **population
footprint** of the new Tier 3 line was heavier than the Life Support
building could comfortably house. A maxed-out empire could afford the
resources and the train time for an Annihilator + Void Stalker army and
then run out of population slots before fielding it.

This patch brings the Tier 3 population cost back in line and raises the
population ceiling so the endgame army you've earned is one you can
actually garrison.

### Void Stalker - lighter footprint, slightly faster

The fastest unit in the game keeps all of its Tier 3 striking power
from v0.18, but no longer eats a full heavy-unit population slot.

- **Population 4 → 3.** A Void Stalker wing now fits where it should ,
  meaningfully cheaper to house than the heavy fire/armor units while
  still costing more than a Tier 2 raider.
- **Train time 30m → 27m base.** A small cut to match the lighter
  footprint and keep mobile strike packages assembling at pace.

Costs, attack, defense and carry are unchanged from v0.18.

### Annihilator Platform - population relief

The apex fire attacker keeps its 320 attack and its 40-minute train
time, but no longer demands the absolute maximum population slot.

- **Population 5 → 4.** Annihilator-heavy armies are now genuinely
  fieldable at a maxed Life Support instead of leaving you a slot or
  two short of a clean composition. Attack-per-pop ticks up to **80** ,
  firmly the most efficient burst attacker in the roster, as the apex
  unit should be.

### Life Support - now goes to level 25

The population ceiling rises to match the new endgame army sizes.

- **Max level 20 → 25.** Five additional levels of Life Support, each
  following the same `floor(100 × 1.19^level)` curve. At level 25 a
  single nexus houses substantially more population than the previous
  level-20 cap, giving Tier 3 compositions the room they need.
- Cost and time for levels 21–25 follow the existing late-tier scaling
  , these are a serious investment, as a +25% population ceiling should
  be.

### Population accounting - fixed at the root

Some players hit "Insufficient population capacity" while their barracks
sat half-empty. The cause: a nexus's stored population count could drift
out of sync with the troops it was actually housing, because more than a
dozen code paths each nudged that count by hand whenever troops were
trained, lost, refunded, granted, or returned home. Any one of them
getting the math slightly wrong , or an admin action bypassing them ,
left the count stuck too high, and the game refused to train more.

Population is now **derived from a single source of truth**: a nexus's
housing is always recomputed from what it's actually holding , stationed
troops, queued training, in-flight attacks, and outbound transfers,
capped at its maximum. There's no separately-maintained number left to
drift, so the bug can't recur. (As a side effect, a couple of admin
tools that double-counted multi-population units now report correctly.)

For operators, a **Recount Population** button in the admin panel sweeps
every nexus in every galaxy and rewrites any count that's wrong , now a
belt-and-suspenders sanity check after manual database work rather than
something gameplay needs.

### Codex updates

Void Stalker and Annihilator Platform entries now reflect their reduced
population cost (and the Void Stalker's shorter train time). The Life
Support entry shows the new level-25 cap and the corrected population
formula.

---

### Troop disbanding

Stationed troops can now be destroyed directly from the **Troops → Stationed** tab.

Each unit card gains a **✕** button. Clicking it expands an inline destroy row , enter a quantity (or click the available count to fill it), confirm the refund preview, then hit **Destroy**.

- Disbanding returns **10% of the unit's base training cost** (biomass, alloy, and ore) and immediately frees the population slots.
- Partial destroys are supported , disband any number up to the full stationed count.

### Troop movements bar - visual restyle

The incoming-attack bar has been brought in line with the game's industrial aesthetic: sharp corners throughout, subtle red-tinted background, monospace font on verb labels and countdowns, and right-border item separators instead of rounded pills.

### Send Troops - click-to-fill available count

On the starfield sidebar Send Troops panel, clicking the **/ {n}** available-count label now populates the input with the full available quantity, matching the existing behaviour on the attack form.

---

See you in the dark. , André
