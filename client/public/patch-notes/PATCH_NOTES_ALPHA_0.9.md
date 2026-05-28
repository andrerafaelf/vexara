## Vexara — Alpha Patch Notes v0.9

Support mission logs removed. Reclaimed Outpost reworked.
Sticky header fix on mobile. Empire overview page in progress.

---

### Stationed troops notify their owner when lost in combat

If your troops are stationed at an ally's nexus and that nexus loses a
battle, you now receive a push notification telling you how many were
lost and how many survived. Your transfer list also refreshes immediately
so the updated troop count is visible without a manual reload.

Previously the troops died silently — no notification, no record.

---

### Support missions no longer appear in combat logs

Support arrivals were incorrectly generating entries in the combat logs
list and triggering unread report badges on your nexuses. These are troop
movements, not battles, they now resolve silently. Your combat log shows
only attacks, conquests, and scout reports.

---

### Reclaimed Outpost renamed and reworked → Forward Base

The Reclaimed Outpost specialization has been replaced by the **Forward Base**.
The old 20% build speed bonus was the weakest option by a wide margin and
didn't fill a meaningful strategic role.

Forward Base is a front-line logistics type, the only nexus type that
affects troop movement speed:

**Base (T1):** 25% faster troop travel · 20% faster construction  
**Doubled (T2, CC≥15):** ~44% faster troop travel · 36% faster construction

All strikes and troop transfers launched from a Forward Base arrive
faster. Placed deep in enemy territory, it shortens reaction windows and
lets you contest distant regions that would otherwise be too far to strike
before reinforcements arrive.

Existing Reclaimed Outpost nexuses are automatically migrated to
Forward Base. NPC neutrals that previously spawned as Reclaimed Outpost
will now spawn as Forward Base.

---

### Loot formula reworked — carry is now a threshold, not a hard cap

Previously, loot was capped by your army's raw carry total divided against
the defender's resource pool. Against a late-game vault of 130,000+
resources, even a 600-unit army could only carry ~33% of it.

Carry now works as a **threshold**: any army with 8,000+ surviving carry
capacity takes 100% of lootable resources. Smaller raids still scale
proportionally below the threshold — a 4,000-carry raid takes 50%.

This means a solid mid-game striking force (e.g. 50 Interceptor Bikes +
30 Annihilators) will always loot a vault clean on a clean win.
Supply Cache loot protection still applies on top.

---

### Sticky header fix on mobile

The in-game header was losing its sticky position on some mobile devices
after the page content grew past one screen height. The root layout now
locks to `100dvh` with internal scroll so the header stays anchored at
the top regardless of content length.
