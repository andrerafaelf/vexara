-- Espionage removal (Military Restructure, Stage 2a).
-- Refunds in-flight recon operatives back to the owner garrison BEFORE dropping
-- the SpyMission table, so players don't lose units to a deleted feature. Only
-- SpyMission rows hold operatives in-flight; SpyAsset rows are stationary intel
-- assets with no troop cost beyond the original embed dispatch (already paid).

-- 1. Refund operatives from missions still in flight (traveling or returning).
--    Only counts > 0 are refunded; completed missions are no-ops.
UPDATE "Nexus" n
SET "reconOperative" = n."reconOperative" + COALESCE(refund.total, 0)
FROM (
  SELECT "fromNexusId", SUM("operatives")::int AS total
  FROM "SpyMission"
  WHERE "status" IN ('traveling', 'returning') AND "operatives" > 0
  GROUP BY "fromNexusId"
) refund
WHERE n.id = refund."fromNexusId";

-- 2. Drop the tables. CASCADE on the FK to Galaxy is already declared at the
--    table level, so a plain DROP is enough here.
DROP TABLE IF EXISTS "SpyMission";
DROP TABLE IF EXISTS "SpyAsset";
