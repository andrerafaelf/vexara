## Vexara - Alpha Patch Notes v0.6

Overseer cap now accounts for overseers that have left the nexus.
Starfield nexus history is now private to you.
Redundant resource readout removed from the attack form.

---

### Overseer training

**Cap check now counts overseers stationed elsewhere or returning home.**

The 3-per-nexus overseer limit was only counting overseers currently sitting
at the nexus, queued in training, or in a traveling attack launched from
this nexus. Overseers that were in a returning attack, or stationed at
another nexus via a troop transfer, were invisible to the check. That let
you queue a 4th overseer the moment your existing ones left to fight or
reinforce , exactly the case the cap was supposed to prevent.

Both the server validator AND the client-side gate were broken. Server-side,
the training endpoint missed returning attacks and outbound transfers.
Client-side, the train button was even more permissive , it only looked at
how many overseers were physically sitting at the nexus, so 2-on-strikes +
1-in-queue still showed "you can train more". Now both sides count every
overseer that originated from this nexus, no matter where it currently is:

- At home (garrison)
- In the training queue
- In an attack from this nexus (traveling OR returning)
- In a troop transfer out of this nexus (traveling, stationed, or returning)

If 2 of your 3 are in combat and 1 is queued, the train button stays
disabled until one slot frees up , by death, by recall, or by completion.
As intended.

---

### Starfield

**Nexus "Recent Attacks" panel is now private.**

Clicking a nexus on the map showed the last 5 completed attacks involving
that nexus to anyone in the galaxy. That leaked intel: you could click an
enemy's nexus and see who they'd been fighting, win or lose. Now the panel
only shows attacks you were personally involved in , as the attacker or the
defender. Other players' battle histories stay hidden.

---

### Attack form

**Removed your own resource counts from the attack dropdown.**

The launch-attack form was displaying the attacking nexus's biomass, alloy,
and ore right above the troop selector. That's information you can already
see in the top bar and on your own nexus view , there's no decision in the
attack form that depends on it. Removed.

---

### Starfield intel

**Embedded operatives now surface live intel on the map.**

Clicking an enemy nexus in the Starfield showed "No intel. Send a scout to
reveal resources and troops." even when you had an active embedded operative
sitting inside that nexus. The map's intel lookup only consulted completed
scout reports , it never checked your active spy assets , so a working spy
was invisible to the one place a player most often goes to read a target.

The intel resolver now checks for an active SpyAsset before falling back to
the most recent scout report. If you have an operative embedded in the
target, the map renders live resources, buildings, population, control, and
troop count just like a fresh scout , because that's exactly what an
embedded operative gives you. Same fields the Espionage tab's Refresh Intel
button reveals, just always-on as long as the spy is in place.

If the operative is recalled, discovered, or lost, the map falls back to
the scout report (or "No intel" if you never scouted).

---

See you in the dark. - André
