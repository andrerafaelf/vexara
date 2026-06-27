## Vexara - Alpha Patch Notes v0.26

The last hardening pass before Beta #1. Two things you'll actually see -
a rebuilt first-faction experience and clearer daily-reward feedback -
plus a round of behind-the-scenes anti-exploit work. No economy,
training, or combat numbers changed.

---

### Founding a faction makes sense now

If you landed in a fresh galaxy with no factions yet, the faction screen
used to be a dead end. It's rebuilt around where you actually are:

- **First one in?** You get a founder's panel that spells out what a
  faction unlocks (war room, shared chat, allied garrisons) and a single
  button to raise your banner. Tap it and the create form is already
  filled in with a sensible name and tag - tweak it or confirm.
- **Factions already recruiting?** You get a short **Recruiting Now**
  list that surfaces the ones with room, with one-tap join. Founding your
  own is still right there if you'd rather lead than join.

The flow is faster and never leaves you staring at an empty screen
wondering what to do next.

### Daily rewards tell you when storage is full

Claiming your daily quest rewards while a nexus is already at its storage
cap used to silently hand you less than the listed amount with no
explanation. The reward is still capped to what your storage can hold,
resources can't overflow, but the claim now **tells you it was capped**
and suggests spending down first, so you can collect the full amount.

### Behind the scenes

- Closed several resource-handling edge cases that could surface under
  heavy concurrent actions, so cancelling a market listing, spending from
  a faction treasury, and trading always settle on exact, conserved
  balances.
- Ongoing pre-Beta security and stability hardening across the server.

---

See you in the dark. - André
