-- Grant one MilestoneToken to every player currently in an active galaxy as
-- compensation for the 2026-05-23 downtime (failed migration kept the server
-- offline). Tagged with milestone = -1 so it sits outside the existing dedupe
-- indexes (Ko-fi uses 0, point milestones use > 0). The NOT EXISTS guard
-- makes the insert idempotent — re-running the migration won't double-grant.
INSERT INTO "MilestoneToken" ("userId", "milestone", "rewardMeta")
SELECT DISTINCT gp."userId", -1, '{"reason":"downtime_2026_05_23"}'::jsonb
  FROM "GalaxyPlayer" gp
  JOIN "Galaxy" g ON g."id" = gp."galaxyId"
 WHERE g."status" = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM "MilestoneToken" mt
      WHERE mt."userId" = gp."userId"
        AND mt."milestone" = -1
        AND mt."rewardMeta" @> '{"reason":"downtime_2026_05_23"}'::jsonb
   );
