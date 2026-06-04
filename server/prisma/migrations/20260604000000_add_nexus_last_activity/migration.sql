-- Presence signal: stamped whenever a nexus owner takes a deliberate action
-- (train / build / cancel / decommission) so OTHER players can see, on the map
-- and in the inspect drawer, whether a nexus has been active recently (within
-- NEXUS_ACTIVE_WINDOW_MS, currently 15 minutes). Nullable: existing nexuses
-- start with no recorded activity and simply read as inactive until their owner
-- next acts.
ALTER TABLE "Nexus"
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);
