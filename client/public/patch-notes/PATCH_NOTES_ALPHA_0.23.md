## Vexara - Alpha Patch Notes v0.23

Two big things this patch. The headline is **Coordinated Assault** -
the engine now honors the coordination tools (Wave Planner and War
Room) at the moment waves land, so a planned multi-wave or multi-player
strike finally resolves as one combined battle instead of N sequential
duels. This is the structural answer to "offense cannot concentrate the
way defense already does." The other change is a tune-up to the **Recon
Operative**: it is now the fastest unit in the game, its missions read
as a real incoming strike to the target, and the intel report is
renamed to the Recon Operative Log. The travel math behind scouting is
also fixed so the numbers you see finally match the clock.

---

### Coordinated Assault: waves you planned together finally fight together

The clearest problem in late-alpha combat was that the engine ignored
your coordination. A defender's garrison plus every allied support
transfer stationed at the nexus collapses into one combined wall at the
moment an attack arrives. Defenders concentrate force for free. The
attacker side had no equivalent: even when ten waves landed in the
same minute on the same target, every wave fought the full combined
wall by itself. Players were doing real coordination work and the
engine threw it away.

It is fixed. Waves that come from a declared coordination - the **Wave
Planner** (your own multiple waves on one target) or a **War Room**
operation (a faction operation with multiple contributors) - now
**merge into one battle at landing time**. The merged attacker force
fights the merged defender force, in a single resolution.

> **Loose dogpiles still do not auto-merge.** Random simultaneous
> attacks that did not go through Wave Planner or War Room resolve
> exactly as they did before. The merge is opt-in - you get it by
> committing through a coordination tool, not by accident.

**Wave Planner (solo).** Open the Wave Planner against a target and
schedule multiple waves from multiple of your own nexuses to land at
the same arrival time. Every wave you schedule in the session is
grouped server-side into one Wave Plan automatically. At landing, all
waves in the plan that share an arrival time merge. Waves with
different arrival times stay separate strikes - the merge is
per-arrival, not per-plan, so staggering on purpose still works.

**War Room (multi-player).** A faction operation already lets multiple
players claim slots under one shared target and arrival time. Those
slots now merge at landing. A five-player War Room strike is one big
battle instead of five solo duels, which is the realistic way for a
faction to crack a wall held by another organized faction.

**The trade - no recall once a coordinated wave has launched.**
Joining a coordination is a real commitment. After the troops have
left the launching nexus they cannot be pulled out of the coordination
before resolution. This is the entire cost of the new mechanic:
concentration earns you the merged battle, and you accept attacker-
grade finality in exchange.

**The combat math is unchanged.** The merged combat uses exactly the
same class triangle, the same Shield Grid amplifier, the same
loser/winner loss curves, the same Overseer-and-Control-drain rules
the singleton path has always used. The only differences in a merged
strike are:

- **Targeting Core uses the BEST Armory** across the participating
  attacker nexuses, not an average. Whoever brings the highest
  Targeting Core directs fire for the merged force, so investing in
  your own Armory still pays off even when you join someone else's
  coordinated strike.
- **Losses are split back proportionally** to each participant's
  contribution per troop type. If you brought 30% of the merged
  Vanguard Breakers, you absorb 30% of the merged Vanguard Breaker
  losses. Conservation is enforced - no troop ever vanishes or
  duplicates in the split.
- **Loot is split back by surviving carry.** The participant with
  more living troops at the end carries more loot home, the same way
  carry capacity already works for a solo strike.
- **Control drains once, building damage applies once, conquest
  happens once.** A coordinated strike is one conquest attempt with
  concentrated force behind it, not many - the Control drain tier
  (50 / 34 / 15) is decided by the merged power ratio and applied
  exactly once. The conquering Overseer is whoever brought it.

**One Overseer per coordinated wave.** A coordinated strike is one
concentrated conquest attempt. If a group somehow ends up carrying
more than one Overseer, the engine soft-fails and resolves the waves
individually so nobody loses an Overseer to an unexpected merge. As
an attacker, plan one Overseer per coordinated wave.

