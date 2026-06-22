## Vexara - Alpha Patch Notes v0.25.1

A hardening point-release ahead of Beta #1. The headline is two
safeguards on **Standing Orders** so the auto-defense feature can't be
turned against you, plus behind-the-scenes combat-health instrumentation
for the team. No economy, training, or combat numbers changed.

---

### Standing Orders can't be baited anymore

Standing Orders auto-deploy your reserve troops the moment a nexus is
attacked. Two new safeguards close the obvious way to abuse that:

- **Tiny probing attacks no longer trigger an order.** Before, a single
  throwaway unit thrown at your protected nexus was enough to fire the
  order and pull your reserve into transit — so an attacker could bait
  the transfer for free and then strike the now-lighter **source**
  nexus. An order now only fires for a **credible incoming force**, not a
  one-unit poke. (The existing 30-minute per-order cooldown still caps
  how often a real raid can re-fire it.)

- **A defensive reserve is always left behind.** A fired order now only
  ever sends the troops **above a self-defense floor** on the source
  nexus, so an order — baited or genuine — can never strip its own source
  to zero and hand it over. If the source is already at the floor, the
  order quietly sends nothing that trigger and stays active for next
  time.

The Standing Orders panel copy now spells both of these out.

### Behind the scenes

- Added internal combat-health instrumentation so we can watch the
  Beta-combat signals (composition diversity, conquest rate, post-loss
  recovery, and first-strike win-rate) directly instead of by feel. This
  is admin-only telemetry — nothing about your game changes.

---

See you in the dark. - André
