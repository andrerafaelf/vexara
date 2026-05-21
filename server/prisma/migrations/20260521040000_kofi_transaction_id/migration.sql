ALTER TABLE "MilestoneToken" ADD COLUMN "kofiTransactionId" VARCHAR(64);
CREATE UNIQUE INDEX "MilestoneToken_kofiTransactionId_key" ON "MilestoneToken" ("kofiTransactionId");

-- Replace the unconditional (userId, milestone) uniqueness with a partial index
-- that only applies to point-milestone tokens (milestone > 0). Ko-fi tokens use
-- milestone = 0 and dedupe via kofiTransactionId instead, so multiple Ko-fi tokens
-- per user must be allowed.
ALTER TABLE "MilestoneToken" DROP CONSTRAINT "MilestoneToken_userId_milestone_key";
CREATE UNIQUE INDEX "MilestoneToken_userId_milestone_positive_key"
  ON "MilestoneToken" ("userId", "milestone")
  WHERE "milestone" > 0;
