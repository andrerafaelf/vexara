## Vexara — Alpha Patch Notes v0.14

A small, focused round of polish for the per-nexus screen. The tab
bar inside a nexus now actually pins under the game header on
mobile — it was supposed to since v0.12 but a z-index mismatch was
letting the game header swallow it. And the Troops tab gained an
inner sub-tab so you can finally see your stationed garrison in
one place instead of scanning the train grid for "X stationed"
overlays.

---

### Nexus tab bar now sticks under the header on mobile (for real this time)

Tabbed views inside a nexus — Overview, Buildings, Troops,
Deployed, Espionage — were set to `position: sticky` on mobile
back in v0.12 with the intent of pinning right under the 56px game
header. Two bugs were silently breaking it:

- The game header's mobile rule used `z-index: 1050` while the
  nexus tab bar used `var(--z-sticky)` which resolves to `100`.
  As soon as you scrolled, the header slid right over the top of
  the tab bar instead of pinning above it, and the bar disappeared
  under the header until it scrolled off entirely. On desktop both
  surfaces sat at the same z-index so DOM order saved it, but
  mobile lost.
- The sticky `top` was a hardcoded `56px`. On notched iPhones the
  game header is taller than 56px — it's `56px + safe-area-inset-top`
  — so even when the z-index was right the tab bar would pin at
  the wrong vertical position and the header would visibly overlap
  the top edge of the tabs.

Both fixed in one go:

- **Tab bar z-index bumped to 1040** — below the game header
  (1050) so the header still wins the layering contest, but high
  above page content so nothing in the tab content can render on
  top of the sticky bar mid-scroll. Same stacking order on desktop
  and mobile, no more "which-one-wins" dependent on render order.
- **Sticky offset is now `calc(56px + env(safe-area-inset-top, 0px))`**
  so the bar pins exactly at the bottom edge of the game header on
  every device — flat-top Android, notched iPhone, iPad in
  landscape with no safe area, all the same.
- **Background opacity tightened** to `rgba(11, 15, 35, 0.92)` plus
  blur, so content scrolling underneath the sticky bar stays
  legibly hidden instead of bleeding through. The previous
  `--bg-app` solid was fine but lost the depth cue between the two
  stacked surfaces.

The Overview / Buildings / Troops / Deployed / Espionage switcher
should now feel like a fixed nav strip the moment you scroll past
it on a phone, the way the rest of the sticky chrome already did.

### Troops tab gets a "Stationed" sub-tab

The Troops tab has always been the **train** tab in practice — a
grid of recruitment cards with a small "X stationed" overlay tucked
in the corner of each card. If you wanted to know what was actually
garrisoned at a nexus you had to scan every card and add it up
yourself. New players especially asked some variant of "okay, but
where do I see my army." The answer was "look at the corners," and
that's not an answer.

Split the existing tab into two inner views:

- **Train** — the existing recruitment grid, unchanged. Training
  queue still lives here at the top, the offense/defense
  categories still partition trainable from locked, the per-card
  "X stationed" overlay is still there so you can see what you've
  already got while deciding what to train next.
- **Stationed** — a clean roster of every unit type currently
  parked at this nexus, grouped by offense/defense, with a total
  count badge at the top. Each row is image + name + count + an
  info button for the unit description, all in a tighter card
  format than the train grid since there's no cost/time/CTA to
  show. Empty unit types are filtered out — a fresh nexus with
  five Assault Troopers shows one card, not fourteen.

Implementation notes worth calling out:

- **Sub-tab state is per-component, not URL-synced.** The main
  nexus tabs (Overview/Troops/etc.) sync to `?tab=` because they're
  the kind of thing you bookmark and share. Train vs. Stationed
  is an interaction-level toggle inside one nexus on one tab —
  bookmarking it doesn't add value and pushing it to the URL would
  clutter the back stack. So it's just `useState`. Switching
  nexuses resets back to Train (the default) so the same user on
  the same screen sees the same starting view every time.
- **Total badge on the Stationed pill** shows the sum of all
  stationed troops at this nexus. Lets you see at a glance whether
  this nexus has any garrison at all without having to switch
  sub-tabs — the badge collapses when total is zero so a brand-new
  nexus's pill stays uncluttered.
