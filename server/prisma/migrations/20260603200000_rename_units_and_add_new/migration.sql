-- Military Restructure Stage 2d: rename 6 units and add 2 new units.
--
-- Renames (key change only - troop counts preserved verbatim):
--   skimmerBike       -> wraithSkimmer    (Mobile attack)
--   interceptorBike   -> phantomLance     (Mobile attack)
--   breakerUnit       -> vanguardBreaker  (Mobile attack)
--   suppressorTeam    -> pyreSuppressor   (Fire   attack)
--   disruptorUnit     -> arcDisruptor     (Fire   attack)
--   lancerDrone       -> sentinelLancer   (Fire   defense)
--
-- New units (default 0 columns; balance tuned in server code):
--   siegeColossus     (Armor attack - elite siege walker)
--   aegisSkirmisher   (Mobile defense - fast-response defender)
--
-- JSON blobs holding troop keys also need rewriting so active queues / pending
-- transfers / scheduled attacks reference the new keys. Per Stage 2d spec we
-- rewrite ACTIVE state only and leave completed Attack.result reports under
-- their historical keys (they're write-once archival data).

-- ─── 1. Column renames + new columns ─────────────────────────────────────────

ALTER TABLE "Nexus" RENAME COLUMN "skimmerBike"     TO "wraithSkimmer";
ALTER TABLE "Nexus" RENAME COLUMN "interceptorBike" TO "phantomLance";
ALTER TABLE "Nexus" RENAME COLUMN "breakerUnit"     TO "vanguardBreaker";
ALTER TABLE "Nexus" RENAME COLUMN "suppressorTeam"  TO "pyreSuppressor";
ALTER TABLE "Nexus" RENAME COLUMN "disruptorUnit"   TO "arcDisruptor";
ALTER TABLE "Nexus" RENAME COLUMN "lancerDrone"     TO "sentinelLancer";

ALTER TABLE "Nexus"
  ADD COLUMN "siegeColossus"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aegisSkirmisher" INTEGER NOT NULL DEFAULT 0;

-- ─── 2. JSON blob rewrites (active state only) ───────────────────────────────
--
-- Implemented as a single PL/pgSQL function that takes a JSONB value and
-- recursively rewrites troop-key references at any depth. Reused below for
-- every JSON column carrying troop counts.

CREATE OR REPLACE FUNCTION pg_temp.rename_troop_keys(input JSONB) RETURNS JSONB AS $$
DECLARE
  result JSONB;
  key TEXT;
  value JSONB;
  new_key TEXT;
  rename_map JSONB := '{
    "skimmerBike":     "wraithSkimmer",
    "interceptorBike": "phantomLance",
    "breakerUnit":     "vanguardBreaker",
    "suppressorTeam":  "pyreSuppressor",
    "disruptorUnit":   "arcDisruptor",
    "lancerDrone":     "sentinelLancer"
  }';
BEGIN
  -- NULL passes through unchanged.
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  -- Array: recurse into every element.
  IF jsonb_typeof(input) = 'array' THEN
    result := '[]'::jsonb;
    FOR value IN SELECT * FROM jsonb_array_elements(input) LOOP
      result := result || jsonb_build_array(pg_temp.rename_troop_keys(value));
    END LOOP;
    RETURN result;
  END IF;

  -- Object: rename keys at this level and recurse into values.
  IF jsonb_typeof(input) = 'object' THEN
    result := '{}'::jsonb;
    FOR key, value IN SELECT * FROM jsonb_each(input) LOOP
      -- Translate the key if it's in the rename map; otherwise keep as-is.
      new_key := COALESCE(rename_map ->> key, key);
      -- Also rewrite string values that are themselves troop keys (e.g. the
      -- training queue entry { "troopType": "skimmerBike", ... }).
      IF jsonb_typeof(value) = 'string' AND rename_map ? (value #>> '{}') THEN
        result := jsonb_set(
          result,
          ARRAY[new_key],
          to_jsonb(rename_map ->> (value #>> '{}'))
        );
      ELSE
        result := jsonb_set(result, ARRAY[new_key], pg_temp.rename_troop_keys(value));
      END IF;
    END LOOP;
    RETURN result;
  END IF;

  -- Scalars (string / number / bool / null): pass through unchanged. Note that
  -- bare-string troop keys are handled inside the object branch above (where
  -- we have the key to set them under).
  RETURN input;
END;
$$ LANGUAGE plpgsql;

-- Apply to every JSON column that carries troop counts.
UPDATE "Nexus" SET "trainingQueue" = pg_temp.rename_troop_keys("trainingQueue"::jsonb);
UPDATE "Nexus" SET "troopsTrained" = pg_temp.rename_troop_keys("troopsTrained"::jsonb);
UPDATE "TroopTransfer"   SET troops = pg_temp.rename_troop_keys(troops::jsonb);
UPDATE "Attack"          SET troops = pg_temp.rename_troop_keys(troops::jsonb) WHERE status != 'completed';
UPDATE "ScheduledAttack" SET troops = pg_temp.rename_troop_keys(troops::jsonb);
UPDATE "WarOperationWave" SET troops = pg_temp.rename_troop_keys(troops::jsonb);
UPDATE "WarOperationSlot" SET troops = pg_temp.rename_troop_keys(troops::jsonb);

-- Completed Attack reports (status = 'completed') are intentionally NOT
-- rewritten - they're historical records. The client renders them by looking
-- up labels via a name map that retains the legacy keys.

-- pg_temp.* functions are dropped automatically at the end of the session.
