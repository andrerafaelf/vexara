## Vexara — Alpha Patch Notes v0.7

Officer and Commander supporters can now upload a custom avatar.
The Commander tier glow on the sidebar finally renders the right colour.

---

### Custom avatars (Officer + Commander)

**Upload a picture, see it everywhere your username appears.**

The Profile → Stats tab now has an avatar card if you're on Officer or
Commander tier. Pick a JPEG, PNG, or WebP (up to 4 MB), crop it to a square,
and your face replaces the username-initial tile across the whole game —
sidebar, profile header, public profile, faction members, war room slots,
attack reports, scouted nexus owners, friend list, every place a name with
a tile shows up.

Under the hood: uploads are re-encoded server-side with `sharp` into two
WebP variants (256×256 for headers, 64×64 for small renders), EXIF stripped,
content-hashed, and stored on Cloudflare R2 with a 1-year immutable cache
header behind a custom CDN domain. Avatars load lazily, are usually <15 KB
each, and after the first hit they come straight from Cloudflare's edge —
no origin egress, no extra DB query. Replacing or removing an avatar deletes
the previous R2 objects in the background.

Tier-gating is enforced server-side: a 403 if anyone tries the upload
endpoint without Officer/Commander, with a per-user rate limit of 10
uploads per hour to keep abuse cheap. If your supporter tier later expires,
your existing avatar stays in place — only changing it requires being on
tier.

Recruit tier doesn't get custom avatars (intentional — it's a $5 perk
boundary). The avatar upload card simply doesn't appear for free accounts
or Recruit supporters.

---

### Sidebar avatar glow

**Commander tier glow renders cyan in the sidebar, not amber.**

The sidebar's commander card avatar was showing the default amber supporter
pulse even for Commander-tier supporters, while the profile page header
correctly rendered the cyan elite glow. Two separate bugs:

1. **Stale user data.** `useAuth().user` is hydrated from localStorage at
   login time and was never refreshed. If your supporter tier changed
   *after* you logged in (Ko-fi upgrade mid-session), the cached blob still
   said `supporterTier: null`, so the cyan-glow class was never applied.
2. **Clipped box-shadow.** Even after the class was applied, the sidebar's
   `.commander-avatar` carried a `clip-path` from the angled-corner theme
   that was cropping the cyan border-pulse box-shadow away, leaving only
   the amber accent background visible at the edges.

Both fixed:

- `AuthProvider` now refreshes `/users/me` on mount when a token exists
  and merges the fresh `supporterTier`, `isFounder`, and avatar URLs into
  state and localStorage. Future tier upgrades show up on the next page
  load instead of requiring a logout.
- The sidebar and profile avatars are now rendered by a shared `<Avatar>`
  component that uses `<img>` when a custom avatar is set (background goes
  transparent so the clip-path doesn't fight an accent fill underneath).

A new `GET /api/users/me` endpoint backs the refresh — same shape as the
login response.

---

### Internal: shared `<Avatar>` component

Every place that used to render a username-initial tile now goes through
`<Avatar username avatarUrl avatarUrlSm size />`. Image variants get
`loading="lazy"` and `decoding="async"` automatically, small renders prefer
the 64×64 file, larger renders prefer the 256×256 file. The legacy
`.commander-avatar` and `.ps-avatar` classes still apply for theme
positioning, but the inner element is now component-controlled.
