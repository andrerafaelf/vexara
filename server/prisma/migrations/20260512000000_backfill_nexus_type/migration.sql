-- Backfill nexusType for NPC nexuses created before the nexusType column was added.
-- These nexuses have a name matching one of the known NPC types but nexusType = NULL.
UPDATE "Nexus"
SET "nexusType" = name
WHERE "nexusType" IS NULL
  AND name IN ('Resource Depot', 'Military Outpost', 'Supply Cache', 'Neutral Settlement', 'Reclaimed Outpost');
