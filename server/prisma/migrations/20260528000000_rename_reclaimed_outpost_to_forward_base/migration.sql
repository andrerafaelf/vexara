-- Rename nexus type: 'Reclaimed Outpost' → 'Forward Base'
-- Affects all nexuses regardless of owner (player-specialised and NPC/neutral).
UPDATE "Nexus"
SET "nexusType" = 'Forward Base'
WHERE "nexusType" = 'Reclaimed Outpost';
