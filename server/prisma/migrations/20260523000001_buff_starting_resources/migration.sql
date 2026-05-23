-- Buff the starting resources from 500 to 1500 so new players can complete
-- the opening sequence (Command Core Lv1-3, Recruitment Core Lv1, first
-- troops, first scavenge raid) without dead waiting periods. Storage Vault
-- base capacity is raised in code (1000 → 1500) so Lv1 gives 2250 cap and
-- holds the buffed stockpile with headroom.
ALTER TABLE "Nexus" ALTER COLUMN "biomass" SET DEFAULT 1500;
ALTER TABLE "Nexus" ALTER COLUMN "alloy"   SET DEFAULT 1500;
ALTER TABLE "Nexus" ALTER COLUMN "ore"     SET DEFAULT 1500;
