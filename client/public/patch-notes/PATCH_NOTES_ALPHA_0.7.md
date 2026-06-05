## Vexara - Alpha Patch Notes v0.7

Custom avatars for Officer and Commander supporters. Several urgent bug fixes
(troop duplication, instant-upgrade revert, missing T2 bonus on conquered
nexuses, inaccurate build/train timers, conquering overseer dying, influence
dropping on strike send). Specialization bonuses now show their real numbers
on the nexus banner. NPCs now actually grow , they level multiple buildings
per tick and recruit troops based on their tech level.

---

### Conquering overseer no longer dies on the winning strike

When an overseer landed the killing blow on a nexus, it was incorrectly
counted as lost , you'd successfully take the nexus but the unit that did
it never came home. Fixed: a successful conquest leaves the overseer
stationed at the newly captured nexus to govern it, as intended.

---

### Influence no longer drops the moment you send a strike

Per-nexus influence now includes troops still in flight on outgoing
strikes (until they actually die in combat). The header total stops
flickering down at strike-send and back up on return , the only time
your influence drops on an attack is now when losses are confirmed in
the combat report.

---

### NPC nexuses actually evolve now

Neutral nexuses upgrade much more aggressively. Each growth tick they
now level up to two buildings (instead of one), recruit a varied roster
of troops scaled to their Recruitment Core tier (Assault Troopers all
the way up to Annihilator Platforms when their tech allows it), and
respect population and storage caps so they grow like a real player
would, not by ignoring the rules.

Growth runs every hour now (was every six). Newer galaxies still grow
slowly; older galaxies see neutrals turn into real threats over days,
not weeks.

---

### Admin: Edit Player nexus picker stays in sync

The nexus dropdown in the player editor now shows coordinates and
Command Core level so identically-named "Conquered Nexus" entries
are distinguishable. The editor also re-binds against the latest
data on refresh, so values reflect the current state of whichever
nexus is selected.

---

### Specialization bonuses now show their math

Every specialized nexus banner now shows the live numbers behind the bonus.
No more guessing whether the buff is on or what it's worth right now.

- **Resource Depot** , real per-hour production shown next to the un-buffed value.
- **Supply Cache** , real storage cap shown next to the un-buffed value, plus loot protection %.
- **Military Outpost** , training time shown buffed (with strikethrough base time) on every troop card.
- **Reclaimed Outpost** , build time shown buffed (with strikethrough base time) on every building card.

---

### Build and train timers no longer lie

Card countdowns now match the time the server actually takes. Two separate
bugs were behind the drift: the client and server were using different
numbers for unit costs and time discounts, and on top of that every
countdown trusted your browser's local clock , which drifts, especially on
phones and Windows machines. Countdowns now sync to the server clock, so a
misconfigured local clock no longer makes timers read short or long. No
balance changes.

---

### Conquered NPC nexuses no longer denied the T2 bonus

If you conquered a neutral that already had Command Core 15, you were
silently stuck at the base tier. Fixed , the doubled bonus now applies
automatically the next time you open the nexus.

---

### Army duplication after recall - fixed

Recalling stationed troops no longer leaves a clone behind at the host.
A one-time cleanup corrects any nexuses still inflated from the bug.

---

### Instant-upgrade reward no longer overwritten

Using an instant-upgrade on a queued building no longer reverts when the
queue completes. The boost is now permanent.

---

### Custom avatars (Officer + Commander)

Profile → Stats now has an avatar upload card. JPEG/PNG/WebP, up to 4 MB,
cropped to a square. Your image replaces the username tile everywhere ,
sidebar, profile, faction members, war room, attack reports, friend list.

Officer and Commander tiers only. Existing avatars stay if your tier expires;
only changes require active tier. 10 uploads per hour cap.

---

### Sidebar Commander glow fixed

Commander-tier sidebar avatar now renders the correct cyan glow instead of
amber. Profile data also refreshes on every page load now, so future tier
upgrades show up without needing a logout.

---

### Coordinates with zero no longer show as "?"

Nexuses on row 0 or column 0 , e.g. (22|0) , were displaying as (22|?)
across combat reports, scout reports, dashboard outgoing strikes, and admin.
Caused by an `x || '?'` fallback that mistakenly treated `0` as missing.
Replaced with a nullish-only check so legitimate edge-of-galaxy coords
render correctly.

---

### "Attack Again" on combat and espionage reports

Combat reports now show an Attack button alongside the existing scout-only
one , open any of your own strike reports and you can re-attack the same
target without leaving the report.

Embed and sabotage missions in the Espionage tab now show an Attack button
on each active operative and each completed mission row. Clicking it jumps
to the Starfield map, selects the target, and opens the attack form
pre-armed.

---

See you in the dark. - André
