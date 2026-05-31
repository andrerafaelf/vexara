## Vexara — Alpha Patch Notes v0.16.2

Population bug fixes and balance: corrected troop tracking from quest
rewards, tuned the population cap formula, and fixed a Combat Calculator
swap bug.

---

### Population cap rebalanced

The Life Support building's population formula was compounding too
aggressively. At level 20 it was handing out ~190,000 capacity, which
made the system effectively meaningless — you could field an enormous
army with no housing pressure whatsoever.

The growth constant has been pulled back from **1.30 to 1.19** per
level. Life Support 20 now caps out at roughly **3,166 population**, which
is still a sizeable late-game army but means housing actually matters
across all stages of the game. Existing nexuses are corrected
automatically on this deploy — your `populationMax` will update, and if
your `populationCurrent` was somehow above the new cap it gets clamped
down too.

### Quest reward troops now count against population

A real bug that's been quietly misreporting your population since quest
rewards were added: when a quest chapter handed out free troops (say, 25
Recon Operatives), those troops were added to your garrison but their
population cost was never charged to `populationCurrent`. So your
population bar would show one number while your actual troop headcount
implied a higher one, and you'd eventually hit a training wall you
couldn't explain.

Both quest reward paths (auto-apply on login and the manual chapter
claim) now correctly add the population cost of any troops granted
alongside the flat population reward. Going forward the numbers will
stay in sync.

### Combat Calculator — swap sides now swaps modifiers

When you hit **Swap sides** in the Combat Calculator, the attacker and
defender forces switched correctly — but **Armory level** and **Shield
Grid level** stayed on their original sides, so after a swap your
attacker was running on the defender's shield bonus and vice versa.

Fixed. Swapping forces now also swaps the two modifiers so the numbers
always belong to the right side.

---

Three small ones, but the population tracking fix in particular clears
up something that's been quietly lying to players for a while.

---

See you in the dark. - André
