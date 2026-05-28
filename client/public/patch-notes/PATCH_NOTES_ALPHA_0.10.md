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
