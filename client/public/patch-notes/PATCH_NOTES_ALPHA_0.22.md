## Vexara - Alpha Patch Notes v0.22

The largest single update to the game since alpha began: combat is
rebalanced from the ground up so the counter triangle finally works on
both attack **and** defense, the economy is overhauled so resources
matter again, the Espionage system is retired, Recruitment Core is
replaced by three class-specific production buildings, six units are
renamed, two new units join the roster, the Armory becomes the Targeting
Core, and Stealth Array gets a brand-new defensive role with a hidden
resource vault.

---

### Espionage is retired

Embed missions, sabotage, embedded operatives, the Espionage tab on your
nexus, and the Espionage log on the Reports page , all gone.

The system worked, but it sat off to the side and didn't pay rent for the
complexity it added. Most of you weren't running embed networks. Sabotage
was a niche tool. Recon Operative spent its life either gathering passive
intel or being the only counter to a sabotage attempt that never came.

**Recon Operative is reborn as a proper scout.** Send it as an attack at
an enemy nexus. It doesn't fight , it returns an intel report straight to
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

- **Hangar Bay** , produces Mobile-class units
- **Plasma Forge** , produces Fire-class units
- **Armor Foundry** , produces Armor-class units

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
Forge AND a Lv20 Armor Foundry , no rebuilding, no resource refund
math, just instant equivalent capacity across every class.

Building queue entries for Recruitment Core that were still pending at
update time were removed; resources already debited are not refunded ,
queue your three new buildings instead. The dropped slot is free
capacity in your queue.

### Six units renamed

A coherent sci-fi roster instead of a mix of generic and evocative names.
Saved troops, in-flight attacks, training queues, and the unit counts on
every nexus carry over verbatim , only the displayed name changes:

| Old              | New                  |
| ---------------- | -------------------- |
| Lancer Drone     | **Sentinel Lancer**  |
| Breaker Unit     | **Vanguard Breaker** |
| Skimmer Bike     | **Wraith Skimmer**   |
| Interceptor Bike | **Phantom Lance**    |
| Suppressor Team  | **Pyre Suppressor**  |
| Disruptor Unit   | **Arc Disruptor**    |

Costs, train times, and class are unchanged for all six (their combat
stats were re-tuned in the combat rebalance below). The Mobile-class
trio (Wraith Skimmer, Phantom Lance, Void Stalker) now reads as a
coherent "ghost-class" of fast strikers, and the Fire roster tightens
around energy-weapon language.

Historical combat logs keep their original wording , a 6-month-old
battle log still reads "Skimmer Bike" because that's what was sent
that day.

### Two new units join the roster

**Siege Colossus** _(Armor striker)_ , the elite siege hammer. The
heaviest single attacker in the game with enough defense to survive its
own assault, and the slowest speed (6). Built to crack fortified
Nexuses, and Armor counters Fire on the way in. Pairs with the
Annihilator Platform as the heavy duo of the endgame line. Unlocks at
**Armor Foundry Lv13, Command Core Lv10, Targeting Core Lv5**.

**Aegis Skirmisher** _(Mobile anvil)_ , the Mobile-class garrison
anchor. It's the defensive answer to Armor attackers (Mobile counters
Armor on defense too) and fast enough (24) to redeploy where the wall
is needed. Pop 2, same tier as Bulwark Guard. Unlocks at **Hangar Bay
Lv5, Shield Grid Lv2**.

Every combat class now has both a **striker** (high-attack offensive
unit) and an **anvil** (high-defense garrison unit) available from the
same building , see the combat rebalance below for what that means.

### Stealth Array gets a hidden vault - and is now far more useful

Stealth Array was the counter-espionage building. Now that espionage is
gone, the building was rebuilt around a new defensive identity.

**Hidden vault.** A portion of your stockpile of each resource is
**hidden from raids and from scout reports**. Raiders can't loot what
they can't see; scouts report the visible portion only. The hidden
cap grows with each Stealth Array level , about **49,000 of each
resource at Lv15** (the max). The vault auto-fills: the first units
of each resource you accumulate go there until full, then everything
above the cap sits in normal lootable storage. No buttons, no
deposits , just a war-recovery fund that's always there.

**Scout fail chance.** A small per-level chance (1.5% per level,
capped at 22.5% at Lv15) that an incoming scout fails outright ,
operatives lost, no intel returned. Low by design; intel is still a
reliable strategic tool even against a maxed defender.

**Unlock lowered.** Stealth Array now becomes available at Command
Core Lv5 (was Lv7) , the new role is useful to more players, so the
gate sits earlier in the build order.

### The Armory is now the Targeting Core

