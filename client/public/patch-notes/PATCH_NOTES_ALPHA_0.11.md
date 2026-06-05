## Vexara - Alpha Patch Notes v0.11

Galaxy events pace down to one roll a day and the Derelict Ship gets a
real reward. The Sabotage Troops mission label is finally honest about
what it does. Early game gets quieter , locked content steps out of the
way until a new commander has a reason to care about it.

---

### Galaxy events: slower, weightier, and the Derelict is worth a fight

The event roller used to fire every 4 hours at 55%, which averaged ~3
events per galaxy per day and pinned the active-event cap fast. Three
players in a row reported "I just see Derelicts" , fast galaxies were
capturing them before the next roll, so the no-duplicate guard kept
rolling Derelict whenever the slot opened.

- **One roll per day at 65%.** Cadence dropped from 4h to 24h. Fire
  chance bumped from 55% to 65%. Expected pacing: roughly two events
  per galaxy per week, with real downtime between them.
- **Derelict Ship reward tripled.** Capturing a Derelict now grants
  **3x resource production** on that nexus (was 2x), and **4x once
  Command Core reaches Lv15**. The bonus is permanent, persists through
  rename and re-conquest, and stacks multiplicatively with Resource
  Storms.

The 4x ceiling is a deliberate late-game prize: a CC-15 Derelict sitting
in a Mega Storm zone briefly tops out at **16x** on the affected
resource. That's the kind of moment we want the late game to have.

---

### Market listings stop being a loot vault

Listing resources put them in escrow off the nexus row, which meant
combat couldn't see them. The exploit: stuff your stockpile into a
self-traded listing the moment an attack timer started, and the raider
walked away with nothing.

When an attack resolves at a nexus, every active listing on that nexus
is now cancelled and its escrowed resources are returned to the nexus
**before** the loot calculation runs. Supply Cache is once again the
only stockpile-protection mechanism. The market create-listing form now
states this in-line.

---

### Sabotage Troops renamed to Delay Training

The mission label and tooltip claimed it would "eliminate the largest
troop group at the target" , which it never did. The actual effect has
always been to push back every batch in the defender's **training
queue** by 30 minutes per excess operative. Garrison troops were never
killed. Renamed to **Delay Training** so the label matches what
happens, and the tooltip now spells out the per-operative scaling.

---

### Quieter early game

The Nexus view used to pile every unbuilt building, every unbuildable
troop, and every secondary page onto a brand-new player's screen at
once. It looked busy and meant nothing. Locked content now steps out of
the way until you have a real reason to engage with it.

- **Locked buildings render as dim "open plot" placeholders.** Just an
  icon, the name, and the single prerequisite that gates them
  (`Requires Command Core Lv2`). No costs, no troop benefits, no
  upgrade button until the prereq is met. Once you build a building,
  the full card returns automatically. Locked plots also sort to the
  bottom so the buildings you can actually act on draw the eye first.
- **Locked troops fold into a single line per category.** A Recruitment
  Core Lv1 player no longer scrolls past a wall of red "requires X"
  cards. The full roster is one click away under `▸ N more units
  (locked)` so the long-term roadmap is still discoverable, just
  opt-in.
- **A persistent "Next:" chip lives in the nexus header.** It surfaces
  the first incomplete intro-chapter quest at all times, on every tab.
  Clicking it switches to the relevant tab (or jumps to the Starfield
  for the "loot a nexus" step) so you never lose the breadcrumb.
- **Top nav softens for new accounts.** Market, Allies, Factions, and
  Players collapse under a `More ▾` menu until you actually have a
  reason to use them , Market unlocks at Command Core Lv3 or a 5k
  stockpile, Allies at CC Lv2, Factions when you build a Recruitment
  Core, Players on your first combat log. Promotions are sticky:
  once a tab appears in your bar it stays there forever. Direct URLs
  still work for anyone hitting the routes by bookmark.

Veterans keep every tab they ever had , the localStorage promotion
state carries forward from the first matching condition, so the
collapsed state only affects players who genuinely haven't crossed the
threshold yet.

---

See you in the dark. - André