- **Empty state nudges back to Train.** A nexus with zero
  stationed troops shows a small "No troops stationed at this
  nexus yet" message with a single CTA that flips the sub-tab back
  to Train. Cheaper than asking the player to figure out where to
  go next.
- **The sub-tab pill sits inside the troops tab content**, below
  the main nexus tab strip but above the training queue / roster.
  That means it scrolls _with_ the troops content, not stickied —
  the main nexus tab bar above it is already the sticky one, and
  stacking two sticky bars on a phone is the kind of UI noise we
  rejected back in the v0.13 BackBar discussion. The sub-tab
  belongs to the troops view; it shouldn't follow you out of it.
- **Visual language: pill switcher, not underline tabs.** The
  main nexus tab strip uses the underline-and-accent style; the
  sub-tab uses an inset pill with a soft amber background on the
  active option. Different shapes for different scopes — your eye
  reads "two levels of nav" instead of "two rows of the same nav"
  and so you don't have to guess which one a tap will switch.

Why no Stationed sub-tab for the Deployed tab — the Deployed tab
is already a stationed-elsewhere/in-flight view by construction,
so the same split doesn't apply. The decomposition we're making
here is "what's on the train screen vs. what's on the garrison
screen," not "show me a list of troops everywhere."

---

---

### Daily Quests panel now refreshes when you return to it

The `DailyStreaks` widget lives inside the Overview tab of every
nexus. Like the rest of the nexus tabs, switching to Map / Buildings
/ Troops doesn't unmount the Overview content — it hides it with
`display: none` so the heavy initial render is reused on re-entry.
Great for switching speed; bad for any component that fetched its
data once on mount and assumed the world wouldn't change beneath it.

`DailyStreaks` was exactly that component:

- A player would open a nexus, the panel would fetch `/stats/
daily-streak` once, render "Send 1 support mission to an ally —
  0/1," and then sit there.
- The player would switch to the Map tab, send a support mission to
  a faction-mate. The server would increment `support_1` in the
  `dailyStreak.questsProgress` JSON correctly — verified by hitting
  the endpoint directly.
- Switching back to Overview, the panel was _still_ showing 0/1,
  because the React state from the original fetch was never
  invalidated. The only way to see the new count was to reload the
  whole page.

This wasn't specific to support missions — it would happen for any
quest progressed from outside the Overview tab (attacks and scout
missions from the Map, sabotage from Espionage, market listings
from the Market view, faction chat messages, etc.). Support just
happened to be the one most visible to the reporter, probably
because the Map tab is where you live when you're sending it.

Fix shape:

- **`DailyStreaks` now accepts an `active` prop** and refetches
  whenever it transitions from inactive to active. The Nexus view
  passes `active={activeTab === 'overview'}` so the panel only
  reloads when you actually return to the surface that displays it.
  No background polling, no per-action event plumbing, no socket
  channel for a panel that you only look at three times a day.
- **Defaults to `active={true}`** so any other future caller that
  doesn't gate on tab visibility (e.g. a standalone quests page)
  keeps the original "load once on mount" behavior without needing
  to know about the new prop.

Considered alternatives and why they lost:

- **Force-remounting with `key={activeTab}`** would have worked in
  one line but it would also blow away `claiming` / `collapsed`
  state on every tab switch, including ones unrelated to Overview.
  The user-visible difference is small but it's the kind of paper
  cut that compounds.
- **Wiring a `daily-quests:refresh` event into every
  quest-progressing controller path on the client** (Map send,
  Espionage send, Market list, etc.) would be the most "correct"
  approach — the panel would update the instant the action
  completes, no need to switch tabs. Rejected as over-engineering
  for the actual symptom: when you send a support mission you stay
  on the Map for several more seconds (picking the next target,
  watching the travel timer settle), so refreshing on return to
  Overview is already within a few seconds of the truth.
- **React Query-ifying the panel** to ride the existing socket
  invalidation pipeline would have been the long-term-right answer
  but it's a bigger refactor than this fix justifies. The hook
  pattern in `useGameSocket` already exists for the next person who
  wants to do it.

The server-side increment logic in `attackController.ts` was already
correct — sending a `type: 'support'` mission bumps `support_1` by
one. No data backfill needed: any support missions you sent today
are already counted, you just couldn't see it.

---

See you in the dark. - André
