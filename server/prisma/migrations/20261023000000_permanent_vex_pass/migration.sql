-- Permanent, account-wide Vex Pass.
-- Moves pass XP, paid unlock and claimed rewards from per-galaxy GalaxyPlayer
-- rows to the User. GalaxyPlayer.seasonXp / passLevel / hasPaidPass / passTitle /
-- claimedLevels are left in place (DEPRECATED, kept for rollback). Nothing dropped.
--
-- Also adds User.passwordChangedAt (nullable, no backfill; NULL = no revocation)
-- for session revocation on password change/reset.
--
-- Online-safe: new columns have constant defaults or are nullable, the new table
-- is empty at creation, and the backfills only write to new columns / the new
-- table. The title rename rewrites only rows that contain the old title.
-- Run-once: every data statement is idempotent (GREATEST / OR / ON CONFLICT /
-- the old title no longer matches after the first run).

-- AlterTable
ALTER TABLE "User"
    ADD COLUMN "passXp"         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "hasPaidPass"    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "passXpDay"      VARCHAR(10),
    ADD COLUMN "passXpDayTotal" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PassClaim" (
    "id"        SERIAL NOT NULL,
    "userId"    INTEGER NOT NULL,
    "level"     INTEGER NOT NULL,
    "track"     VARCHAR(8) NOT NULL,
    "galaxyId"  INTEGER,
    "nexusId"   INTEGER,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (claim lock: duplicate insert means already claimed)
CREATE UNIQUE INDEX "PassClaim_userId_level_track_key" ON "PassClaim"("userId", "level", "track");

-- AddForeignKey
ALTER TABLE "PassClaim" ADD CONSTRAINT "PassClaim_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: lifetime XP = best XP the user reached in any single galaxy, and the
-- paid track is kept by anyone who ever paid. Users with no GalaxyPlayer rows
-- keep the defaults (0 / false). GREATEST / OR keep a re-run harmless.
UPDATE "User" u
SET "passXp"      = GREATEST(u."passXp", agg.max_xp),
    "hasPaidPass" = (u."hasPaidPass" OR agg.any_paid)
FROM (
    SELECT "userId",
           MAX("seasonXp")        AS max_xp,
           BOOL_OR("hasPaidPass") AS any_paid
    FROM "GalaxyPlayer"
    GROUP BY "userId"
) agg
WHERE agg."userId" = u."id";

-- Backfill (free track): union of every level already claimed in any galaxy, so
-- nothing already paid out can be claimed again. claimedLevels is JSONB. Junk is
-- ignored: non-array values, non-integer elements, and levels outside 1..50.
-- CASE guards force the type checks before the casts. One row per
-- (userId, level, track); galaxyId is the lowest galaxy id the level came from.
INSERT INTO "PassClaim" ("userId", "level", "track", "galaxyId")
SELECT gp."userId",
       lvl.level,
       'free',
       MIN(gp."galaxyId")
FROM "GalaxyPlayer" gp
CROSS JOIN LATERAL (
    SELECT CASE WHEN e.txt ~ '^[0-9]{1,2}$' THEN e.txt::INTEGER END AS level
    FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(gp."claimedLevels") = 'array'
             THEN gp."claimedLevels" ELSE '[]'::jsonb END
    ) AS e(txt)
) lvl
WHERE lvl.level BETWEEN 1 AND 50
GROUP BY gp."userId", lvl.level
ON CONFLICT ("userId", "level", "track") DO NOTHING;

-- Backfill (paid track): levels claimed in a galaxy where that player held the
-- paid pass had their paid rewards paid out too, so they must not be claimable
-- again. Same junk guards as above.
INSERT INTO "PassClaim" ("userId", "level", "track", "galaxyId")
SELECT gp."userId",
       lvl.level,
       'paid',
       MIN(gp."galaxyId")
FROM "GalaxyPlayer" gp
CROSS JOIN LATERAL (
    SELECT CASE WHEN e.txt ~ '^[0-9]{1,2}$' THEN e.txt::INTEGER END AS level
    FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(gp."claimedLevels") = 'array'
             THEN gp."claimedLevels" ELSE '[]'::jsonb END
    ) AS e(txt)
) lvl
WHERE gp."hasPaidPass" = true
  AND lvl.level BETWEEN 1 AND 50
GROUP BY gp."userId", lvl.level
ON CONFLICT ("userId", "level", "track") DO NOTHING;

-- Title rename: the L50 paid pass title 'Season Conqueror' becomes
-- 'Protocol Ascendant'. earnedTitles is JSONB (array of strings); the others are
-- VARCHAR(32). Order is preserved and a pre-existing 'Protocol Ascendant' is not
-- duplicated (first occurrence wins).
UPDATE "User" u
SET "earnedTitles" = COALESCE((
    SELECT jsonb_agg(t.val ORDER BY t.first_ord)
    FROM (
        SELECT CASE WHEN x.elem = to_jsonb('Season Conqueror'::text)
                    THEN to_jsonb('Protocol Ascendant'::text)
                    ELSE x.elem END AS val,
               MIN(x.ord) AS first_ord
        FROM jsonb_array_elements(u."earnedTitles") WITH ORDINALITY AS x(elem, ord)
        GROUP BY 1
    ) t
), '[]'::jsonb)
WHERE jsonb_typeof(u."earnedTitles") = 'array'
  AND u."earnedTitles" @> '["Season Conqueror"]'::jsonb;

UPDATE "User" SET "activeTitle" = 'Protocol Ascendant' WHERE "activeTitle" = 'Season Conqueror';
UPDATE "User" SET "passTitle" = 'Protocol Ascendant' WHERE "passTitle" = 'Season Conqueror';
UPDATE "GalaxyPlayer" SET "passTitle" = 'Protocol Ascendant' WHERE "passTitle" = 'Season Conqueror';
