## Vexara — Alpha Patch Notes v0.15.1

A focused economy pass. Resource generation was scaling too fast
at high levels, and Overseers — the only meaningful way to spend
a large surplus — stayed flat-priced no matter how many nexuses
you held. Both are addressed here.

---

### Resource production growth reduced

Production at low levels is unchanged — the opening sequence and
early upgrades feel the same as before. What changed is how fast
output compounds as buildings climb.

The per-level growth multiplier dropped from **1.35 to 1.32**.
That sounds small, but it stacks across 20 levels:

| Farm level | Before | After |
|---|---|---|
| 5 | ~2,688/h | ~2,385/h |
| 10 | ~10,079/h | ~8,127/h |
| 15 | ~37,797/h | ~27,696/h |
| 20 | ~141,795/h | ~94,369/h |

A maxed-out 2× Resource Depot nexus goes from ~479k/h per resource
down to roughly **~189k/h** — still a strong late-game payoff, but
no longer an amount that's impossible to outspend.

### Overseer cost scales with your empire size

Overseers are conquest units, and conquest is the only thing that
meaningfully absorbs a large resource stockpile. With flat pricing
there was no pressure: a player sitting on a hundred nexuses paid
the same 440k per Overseer as someone just breaking into their
fourth. That's been corrected.

The first **three** Overseers (across all queues, all nexuses)
cost the standard base price. From the fourth onward, cost
increases **1.5× per additional nexus owned**:

| Nexuses owned | Biomass | Alloy | Ore |
|---|---|---|---|
| 1 – 3 | 180,000 | 140,000 | 120,000 |
| 4 | 270,000 | 210,000 | 180,000 |
| 5 | 405,000 | 315,000 | 270,000 |
| 6 | 607,500 | 472,500 | 405,000 |

The cost shown in the training panel always reflects what you'll
actually pay at your current empire size. Cancellation refunds
(85%) are calculated against the price you paid, not the base rate.

---

See you in the dark. - André
