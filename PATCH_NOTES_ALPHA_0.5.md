## Vexara — Alpha Patch Notes v0.5

Combat triangle rebalanced. Several long-standing display bugs fixed.
Push notifications now fire the moment a strike is launched toward you.
Void Stalker finally shows up in the attack screen where it belongs.

---

### Combat system

**Class counter triangle reworked — Heavy now counters Ranged.**

The old triangle had Heavy beating Special (Overseer/Recon). That made no
sense because special units don't fight. The triangle is now a clean
rock-paper-scissors:

- Light beats Heavy
- Heavy beats Ranged
- Ranged beats Light
- Special: neutral in all matchups (no counter, no vulnerability)

Previously Siege Mech and Bulwark Guard were wasting their counter bonus
against non-combat units. Now they crush ranged emplacements instead —
which is exactly what a slow heavy platform should do.

**Counter bonus is proportional to defender composition — always was, now
documented properly.**

A full ×1.35 counter only applies if 100% of defenders are the countered
class. Against a mixed force, the multiplier is a weighted average. Ten
Ranged units against 5 Light + 5 Heavy get roughly ×1.05 — a small edge,
not a dominant one. The Codex now explains this in full with an example.

**Plasma Turret stats corrected — it's a wall, not a weapon.**

The Plasma Turret had 180 attack (tied with top-tier offensive units) and
only 90 defense. A stationary emplacement shouldn't hit harder than an
Annihilator Platform. Corrected:

- Attack: was 180, now 0
- Defense: was 90, now 160

It still hard-counters light cavalry via the ranged class bonus. It just
doesn't contribute offensive power — only defensive bulk.

---

### Void Stalker

**Void Stalker now appears in the attack form.**

It was never added to the attack screen's troop list. Fixed — it shows up
in the strike form alongside every other deployable unit.

---

### Military Outpost

**Bonus display updated to match Resource Depot style.**

The bonus labels now show "2x Training Speed" and "3x Training Speed"
instead of "50% Faster" and "75% Faster". Consistent with how Resource
Depot and Supply Cache display their bonuses.

---

### Starfield (Map)

**Outgoing attacks no longer show Unknown (?|?) as destination.**

The attack data was serialized to `attack.defender.nexus` but the map
panel was reading `attack.defenderNexus` (the unserialized field). Both
incoming and outgoing now read the correct path.

**Attack history (last 5) now shown on each nexus in the starfield.**

Clicking a nexus shows a "Recent Attacks" section with the last 5
completed strikes involving that nexus — attacker name, defender name,
win/loss/scout outcome. Visible to any player in the same galaxy.

**Resources shown on the Strike screen.**

Your current biomass, alloy, and ore are now displayed at the top of the
attack form so you can check your stockpile without leaving the panel.

---

### Notifications

**Incoming attack push notification now fires on launch, not on resolution.**

Previously the defender only received a push notification after the battle
resolved. Now a notification fires the moment a strike is sent toward your
nexus, including the estimated arrival time. Scout missions remain silent —
stealth is part of the mechanic.

---

### NPC and legacy nexuses

**Resource buildings now have a level-7 floor across all nexuses.**

Legacy nexuses (NPC and player) that were created before the floor was set
had resource buildings stuck at level 0. On next server startup, any nexus
with biomassFarm, alloyForge, or oreExtractor individually at 0 is bumped
to level 7. New nexuses are unaffected — they spawn at their normal
starting levels.

---

### UI / Mobile

**Building and troop info modals are now fixed to the center of the mobile
viewport.**

The overlay was scrollable, which meant the modal could appear partially
off-screen and required scrolling to reach the close button. The overlay
no longer scrolls; the modal content scrolls internally.

---

See you in the dark. — andre
