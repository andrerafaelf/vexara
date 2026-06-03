## Vexara - Alpha Patch Notes v0.21

The largest single update to the game since alpha began: the Espionage
system is retired, Recruitment Core is replaced by three class-specific
production buildings, six units are renamed, two new units join the
roster, and Stealth Array gets a brand-new defensive role with a hidden
resource vault.

---

### Espionage is retired

Embed missions, sabotage, embedded operatives, the Espionage tab on your
nexus, and the Espionage log on the Reports page — all gone.

The system worked, but it sat off to the side and didn't pay rent for the
complexity it added. Most of you weren't running embed networks. Sabotage
was a niche tool. Recon Operative spent its life either gathering passive
intel or being the only counter to a sabotage attempt that never came.

**Recon Operative is reborn as a proper scout.** Send it as an attack at
an enemy nexus. It doesn't fight — it returns an intel report straight to
your combat log. That's it. Clean, predictable, no separate tab to
manage. If you've ever played a Tribal Wars-style 4X, this is the scout
you know.

> **Spent operatives:** any Recon Operatives that were in flight on
> embed/sabotage missions when this update lands are refunded to your
> garrison.

### Recruitment Core is retired; three class buildings take over

Recruitment Core trained every unit and gated every troop tier through
a single level. That's gone. Three new buildings replace it, one per
combat class:

- **Hangar Bay** — produces Mobile-class units
- **Plasma Forge** — produces Fire-class units
- **Armor Foundry** — produces Armor-class units

Each gates and accelerates **only its own class**. A mobile specialist
who maxes Hangar Bay gets the same train-time bonus on Mobile units that
a maxed Recruitment Core used to give on everything. A generalist who
builds all three pays three times the investment but gets the bonus on
every class.

**Specials (Recon Operative, Overseer) train from Command Core now.**
Their training time is unaffected by the class buildings.

**Existing players lose nothing.** Every Recruitment Core level you had
when this update lands was granted to all three new buildings at the
same level. A maxed RC20 is now a Lv20 Hangar Bay AND a Lv20 Plasma
Forge AND a Lv20 Armor Foundry — no rebuilding, no resource refund
math, just instant equivalent capacity across every class.

Building queue entries for Recruitment Core that were still pending at
update time were removed; resources already debited are not refunded —
queue your three new buildings instead. The dropped slot is free
capacity in your queue.

### Six units renamed

A coherent sci-fi roster instead of a mix of generic and evocative names.
Saved troops, in-flight attacks, training queues, and the unit counts on
every nexus carry over verbatim — only the displayed name changes:

| Old | New |
|---|---|
| Lancer Drone | **Sentinel Lancer** |
| Breaker Unit | **Vanguard Breaker** |
| Skimmer Bike | **Wraith Skimmer** |
| Interceptor Bike | **Phantom Lance** |
| Suppressor Team | **Pyre Suppressor** |
| Disruptor Unit | **Arc Disruptor** |

Stats, costs, train times, and class are unchanged for all six. The
Mobile-class trio (Wraith Skimmer, Phantom Lance, Void Stalker) now
reads as a coherent "ghost-class" of fast strikers, and the Fire roster
tightens around energy-weapon language.

Historical combat reports keep their original wording — a 6-month-old
battle log still reads "Skimmer Bike" because that's what was sent
that day.

### Two new units join the roster

**Siege Colossus** *(Armor attack)* — the elite siege walker. Highest
single-unit attack and survivability in the game, slowest speed (6),
highest population cost (5). Built to crack fortified Nexuses. Pairs
with the Annihilator Platform as the heavy duo of the endgame line.
Unlocks at **Armor Foundry Lv13, Command Core Lv10, Armory Lv5**.

**Aegis Skirmisher** *(Mobile defense)* — the fast-response defender.
Lower defense than Bulwark Guard but high speed (24) lets it intercept
incoming Mobile attackers rather than passively absorb hits. Pop 2,
same tier as Bulwark Guard. Unlocks at **Hangar Bay Lv5, Shield Grid
Lv2**.

Final roster after the restructure: **8 attackers, 6 defenders, 2
specials**. Every class has both an attacker and a defender available
from the same building.

### Stealth Array gets a hidden vault — and is now far more useful

Stealth Array was the counter-espionage building. Now that espionage is
gone, the building was rebuilt around a new defensive identity.

**Hidden vault.** A portion of your stockpile of each resource is
**hidden from raids and from scout reports**. Raiders can't loot what
they can't see; scouts report the visible portion only. The hidden
cap grows with each Stealth Array level — about **49,000 of each
resource at Lv15** (the max). The vault auto-fills: the first units
of each resource you accumulate go there until full, then everything
above the cap sits in normal lootable storage. No buttons, no
deposits — just a war-recovery fund that's always there.

**Scout fail chance.** A small per-level chance (1.5% per level,
capped at 22.5% at Lv15) that an incoming scout fails outright —
operatives lost, no intel returned. Low by design; intel is still a
reliable strategic tool even against a maxed defender.

**Unlock lowered.** Stealth Array now becomes available at Command
Core Lv5 (was Lv7) — the new role is useful to more players, so the
gate sits earlier in the build order.

### Reworked Armory milestones

Armory's level dependencies were tied to Recruitment Core. Now they're
gated by the class building that matches what each Armory tier unlocks:

- **Armory Lv3** (unlocks Void Stalker, a Mobile unit) → requires
  Hangar Bay Lv5
- **Armory Lv5** (unlocks Plasma Turret, a Fire unit) → requires
  Plasma Forge Lv7 + Shield Grid Lv3
- **Armory Lv10** (the elite-tier cap) → requires Command Core Lv10
  + Armor Foundry Lv10

### Reworked points & raid loot

- **Each class building is worth 8 points** (Recruitment Core was 16).
  A three-building generalist scores 24 — a 1.5× reward for the broader
  investment. A single-class specialist scores 8 — modest cost for
  the per-class trade-off.
- **Raid loot calc respects the hidden vault.** Defenders with Stealth
  Array see less of their stockpile stolen on a successful raid; the
  hidden portion is untouchable. Defender's actual balance stays intact —
  raiders just can't reach it.

### A note on map and starter changes (already in 0.20)

If you're catching up: 0.20 shipped a rebuilt Starfield map with
buttery panning and zooming, one-time relocation tokens for fresh
commanders, a 5-day hold on special NPC nexus types in young galaxies,
and an even-spread map seeding pass. Those changes carry forward —
the map you're playing on today is the rebuilt one.

---

See you in the dark. - André
