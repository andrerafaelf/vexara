-- Backfill isAlphaFounder for everyone who has ever joined a galaxy.
-- Joining a galaxy always creates a starter nexus (see galaxyService.selectGalaxy
-- / starterNexus.createStarterNexus), so a GalaxyPlayer row is the durable proof
-- that a user "signed up and created a nexus" - it survives elimination, leaving,
-- and galaxy resets, unlike a live Nexus row. Going forward the flag is set at
-- starter-nexus creation; this captures the existing player base.
UPDATE "User"
SET "isAlphaFounder" = true
WHERE "isAlphaFounder" = false
  AND EXISTS (
    SELECT 1 FROM "GalaxyPlayer" gp WHERE gp."userId" = "User"."id"
  );