"Armory" and "Armor Foundry" were too easy to confuse , they look related
but do completely different jobs (Armor Foundry produces the Armor combat
class; the old Armory amplifies your _attack_ counters and gates elite
units). The attack-amplifier building is **renamed Targeting Core**. Same
building, same level, same cost, same effects , only the name changed, and
your current level carries over untouched.

**Reworked Targeting Core milestones.** Its level dependencies were tied to
Recruitment Core; now they're gated by the class building that matches what
each tier unlocks:

- **Targeting Core Lv3** (unlocks Void Stalker, a Mobile unit) → requires
  Hangar Bay Lv5
- **Targeting Core Lv5** (unlocks Plasma Turret + Siege Colossus) → requires
  Plasma Forge Lv7 + Shield Grid Lv3
- **Targeting Core Lv10** (the elite-tier cap) → requires Command Core Lv10
  - Armor Foundry Lv10

### Reworked points & raid loot

- **Each class building is worth 8 points** (Recruitment Core was 16).
  A three-building generalist scores 24 , a 1.5× reward for the broader
  investment. A single-class specialist scores 8 , modest cost for
  the per-class trade-off.
- **Raid loot calc respects the hidden vault.** Defenders with Stealth
  Array see less of their stockpile stolen on a successful raid; the
  hidden portion is untouchable. Defender's actual balance stays intact ,
  raiders just can't reach it.

### Combat rebalance: the counter triangle now cuts both ways

This is the big one. The class triangle , Mobile beats Armor, Armor
beats Fire, Fire beats Mobile , has been the heart of Vexara combat
since day one. But there was a quiet flaw: the counter only ever
boosted the **attacker's** damage. Defense was raw. That meant the
single best garrison was always "stack whatever unit has the biggest
defense number," no matter what was coming at you , and the triangle
the codex promised you on defense simply wasn't there.

**Now the triangle is symmetric.** A defending unit whose class counters
the incoming attacker has its **defense amplified**; a unit being
countered defends for less. Bringing the wrong class into a fight is
punished on both sides of the engagement. Scouting your target's
composition and bringing the class that beats it is no longer a nice
bonus , it's the deciding factor.

The defensive counter spread is deliberately a touch milder than the
attack side (×1.25 / ×0.80 on defense vs ×1.35 / ×0.75 on attack), so
an attacker keeps a small initiative and a defender can't win simply by
sitting still.

**Every unit is now clearly a striker or an anvil.**

- **Strikers** are high-attack, low-defense , your offensive units.
  Sending them on attacks, where their counter and their attack stat
  both shine.
- **Anvils** are high-defense, low-attack , your garrison units. They
  hold the wall, and the triangle makes them shine against the class
  they counter.

A glass-cannon striker left on defense barely contributes its tiny
defense stat _and_ can be class-countered on top of it, so a striker
garrison folds fast. Garrison with anvils, attack with strikers.

**Every class has an anvil, so every attacker has an answer:**

- **Armor anvils** , Assault Trooper, Bulwark Guard, Siege Mech , stop Fire.
- **Mobile anvil** , Aegis Skirmisher , stops Armor.
- **Fire anvils** , Arc Disruptor and Plasma Turret , stop Mobile.

**Arc Disruptor is reborn as the Fire-class anvil.** It used to be a
glass-cannon fire striker that overlapped with the Suppressor. The
Fire class had no mobile-stopping garrison unit except the immobile
Plasma Turret , so a mobile rush had no mid-game answer on the wall.
Arc Disruptor now trades raw attack for real defense (an EMP
interceptor) and becomes the mid-game answer to Mobile raiders.

**Sentinel Lancer flips the other way** , from a near-useless
defensive drone into a genuine cheap Fire striker, giving the early
game a real fire attacker.

**Full stat pass.** Every combat unit's attack and defense were
re-tuned so the _counter_ decides equal-resource fights, not whichever
unit happens to have the biggest raw number. Attack-per-population AND
attack-per-resource both rise with tier, so massing the cheapest unit
is never the optimal army , Tier-1 strikers (Vanguard Breaker, Sentinel
Lancer) had their attack trimmed so teching up always beats spamming
openers, even in the resource-rich early game. They still win their
counter matchups; they're just no longer a substitute for a real army.
Check the in-game Codex for every unit's new line , the combat
calculator and scout reports already reflect the new math.

**Turtles are strong but no longer unbreakable.** A deep defensive
nexus , anvils, high Shield Grid, a Plasma Turret , is genuinely hard
to crack. But a correctly-countered, scouted attack with enough
committed force _will_ break it; it just costs you real losses to do
it. A blind or wrong-class assault still bounces off, no matter how
big. (Shield Grid was trimmed from +2% to +1.5% defense per level so a
high-shield wall can't stack into true invincibility on top of the new
class-amplified defense.)

