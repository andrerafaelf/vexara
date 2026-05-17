-- Add registrationIp to User
ALTER TABLE "User" ADD COLUMN "registrationIp" VARCHAR(45);

-- Drop old unique on ReferralToken.refereeId to allow 2 tokens per referee (referrer earns 2)
DROP INDEX IF EXISTS "ReferralToken_refereeId_key";

-- Create MilestoneToken table
CREATE TABLE "MilestoneToken" (
  "id"         SERIAL NOT NULL,
  "userId"     INTEGER NOT NULL,
  "milestone"  INTEGER NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "rewardType" VARCHAR(32),
  "rewardMeta" JSONB,
  CONSTRAINT "MilestoneToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MilestoneToken"
  ADD CONSTRAINT "MilestoneToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MilestoneToken_userId_milestone_key" ON "MilestoneToken"("userId", "milestone");
CREATE INDEX "MilestoneToken_userId_idx" ON "MilestoneToken"("userId");
