# Speed Galaxy Design

Tribal Wars has speed worlds (2×, 3×, 5×, 10×) where every time-based mechanic runs
faster. This document describes how to implement the same concept in Vexara.

---

## What a speed multiplier controls

Everything time-sensitive in Vexara is anchored to **wall-clock milliseconds**. A
per-galaxy `speedMultiplier` (e.g. 5 for a 5× world) shrinks durations by dividing
them, so a 36-hour dominance hold becomes 7.2 hours on a 5× world. That single lever
affects every mechanism listed below.

### 1 · Resource production

**File:** `server/utils/economy.ts · computeResourceUpdate`

Production is `production_per_hour × hoursSinceLastUpdate`. With a multiplier:

```
hoursSinceLastUpdate = elapsedMs / 3_600_000 * speedMultiplier
```

Net effect: resource stockpiles fill `N×` faster. Storage caps and the per-hour rates
themselves don't need to change — the elapsed-time multiplier handles it.

### 2 · Travel time (attacks, transfers, scouts)

**File:** `server/services/attackService.ts · computeTravelMinutes`

The formula returns `travelTimeMinutes` from distance + troop speed. Divide by the
multiplier before converting to a timestamp:

```
travelTimeMinutes / speedMultiplier → arrivesAt
```

### 3 · Build queue

**File:** `server/controllers/nexusController.ts` (builds the `finishesAt` timestamp)

The base build duration comes from `gameConstants`. Divide by the multiplier when
computing `finishesAt = now + baseDurationMs / speedMultiplier`.

### 4 · Training queue

Same pattern as builds. The training duration per unit is divided by the multiplier.

### 5 · Dominance sustain window

**File:** `server/utils/dominance.ts · resolveWinConfig`

`DOMINANCE_SUSTAIN_MS` (36 h) is already read via `resolveWinConfig`. On a speed world
the admin can set `winSustainHours` to `36 / speedMultiplier` when creating the galaxy.
Alternatively, `resolveWinConfig` can automatically apply the multiplier if it's stored
on the galaxy row (see schema section below).

### 6 · Rogue-AI & neutral nexus timers

**Files:** `server/utils/rogueAiRaider.ts`, `server/utils/rogueAiGrowth.ts`,
`server/utils/neutralNexuses.ts`

These are driven by periodic `setInterval` calls in `server/server.ts`. The server
loops don't need to run faster — they just need to pass the galaxy's `speedMultiplier`
to the internal "how much time has passed?" calculations, the same way economy.ts does.

### 7 · Daily streak / newbie protection / quest timers

These are user-level, not galaxy-level. They should stay at 1× to avoid confusing
players across worlds. Re-evaluate if a galaxy ever needs to be fully isolated.

---

## Schema change (one field)

```prisma
model Galaxy {
  // … existing fields …
  speedMultiplier Float @default(1.0) // 1 = normal, 5 = 5× speed world
}
```

Migration: `ALTER TABLE "Galaxy" ADD COLUMN "speedMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0;`

The default of `1.0` means every existing galaxy continues to work with zero code-path
changes.

---

## Propagating the multiplier

The cleanest approach is **fetch-once at use site**: wherever a time-sensitive
calculation runs it looks up `galaxy.speedMultiplier`. For the hot paths (economy,
travel, builds) the galaxy row is already being fetched as part of the request context,
so there's no extra DB hit. The game-loop timers (rogueAI, neutralNexuses) that run
across all galaxies already iterate galaxy rows — add `speedMultiplier` to their
`select`.

**Do not** cache the multiplier in a module-level variable or in the nexus row — that
creates stale-multiplier bugs if an admin changes the value mid-game.

---

## Admin UI

The existing win-config modal in `admin-client/src/components/pages/GalaxiesPage.tsx`
can gain a **Speed multiplier** field (numeric, free-form, e.g. 1/2/5/10/25) next to
the win-condition fields. It's persisted via `PATCH /api/admin/galaxies/:id`.

The galaxy-list meta line already shows `Win 65%/36h` — add `· 5×` for non-standard
speeds.

---

## Client-picker display

`GalaxyPicker.tsx` should show a speed badge on the card name row when `speedMultiplier > 1`:

```
Beta test #1  [Joined]  5×
```

The badge uses the existing `.gp-card-tag` styling with an amber colour (`gp-card-tag-speed`).

The server's `serializeGalaxy` needs to include `speedMultiplier` in the client payload
(currently it's excluded, same as win-config fields).

---

## Suggested multiplier values

| Label | multiplier | Notes |
|-------|-----------|-------|
| Standard | 1× | All existing galaxies |
| Fast | 5× | "Weekend sprint" world — collapses a normal 2-week game into ~3 days |
| Blitz | 10× | Short-burst competitive world |
| Ultra | 25× | Test / showcase world. Not recommended for long-running seasons. |

Fractional values (0.5× for a "slow world") work too, though the product hasn't tested
player appetite for that.

---

## Implementation order

1. Schema + migration (`speedMultiplier` field, default 1.0).
2. Admin service: include in `updateGalaxy`, expose in `listGalaxies` / `createGalaxy`.
3. Admin UI: field in win-config modal; show speed badge on galaxy list item.
4. `computeResourceUpdate` — pass `galaxy.speedMultiplier`, multiply `hoursSinceLastUpdate`.
5. `attackService.ts` — divide `travelTimeMinutes` by multiplier before building `arrivesAt`.
6. Build-queue `finishesAt` calculation — divide base duration by multiplier.
7. Training-queue `finishesAt` — same.
8. `dominance.ts · resolveWinConfig` — divide `sustainMs` by multiplier automatically.
9. Rogue-AI / neutral nexus loops — pass multiplier to elapsed-time calculations.
10. Client serializer — include `speedMultiplier` in galaxy payload.
11. `GalaxyPicker.tsx` — show speed badge on card.
12. Patch notes.

Steps 4–9 each require touching a single function. Steps 1–3 and 10–12 are boilerplate.
Total estimate: medium-sized batch (~1 day), low regression risk because the 1× default
is a no-op on all existing code paths.
