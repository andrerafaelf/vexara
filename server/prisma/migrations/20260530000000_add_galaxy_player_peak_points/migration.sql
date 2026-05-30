-- Track each player's highest-ever total influence per galaxy.
-- Used to scale an eliminated player's respawn nexus to a fraction of their
-- former strength. Backfilled to the current points so existing players who
-- get eliminated before earning a new peak still respawn at a sensible size.
ALTER TABLE "GalaxyPlayer" ADD COLUMN "peakPoints" INTEGER NOT NULL DEFAULT 0;

UPDATE "GalaxyPlayer" SET "peakPoints" = GREATEST("points", COALESCE("finalPoints", 0));
