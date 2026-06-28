## Vexara - Alpha Patch Notes v0.27

Diplomacy stops being decoration. Non-Aggression Pacts get teeth, treaty
partners start sharing their eyes on the map, and vassalage becomes a
real, bounded path to winning a galaxy through politics instead of pure
conquest.

---

### Non-Aggression Pacts now mean something

A signed NAP is no longer just a label on the diplomacy board:

- **While a pact is active, neither faction can launch attacks at the
  other.** Try it and the order is refused. Scouting and supporting your
  partner still work - the pact stops aggression, not coordination.
- **To go to war, a leader or officer must formally Break the Pact.**
  That opens a **60-minute warning window**: your target is alerted the
  instant you break it, and no attack from either side can land until the
  window closes. The betrayal is deliberate, and it is never a surprise.
- **Attacks already in flight when a pact is signed still land.** You
  can't sign a NAP to wish away a wave that's already on its way.
- **Breaking a pact is public.** It's posted to the galaxy diplomacy
  board and logged for both factions, and the two of you can't re-sign a
  NAP for 24 hours. Your word is worth exactly as much as you keep it.

On fast galaxies the warning window and the re-sign cooldown scale with
the galaxy speed, like every other timer.

### See through an ally's eyes

Sign an active Non-Aggression Pact or Trade Agreement and you now share
limited vision with that faction:

- Their nexuses appear on your map, marked as treaty allies, without you
  having to discover them.
- You can see attacks inbound to allied territory, so a coalition can
  coordinate its defense.

What stays hidden: garrison strength, resources, and buildings. Intel is
still earned - you scout for it, or you do not have it. An ally cannot
read your defenses for free, so a pact is never a quiet x-ray before a
betrayal.

### Vassalage now matters

A vassal treaty is no longer just a label. When you accept one, both
factions agree on who is the overlord and who is the vassal:

- **The overlord** counts a quarter of each qualifying vassal's territory
  toward galaxy dominance - a genuine diplomatic path to victory, and a
  deliberately bounded one: at most your three largest vassals count, each
  must hold real ground to count at all, and your borrowed credit can
  never exceed half of what you hold yourself. You still have to command
  the largest empire on your own merits; diplomacy is the final margin,
  not the bulk. A galaxy still needs enough independent factions for
  anyone to win, so you cannot vassalize the map into a walkover.
- **The vassal** gains a protector: their nexuses take 25% less loot from
  outside raiders (the overlord and the vassal's own faction excepted).
  Vassalage never makes a nexus unconquerable - you can always be taken by
  force.

Two factions cannot quietly swap vassal status to inflate each other, and
vassal chains do not stack. The credit is a clean overlay on the win
track: no nexus, resource, or troop is ever created or moved.

### Behind the scenes

- Closed the loophole where an active pact could be quietly dropped
  without the warning window. The only way out of an active NAP is to
  break it out loud.
- Conservation and anti-exploit tests around the new pact rules, so a
  blocked attack never costs you troops and the betrayal window can't be
  raced or gamed.

---

See you in the dark. - André
