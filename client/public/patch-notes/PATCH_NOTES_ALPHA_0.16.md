## Vexara — Alpha Patch Notes v0.16

Combat decisiveness, a Starfield speed-up, a batch of mobile/PWA
fixes, map expansion, espionage improvements, and a round of
anti-farming hardening.

---

### Combat: a blowout is a total wipe

Before, even a 15:1 fight left a handful of the losing army alive. A
report reading **"Attacker Wins — Crushing victory"** with 99% enemy
losses and four survivors didn't make sense, and those survivors could
block a conquest. That's fixed.

Losses for the losing side now scale like this against the power ratio
(loser power ÷ winner power):

| Power ratio | Loser losses |
|---|---|
| 3:1 or worse (ratio ≤ 0.33) | **100% — total wipe** |
| Between 3:1 and even | 100% → 85%, scaling |
| Even fight (ratio ≈ 1) | ~85% (a real remnant survives) |

Close fights still leave a remnant that can limp home, so attacking a
comparable force is still a gamble. But a decisive strike — the kind
that should obviously crush the defense — now annihilates it outright,
which also means your Overseer reliably clears the garrison and drives
the conquest through.

The in-attack combat calculator uses the same math, so its prediction
now matches the result you'll actually get.

### Starfield: 50×50 galaxy + faster panning

The playable map has expanded from 35×35 to **50×50** — more room to
spread out, more targets to find, and less early-game crowding around
starting positions.

- Panning the galaxy map no longer reloads on every cell. The client
  keeps the surrounding sector buffered and only fetches a new area
  when you near the edge of what's loaded — so dragging around feels
  instant instead of stuttering.
- Old nexuses stay on screen while the next sector loads. No more blank
  flashes between moves. A small pulse by the coordinates shows when a
  fresh sector is loading.
- Nexuses your faction has **marked as a target** now read `TARGET` in
  text under the marker, not just a small crosshair icon — easy to spot
  at a glance while scanning the map.

### Espionage map overhaul

The espionage map got a dedicated look to match the shadow-ops feel:

- **Denser starfield** — deeper space palette with blue-white stars and
  coloured nebula blooms, distinct from the main Starfield view.
- **Owner labels** — each nexus cell now shows the owner's username
  directly on the cell, so you can scan targets without clicking each one.
- **Coordinate jump controls** — the espionage map header now has the
  same X|Y jump box as the main Starfield, so you can navigate straight
  to a known target.

### Quest fixes

- **"Send 3 Attacks" (Aggressor) quest** could appear on the same day
  as "Launch 1 Attack" and they'd compete, making the 3-attack quest
  rarely selectable. Fixed: both quests now share the same category
  slot, so you get one attack quest per day — either the 1-attack or
  3-attack variant.

### Referral system: resource bonus reworked

Referred players previously received 5,000 of each resource on
sign-up — but the starting storage cap is 1,500, so the bonus silently
overflowed and most of it was lost. The bonus is now **35 starter
troops** (15 Recon Operatives, 10 Lancer Drones, 10 Assault Troopers)
instead. They're immediately useful and don't get capped away.

### Anti-smurf hardening

Several new layers to make account farming harder:

- **Disposable email block** — registrations from temp-mail and
  throwaway address providers are rejected outright.
- **Email alias deduplication** — `user+tag@domain.com` and
  `user@domain.com` resolve to the same address; using an alias to
  refer yourself is now blocked.
- **IP referral cap** — a single IP can be the source of at most 2
  referred accounts. Legitimate household sharing is kept; bulk farming
  from one machine is not. The new account still registers — only the
  referral credit is withheld.
- **Account age gate** — referral tokens aren't granted for accounts
  that reach the score threshold in under 4 hours, since real players
  take longer than bots to earn those points.

### Tab UI fixes

- The Overview, Buildings, and Troops tabs now have a consistent
  background that matches the app theme.
- The tab bar is sticky on both desktop and mobile, keeping the
  switcher in reach while scrolling through long lists.

### Patch notes prompt

The "new patch" notification has been promoted from a small corner
toast to a **centred modal**, so it's harder to miss.

### Mobile / PWA fixes

- **Installed-app top bar fix.** On Android, the installed PWA put the
  navigation (including the **Login** button and the in-game header)
  underneath the status bar — clock, battery, and Wi-Fi icons sat on
  top of it and it couldn't be tapped. Every top bar now reserves a
  guaranteed strip of clearance in standalone mode while still honoring
  a notch inset where the device reports one.

### Patch notes formatting

- The patch-notes page now renders **tables**, numbered lists, nested
  bullets, and links — previously these showed up as raw text. (You're
  looking at one of those tables above.)

---

See you in the dark. - André
