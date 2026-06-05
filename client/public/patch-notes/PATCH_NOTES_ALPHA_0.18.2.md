## Vexara - Alpha Patch Notes v0.18.2

A small conquest-economy correction: Overseer cost scaling now keeps
pressure on large empires without running into the storage wall.

---

### Overseer cost now caps at 4x

The previous Overseer curve multiplied cost by **1.5x for every owned
nexus beyond three**. That did the anti-snowball job early, but it
kept growing until the cost could exceed even a maxed Storage Vault.
At that point the rule stopped being "conquest is expensive" and became
"this unit cannot be trained from most nexuses."

The new rule keeps the same early-game protection, then caps cleanly:

| Owned nexuses | Multiplier | Biomass |   Alloy |     Ore |
| ------------- | ---------: | ------: | ------: | ------: |
| 1-3           |      1.00x | 180,000 | 140,000 | 120,000 |
| 4             |      1.33x | 240,000 | 186,666 | 160,000 |
| 6             |      2.00x | 360,000 | 280,000 | 240,000 |
| 9             |      3.00x | 540,000 | 420,000 | 360,000 |
| 12+           |      4.00x | 720,000 | 560,000 | 480,000 |

The training panel uses the same formula as the server, so the price
shown is the price paid. Cancellation refunds still use the stored
price paid by that queue item.

### Population capacity fixes

Two bugs caused "Insufficient population capacity" errors when players
actually had room to train:

**Dead troops no longer block training**
When your attack resolved and troops died in combat, the system kept
reserving housing for the entire original force , including the dead ,
until the survivors physically returned home. Now, dead troops free
their population slots immediately when combat resolves. You can train
replacements right away instead of waiting for ghosts to come home.

**Stationed reinforcements now show in your population count**
If you had troops stationed at an ally's nexus as reinforcements, those
troops still occupied your housing but weren't reflected in your
displayed population. The UI showed plenty of free capacity, but the
server correctly blocked training. Your population bar now accurately
includes troops you have deployed elsewhere (traveling, stationed, or
returning), so what you see matches what you can actually use.

### Codex update

The Overseer Codex entry now calls out the empire-size cost ramp and
the 12+ nexus cap.

---

See you in the dark. - Andre