**What the defender keeps.** Everything. Full information on incoming
waves and unlimited reactive support. We did not nerf defense to fix
this. Reactive support that arrives in time still stacks on the wall
exactly as before. The change is purely additive on the attacker
side: a coordinated attacker now has the weight to push through a
prepared wall when they bring the right composition.

> **Tactical note.** Before v0.23, a faction's worth of attackers
> fighting one organized wall got chewed up serially - each solo wave
> hit the same combined defender, lost, and fed the wall the next
> wave's bones. After v0.23, concentration is the answer to
> concentration. Scout the target, agree on the right counter class,
> declare the coordination, commit the force. The triangle still
> decides the fight, the fight is just finally happening at the right
> scale.

### The Recon Operative is the fastest unit in the game

The scout's whole job is to get eyes on a target and get the report home
before the picture goes stale. It was never priced or tuned for that.

**Recon Operative speed is now 50 - the fastest in the roster**, ahead
of the Void Stalker (32), which remains the fastest *combat* unit. A
scout mission now arrives ahead of any strike fleet you could send.

Behind the scenes, scouting used to run on a separate flat travel rate
that ignored the unit's speed stat entirely. That special case is gone -
every mission, scouts included, now uses the same speed-based travel
formula. The Recon Operative's speed stat finally drives its scout
travel time, and the time you see quoted before you send is the time it
actually takes.

> **What this means for a typical scout:** at speed 50 a scout covers
> ground at `4 + (28 - 50) / 10 = 1.8` minutes per tile - roughly **40%
> faster** than the old flat rate, and far faster than any attack force.

### Scouts now look like a real strike to your target

When an enemy scouts you, your incoming-movement alert and the map now
show it as a generic **INCOMING ATTACK**, the same as any hostile fleet.
No more "incoming scout" label that let a defender glance at the threat
bar and safely ignore it.

The Recon Operative still does no damage and still just gathers intel -
this is purely about what the *defender* can see. As the attacker, your
own outgoing view still tells you exactly what you sent. Scouting is
supposed to be quiet; telegraphing "this one's harmless" to the target
defeated the point.

> Keep Recon Operatives stationed at home and raise your Stealth Array
> to make hostile scouts fight through your recon and risk interception
> before they learn anything.

### "Combat Log" becomes "Recon Operative Log" for scouts

A scout report was titled the same as a battle report, which never sat
right - nothing fought, nothing died, it's an intel dossier. Scout
reports are now titled **Recon Operative Log** everywhere they appear:
the Reports page, shared report cards in faction chat, and the
push notification you get when a scout returns. Battle reports are still
the Combat Log.

### The Recon Operative stays a no-damage Special unit

To be explicit, because it comes up: the Recon Operative remains a
**Special-class unit that deals no damage** and takes no part in normal
combat. Its only fight is scout-vs-scout - if a defender keeps recon
stationed, your scouts have to break through theirs (more operatives =
better odds) before the Stealth Array roll and the intel come home. It
gathers information; it does not kill. That's the role, and it's staying.

### Fixes & polish

- Fixed a stat drift where the Recon Operative was listed at speed 50 in
  one place and speed 25 in another. It is 50 everywhere now - the
  codex, the troop guide, and the travel math all agree.
- Updated the codex, the how-to-play guide, and the landing page to drop
  leftover references to the retired Espionage system (embed / sabotage)
  and describe scouting as it works today.
- "Fastest unit in the game" callouts now correctly point at the Recon
  Operative; the Void Stalker is described as the fastest combat unit.
- The codex gained a new **Coordinated Assault** section explaining
  exactly how Wave Planner and War Room merges work at landing time,
  including the split-back rules for losses and loot. The how-to-play
  guide also picks up a step and an FAQ entry covering coordinated
  strikes for new players who hit organized defenses.
