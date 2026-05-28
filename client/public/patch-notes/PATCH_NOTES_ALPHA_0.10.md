## Vexara — Alpha Patch Notes v0.10

Faction wars get teeth. Combat reports go shareable. Late-game training
shortens. UI polish across arrivals, referrals, and page titles.

---

### Faction targets

Officers can now mark and unmark targets for the whole faction. Targeted
nexuses surface in chat and on the map so coordinated strikes happen
without a separate Discord call. Countdown displays were tightened for
the new target callouts.

---

### Wave planner and War Room cleanup

The faction wave planner has been rebuilt around clearer launch timing.
Travel math now matches the server for Forward Bases, doubled nexus-type
bonuses, scout-only recon waves, and Overseer strike delays. The planner
also uses the server clock for countdowns, clamps troop inputs to the
selected source nexus, and sorts your source nexuses by distance to the
target so the best launch options appear first.

War Room pledges now behave more reliably too. Empty wave targets and
empty pledges are rejected, operations must target a future arrival time,
and launched War Room slots are marked as sent so the same pledge does
not keep offering a duplicate launch button. The Wave Planner modal was
restyled for a cleaner layout, better mobile wrapping, and easier scanning
when several waves are stacked.

---

### Faction management tools

Faction leaders can browse the full faction list, promote and demote
members through the roles UI, and disband a faction when needed. Members
see role changes immediately and the badge system flags pending
faction-attention items (unread chats, pending join requests, unseen
war declarations) directly on the nav bar.

---

### Faction chat shares combat logs

A "Share to Chat" button on every combat report posts a formatted log
into your faction chat. The chat input and server limit were raised from
1000 to 4000 characters so a full report fits in one message. The
receiving end parses the block and renders it inline with the rest of
the chat — clickable, expandable, no copy-paste.

---

### Troop movements bar

A red incoming-strike banner now pins to the top of the game while an
attack is in flight against any of your nexuses. Click it to jump
straight to the defending nexus or to the Starfield view. Scout attacks
get their own variant so you can tell intel probes apart from a real
strike at a glance.

---

### Support missions resolve before attacks

When a support mission and an attack arrive in the same combat tick,
the support troops are now stationed first. Previously the attacker
could resolve against an empty defender even though reinforcements were
scheduled for the same instant. Allied troop transfer records are now
guaranteed to exist before combat reads them — fixes a rare crash on
support-heavy battles.

The combat report header was also wrong for supporters: a successful
defense (your supported nexus held) was being shown as "Defense lost"
with a red banner. Win/loss is now correctly displayed from the ally's
perspective.

---

### Arrival timestamps everywhere

Every countdown in the game (deployed forces, troop transfers, incoming
attacks, outgoing attacks, spy missions, the Map attack form, the
top-of-screen incoming-strike bar) now shows both the relative countdown
**and** the absolute time of day:

`→ Attacking XXX · 1h 12m @ 15:30:42`

The attack-form preview shows the projected arrival before you commit
troops, so you can stack waves on a target arrival time without doing
the arithmetic in your head.

---

### Tokens tab in Allies → Referrals

Pending referral tokens (Early Scout, Commander's Cache) now have their
own tab in the Allies section. Padding and spacing of the Referrals tab
were also fixed — text was butting flush against the panel border on
some panels.

---

### Late-game training shortened

Recruitment Core's per-level discount went from 8% to **9%** compounding.
Annihilator Platform base train time dropped from 1h 30m to **1h 8m**.

At max Recruitment Core (Lv15), per-unit times are now:

| Unit          | Old     | New     |
| ------------- | ------- | ------- |
| Annihilator   | 25m 43s | 16m 30s |
| Plasma Turret | 14m 18s | 12m 9s  |
| Siege Mech    | 11m 26s | 9m 43s  |
| Void Stalker  | 6m 52s  | 5m 50s  |
| Lancer Drone  | 15s     | 13s     |

All units except the Overseer benefit from the factor change; Annihilator
gets an additional cut from its base-time reduction.

---

### Life Support gives more population per level

Population growth per Life Support level went from **1.28** to **1.30**
compounding. Same base of 100, steeper curve — late-game nexuses get
the biggest boost, which is where the previous training-time cuts paid
off and stacks felt pop-capped instead of time-capped.

| Life Support | Old pop cap | New pop cap | Change |
| ------------ | ----------- | ----------- | ------ |
| Lv 5         | 343         | 371         | +8%    |
| Lv 10        | 1,178       | 1,378       | +17%   |
| Lv 15        | 4,041       | 5,118       | +27%   |
| Lv 18        | 8,467       | 11,240      | +33%   |
| Lv 20 (max)  | 13,862      | 19,004      | +37%   |

Existing nexuses recompute their pop max next time the building queue
processes (or immediately on next Life Support upgrade).

---

### In-game page titles

Browser tabs now show `Vexara - Dashboard`, `Vexara - Starfield`,
`Vexara - Market`, etc. instead of the SEO landing-page title on every
in-game route. Public/marketing pages (landing, codex, units, how-to-play,
patch notes, terms, privacy) keep their search-optimized titles.

---

### Faction notifications and badges

The nav bar now shows attention badges for unread faction chat messages,
pending faction join requests, and unseen war declarations. The badge
clears when you visit the relevant section.

---

### Influence rebalance

Six unit types (Suppressor Team, Bulwark Guard, Disruptor Unit,
Interceptor Bike, Annihilator Platform, Overseer) were silently giving
**zero influence** — you could build 100 Annihilators and your dominance
score wouldn't budge. Meanwhile Assault Troopers were worth 2 influence
each, the best per-resource return in the game, which made low-tier
spam the most efficient ranking strategy.

The influence table now covers every unit and scales with real cost.
Roughly 1 influence per 500 resources of cost, with high-tier units
weighted slightly above pure cost to reflect their strategic value:

| Unit             | Old | New |
| ---------------- | --- | --- |
| Lancer Drone     | 1   | 1   |
| Assault Trooper  | 2   | 1   |
| Breaker Unit     | 1   | 1   |
| Recon Operative  | 2   | 2   |
| Suppressor Team  | 0   | 3   |
| Bulwark Guard    | 0   | 3   |
| Skimmer Bike     | 3   | 4   |
| Disruptor Unit   | 0   | 4   |
| Interceptor Bike | 0   | 5   |
| Void Stalker     | 4   | 5   |
| Siege Mech       | 4   | 8   |
| Plasma Turret    | 5   | 10  |
| Annihilator      | 0   | 13  |
| Overseer         | 0   | 50  |

A 100-Annihilator stack jumps from 0 influence to 1300. A 1000-Assault
Trooper army drops from 2000 to 1000. Leaderboard positions will shift
on the next stats refresh — no manual reset needed.
