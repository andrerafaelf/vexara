## Vexara - Alpha Patch Notes v0.23.2

A quality-of-life patch. The headline is **colorblind accessibility** — three
CVD modes are now available in Profile Settings that remap the Starfield's
nexus colours to scientifically-verified palettes. Two bug fixes land alongside
it: faction names now show correctly under usernames on mobile podium cards,
and Allied Support entries in the Combat After-Action Report now name the
nexus the support came from, not just the commander.

---

### Colorblind accessibility modes

The Starfield map uses colour as a primary signal for nexus ownership — your
nexus, faction nexuses, allies, enemies, and targets each have a distinct tint.
For commanders with colour vision deficiency (CVD) those tints overlap or
disappear entirely.

Three corrected palettes are now available under **Profile → Accessibility**:

**Protanopia / Deuteranopia.** Red-green deficiency is the most common form of
CVD. The default green (own) / red (enemy) pairing is replaced by a
gold / blue pair that reads clearly under both conditions. Faction nexuses shift
to teal, ally to rose, and target to deep orange — all four remain distinct from
each other and from the background.

**Tritanopia.** Blue-yellow deficiency is rarer. The default amber (active) and
blue (faction) signals are the ones that collapse. The corrected palette swaps
faction to magenta and ally to burnt orange, leaving amber and the remaining
colours intact.

Mode selection persists in `localStorage` and is applied instantly without a
page reload. The map legend updates alongside the map cells so the key always
matches what you're seeing. On next load the colour mode is restored before
first paint — there is no colour flash.

Commanders without CVD will see no change. The default palette is unchanged.

### Mobile podium: faction name now visible under username

On the **Players** leaderboard, the top-three podium cards were missing the
faction chip below the username on mobile viewports. The name and faction were
laid out in the same row as the influence and nexus stats, and on narrow
screens the stats block pushed the faction label out of view.

The identity block (username + faction chip) is now a vertical stack that takes
available width first. Stats are pinned to the right edge. Both are visible at
all viewport sizes.

### Combat AAR: Allied Support now shows source nexus

In the **After-Action Report**, Allied Support entries showed only the
contributing commander's username. If a player commands multiple nexuses and
sent support from a specific one, there was no way to know which nexus the
troops came from.

Support entries now show the nexus name below the username in a smaller
monospace label, matching the coordinate style used elsewhere in the AAR. If the
nexus name is the same as the username the label is suppressed — no redundant
text.

---

See you in the dark. - André
