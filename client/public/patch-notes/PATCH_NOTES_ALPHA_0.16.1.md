## Vexara - Alpha Patch Notes v0.16.1

A focused espionage pass: a one-click way to recover blown covers, a
fix for embeds silently eating extra operatives, and clearer feedback
while operatives are still inbound.

---

### Re-embed a discovered operative in one click

The complaint that started this: you embed an operative, refresh intel a
couple of times to prep an attack, the **Stealth Array** catches it ,
and now the asset is gone and you have to hunt that nexus down on the
map all over again just to send another. Annoying enough to close the
tab over.

There's now a **Recently Discovered Operatives** panel in the Espionage
tab. The last five operatives that got caught are listed with their
target name and coordinates, each with a **Re-embed** button that
dispatches a fresh operative straight back to that exact nexus , no map
hunting. The button knows when you're out of Recon Operatives, or when
the target no longer exists, and tells you why it's disabled.

### Embeds no longer waste your operatives

A real bug: an embed only ever stations **one** operative , its cost and
detection odds don't change with the number sent. But if you'd set a
larger operative count for a sabotage and then switched to embed, that
count carried over, and the embed silently spent every one of those
operatives for no extra benefit. Send 4, lose 4, get one asset (or none
if detected).

Fixed on three fronts:

- Switching mission type now resets the operative count.
- Embed dispatches are hard-capped to a single operative on the way out.
- The server enforces the same cap, so no client can over-spend recon on
  an embed regardless of what it sends.

### "Where did my operative go?" - clearer in-transit feedback

An embedded operative only becomes a **stationed asset** once it
*arrives* at the target, which takes travel time. Until then it sits
under **Missions in Transit**, and the Active Embedded Operatives list
read a flat "No operatives embedded" , easy to read as "nothing
happened."

That empty state now counts your inbound embeds: *"2 embed operatives
still in transit , they'll appear here once they reach the target."* So
a dispatch that's working no longer looks like one that failed.

---

A quick note on what *didn't* change: discovery odds are the same as
before (4% base + 1.5% per enemy Stealth Array level on refresh, capped
at 12%). The Stealth Array is meant to make embedded intel a contested,
expiring resource , the goal here was to make recovering from a blown
cover painless, not to remove the risk.

See you in the dark. - André
