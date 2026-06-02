## Vexara - Alpha Patch Notes v0.20

The Starfield map is rebuilt for buttery panning and zooming, new commanders
get a one-time relocation token to escape a bad starting spot, special NPC
nexuses hold off until a galaxy has found its feet, and the map seeds far
less clumpy.

---

### The Starfield map, rebuilt

The old map moved in **whole-cell jumps** — you'd drag, nothing happened,
then it snapped a tile sideways. Every step rebuilt the entire grid, which
is why panning and zooming felt heavy, especially on mobile.

The map is now driven by a **continuous camera**. The grid is rendered once
and slid around with a GPU transform, so the map tracks your cursor or
finger **pixel-for-pixel** with no rebuild between frames.

**What you'll feel:**

- **Drag-to-pan that follows your hand.** No more dead zone, no more
  snapping. The map moves exactly as far as you drag it.
- **Flick to coast.** Throw the map with a quick drag and it glides to a
  stop with natural momentum — then settles instantly when you grab it
  again.
- **Smooth, anchored zoom.** Scroll the wheel to zoom toward your cursor;
  pinch to zoom toward your fingers; the point under the pointer stays put
  while the map scales around it. New **+ / −** buttons (bottom-right) and
  the **+ / −** keys zoom too. Zoom is now a pure visual scale, so it never
  refetches the sector or blanks the markers.
- **Lighter, especially on mobile.** Tiles no longer re-render while you
  move, and a level-of-detail pass drops the heaviest glows and the tiny
  coordinate text when you're zoomed out, so a wide sector stays smooth on
  budget phones. Zoom back in and full detail returns.

The selected-nexus ring now lives on the tile itself, so it stays locked to
your selection as you pan and zoom. Everything else is intact — ownership
colours, faction/ally tints, faction targets, storm zones, event jumps, the
Jump box and Reset. On the Espionage tab a one-finger swipe still scrolls
the page (you select targets by tapping); pinch still zooms.

### New: one-time relocation token for fresh commanders

Land next to a bigger fish? Boxed into a corner with nothing to raid? Every
**fresh signup** now gets a single **relocation token** to fix it.

While you still hold your one starter nexus and your newbie shield is up, open
the map, select **any** nexus you'd like to set up shop near — an NPC, a
neighbour, even a heavyweight — and hit **Relocate Here**. Your nexus warps to
the nearest open tile beside it, intact: same buildings, same troops, same
resources, same points. Nothing resets.

A few honest details:

- **One use, then it's gone.** The token is consumed the moment you relocate.
- **It expires with your shield.** When newbie protection ends (3 days), the
  token does too. Use it while you're settling in, not as a late-game escape.
- **Single nexus only.** Once you've taken a second nexus, relocation is off
  the table — you're past the point it's meant for.
- **Not while you're mid-move.** You can't relocate with troops or attacks in
  transit to or from your nexus; let them resolve first.

Worried that someone will warp next to you and strike? They can't. A
nexus under newbie protection still **cannot attack or scout other players** —
moving next to you buys an opening, not a free hit, and by the time their shield
drops, the token is long spent.

> Eliminated and respawning? Respawns don't get a relocation token — it's a
> first-footing tool for brand-new commanders, not a way to reroll your spot
> after a loss.

### Special NPC nexuses now hold off in young galaxies

Resource Depots, Military Outposts, Supply Caches, and Forward Bases — every
neutral that carries a type bonus — no longer spawn in a galaxy's **first 5
days**. New galaxies open with plain **Neutral Settlements** only (the one
neutral with no special perk); the typed neutrals begin appearing once the
galaxy is 5 days old.

Why: the opening days are when the newest commanders are finding their feet
behind a 3-day shield. Seeding juicy special targets right away distorted the
early economy and surrounded fresh players with bait they couldn't yet defend
or exploit cleanly. A 5-day hold lets the first wave clear protection first,
with a two-day buffer, against a calm backdrop of ordinary neutrals.

This is keyed off **galaxy age**, so it only affects new galaxies. Existing
galaxies are already past the window and spawn the full mix as before.

### The map seeds far less clumpy

Neutral nexuses used to scatter with pure random placement, which — counter to
intuition — clumps. Maps ended up a dense diagonal blob through the middle with
empty edges. Placement now uses **best-candidate sampling**: each new nexus
considers several open spots and takes the one farthest from its nearest
neighbour, so the galaxy fills out evenly instead of piling up.

New players also get the same breathing room: **starter nexuses now respect the
spacing rule**, so you no longer spawn jammed directly against an NPC or another
player.

---

See you in the dark. - André
