## Vexara - Alpha Patch Notes v0.28

The Vex Pass stops being a seasonal thing you lose when a galaxy ends. It
is now one permanent pass that belongs to your account. This patch also
fixes a long-running Rogue AI bug and makes signing up and signing in more
reliable for new commanders.

---

### One permanent Vex Pass

- **Your pass XP, level, claimed rewards and paid unlock now belong to
  your account** and carry across every galaxy. There is no season timer
  and nothing resets when a galaxy ends.
- **Each reward can be claimed once per account.** If you played several
  galaxies, you keep your highest pass XP, every level you claimed
  anywhere, and the paid track if you ever bought it.
- **Buying the paid track later now pays out the paid rewards of every
  level you have already reached**, including levels whose free reward you
  already claimed. Nothing is lost by buying late.
- **Gifting the paid track works across galaxies.** The recipient no
  longer has to be in your galaxy.

### New: Resource Caches after level 50

- After level 50, every 200 pass XP earns a **Resource Cache: 50,000
  Biomass, 50,000 Alloy and 50,000 Ore**. Free and paid players get the
  same cache.
- You can bank up to **10 unclaimed caches**. While 10 are waiting, cache
  progress pauses until you claim one.

### Claiming rewards

- **Pass resources must fit in the storage of the nexus you pick.** If
  they do not fit, the claim is refused, nothing is lost, and the reward
  stays claimable. Spend some resources, upgrade the Storage Vault, or
  pick another nexus.
- **In a galaxy you just joined**, pass rewards open up to level 10 right
  away, then 4 more levels per day. Resource Caches unlock 10 days after
  you join. This only affects players carrying banked levels into a fresh
  galaxy; normal progress is never held back.
- **Pass XP is capped at 800 per day** across your account. A very active
  day of normal play stays under it.
- Production boosts do not stack: only your strongest active boost
  applies, so there is no need to claim several boost levels at once.
- XP from several events that land at the same moment (for example an
  attack launched and won) is no longer occasionally lost.

### Title rename

- The level 50 paid title **Season Conqueror is now Protocol Ascendant**.
  Everyone who earned it keeps it under the new name.

### Rogue AI and galaxy events

- **Rogue AI cores now actually expire.** A bug stopped an expired core
  from being removed once it had raided anyone, so it kept raiding the
  same nexus every 6 hours indefinitely. Expired cores now stand down and
  revert to an ordinary neutral settlement.
- **Rogue AI cores give newcomers room to breathe.** Cores no longer pick
  a commander in the first 48 hours after their starter protection ends,
  and they leave commanders who have been away for more than 3 days alone.
- Galaxy events and daily neutral growth now run on a reliable schedule
  instead of restarting their clock on every server update.

### Signing up and signing in

- If the verification email cannot be sent, registration now tells you
  and offers to resend it, instead of silently failing.
- Confirming your email is now a button press, so email link scanners can
  no longer use up your link before you click it.
- Sign-in protection is tuned for groups playing from one network: honest
  players on a shared connection are no longer locked out, while repeated
  failed guesses against an account are blocked.
- Changing or resetting your password now signs out every other session.

### Codex corrections

These are fixes to what the Codex said, not gameplay changes. The game
already worked this way:

- Shield Grid adds **+1.5% defense per level** (+22.5% at level 15), not
  2%.
- Battle losses: the losing side loses **85-100%** of its force (100% at a
  3:1 power ratio or worse); the winner loses **0-45%** before defense and
  class modifiers.
- Assault Trooper speed is **16**.
- Hangar Bay trains the Vanguard Breaker, Wraith Skimmer, Aegis Skirmisher,
  Phantom Lance and Void Stalker.
- Overseer travel time is shown correctly (much slower than a normal
  strike), and garrisoned Recon Operatives and Overseers do count toward a
  nexus's defense.
- Non-Aggression Pacts and vassalage are now described as they actually
  work since v0.27: pacts block attacks and must be formally broken, and
  vassals get loot protection while overlords get bounded dominance
  credit.

### Website

- The public site now shows accurate numbers for units (16), buildings
  (12), the Vex Pass and combat rules, and only shows live galaxy figures
  once the galaxy is busy enough for them to mean something.
- Public pages now load their content directly instead of waiting for
  scripts, so they appear faster and show up properly in search.