**Stationing follows the new roles.** Lending troops to allies or
transferring between your own nexuses is defense-only, so the
stationable list is now the five anvils: Assault Trooper, Bulwark
Guard, Siege Mech, Aegis Skirmisher, and **Arc Disruptor** (newly
eligible as a defender). **Sentinel Lancer** is no longer stationable ,
it's a striker now.

> **Nothing is lost.** Your troop counts, in-flight attacks, and
> garrisons all carry over untouched , only the numbers behind how
> they fight have changed. Open the Codex and the combat calculator to
> re-plan your army around the new triangle before your next war.

### Economy overhaul: resources matter again

With combat rebuilt, we turned the same rigor on everything underneath
it. At the high end, **resources had quietly stopped mattering** , you
could gather a war chest in an afternoon while the real wall was always
training time. Three fixes:

**Production grows faster.** Output per Farm/Forge/Extractor level now
scales by **1.35** (was 1.32). Your base output is unchanged , a new
nexus produces exactly what it did before , but the curve climbs harder
through the mid and late game where resources had gone decorative. A
maxed economy produces roughly **75% more** at the top than it used to.

**Storage rebalanced , farms are no longer a decoy.** Storage cap now
grows by **1.48** per Storage Vault level (was 1.50). It reads like a
nerf; it isn't. Storage was outpacing production so badly that late
vaults took **30+ hours** to fill from your own output , quietly making
Storage Vault a must-build and your Farms an afterthought. Now the
time to fill a vault from empty stays in a sane **3–16 hour** band
instead of running away to 32. Storage still leads production at every
level (so raiding still pays , a full vault is always partly stolen
goods), but **upgrading a Farm is finally a real decision.**

**Unit costs re-tuned so teching up always wins.** Every striker's
**resource cost** was re-tuned so attack-per-resource rises cleanly with
tier. Population and training times are unchanged; only the
biomass/alloy/ore totals moved, and each unit keeps its old resource
mix. The headline fix: the **Siege Colossus was secretly the worst deal
in the game** , per resource spent, the elite siege hammer delivered
_less_ attack than a Tier-1 Sentinel Lancer, so massing cheap units was
cheaper than building the unit designed to crack fortresses. Backwards,
and fixed.

**Siege Colossus also drops from population 5 to 4.** It was
double-taxed , worst attack-per-resource _and_ worst
attack-per-population among the Tier-3 strikers, which buried the
flagship in a niche. At pop 4 you can field it as a real elite line.
(This changes nothing about how a battle resolves , population only
governs how many troops a nexus can house, never the math of a fight.)

| Unit                 | Old total cost | New total cost              |
| -------------------- | -------------- | --------------------------- |
| Sentinel Lancer      | 500            | 650                         |
| Pyre Suppressor      | 1,300          | 1,500                       |
| Wraith Skimmer       | 1,875          | 1,950                       |
| Phantom Lance        | 2,250          | 2,350                       |
| Void Stalker         | 3,400          | 3,450                       |
| Annihilator Platform | 6,750          | 6,400                       |
| Siege Colossus       | 7,200          | **6,200** _(and pop 5 → 4)_ |

> **Nothing you own is touched.** Existing troops, in-flight attacks,
> and garrisons carry over exactly , only the cost of _building new
> ones_ changes. The Codex already shows every unit's new cost.

A re-pricing of **anvil (garrison) units** and a re-check of two elite
attack/defense ratios were drafted but deliberately **held back** ,
they reach into combat's tuning, and anything that touches the combat
triangle waits for a combat-balance pass rather than riding an economy
update. Same discipline that kept the combat rework clean.

### Quality of life

**Troops return home instantly.** Surviving troops no longer crawl back
on a full return trip after a strike. The moment a battle resolves, your
survivors (and any loot) are on their way home and land almost
immediately , no more watching a victorious army trudge back across the
map. The same applies to scouts heading home, bounced support, and any
garrison you recall. (Outbound travel is unchanged , the distance to
your target still matters; only the trip _home_ is now instant.)

**Conquered nexuses keep their name.** Take an enemy nexus and it stays
named what it was , your new prize keeps its identity instead of being
flattened to a generic "Conquered Nexus." Rename it yourself if you like.

**No more phantom "Defeat" reports.** Send several waves at one target
and, once an early wave conquers it, the later waves arrive to find the
nexus already yours and simply turn around , untouched, no losses. Those
fly-homes used to clutter your combat log as bogus "Defeat" entries.
They're gone now; only real engagements show up.

