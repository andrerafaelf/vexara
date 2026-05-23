-- Backfill newbie protection for player-owned nexuses that never received it.
-- Original 3-day window starts from createdAt, so anyone whose nexus is older
-- than 3 days will resolve to a past timestamp and remain unprotected — which
-- matches the intended behavior (the shield only ever covered the first 3 days).
UPDATE "Nexus"
SET "newbieProtectionEndsAt" = "createdAt" + INTERVAL '3 days'
WHERE "newbieProtectionEndsAt" IS NULL
  AND "ownerId" IS NOT NULL;
