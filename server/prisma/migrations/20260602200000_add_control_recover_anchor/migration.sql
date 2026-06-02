-- Time-based control regen anchor. Replaces the old "+10 per job invocation"
-- model (which granted a free +10 to every nexus on each server restart, letting
-- besieged defenders farm control during frequent deploys). Regen now grants
-- floor(hours elapsed since this timestamp) * 10, advancing the anchor by the
-- whole hours consumed so the remainder carries over.
--
-- Backfill existing rows to now() so the deploy doesn't hand out a one-time
-- catch-up; everyone's regen clock simply starts fresh from this migration.
ALTER TABLE "Nexus"
  ADD COLUMN "lastControlRecoverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Nexus" SET "lastControlRecoverAt" = CURRENT_TIMESTAMP;