**New Logistics tab , move resources without the star-map hunt.** Open any
nexus and you'll find a **Logistics** tab: a single table of every base you
own, each resource shown as current/cap with a fill bar, color-coded so a
base running **low** (amber) or **near full** (red, about to waste overflow)
jumps out at a glance. Hit **Send** on any row , or the **Send Resources**
button , and a transfer dialog opens with your nexuses in dropdowns, the
destination's free space shown live, and a **Max** button that fills the most
that fits so you can never overflow. Opening Send from a row even
**pre-suggests** a sensible top-up. No more bouncing through the star map to
find a base, eyeball its storage, and guess an amount. (Transfers between your
own nexuses remain instant.)

**Send resources to faction members.** The same Send Resources dialog now has
a **Faction** tab alongside _My Empire_. Pick any of your faction-mates'
nexuses as the destination , their bases appear in the dropdown labeled by
owner name and coordinates. A **10% transit tax** applies: you send 100,
they receive 90. The tax is shown live in the dialog footer before you
confirm. The Max and smart top-up buttons account for the tax automatically
so you can never accidentally overflow the recipient. Newbie-protected bases
(fresh players under their protection window) cannot receive faction transfers.

### A note on map and starter changes (already in 0.20)

If you're catching up: 0.20 shipped a rebuilt Starfield map with
buttery panning and zooming, one-time relocation tokens for fresh
commanders, a 5-day hold on special NPC nexus types in young galaxies,
and an even-spread map seeding pass. Those changes carry forward ,
the map you're playing on today is the rebuilt one.

---

### Galaxy picker & lobby polish (0.22 continued)

Small quality-of-life pass on the galaxy selection screen:

- **Close button** now has a clipped corner matching the rest of the
  UI's industrial design language.
- **Dates now read "Starts on" / "Started"** instead of the generic
  "Created at" label. Pending galaxies show the start date; active
  galaxies show when play began.
- **Timezone line is now live-computed** from the galaxy's actual
  start time rather than hardcoded offsets , times shown for UTC,
  Lisbon, Paris, New York, and Los Angeles are now correct regardless
  of DST.
- **Locked galaxies** (ones where registration is closed) now show a
  "Locked" tag and a disabled button rather than silently rejecting
  your join attempt. Already-joined players can still enter and play
  normally.

---

### Scout combat rework - two-gate system

Scouting is no longer a flat dice roll against the Stealth Array. It's
now a proper Tribal Wars-style scout-vs-scout fight followed by the
Stealth Array interception:

**Gate 1: Recon vs Recon.** Your incoming scouts fight the defender's
garrisoned Recon Operatives. Both sides take proportional losses (same
casualty curves as regular combat). If you win, your survivors proceed
to Gate 2. If the defender wipes your scouts, no intel is returned.

**Gate 2: Stealth Array roll.** If any of your scouts survived Gate 1,
the Stealth Array still gets its per-level interception chance (1.5%
per level, max 22.5% at Lv15). If intercepted, remaining scouts are
lost and no intel comes back.

**What this means:**

- Sending more Recon Operatives now matters. 1 scout into a defended
  nexus will likely fail. 20 scouts will break through.
- Defenders can garrison Recon Operatives to block enemy intel.
  Repeated probing wears down the garrison.
- The Stealth Array is now a second line of defense, not the only one.
- Scout the enemy's scout count. Counter-intel is a real game now.

### Recon Operative training time scales with Stealth Array

Recon Operatives now train faster based on your Stealth Array level.
Same curve as class buildings: -9% per level. At Stealth Array Lv15,
training time drops from 180s to ~45s.

This rewards investing in your intel infrastructure. A high Stealth
Array makes you harder to scout AND lets you produce scouts faster to
probe the enemy.

---

### Starfield & combat-log polish

A pass over the map and reports UI:

- **Command Core art now fills the whole map tile.** Nexuses used to
  draw a small building thumbnail floating in the cell; the art now
  spans the full tile, with coordinates and the "Target" label pinned
  along the bottom edge so they stay readable on top.
- **Faction targets are cleaner on the map.** The little crosshair badge
  is gone , a marked nexus now reads as a target from the orange cell
  outline plus the "TARGET" label alone.
- **Marking a target works the way you'd expect.** Targeting a nexus
  shows on the map instantly, and re-opening an already-marked nexus now
  correctly offers "Unmark Target" so you can clear it. The inspect
  drawer also shows **Targeted by: <player>** so your faction knows who
  flagged it.
- **Combat logs are de-cluttered.** The decorative icons on combat-log
  rows (and the loot coin) have been removed , the result text and
  numbers carry the information on their own.

---

See you in the dark. - André
