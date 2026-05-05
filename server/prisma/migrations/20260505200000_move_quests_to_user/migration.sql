-- Move quest tracking from Nexus to User (quests are per-user, not per-nexus)

-- Add quest fields to User
ALTER TABLE "User" ADD COLUMN "questRewardClaims" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "User" ADD COLUMN "completedQuestIds" JSONB NOT NULL DEFAULT '[]';

-- Migrate: for each user, take quest data from the nexus with the most completed quests
UPDATE "User" u
SET
  "questRewardClaims" = sub."questRewardClaims",
  "completedQuestIds" = sub."completedQuestIds"
FROM (
  SELECT DISTINCT ON (n."ownerId")
    n."ownerId",
    n."questRewardClaims",
    n."completedQuestIds"
  FROM "Nexus" n
  WHERE n."ownerId" IS NOT NULL
  ORDER BY n."ownerId", jsonb_array_length(n."completedQuestIds") DESC
) sub
WHERE u.id = sub."ownerId";

-- Drop quest fields from Nexus
ALTER TABLE "Nexus" DROP COLUMN "questRewardClaims";
ALTER TABLE "Nexus" DROP COLUMN "completedQuestIds";
