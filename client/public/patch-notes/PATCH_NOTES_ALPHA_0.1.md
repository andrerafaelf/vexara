## Vexara — Alpha Patch Notes v0.1

The first patch of the alpha. Focus: smoother first hour, less drift in the
opening minutes, fewer rough edges around the UI.

---

### New player experience

- **Starting stockpile buffed** from 500 → **1,500** of each resource. Your
  first nexus now has enough to start building immediately instead of waiting.
- **Storage Vault base capacity raised** from 1,000 → **1,500** (Lv1 now
  caps at 2,250 instead of 1,500). The buffed starting stockpile now fits
  with headroom and your farms keep ticking from the moment you spawn
  instead of capping out instantly. Higher Storage Vault levels scale up
  proportionally.
- **Base resource production raised** from 600/h → **800/h** per
  farm/forge/extractor. That carries through every later level since the
  multiplier (1.35× per level) stays the same.
- **Recruitment Core cost lowered** from 200/170/90 → **180/150/80**.
- **Early build times lengthened** so resources have time to tick in while
  your first structures finish. The opening (Command Core → Recruitment Core
  → first troops) now runs about 2–3 minutes per step instead of seconds.

### Reworked first quest line

The intro questline now walks you through the entire opening loop end to end:

1. **Power The Nexus** — Command Core to Lv1
2. **Reinforce Command** — Command Core to Lv2 (unlocks Recruitment Core)
3. **Enable Recruitment** — Recruitment Core to Lv1
4. **Train Your First Troops** — train 5 Assault Troopers
5. **Loot A Nexus** — send your first scavenge raid from the Starfield

The contextual "Next up" tips in your nexus view now match this sequence
step-by-step, so you should never run out of things to do during the first
sitting.

Intro reward bumped from 500 → **750** of each resource so the early game has
a touch more breathing room when the chapter clears.

### UI / Header

- **Login link added** to the landing and codex headers (visible when not
  signed in) — clearly styled as a secondary button next to **Enlist**.
- **Upgrade Building button** text is now legible — previously the dark text
  on a dark amber background was nearly invisible. Same fix applied to the
  troop **Train** button so every primary action shares the same look.
- New **Players** tab in the in-game header. Browse everyone in your galaxy,
  search by name or faction, and sort by influence / nexuses / join date.

### Factions & Social

- Faction names in the **All Factions** browser are now **clickable** —
  selecting one expands the card to show its current members and roles.
- The new **Players** list (`/players`) shows every player in the galaxy with
  their influence, nexus count, and faction affiliation. Styled to match the
  faction browser.

### World Map colour-coding

The map now distinguishes three friendly states so you can read alliances at
a glance:

- 🟢 **Green** — your own nexuses
- 🔵 **Cyan** — same-faction members
- 🟣 **Violet** — individual allies / friends list
- 🔴 **Red** — everyone else

Legend in the map sidebar updated to match.

### Bug fixes

- **Resource bonus preview** no longer shows the same number on both sides of
  the arrow (e.g. "+800/h → +800/h"). The level-0 clamp that caused this has
  been removed; production at level 0 is now reported as 0/h.
- **"Ready to apply"** label is gone. Completed building upgrades and troop
  training are applied automatically by the server, and the client now polls
  aggressively (~1s) as a queue item approaches completion so the change
  lands almost immediately. The transient label now reads **"Finishing…"**.

---

See you in the dark. - André
