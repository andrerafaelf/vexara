-- Add galaxyId to ReferralToken so tokens stack once per referee per galaxy
ALTER TABLE "ReferralToken" ADD COLUMN IF NOT EXISTS "galaxyId" INTEGER NOT NULL DEFAULT 0;

-- Migrate existing rows: assign a dummy unique galaxyId per duplicate refereeId
-- so the unique constraint can be applied without conflicts.
-- Existing tokens all get galaxyId 0 (the default), but we need to deduplicate first:
-- keep the first token per refereeId and renumber the rest so they don't collide.
WITH ranked AS (
  SELECT id, "refereeId",
         ROW_NUMBER() OVER (PARTITION BY "refereeId" ORDER BY id) - 1 AS rn
  FROM "ReferralToken"
)
UPDATE "ReferralToken" t
SET "galaxyId" = r.rn
FROM ranked r
WHERE t.id = r.id;

-- Now apply the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralToken_refereeId_galaxyId_key"
  ON "ReferralToken"("refereeId", "galaxyId");
