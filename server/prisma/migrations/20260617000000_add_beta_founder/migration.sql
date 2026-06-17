-- Beta Founder cohort. Alpha is closed; isAlphaFounder is now a historical badge.
-- isBetaFounder is granted ONLY to players who found a nexus on/after the beta
-- launch (2026-06-28 18:30 UTC). The window stays open for the whole beta (no
-- hard end date; closed manually in galaxyService when beta ends).
-- Granted at nexus-founding time in galaxyService.joinGalaxy — no backfill, since
-- existing users founded their nexus before beta launch and do not qualify.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isBetaFounder" BOOLEAN NOT NULL DEFAULT false;
