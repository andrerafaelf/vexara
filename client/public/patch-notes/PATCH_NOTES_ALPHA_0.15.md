## Vexara — Alpha Patch Notes v0.15

The big one this round is combat. It got a proper audit and a
rebalance: losing a fight no longer means losing your entire army
on the spot, winning a coin-flip now actually costs you, and a
lone Overseer can finally finish off an empty nexus. There's also
a new live combat preview right on the attack screen so you can
see roughly how a strike will go before you commit it. On top of
that: returning eliminated players come back scaled to their old
strength, combat reports stopped triple-listing the defender,
public profiles stopped leaking your stockpile, resource transfers
respect the receiver's storage, and a pile of smaller fixes.

---

### Combat rebalance — no more all-or-nothing

Combat had a cliff. The loser of any engagement lost **100% of
their army** — every non-Overseer unit, gone — whether they lost
by a landslide or by a single point of power. The winner, meanwhile,
capped out at 30% losses even in a dead-even fight. The result was
that being slightly outgunned meant total annihilation, while
attacking a force your own size was nearly risk-free. That's the
"something feels off" a lot of you described, and it was real.

The whole win/lose gradient is now smooth instead of a cliff:

- **Losing scales with the margin.** A blowout still essentially
  wipes you, but a narrow defeat now leaves a real remnant —
  around 85% lost instead of 100%. You can lose a close fight and
  still have something to regroup with.
- **Winning a coin-flip hurts.** The winner's loss cap on an
  evenly-matched fight went from 30% up to 45%. Crush a much weaker
  target and you still walk away nearly intact (losses scale down
  toward zero as your advantage grows), but throwing your army at
  something comparable is now a genuine decision, not a free roll.
- **Conquest still needs a cleared garrison.** To drop a nexus's
  control with an Overseer you still have to fully wipe the
  defending troops — and with the softened loser curve, that only
  happens on a *decisive* win. A near-even victory will leave
  survivors and you'll need another strike to finish the job. Bring
  enough force to overwhelm, not just to edge it.

None of the underlying systems changed — the rock-paper-scissors
class triangle, Armory amplification, Shield Grid defender bonus,
and loot carry threshold all work exactly as before. What changed
is how casualties are distributed once the winner is decided.

### Empty nexuses can finally be conquered by follow-up Overseers

A conquest takes three Overseer strikes (each knocks control down
by 34). The classic play is one big strike with an Overseer to
clear the garrison and drop control to 66, then send lone Overseers
to finish — except that didn't work against an *undefended* nexus.

Overseers have zero attack power. Against an empty nexus the math
was 0 attack vs 0 defense, which failed the "attacker wins" check
(it required strictly greater), so a lone Overseer sent at an empty
nexus would just bounce — control never moved, and the conquest
stalled forever. Reported as: "I sent one full strike plus an
Overseer, then two more Overseers, and an empty nexus still wouldn't
fall."

Fixed: **a force with any units walking into a nexus with no
defenders now always wins the engagement unopposed.** So the
sequence works exactly as intended — clear the garrison once, then
walk Overseers in to drive control to zero. A nexus defended only
by Plasma Turrets still counts as defended (turrets stay home and
fight), so this only applies to genuinely empty targets.

### Live combat preview on the attack screen

A player built an external combat calculator by reading the formulas
out of the Codex. Rather than hide the math (you'd reverse-engineer
it from reports anyway), we built our own — and put it where you
actually decide to attack, not buried in a reference page.

Open the attack panel on any target and you now get a **live outcome
preview** that updates as you adjust your force: predicted win or
loss, how close it'll be ("crushing" → "coin-flip"), your estimated
losses, the enemy's estimated losses, your loot capacity, and —
if you've packed an Overseer — whether this strike will actually
clear the garrison and enable conquest. It uses the real combat
formulas, so it tracks the live balance above.

It's honest about uncertainty: with no scout intel on the target,
it tells you it's assuming an empty garrison and to scout first for
an accurate read. Scout the target and the prediction uses their
actual known troops, shield level, and your Armory bonus.

### Combat reports: two forces, not three

Combat reports were showing the defender's troops **twice** when an
ally supported them — once mixed into a "Defender Forces" table that
silently combined the garrison with allied support, and again in a
separate "Allied Forces" table. And if you were the defender, "Your
Forces" and "Defender Forces" were the same data printed twice.

Reports now always show exactly what you'd expect: an **Attacker**
table and a **Defender** table, each labelled with the player's
username and a "(You)" marker for your side — plus **one table per
supporting ally**. The defender table is garrison-only now; allied
support is reported solely in its own block, so nothing is
double-counted. Two lists, plus one per ally. That's it.

