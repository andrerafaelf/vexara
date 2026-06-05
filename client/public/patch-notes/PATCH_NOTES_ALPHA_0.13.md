## Vexara - Alpha Patch Notes v0.13

In-game navigation just got the polish pass it's been needing.
Tab state now lives in the URL, so the browser back button (and the
iOS swipe-from-edge) actually return you to where you were. A persistent
back button is now pinned to the top of player-profile pages so
mobile/PWA users don't have to dig through the menu to escape.
Deep-linking and bookmarking specific tabs finally works.

---

### Tab state moved into the URL

Every tabbed view in the game . Factions, Allies, Codex .
held the active tab in local React state. That meant clicking a
username inside the Members tab navigated you to the player's
profile fine, but pressing back landed you on `/factions` with the
tab reset to Overview. The URL never knew you'd been on Members,
so it had nothing to restore.

- **Factions, Allies, and Codex tabs now sync to the `?tab=` query
  param.** Switching tabs uses `router.replace()`, so a session of
  tab-flipping doesn't bloat the history stack . only cross-page
  navigations create back entries.
- **`/factions?tab=members`, `/allies?tab=requests`, and
  `/codex?tab=troops` are real URLs now.** Bookmark them. Share
  them. Refresh them. They all land on the right tab.
- **Validated on read.** A stale `?tab=xyz` link falls back to the
  default tab silently instead of rendering nothing. The hook's
  allow-list rejects anything that isn't a known tab id.

Nexus View tabs (Overview / Buildings / Troops / Deployed / Map /
Espionage) were already URL-driven, so they didn't need touching.

### Persistent back bar on player profiles

The eliminated-screen-style top header has a sibling now: a slim
sticky strip that lives just below the game header on detail pages,
with an `←` back button on the left and the current page title
centered. First page to get it is `/u/<username>` . the public
profile view that the user-friction report specifically called out.

- **Smart back, not naive back.** The button calls `router.back()`
  when there's a same-origin entry behind you (the usual case . you
  clicked a username inside a tab). When you arrived from a deep
  link or shared URL with no in-app history, it falls back to a
  sensible in-app destination (`/players` for a profile page) so
  you're never stranded.
- **Captures the originating tab.** Clicking a `<Username>` link
  appends `?from=/factions?tab=members` (or wherever you came from)
  to the profile URL. The back button reads that and labels itself
  "Back to Factions . Members" so you always know where the arrow
  is taking you.
- **Click-time URL rewrite, not a render subscription.** Long lists
  of usernames (faction chat, leaderboards, the members tab) do not
  re-render on every URL change . the `from` value is computed in
  the click handler, not via `useSearchParams` during render. Chat
  scroll performance is unaffected.
- **Sticks below the 56px game header on mobile**, matches the
  blur/background of the existing sticky Nexus tab bar so two
  stacked sticky surfaces feel intentional. On viewports under
  480px the back label collapses to icon-only and the page title
  takes the freed space . the button keeps an `aria-label` so
  screen readers still announce "Back to ".

### Mobile / PWA polish

The iOS PWA install has no browser chrome . no back arrow, no
forward button, no refresh. Before this patch, opening a player
profile from a faction roster left you with no way back except the
hamburger menu and re-navigation. The new BackBar gives every
detail leaf a tappable escape hatch that's always one finger reach
from the top of the screen.

We considered a bottom tab bar but rejected it . it would compete
with the v0.12 sticky Nexus tab strip and the iOS home indicator,
and the actual gap was "how do I leave this leaf page," not "how
do I switch top-level sections." Same reasoning for not adding a
custom edge-swipe gesture: iOS PWAs already do edge-swipe back for
same-origin history for free, and intercepting it would double-fire.

### Combat: defense stat and class matchup actually shape casualties now

A player asked why Assault Troopers were always topping their
survivor counts despite the in-game role text calling them
frontline tanks. They aren't cannon fodder . the codex was right
about that . but tracing the math revealed the survival rate
spread between a Breaker Unit (def 10) and a Siege Mech (def 210)
was only about 5 percentage points on a coin-flip victory. The
defense stat existed on paper but barely budged the loss numbers
in practice. And class counters affected who *won* the battle but
not who *survived* it, which made the rock-paper-scissors triangle
half as useful as it looked.

