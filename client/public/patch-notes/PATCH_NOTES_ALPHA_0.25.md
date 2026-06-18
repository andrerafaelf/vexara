## Vexara - Beta Patch Notes v0.25

This patch is a defense and quality-of-life pass: a fairer curve for
new commanders coming out of protection, real tools to defend a nexus
and manage queues without babysitting them, and notifications you can
act on without opening the app.

---

### A softer landing out of newbie protection

Protection used to end as a hard cliff — fully shielded one moment,
fully exposed the next. It now **tapers off**, so the jump from
"untouchable" to "fair game" is a curve instead of a wall, giving new
commanders a more reasonable window to build up a real defense before
facing the open galaxy.

### Standing Defensive Orders

Pre-commit a response to an incoming attack instead of scrambling when
the alert fires. Set a **Standing Order** on a nexus — troops sourced
from elsewhere automatically reinforce it under conditions you define —
so your defense is already in motion before you've even seen the
notification.

### Queue Templates and repeat-last

Training and building queues now support **saved templates** and a
**repeat-last** action, so a commander who trains the same composition
or queues the same upgrade order repeatedly doesn't have to re-enter it
by hand every time.

### Actionable push notifications

Push notifications are no longer just a heads-up — several now carry
**actions you can take directly from the notification**, without
opening the app first.

### Auto-Requeue

Set a nexus to automatically repeat a training batch or a building
upgrade every time the previous one completes — no more watching a
timer just to click again.

- Available for both **troop training** and **building upgrades**, from
  a new **Auto-Requeue** button alongside Standing Orders on the nexus
  page.
- Each rule reuses the exact same validation as the manual action —
  same cost checks, same requirement gates, same milestones. Auto-Requeue
  never bends the rules a manual click would have to follow.
- If a rule ever fails that validation (insufficient resources, a
  building requirement not yet met, queue full), it **pauses itself and
  notifies you** instead of silently dropping or repeatedly erroring.
  The pause reason is shown right on the rule, and you can re-enable it
  with one click once the blocker is cleared.
- A configurable limit keeps this from being abused as a fire-and-forget
  macro: up to 30 active rules per account.

### Notes

- Auto-Requeue notifications have their own opt-out toggle in
  Notification Settings, separate from other push categories.
- No combat, economy, or training-time numbers changed in this patch.
