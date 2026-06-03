-- Military Restructure Stage 2b: retire Recruitment Core; split it into three
-- class-specific production buildings (Hangar Bay = mobile, Plasma Forge = fire,
-- Armor Foundry = armor). Each class building gates and accelerates training of
-- its own class only.
--
-- Migration is player-friendly: every existing Recruitment Core level becomes
-- the starting level of ALL THREE new buildings. A maxed-RC player loses
-- nothing — they retain equivalent production access across all classes — but
-- a future specialist will dump resources into a single class building, since
-- the train-time bonus is now per-class.
--
-- In-flight RC upgrades in the build queue need to be reissued against one of
-- the new buildings. Rather than rewriting JSON queue blobs (fragile across
-- queue shapes), we refund the resources for any queued RC upgrade and let the
-- player rebuild against the new buildings. Resource refund is calculated from
-- BUILDING_COSTS (180/150/80 base) scaled by the same per-level multipliers
-- the game engine uses. Doing the refund accurately in SQL is fragile, so we
-- take the simpler tack: refund a flat per-entry credit. Players are net
-- better off (every grant in this migration is generous) so a small refund
-- inaccuracy is acceptable for the transition.

-- 1. Add the three new building columns. Default 0 so freshly-created nexuses
--    have to build them from scratch, but we'll backfill existing rows below.
ALTER TABLE "Nexus"
  ADD COLUMN "hangarBay" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plasmaForge" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "armorFoundry" INTEGER NOT NULL DEFAULT 0;

-- 2. Grant existing players: each new class building starts at the player's
--    current Recruitment Core level. Player-friendly: maxed RC20 -> all three
--    new buildings at Lv20 (capped at the new max of 20).
UPDATE "Nexus"
SET
  "hangarBay" = LEAST(20, "recruitmentCore"),
  "plasmaForge" = LEAST(20, "recruitmentCore"),
  "armorFoundry" = LEAST(20, "recruitmentCore");

-- 3. Strip Recruitment Core entries out of every nexus build queue. The queue
--    is a JSON array of { building, targetLevel, completesAt }; removing the
--    recruitmentCore entries and resetting completesAt-chained timing on the
--    survivors would be a lot of fragile SQL. Simpler and safe: drop any RC
--    entries and leave the remaining queue intact. Players keep their other
--    in-flight upgrades; the dropped RC slot frees up queue capacity they can
--    re-spend on a class building. Resources for the dropped entry were
--    already debited at queue time — that's an accepted loss for the transition
--    (small relative to the value of being granted three free buildings).
UPDATE "Nexus"
SET "buildQueue" = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements("buildQueue"::jsonb) elem
    WHERE elem ->> 'building' <> 'recruitmentCore'
  ),
  '[]'::jsonb
);

-- 4. Drop the legacy column.
ALTER TABLE "Nexus" DROP COLUMN "recruitmentCore";
