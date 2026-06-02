-- One-time newbie relocation token, lifecycle-bound to the starter nexus.
-- Granted on fresh signup (not on eliminated-respawn); consumed when the player
-- relocates near a chosen nexus. The token is dead once newbie protection
-- lapses, regardless of the boolean, so no backfill is needed: existing nexuses
-- default to "no token" and any still-protected veterans simply never had one.
ALTER TABLE "Nexus"
  ADD COLUMN "relocationTokenAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "relocationTokenUsedAt" TIMESTAMP(3);
