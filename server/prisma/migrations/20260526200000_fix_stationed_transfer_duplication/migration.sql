-- Stationed troop transfers were being double-counted: arrival code added
-- transfer.troops into the host Nexus columns AND combat aggregated them again
-- from the TroopTransfer record. Recall also duplicated them (host kept the
-- inflated columns while troops were also returned to origin).
--
-- This migration subtracts the stationed transfer troops from their host nexus
-- columns to restore the invariant that stationed transfers live ONLY on the
-- TroopTransfer record. Clamped at 0 to avoid negative counts.

UPDATE "Nexus" n
SET
  "lancerDrone"         = GREATEST(0, n."lancerDrone"         - COALESCE(s.lancer_drone, 0)),
  "assaultTrooper"      = GREATEST(0, n."assaultTrooper"      - COALESCE(s.assault_trooper, 0)),
  "breakerUnit"         = GREATEST(0, n."breakerUnit"         - COALESCE(s.breaker_unit, 0)),
  "reconOperative"      = GREATEST(0, n."reconOperative"      - COALESCE(s.recon_operative, 0)),
  "skimmerBike"         = GREATEST(0, n."skimmerBike"         - COALESCE(s.skimmer_bike, 0)),
  "siegeMech"           = GREATEST(0, n."siegeMech"           - COALESCE(s.siege_mech, 0)),
  "bulwarkGuard"        = GREATEST(0, n."bulwarkGuard"        - COALESCE(s.bulwark_guard, 0)),
  "suppressorTeam"      = GREATEST(0, n."suppressorTeam"      - COALESCE(s.suppressor_team, 0)),
  "disruptorUnit"       = GREATEST(0, n."disruptorUnit"       - COALESCE(s.disruptor_unit, 0)),
  "interceptorBike"     = GREATEST(0, n."interceptorBike"     - COALESCE(s.interceptor_bike, 0)),
  "annihilatorPlatform" = GREATEST(0, n."annihilatorPlatform" - COALESCE(s.annihilator_platform, 0)),
  "voidStalker"         = GREATEST(0, n."voidStalker"         - COALESCE(s.void_stalker, 0)),
  "plasmaTurret"        = GREATEST(0, n."plasmaTurret"        - COALESCE(s.plasma_turret, 0)),
  "overseer"            = GREATEST(0, n."overseer"            - COALESCE(s.overseer, 0))
FROM (
  SELECT
    "hostNexusId",
    SUM(COALESCE((troops->>'lancerDrone')::int, 0))         AS lancer_drone,
    SUM(COALESCE((troops->>'assaultTrooper')::int, 0))      AS assault_trooper,
    SUM(COALESCE((troops->>'breakerUnit')::int, 0))         AS breaker_unit,
    SUM(COALESCE((troops->>'reconOperative')::int, 0))      AS recon_operative,
    SUM(COALESCE((troops->>'skimmerBike')::int, 0))         AS skimmer_bike,
    SUM(COALESCE((troops->>'siegeMech')::int, 0))           AS siege_mech,
    SUM(COALESCE((troops->>'bulwarkGuard')::int, 0))        AS bulwark_guard,
    SUM(COALESCE((troops->>'suppressorTeam')::int, 0))      AS suppressor_team,
    SUM(COALESCE((troops->>'disruptorUnit')::int, 0))       AS disruptor_unit,
    SUM(COALESCE((troops->>'interceptorBike')::int, 0))     AS interceptor_bike,
    SUM(COALESCE((troops->>'annihilatorPlatform')::int, 0)) AS annihilator_platform,
    SUM(COALESCE((troops->>'voidStalker')::int, 0))         AS void_stalker,
    SUM(COALESCE((troops->>'plasmaTurret')::int, 0))        AS plasma_turret,
    SUM(COALESCE((troops->>'overseer')::int, 0))            AS overseer
  FROM "TroopTransfer"
  WHERE status = 'stationed'
  GROUP BY "hostNexusId"
) s
WHERE n.id = s."hostNexusId";
