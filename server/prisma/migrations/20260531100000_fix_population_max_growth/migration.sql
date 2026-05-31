-- Recalculate populationMax for all nexuses using the corrected growth constant (1.15 instead of 1.30).
-- Also clamps populationCurrent down to the new max where it would exceed it.
UPDATE "Nexus"
SET
  "populationMax" = FLOOR(100.0 * POWER(1.15, "lifeSupport")),
  "populationCurrent" = LEAST("populationCurrent", FLOOR(100.0 * POWER(1.15, "lifeSupport")));
