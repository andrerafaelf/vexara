-- Rename the "Armory" building to "Targeting Core" to remove the confusing
-- "Armory" / "Armor Foundry" name collision (Armor Foundry produces the armor
-- combat class; the old Armory amplifies ATTACK counters + gates elite units —
-- the names looked related but mean different things). This is a pure identifier
-- rename: the building's mechanics, level, cost, and effects are unchanged.
--
-- Safe by construction:
--   1. RENAME COLUMN is a metadata-only operation in Postgres (instant, no table
--      rewrite, no data risk) — every player's current level is preserved as-is.
--   2. `prisma migrate deploy` runs before the new server code in the start
--      script, so the column is renamed before any code references targetingCore.
--   3. In-flight upgrades stored in the buildQueue JSON as { building: 'armory' }
--      are rewritten to 'targetingCore' so the queue-completion handler (which
--      writes updates[build.building] = level directly to the column) keeps
--      working for upgrades that were queued before this migration.

-- 1. Rename the physical column. Existing levels carry over untouched.
ALTER TABLE "Nexus" RENAME COLUMN "armory" TO "targetingCore";

-- 2. Rewrite any pending Armory upgrades in the build queue JSON so their
--    `building` key matches the new column name. Leaves all other queue entries
--    (and their completesAt timing) intact.
UPDATE "Nexus"
SET "buildQueue" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ->> 'building' = 'armory'
        THEN jsonb_set(elem, '{building}', '"targetingCore"'::jsonb)
      ELSE elem
    END
  )
  FROM jsonb_array_elements("buildQueue"::jsonb) elem
)
WHERE "buildQueue" IS NOT NULL
  AND jsonb_typeof("buildQueue"::jsonb) = 'array'
  AND "buildQueue"::jsonb @> '[{"building": "armory"}]'::jsonb;
