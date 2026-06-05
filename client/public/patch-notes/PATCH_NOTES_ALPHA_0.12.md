## Vexara - Alpha Patch Notes v0.12

Cancelling training no longer eats units the timer has already produced.
Command Core's last five levels finally pay rent. Eliminated players get
the same shield window as a fresh signup, plus a real starter garrison
and a working command structure. Nexus tabs stay glued to the top on
mobile so the switcher is always one tap away.

---

### Cancelling training no longer deletes already-built units

The cancel path read the queue entry's `amount` as if it were still the
original number queued, refunded the full 85% cost, and deleted the
entry. Trouble was the per-unit completion timer (the one `checkTrainingQueue`
trickles into the nexus row over time) wasn't being applied first, so
any units the timer had already produced but not yet flushed were
silently dropped on the floor. Andre's case: 100 Assault Troopers
queued, 15 already shown as built, cancel , and the 15 vanish.

- **Partial-credit runs before the refund.** When a cancel comes in,
  the controller now walks the chain head-down, crediting every unit
  whose individual train timer has elapsed (same logic
  `checkTrainingQueue` already uses), then re-resolves the cancelled
  entry by `(troopType, completesAt)` and refunds only the units that
  were never trained. Population freed = the cancelled remainder's
  cost, not the original queue amount, so the partial-credited units
  keep their seat at the table.
- **Lifetime "troops trained" counter updates too.** The
  `troopsTrained` JSON on the nexus row gets the partial-credit delta
  merged in, so the train-N-units daily quests don't lose progress on
  cancel.

The refund math is unchanged for the simple case (cancel before any
unit completes): you still get 85% of everything back. The fix only
affects cancels that happened on a queue with elapsed per-unit timers.

---

### Command Core 16-20 - Veteran Tier

Once Command Core hit Lv15 the building stopped doing anything
interesting. CC 16-20 only gave the standard 5% compounding build
discount and didn't gate any further unlocks , no new troops, no new
buildings, the derelict bonus already maxed at Lv15. Andre flagged it
as feeling pointless. The fix is pure quality-of-life , extra queue
slots, no combat or economy power creep:

- **CC 16 and 17 each add +1 build queue slot.** Cap rises from 5 to
  7 on a CC-17+ nexus. The toast, the BuildingCard counter, and the
  server-side enforcement all read the new cap from a single helper.
- **CC 18 and 19 each add +1 training queue slot.** Cap rises from
  5 to 7. Applied independently to the regular and Overseer
  sub-chains, same as the existing 5-cap was. The "queue full" hint
  on each train card shows the new cap.
- **CC 20 grants nothing extra** beyond the standard 5%-per-level
  build-time discount it already gives. The Veteran perks max out at
  Lv19 , Lv20 is the prestige cap, not another bonus tier.

Combat math, training times, and the Recruitment Core / Military
Outpost discounts are all unchanged. The Veteran tier is purely
"how many things can you have cooking at once."

---

### Eliminated respawn - protection, garrison, and a functional core

The respawn flow was three different kinds of wrong. The eliminated
screen advertised "24 hours of attack protection" while the Newbie
Protection banner on the new nexus said "3 days." The respawned nexus
came up with Command Core 0 and Recruitment Core 0, so a player who
just lost everything couldn't even begin training during the shield
window. And there were zero garrison troops, so the moment shields
dropped the respawn was an open invitation.

The first pass on this fix bumped CC/RC to Lv5/Lv3 and handed out a
100-troop garrison with a 3-day shield. That was the floor , andre
wanted a respawn that lands closer to a mid-tier nexus and a shorter
window so the player can't sit untouchable for half a week.

- **1.5 days of protection.** Down from 3. The respawn already lands
  with mid-tier buildings, real defensive structures, and a full
  garrison , there's no need for a full fresh-signup window on top.
- **Buildings: CC Lv12, RC Lv7, Life Support Lv12, Shield Grid Lv8,
  resource buildings (Biomass / Alloy / Ore / Storage) at Lv12.**
  Up from the first pass's Lv10 / CC5 / RC3 / Shield Grid 0. RC7 is
  the threshold for the garrison tier (see below) and CC12 unlocks
  Suppressor and the deeper troop tree. Shield Grid 8 means a
  returning player has a real building-defence layer instead of bare
  ground.
- **Starter garrison: 250 troops across six classes** ,
  100 Assault Troopers, 60 Lancer Drones, 40 Breaker Units,
  20 Recon Operatives, 15 Suppressor Teams, 15 Bulwark Guards.
  Every pick is gated by the buildings the respawn already has, so
  the player can re-train any of them out of the box. Population
  current is set to match.
- **Resources unchanged at 100,000 of each.** Lv12 Storage Vault
  caps around 195k, so the stockpile lands at about half-full and
  leaves real room for production over the protection window.
- **Eliminated screen copy refreshed** to list the new perks honestly.

---

### Nexus tabs stay sticky on mobile

On desktop the Overview / Buildings / Troops / Deployed / Espionage
bar lives near the top and is always visible. On mobile, scrolling
through a long buildings list or a stack of training queue cards
buried the tab bar above the fold , every tab switch meant scrolling
back to the top first.

The tab bar now pins to `top: 56px` (just below the sticky game
header) on screens under 769px, with the page background and a blur
so content scrolling underneath stays cleanly hidden. The bar still
scrolls horizontally on extra-narrow viewports for the Espionage tab,
just like before , only the vertical pin is new.

---

### Last-nexus-lost create flow no longer gets stuck

Losing your final nexus left the app in a dead state on the stale
`/nexus/<id>` URL. The page tried to `GET /nexus/<lostId>`, got a
403, and the eliminated-screen gate required the per-nexus query to
*succeed* (`nexusSucceeded`) , which it never could once ownership
was lost. Result: PageSkeleton forever, no "create new nexus" button.

- **403 / 404 on the active nexus is now a terminal signal.** The
  per-nexus query stops polling and stops retrying once it sees one,
  and the `pageReady` gate treats ownership-lost the same as
  "confirmed zero owned nexuses." The eliminated screen renders as
  soon as the myNexuses list also resolves to zero.
- **The stale `selectedNexusId` is cleared from localStorage** the
  moment ownership-lost is confirmed, so the `/play` dispatcher
  doesn't keep bouncing the user back to the conquered nexus's URL.

---

See you in the dark. - André
