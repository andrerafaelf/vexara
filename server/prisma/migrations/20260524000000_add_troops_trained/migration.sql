-- Adds a per-troop-type lifetime counter to Nexus so that "train N units"
-- quest progress survives combat losses. Without this, training 4 troops,
-- losing them in combat, and training 1 more left the player permanently
-- stuck on the quest (current count never reached N).
ALTER TABLE "Nexus" ADD COLUMN "troopsTrained" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: seed each nexus's counter with current alive counts so that
-- existing players who already had >= N alive don't regress after deploy.
-- This undercounts anyone who already trained-and-lost, but that's the best
-- approximation we can make from the current state.
UPDATE "Nexus" SET "troopsTrained" = jsonb_strip_nulls(jsonb_build_object(
  'lancerDrone',         NULLIF("lancerDrone", 0),
  'assaultTrooper',      NULLIF("assaultTrooper", 0),
  'breakerUnit',         NULLIF("breakerUnit", 0),
  'reconOperative',      NULLIF("reconOperative", 0),
  'skimmerBike',         NULLIF("skimmerBike", 0),
  'siegeMech',           NULLIF("siegeMech", 0),
  'bulwarkGuard',        NULLIF("bulwarkGuard", 0),
  'suppressorTeam',      NULLIF("suppressorTeam", 0),
  'disruptorUnit',       NULLIF("disruptorUnit", 0),
  'interceptorBike',     NULLIF("interceptorBike", 0),
  'annihilatorPlatform', NULLIF("annihilatorPlatform", 0),
  'voidStalker',         NULLIF("voidStalker", 0),
  'plasmaTurret',        NULLIF("plasmaTurret", 0),
  'overseer',            NULLIF("overseer", 0)
));
