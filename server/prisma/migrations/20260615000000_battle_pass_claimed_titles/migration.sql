-- Add claimedLevels to GalaxyPlayer: JSON array of level numbers already claimed.
ALTER TABLE "GalaxyPlayer" ADD COLUMN "claimedLevels" JSONB NOT NULL DEFAULT '[]';

-- Add earnedTitles to User: permanent collection of all pass titles ever earned.
ALTER TABLE "User" ADD COLUMN "earnedTitles" JSONB NOT NULL DEFAULT '[]';

-- Add activeTitle to User: the single title the player chooses to display publicly.
ALTER TABLE "User" ADD COLUMN "activeTitle" VARCHAR(32);
