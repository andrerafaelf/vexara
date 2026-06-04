## Vexara - Alpha Patch Notes v0.22

The largest single update to the game since alpha began: combat is
rebalanced from the ground up so the counter triangle finally works on
both attack **and** defense, the Espionage system is retired,
Recruitment Core is replaced by three class-specific production
buildings, six units are renamed, two new units join the roster, and
Stealth Array gets a brand-new defensive role with a hidden resource
vault.

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

Costs, train times, and class are unchanged for all six (their combat
stats were re-tuned in the combat rebalance below). The Mobile-class
trio (Wraith Skimmer, Phantom Lance, Void Stalker) now reads as a
coherent "ghost-class" of fast strikers, and the Fire roster tightens
around energy-weapon language.

Historical combat reports keep their original wording — a 6-month-old
battle log still reads "Skimmer Bike" because that's what was sent
that day.

### Two new units join the roster

**Siege Colossus** *(Armor striker)* — the elite siege hammer. The
heaviest single attacker in the game with enough defense to survive its
own assault, slowest speed (6), highest population cost (5). Built to
crack fortified Nexuses, and Armor counters Fire on the way in. Pairs
with the Annihilator Platform as the heavy duo of the endgame line.
Unlocks at **Armor Foundry Lv13, Command Core Lv10, Armory Lv5**.

**Aegis Skirmisher** *(Mobile anvil)* — the Mobile-class garrison
anchor. It's the defensive answer to Armor attackers (Mobile counters
Armor on defense too) and fast enough (24) to redeploy where the wall
is needed. Pop 2, same tier as Bulwark Guard. Unlocks at **Hangar Bay
Lv5, Shield Grid Lv2**.

Every combat class now has both a **striker** (high-attack offensive
unit) and an **anvil** (high-defense garrison unit) available from the
same building — see the combat rebalance below for what that means.

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

### Combat rebalance: the counter triangle now cuts both ways

This is the big one. The class triangle — Mobile beats Armor, Armor
beats Fire, Fire beats Mobile — has been the heart of Vexara combat
since day one. But there was a quiet flaw: the counter only ever
boosted the **attacker's** damage. Defense was raw. That meant the
single best garrison was always "stack whatever unit has the biggest
defense number," no matter what was coming at you — and the triangle
the codex promised you on defense simply wasn't there.

**Now the triangle is symmetric.** A defending unit whose class counters
the incoming attacker has its **defense amplified**; a unit being
countered defends for less. Bringing the wrong class into a fight is
punished on both sides of the engagement. Scouting your target's
composition and bringing the class that beats it is no longer a nice
bonus — it's the deciding factor.

The defensive counter spread is deliberately a touch milder than the
attack side (×1.25 / ×0.80 on defense vs ×1.35 / ×0.75 on attack), so
an attacker keeps a small initiative and a defender can't win simply by
sitting still.

**Every unit is now clearly a striker or an anvil.**

- **Strikers** are high-attack, low-defense — your offensive units.
  Sending them on attacks, where their counter and their attack stat
  both shine.
- **Anvils** are high-defense, low-attack — your garrison units. They
  hold the wall, and the triangle makes them shine against the class
  they counter.

A glass-cannon striker left on defense barely contributes its tiny
defense stat *and* can be class-countered on top of it, so a striker
garrison folds fast. Garrison with anvils, attack with strikers.

**Every class has an anvil, so every attacker has an answer:**

- **Armor anvils** — Assault Trooper, Bulwark Guard, Siege Mech — stop Fire.
- **Mobile anvil** — Aegis Skirmisher — stops Armor.
- **Fire anvils** — Arc Disruptor and Plasma Turret — stop Mobile.

**Arc Disruptor is reborn as the Fire-class anvil.** It used to be a
glass-cannon fire striker that overlapped with the Suppressor. The
Fire class had no mobile-stopping garrison unit except the immobile
Plasma Turret — so a mobile rush had no mid-game answer on the wall.
Arc Disruptor now trades raw attack for real defense (an EMP
interceptor) and becomes the mid-game answer to Mobile raiders.

**Sentinel Lancer flips the other way** — from a near-useless
defensive drone into a genuine cheap Fire striker, giving the early
game a real fire attacker.

**Full stat pass.** Every combat unit's attack and defense were
re-tuned so the *counter* decides equal-resource fights, not whichever
unit happens to have the biggest raw number. Attack-per-population AND
attack-per-resource both rise with tier, so massing the cheapest unit
is never the optimal army — Tier-1 strikers (Vanguard Breaker, Sentinel
Lancer) had their attack trimmed so teching up always beats spamming
openers, even in the resource-rich early game. They still win their
counter matchups; they're just no longer a substitute for a real army.
Check the in-game Codex for every unit's new line — the combat
calculator and scout reports already reflect the new math.

**Turtles are strong but no longer unbreakable.** A deep defensive
nexus — anvils, high Shield Grid, a Plasma Turret — is genuinely hard
to crack. But a correctly-countered, scouted attack with enough
committed force *will* break it; it just costs you real losses to do
it. A blind or wrong-class assault still bounces off, no matter how
big. (Shield Grid was trimmed from +2% to +1.5% defense per level so a
high-shield wall can't stack into true invincibility on top of the new
class-amplified defense.)

**Stationing follows the new roles.** Lending troops to allies or
transferring between your own nexuses is defense-only, so the
stationable list is now the five anvils: Assault Trooper, Bulwark
Guard, Siege Mech, Aegis Skirmisher, and **Arc Disruptor** (newly
eligible as a defender). **Sentinel Lancer** is no longer stationable —
it's a striker now.

> **Nothing is lost.** Your troop counts, in-flight attacks, and
> garrisons all carry over untouched — only the numbers behind how
> they fight have changed. Open the Codex and the combat calculator to
> re-plan your army around the new triangle before your next war.

### A note on map and starter changes (already in 0.20)

If you're catching up: 0.20 shipped a rebuilt Starfield map with
buttery panning and zooming, one-time relocation tokens for fresh
commanders, a 5-day hold on special NPC nexus types in young galaxies,
and an even-spread map seeding pass. Those changes carry forward —
the map you're playing on today is the rebuilt one.

---

See you in the dark. - André
