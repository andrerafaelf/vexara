## Vexara — Alpha Patch Notes v0.18

A full combat rebalance. The unit tier system has been redrawn from the
ground up so that endgame armies are built around endgame units, not
oceans of the cheapest thing you can produce. Breaker Unit spam is no
longer the optimal late-game answer. Annihilator Platforms and Void
Stalkers finally feel like the apex units the codex says they are.

---

### Why this patch exists

At max Recruitment Core, the Breaker Unit delivered **55 attack per
population slot** — higher than any other unit in the game, including
the Annihilator Platform (42 atk/pop). It cost 160s base to train, it
fit one pop, and once Recruitment Core was maxed it churned out at
roughly 24 seconds per unit. There was no late-game reason to ever
build anything else. The tech tree was decoration.

That isn't how an RTS tier system is supposed to work. Tier 1 units
should *unlock the game*, not *win the game*. Tier 3 units should be
the reason you grind to CC 12+.

So this patch redefines what each tier means and re-tunes every unit
that wandered out of its lane.

### The new tier contract

**Tier 1 — Early game core (pop 1, fast train):** Lancer Drone,
Assault Trooper, Breaker Unit, Recon Operative. Cheap, throwaway,
essential for the first day or two of play. Useful as fodder and
screening units even late. Never optimal as a mass unit at endgame.

**Tier 2 — Mid-game workhorses (pop 2–3, mid train):** Suppressor
Team, Skimmer Bike, Bulwark Guard, Disruptor Unit, Interceptor Bike.
The class-counter triangle matters most at this tier. Composition
becomes a real decision.

**Tier 3 — Endgame power (pop 4–5, slow train, two attackers + two
defenders):**

- **Annihilator Platform** — heavy fire attacker
- **Void Stalker** — fast mobile attacker (promoted from Tier 2)
- **Siege Mech** — heavy armor defender
- **Plasma Turret** — static fire defender

These are the four prestige units of a maxed empire.

### Breaker Unit — pulled back to its Tier 1 role

- **Attack 55 → 35.** Still the strongest pure attacker available
  at Recruitment Core 3, still the right answer to a wall of Bulwark
  Guards in the early game. No longer the strongest attack-per-pop
  unit in the entire roster.
- **Carry 60 → 40.** Removes the "swarm of Breakers also happens to
  be the best raiding force" dominance — raiding is still on the
  table, just not strictly better than dedicated raiders.

### Void Stalker — promoted to Tier 3

The fastest unit in the game now sits where its codex description
always suggested it belonged: alongside the Annihilator Platform as
the mobile half of the endgame attacking line.

- **Attack 110 → 150.** Tier 3 striking power.
- **Defense 8 → 15.** Slight bump, still glass-fragile.
- **Carry 40 → 60.** Modest raid utility.
- **Population 3 → 4.** Tier 3 footprint.
- **Train time 24m → 30m base.** Tier 3 commitment.
- **Costs raised** to 1,100 / 900 / 1,400 to match Tier 3 bracket.

### Siege Mech — the field anvil

Has always been the anvil. Now actually anvil-shaped.

- **Defense 210 → 260.** Top-end durability in the roster.
- **Attack 20 → 40.** A glancing punishment for anything that crashes
  into it.
- **Train time 40m → 30m base.** Brought in line with Void Stalker
  so the Tier 3 ground line doesn't take a real-world day to assemble.

### Annihilator Platform — finally an endgame unit

The Annihilator had the *stats* of an apex unit and the *training
time* of a public works project. At 4,080s base (more than an hour),
even a maxed Recruitment Core left you producing one every six and a
half minutes — slower than churning out Breakers two-for-one. The
math made the apex unit a curio.

- **Attack 210 → 320.** Now 64 attack per pop slot — the highest in
  the roster, as it should be.
- **Defense 20 → 35.** Survives its own victories instead of bleeding
  out alongside the screen units.
- **Carry 160 → 250.** Raids with Annihilators are now genuinely
  worth the train time.
- **Train time 4,080s → 2,400s base** (40 min). At maxed Recruitment
  Core, this is roughly **6 minutes per unit** instead of 10 — fast
  enough that a Tier 3 army is something you actually field, not
  something you display in a museum.

### Plasma Turret — small adjustment

- **Train time 50m → 45m base.** Modest cut to match the rest of the
  Tier 3 retune.

### Combat math — defense actually matters when you win

Defense was a *cosmetic* stat for attackers in version 0.17. The
winner's loss formula used `defFactor = 1 - defense/600`, which
spread every unit across roughly a 5-percentage-point survival band.
A Breaker Unit and a Siege Mech took nearly identical casualties on
the winning side — which broke the entire "tank vs glass cannon"
identity for attacking armies.

- **Defense divisor steepened from /600 to /250**, with a 10%
  survival floor for the truly indestructible. The spread is now
  meaningful: a Breaker (def 3) takes ~99% of the base loss rate when
  winning, an Annihilator (def 35) takes ~86%, a Bulwark Guard
  (def 130) takes ~48%, and a Siege Mech (def 260) hits the 10%
  floor — virtually untouchable when winning.

Combined with the stat changes, this gives endgame units the
survivability story they deserve. A Tier 3 force doesn't just hit
harder than the Breaker swarm — it walks away from the fight.

### The "10 Breakers vs 1 Annihilator" test

A senior-dev sanity check: roughly equal resources and population,
who wins?

| | 1 Annihilator | 10 Breakers |
|---|---|---|
| Attack | 320 | 350 |
| Pop | 5 | 10 |
| Resources | ~6,750 | ~7,000 |
| Train @ RC20 | ~6 min | ~4 min |
| Carry | 250 | 400 |
| Survival on win | 86% | 99%* |

\*before the Annihilator's class counter and superior raw attack wins
the fight and starts wiping the Breakers. In practice, 1 Annihilator
takes ~10 Breakers in a head-on fight and keeps more survivors at
half the pop cost. That's the tier contract working as intended.

### Codex updates

All Tier 3 unit descriptions have been refreshed to reflect their new
role and identity. Scout intel threat estimates have been re-tuned
against the authoritative combat numbers, so the threat label you see
on a scouted nexus actually reflects what it would do to your army.

---

A patch about saying no to spam. If you've spent the last few months
training Breaker Units by the thousand, you don't need to retire them
— they're still the right Tier 1 mobile attacker. You just have a
much better answer waiting for you at the top of the tech tree now.

---

See you in the dark. — André
