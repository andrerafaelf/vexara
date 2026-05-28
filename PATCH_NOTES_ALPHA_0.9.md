## Vexara — Alpha Patch Notes v0.9

Support mission logs removed. Reclaimed Outpost reworked.
Sticky header fix on mobile. Empire overview page in progress.

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

### Sticky header fix on mobile

The in-game header was losing its sticky position on some mobile devices
after the page content grew past one screen height. The root layout now
locks to `100dvh` with internal scroll so the header stays anchored at
the top regardless of content length.
