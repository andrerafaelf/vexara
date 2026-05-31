## Vexara — Alpha Patch Notes v0.4

Nexus specialization and type bonus audit. Military Outpost was running at
half strength everywhere. The doubling logic for conquered NPC nexuses was
wired to the wrong event. All corrected end-to-end.

---

### Nexus types

**Military Outpost corrected — was running at half its intended power.**

The shield efficiency and training speed multipliers were both wrong at the
data layer, and every label, tooltip, and Codex entry that referenced them.
All corrected:

- Shield efficiency: was +25%, now correctly +100% (base) / +200% (doubled).
- Training speed: was 25% faster, now correctly 50% faster (base) / 75% faster (doubled).

**Nexus type doubling now triggers correctly at Command Core 15.**

The previous logic doubled bonuses at conquest time, which was wrong — NPC
nexuses have base-tier bonuses and conquering them doesn't change that.
Doubling is the reward for investing in the nexus to Command Core 15:

- **Conquered NPC nexus**: acquired at base tier. When the owner builds
  Command Core to level 15, the doubled bonus tier unlocks automatically.
  No separate action needed.
- **Player specialization** (nexus with no prior type): choosing a type at
  CC15 grants the doubled tier immediately. Unchanged.
- **Conquest of another player's nexus**: always resets to base tier on
  conquest. The new owner must reach CC15 themselves to unlock the doubled tier.

**Bonus doubling formula fixed for time-based multipliers.**

The doubled path for training and build time bonuses used linear scaling,
which would have zeroed out training time for Military Outpost at the doubled
tier. Both now compound correctly:

- Military Outpost doubled: `0.5² = 0.25` → 75% faster training ✓
- Reclaimed Outpost doubled: `0.8² = 0.64` → 36% faster construction ✓

**Badge tooltips now show correct tier per nexus.**

The type badge in the sidebar now reflects whether a nexus is at base or
doubled tier.

---

**Bonus tiers — all nexus types:**

| Type | Base (pre-CC15) | Doubled (CC15 reached) |
|---|---|---|
| Resource Depot | 2x production | 3x production |
| Supply Cache | 2x storage | 3x storage |
| Military Outpost | +100% shield, 50% faster training | +200% shield, 75% faster training |
| Reclaimed Outpost | 20% faster construction | 36% faster construction |

---

See you in the dark. - André
