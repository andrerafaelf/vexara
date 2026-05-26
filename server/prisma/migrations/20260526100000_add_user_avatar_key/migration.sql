-- Custom avatars (Officer + Commander tiers only).
-- avatarKey: short content-hash string (e.g. "a3f9b2c1d4e5f6a7").
-- Full URL is composed at read time as ${R2_PUBLIC_URL}/avatars/${userId}/${avatarKey}.webp.
-- Null = user has no custom avatar; UI falls back to the username-initial tile.
ALTER TABLE "User"
  ADD COLUMN "avatarKey" VARCHAR(64);
