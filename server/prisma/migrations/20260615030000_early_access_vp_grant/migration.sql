-- Grant 1,000 Vex Points to all users who existed before this deploy.
-- Idempotent: only touches rows that haven't received the grant yet.
-- A new column tracks the grant so re-running the migration is safe.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "earlyAccessVpGranted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "vexPoints" = "vexPoints" + 1000,
    "earlyAccessVpGranted" = true
WHERE "earlyAccessVpGranted" = false;
