-- Performance indexes added for production scale
-- Eliminates full-table scans on hot query paths

-- Attack: job polls (status, arrivesAt) every 10 s and per-nexus lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Attack_status_arrivesAt_idx"
  ON "Attack"("status", "arrivesAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Attack_attackerNexusId_status_idx"
  ON "Attack"("attackerNexusId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Attack_defenderNexusId_status_idx"
  ON "Attack"("defenderNexusId", "status");

-- TroopTransfer: job polls arriving transfers every 10 s
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TroopTransfer_status_arrivesAt_idx"
  ON "TroopTransfer"("status", "arrivesAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "TroopTransfer_ownerNexusId_status_idx"
  ON "TroopTransfer"("ownerNexusId", "status");

-- Nexus: owner+galaxy lookup (getMyNexuses), controlLevel scan (recoverControlLevels)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Nexus_ownerId_galaxyId_idx"
  ON "Nexus"("ownerId", "galaxyId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Nexus_controlLevel_idx"
  ON "Nexus"("controlLevel");

-- MarketListing: seller nexus lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarketListing_sellerNexusId_idx"
  ON "MarketListing"("sellerNexusId");
