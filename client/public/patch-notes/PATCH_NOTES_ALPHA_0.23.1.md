## Vexara - Alpha Patch Notes v0.23.1

A UI-focused patch. The headline is a complete rebuild of the **Combat
After-Action Report** - the old BattleReplay is replaced by a proper
military HUD that shows you everything that mattered in a fight at a
glance. The **Players page** gets a full visual overhaul with a real
leaderboard and a gold/silver/bronze podium for the top three. The map
gains a **legend** and a wider zoom ceiling, the starfield is denser, the
footer picks up an **intellectual property notice**, and the Privacy and
Terms pages are updated for June 2026.

---

### Combat After-Action Report replaces BattleReplay

The old BattleReplay was a step-by-step replay that made you sit through
the resolution before you could read the outcome. It is gone. In its
place is the **Combat After-Action Report (AAR)** - a static, structured
HUD that shows the full picture of a fight the moment you open the
report.

The AAR is laid out in four zones:

**Outcome banner.** VICTORY or DEFEAT, big and immediate. A conquest
badge appears below it if the nexus changed hands.

**Power assessment.** A side-by-side breakdown of attacker vs. defender
combat power with a visual bar so you can read the strength ratio at a
glance. Player names, nexus coordinates, and the class composition are
shown underneath.

**Force panel.** A two-column grid - attacker on the left, defender on
the right. Each column lists every unit type, how many were present,
how many were lost, and how many survived. Wiped units are struck
through. Allied contributions are broken out per supporter with their
own troop breakdown and a bar showing their share of the defence wall.

**Footer strip.** A row of headline numbers pulled out of the detail:
total attacker losses, total defender losses, resources looted (Biomass /
Alloy / Ore), control drain with before/after, nexus life remaining, and
buildings damaged. These are the numbers you actually want when you're
deciding whether to hit the same target again.

The AAR reads instantly. No waiting for an animation to end. The
information density is the same or higher than BattleReplay - nothing
was removed, just restructured into a format you can scan in seconds
instead of watch over half a minute.

Scout reports are unchanged - they already showed as a static intel
dossier and continue to do so.

### Players page rebuilt as a ranked leaderboard

The old players list was a flat directory of identical cards. It's been
replaced by a proper **leaderboard** with visual hierarchy.

**Podium (influence sort only).** The top three commanders get a
gold / silver / bronze treatment - coloured top border, matching avatar
glow ring, and a medal tag. The podium auto-hides when you search or
switch to a different sort, giving way to a full ranked table.

**Ranked table.** Every player from rank four down (or all players when
the podium is hidden) sits in a clean two-panel table: rank, avatar,
name, faction chip, influence with a proportional mini-bar, and nexus
count. Top-three rows keep their metal-colour left border even inside the
table. All numbers are in monospace tabular figures so they don't jitter
on sort.

**Search and sort** work the same as before. Sorting by anything other
than influence, or typing in the search box, collapses the podium and
shows a single ranked list.

### Map legend added

A persistent legend bar now sits in the bottom-left corner of the map
overlay, above the zoom controls. It shows colour-keyed dots for the six
cell states: Active Nexus (amber), Your Nexus (green), Faction (blue),
Ally (purple), Enemy (red), and Target (orange). Each dot is an 8px
square with the label alongside in monospace text.

The bar wraps on small screens, and on very narrow viewports it lifts
above the zoom buttons so nothing overlaps.

### Map zoom ceiling raised

Maximum zoom is now **3.2×** (was 2.4×). The close-in view now lets you
read the coordinates and control numbers on a single cell without the
cell straining to fill the viewport. Minimum zoom and zoom step are
unchanged.

### Starfield density pass

The map background starfield has been expanded from 12 gradients to 44.
Four distinct layers now contribute: fine dim white stars (dense
fill), medium slightly-brighter white stars, bright warm/cool accent
stars, and nebula-tinted micro-stars in amber, green, blue, and purple.
The result is a proper deep-space field rather than a sparse scatter.

---

See you in the dark. - André
