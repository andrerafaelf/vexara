## Vexara — Alpha Patch Notes v0.7

Custom avatars for Officer and Commander supporters. Four urgent bug fixes
(troop duplication, instant-upgrade revert, missing T2 bonus on conquered
nexuses, and inaccurate build/train timers). Specialization bonuses now
show their real numbers on the nexus banner.

---

### Specialization bonuses now show their math

Every specialized nexus banner now shows the live numbers behind the bonus.
No more guessing whether the buff is on or what it's worth right now.

- **Resource Depot** — real per-hour production shown next to the un-buffed value.
- **Supply Cache** — real storage cap shown next to the un-buffed value, plus loot protection %.
- **Military Outpost** — training time shown buffed (with strikethrough base time) on every troop card.
- **Reclaimed Outpost** — build time shown buffed (with strikethrough base time) on every building card.

---

### Build and train timers no longer lie

Card countdowns now match the time the server actually takes. Two separate
bugs were behind the drift: the client and server were using different
numbers for unit costs and time discounts, and on top of that every
countdown trusted your browser's local clock — which drifts, especially on
phones and Windows machines. Countdowns now sync to the server clock, so a
misconfigured local clock no longer makes timers read short or long. No
balance changes.

---

### Conquered NPC nexuses no longer denied the T2 bonus

If you conquered a neutral that already had Command Core 15, you were
silently stuck at the base tier. Fixed — the doubled bonus now applies
automatically the next time you open the nexus.

---

### Army duplication after recall, fixed

Recalling stationed troops no longer leaves a clone behind at the host.
A one-time cleanup corrects any nexuses still inflated from the bug.

---

### Instant-upgrade reward no longer overwritten

Using an instant-upgrade on a queued building no longer reverts when the
queue completes. The boost is now permanent.

---

### Custom avatars (Officer + Commander)

Profile → Stats now has an avatar upload card. JPEG/PNG/WebP, up to 4 MB,
cropped to a square. Your image replaces the username tile everywhere —
sidebar, profile, faction members, war room, attack reports, friend list.

Officer and Commander tiers only. Existing avatars stay if your tier expires;
only changes require active tier. 10 uploads per hour cap.

---

### Sidebar Commander glow fixed

Commander-tier sidebar avatar now renders the correct cyan glow instead of
amber. Profile data also refreshes on every page load now, so future tier
upgrades show up without needing a logout.