Two surgical changes to the winner's loss math (loser still loses
everything . combat already commits hard there):

- **Defense stat divisor steepened from /1200 to /600.** Tank
  units now feel like tank units. The spread between Breaker and
  Siege Mech is now about 10 percentage points on a coin-flip win
  (~70% vs ~80% survival) instead of ~5pp. Assault Trooper sits
  around 72% survival in the same fight, Bulwark Guard around 77%.
  Glass cannons still survive when the win is dominant, they just
  feel the cost when the fight is close.
- **Class matchup now modulates survival, not just damage.** The
  same counter triangle that decides combat outcome (Mobile beats
  Armor beats Fire beats Mobile) now also nudges per-unit
  casualties. Armor sent into a Fire-heavy enemy takes fewer
  losses; Armor sent into a Mobile-heavy enemy takes more. The
  effect is intentionally mild (.85x to 1.15x on loss rate) so
  matchup is a tilt, not a roulette wheel . a 100-troop wave that
  would lose 30 might lose 25 with a good matchup or 35 with a bad
  one. Reuses the same composition-weighting style as the existing
  attack-power math so both halves of the engagement react to
  matchup consistently.

The codex troop pages had no language describing how survival rate
worked. Updated the Class counters panel to spell it out: matchup
moves both damage dealt and damage taken, not just the former.

### Standardized back affordance across the app

The new BackBar's visual language now extends to in-page drill-down
surfaces too, so the whole app speaks one "back" dialect regardless
of whether the back action is a route navigation or just a piece of
component state.

- **Combat report detail** now uses the unified back-button look
  (arrow icon, accent hover). Same button, same hover color as the
  BackBar on profiles. Prev/Next/Share stay in the same cluster .
  only the visual language of the back affordance changed.
- **Ally chat on mobile** gets a "Back to Allies" button in the
  chat thread header when a friend is selected. On desktop the
  sidebar and thread are visible together so the button stays
  hidden . it only surfaces below 768px where the thread
  effectively takes over the visible space.
- **War Room operation board on phone** gets a "Back to
  Operations" button in the board header so officers can clear the
  selected op without scrolling the horizontal rail back to find a
  different card to tap. Hidden on desktop and tablet where the
  rail and board are visible side-by-side.

All three reuse the same `InlineBackButton` component, so future
list-detail surfaces get the same look for free.

### "New patch" prompt in-game

Up until now there was no way to tell when a new patch shipped
short of noticing something had moved. The patch notes page itself
was always public, but you had to know to go look. Now you don't:

- **A small bottom-right toast surfaces inside the game** whenever
  the build's `LATEST_PATCH_VERSION` doesn't match what your browser
  has acknowledged. Two actions: **Read** opens the patch notes in
  a new tab anchored to the new version (`/patch-notes#v0.13`),
  **X** dismisses. Either action marks the version seen and the
  toast stays gone until the next bump.
- **Suppressed for first-ever visits.** A new player loading the
  game for the first time gets the current version silently stamped
  into their browser . no "new!" UI for changes that shipped
  before they showed up. The toast only fires when a player who has
  *already* acknowledged some prior version sees a newer one go
  live.
- **No backend state.** The acknowledgement lives in localStorage
  (`lastSeenPatchVersion`). Trade-off: clearing storage may resurface
  the prompt once. That's cheaper than a per-user row + migration
  for a feature whose stake is "did you notice the changelog."
- **Patch notes are now linked publicly** too. `/patch-notes` was
  already unauthenticated but it's worth saying out loud . the
  page renders for logged-out users, anonymous visitors, and search
  crawlers. Bookmark it.

### Desktop back/forward feels natural again

Because tab switches now bump the URL (via `replace`, not `push`),
the browser back/forward buttons step through page-level
navigations the way users expect: Profile → Factions → Members → a
member's profile, then back, back, back returns you all the way to
the original Profile page with each tab restored. Forward replays
the trail.

The behavior change worth naming: tab-switching used to be invisible
to history. Now it shows up in the URL bar (but not as a back
entry, thanks to `replace`). If you middle-click a tab to open it
in a new window, the new window inherits the tab state via the URL.

---

See you in the dark. - André
