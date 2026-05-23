-- Buff the starting resources from 500 to 1500 so new players can complete
-- the opening sequence (Command Core Lv1-3, Recruitment Core Lv1, first
-- troops, first scavenge raid) without dead waiting periods.
ALTER TABLE "Nexus" ALTER COLUMN "biomass" SET DEFAULT 1500;
ALTER TABLE "Nexus" ALTER COLUMN "alloy"   SET DEFAULT 1500;
ALTER TABLE "Nexus" ALTER COLUMN "ore"     SET DEFAULT 1500;