(Combat stats and the battle replay still account for allied
casualties correctly behind the scenes — the merged totals are kept
for those; only the *report layout* changed.)

### Eliminated players return scaled to their former strength

When you lose your last nexus and respawn, you used to get a fixed
mid-tier nexus regardless of whether you'd been a 200-influence
beginner or a 5,000-influence power. That fixed respawn was a
demotion for a strong player and an over-reward for a weak one.

Respawns now scale to **just over half (~55%) of the peak influence
you'd reached in that galaxy** before being knocked out. A player
who topped out at 5,000 influence comes back at a nexus worth a bit
over 2,750 — buildings, garrison, and stockpile all scaled to match
— while someone who never built much still comes back at a solid
mid-tier floor (the old fixed respawn is now the minimum, never the
ceiling). Building levels cap at 20 and the garrison scale is
bounded, so even a former galaxy leader doesn't respawn as an
instant threat. The 36-hour respawn shield is unchanged.

We track your high-water mark continuously, so it survives the
elimination itself.

### Public profiles no longer leak your stockpile

Anyone could open your public profile (`/u/yourname`) and read your
**current resource stockpile, production rates, total troop count,
and every nexus's name and coordinates** — all the intel an attacker
would otherwise have to spend a scout mission to get. That's free
reconnaissance and it shouldn't exist.

Public profiles now show only your **reputation**: influence,
win/loss record, troops killed/lost over time, resources plundered,
galaxies played and won, account age, supporter status. Your live
stockpile, production, troop totals, and per-nexus locations are
**visible only to you, on your own profile.** Your own profile page
is unchanged — you still see everything about yourself.

### Newbie protection now blocks attacking players, not just being attacked

Newbie protection always made you un-attackable for your first few
days. But nothing stopped a *protected* player from attacking or
scouting other players — you could hide behind the shield and still
poke real people. That's one-sided.

While your nexus is under newbie protection you can now **only attack
or scout NPC / neutral nexuses, not other players.** NPC raids — how
a new player is supposed to grow — stay fully open. Sending support
to a friendly player is still allowed (it's cooperative, not
aggressive). The attack button now says why it's disabled when you
try to hit a player too early.

### Resource transfers respect the receiver's storage

Sending resources between your own nexuses didn't check whether the
destination had room. Anything over the receiver's storage cap got
silently deleted on the next production tick — you'd send 50k ore to
a nexus with 10k of headroom and 40k just vanished.

Transfers now **clamp to the receiver's remaining storage** and only
move what fits. If the destination is completely full for what you're
sending, the transfer is rejected with a clear message instead of
eating your resources. If only part fits, the rest stays home and
you get a heads-up that storage was nearly full.

### Support missions never touch the host's population

Confirmed and locked down: a support mission stationing troops at an
ally's nexus does **not** change that nexus's population — stationed
support belongs to the sender, occupies the *sender's* housing, and
the host's population is untouched. Population is only freed (on the
sender's side) when support troops actually **die** in combat. This
was already the behavior; it's now covered by a test and an explicit
invariant in the code so it can't quietly regress.

### "While you were away" stopped lying about the time window

The activity summary that greets you on return had a few problems:

- On a brand-new browser it would fire on your very first login and
  claim "1 day of activity" when there was nothing and you'd just
  arrived.
- The "Last X of activity" label was based on a server default, not
  how long you were actually gone, so it was frequently wrong.
- It surfaced your last 20 battles regardless of when they happened,
  instead of only what occurred while you were away. Conquests (which
  don't have a return trip) could sort unpredictably or show a blank
  time.

Now it stamps your first visit silently (no summary on a fresh
account), skips the popup entirely if you only bounced away for a
few minutes, and scopes the summary to the real window since your
last visit — clamped to a sensible 7-day maximum so a long absence
doesn't dredge up stale battles as if they just happened. The
duration label and the battles listed now actually match.

### A way back to the game from the patch notes

Reading patch notes from inside the game dead-ended you on a page
with only a marketing nav (Login / Enlist) and no way back. There's
now a **"Back to game"** bar at the top of the patch notes page when
you're logged in, routing you straight back to your last nexus.

### Incoming strikes list collapses

The Strikes card on a nexus Overview can get crowded when several
attacks are inbound. The **Incoming** section is now collapsible —
click the header (it shows a count) to shrink or expand the list. It
defaults to expanded so an active threat is always visible at a
glance.

---

See you in the dark. — andre
