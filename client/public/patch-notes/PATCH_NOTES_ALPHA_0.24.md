## Vexara - Beta Patch Notes v0.24

**Beta #1 opens 28 June 2026.** The late-alpha period wraps up with
this patch and the next galaxy launches as the first official Beta test.
You can opt in to an email alert on the galaxy selection screen so we'll
ping you the moment it goes live.

This patch is about your first hour. New commanders told us the opening
felt like staring at a timer, that resources kept scrolling out of
sight, and that combat's whole reason for existing — the class triangle
— was invisible until you lost an army to it. So this patch is an
onboarding and legibility pass: a much faster first build, a resource
bar that never leaves the screen, daily objectives that follow you
across every tab, and a set of in-context coaching cues that teach the
combat meta **without changing a single combat number.**

---

### Your first build is fast now

A brand-new nexus starts with nothing built, so a new player's very
first action was a Command Core upgrade that took two full minutes with
no discount yet applied. Two minutes of watching a bar before the game
opens up.

That first build is now **accelerated to a fixed ~25 seconds.** It is a
one-time speed-up — it only ever applies to the Command Core 0 → 1
upgrade, which by definition can only happen once per nexus — and the
build card flags it with an **Accelerated first build** chip so it's
clear this is a head start, not the normal rate. Every later build
takes its usual time. Nothing about the economy, training, or combat
timing changed; this is purely the opening build.

### A guided beat while it builds

The moment that first Core upgrade starts, a short coaching card now
explains the two things you'll use immediately — the resource bar and
the build queue — so the (now brief) wait teaches instead of idles. It
clears itself the instant the Core lands and never gates a click: like
the rest of the tutorial, it's a hint you can ignore.

### Resources stay on screen, always

The live resource bar — Biomass, Alloy, Ore, with their per-hour
production — used to live inside the nexus page body, so it scrolled
away the moment you looked at buildings or troops. Players were
scrolling back to the top constantly just to check what they could
afford.

It now lives in the **top bar, pinned on every page**, the way an RTS
resource readout should. It follows your selected nexus, so you can be
on the Starfield or in the Market and still see your economy at a
glance. On phones it condenses to a compact three-value strip so it
fits without crowding the header.

### Daily Quests follow you across every tab

Daily Quests used to render only on the nexus Overview, which meant the
"upgrade a building" or "train a unit" objective vanished exactly when
you switched to the Buildings or Troops tab to do it. A compact Daily
Quests tracker now sits in the **left sidebar, visible on every tab**,
with progress and a claim button. The full reward breakdown still lives
on the Overview panel; the sidebar version is the at-a-glance tracker.

### The combat triangle is finally taught, not discovered the hard way

Vexara's combat is built on a class triangle — **Mobile beats Armor,
Armor beats Fire, Fire beats Mobile** — and on a striker/anvil split
where some units are built to attack and others to defend. None of that
was visible to a new player until they lost a fleet to it. This patch
surfaces the existing meta everywhere you make a combat decision. **No
balance numbers changed** — the triangle, the stats, the loss curves are
all exactly as they were; we just made them readable.

- **A combat primer** appears right before you train your first troops,
  laying out the triangle and the striker/anvil idea in three lines.
- **Every unit card now shows two badges:** its **role** (Striker /
  Anvil / Scout / Conquest) and its **class with what it beats** (e.g.
  "Mobile ▸ Armor"). Roles are derived straight from each unit's stats,
  so they can never drift from the real math.
- **A glass-cannon garrison warning** flags when a nexus is held mostly
  by Strikers — high-attack units that defend poorly — and nudges you to
  train an Anvil to actually hold the position.
- **A pre-attack matchup hint** in the attack panel reads your scouted
  target and your current selection and tells you whether the triangle
  **favours or counters** your composition before you commit — with a
  one-click link straight to the battle calculator.
- **War Room matchup verdict.** When you pledge troops to a coordinated
  operation, the War Room now reads your own scout intel on the target
  and tells you whether your pledge is **favoured or countered** by the
  actual defending garrison — the same verdict as the solo attack panel —
  and every committed slot shows a ✓ / ✕ matchup chip so the whole
  faction can see which pledges have the class edge. If nobody's scouted
  the target yet, it falls back to composition coaching (don't pledge a
  single-class wave that's easy to hard-counter) and prompts you to scout
  for a precise read.

### Notes

- The combat math is untouched. Class counters (1.35 / 0.75 on attack,
  1.25 / 0.80 on defense), Targeting Core amplification, Shield Grid,
  and the loss curves are all exactly as they shipped in v0.23. This
  patch only makes the existing system legible and the opening faster.
- The codex and how-to-play guide pick up the role/class glossary and a
  short "read the matchup before you strike" section for new commanders.
