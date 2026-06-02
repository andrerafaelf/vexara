## Vexara - Alpha Patch Notes v0.19

Scheduled waves now fire on the server, training queues split by combat
class at Command Core 15, Life Support and Recruitment Core push to higher
ceilings, and a pile of fixes.

---

### Wave Planner now schedules server-side

If you planned a wave for the middle of the night and woke up to find
**nothing happened**, this is why — and it's fixed.

The old Wave Planner held your scheduled launch in a timer **inside your
browser tab**. That timer only survived while the tab stayed open and
focused. Close the tab, sleep the laptop, or let the browser background
the tab for a few hours, and the launch silently died. Nothing ever
reached the server, so there was no attack and no trace.

Now, when you schedule a wave, the launch is persisted **on the server**.
A background job fires it the moment its launch time passes — whether or
not you're online, whether or not the tab is open. You can plan an
overnight strike, close everything, and trust it to go.

**What this means for you:**

- **Close the tab.** Scheduled waves no longer depend on a live browser.
- **It re-checks at launch.** Troop counts, ownership, and newbie
  protection are validated _when the wave fires_, not when you schedule
  it — so a wave only sends troops you still have, to a target that's
  still valid. If something changed (troops spent elsewhere, target
  gained protection), the wave is marked failed instead of misfiring.
- **Cancel from anywhere.** Pending scheduled waves load back into the
  planner on any device and can be cancelled until they launch.
- **Near-instant waves still send immediately.** If a launch is due
  within a minute, it's sent right then rather than queued.

Limits: up to 50 pending scheduled waves per player, scheduled up to 7
days ahead.

> Note: this covers the personal **Wave Planner** (Map → target → Wave
> Planner). War Room operations remain a coordination board — members
> still send their own slots.

### Training queues split by combat class at Command Core 15

Veteran nexuses can now train multiple combat classes **at the same
time**. Reaching **Command Core 15** splits your single combat training
queue into three parallel lanes — **Mobile, Armor, and Fire** — each
running its own timeline. A fourth **Special** lane (Recon + Overseer)
runs alongside, as it always has.

What that means: you no longer have to wait for a stack of Siege Mechs to
finish before you can start on Skimmer Bikes. Build a balanced,
counter-ready army in one pass instead of three.

| Command Core | Queues                          | Slots per lane |
| ------------ | ------------------------------- | -------------- |
| Below 15     | Combat + Special (as before)    | 5              |
| 15 – 17      | Mobile · Armor · Fire · Special | 2              |
| 18           | (same four lanes)               | 3              |
| 19+          | (same four lanes)               | 4              |

The per-lane slot count is intentionally tight. This is a **capability**
upgrade — produce more variety in parallel — not a way to rebuild a wiped
army faster. Population capacity is still the real ceiling on how much you
can field at once.

Nothing changes below Command Core 15: you keep the single combat queue
and its full slot count. The Train panel now shows which lane is full
(e.g. "Mobile queue is full"), and the queue display groups each lane
with its own class-coloured slot meter.

### Life Support holds more population

The population ceiling has been raised, with the gain concentrated in the
late levels where the investment is. A **maxed Life Support (Lv25) now
supports just under 10,000 population** — up from ~7,700. Early levels are
barely affected; the curve simply climbs harder as you push toward the
cap, making a fully built Life Support the real anchor for a large standing
army.

### Recruitment Core extends to Level 20

Recruitment Core's maximum level is raised from **15 to 20**, giving deep
economies five more levels of training-speed investment. To keep army
**production** speed from running away, the per-level discount eases off in
the new band:

- **Lv1–15:** −9% train time per level (unchanged).
- **Lv16–20:** −5% train time per level.

A maxed Lv20 Recruitment Core trains roughly **5.3× faster** than base.
These last levels are deliberately a min-max investment — the upgrade costs
climb steeply, so they reward dedicated economies without handing the
fastest army-rebuild to whoever's already ahead.

### Stationing is defensive-only (support and transfers)

Sending troops to sit at another nexus — whether reinforcing an ally
(support) or one of your own nexuses (transfer) — is one rule now: **only
defensive units may be stationed**: Assault Trooper, Lancer Drone, Siege
Mech, and Bulwark Guard. Offensive units only ever leave a nexus on an
attack, and always strike from the nexus that trained them. (Previously a
gap let offensive units be transferred between your own nexuses; that was
never intended.)

Plasma Turret remains fully stationary — it can't be sent on attacks,
scouts, support, or transfers, and now never appears as an option for any
of them.

### Fixes

- **Recalled / returning troops no longer go missing.** When two groups
  of troops returned to the same nexus at the same moment (e.g. multiple
  support forces recalled together after a defense), one group's units
  could be silently dropped for any unit type the two shared. Survivors
  now always land in full. Also fixed: troops recalled to a nexus you then
  lost could get stuck mid-return — they now resolve cleanly and free their
  population.
- **Combat Calculator:** the defender's "estimated survivors" column was
  clipped off the right edge of the result panel — fixed, and the panel
  widened so both columns read clearly.
- **Training amount input** no longer offers a max above the per-batch
  limit (1,000). It previously let you enter a higher number — e.g. 1,215
  Void Stalkers — then rejected the request on submit. Queue another batch
  for more.

### Nexus tab bar pins flush to the header (desktop)

The Overview / Buildings / Troops switcher had a stubborn gap between it
and the top header on desktop. It now pins cleanly right under the header
when you scroll. (The bar had been carrying a layout trick meant for a
different position; removed.)

---

See you in the dark. - André
