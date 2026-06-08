-- Galaxy join-lock: when true, no new players may join (existing members keep playing).
ALTER TABLE "Galaxy" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;

-- Per-galaxy dominance victory config. NULL columns fall back to the engine defaults
-- in server/utils/dominance.ts (0.65 share, 36h sustain, 15 players, 4 factions).
ALTER TABLE "Galaxy" ADD COLUMN "winShare" DOUBLE PRECISION;
ALTER TABLE "Galaxy" ADD COLUMN "winSustainHours" INTEGER;
ALTER TABLE "Galaxy" ADD COLUMN "winMinPlayers" INTEGER;
ALTER TABLE "Galaxy" ADD COLUMN "winMinFactions" INTEGER;
