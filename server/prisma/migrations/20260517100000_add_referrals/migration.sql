-- AlterTable: add referredById to User
ALTER TABLE "User" ADD COLUMN "referredById" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ReferralToken
CREATE TABLE "ReferralToken" (
  "id"          SERIAL        NOT NULL,
  "referrerId"  INTEGER       NOT NULL,
  "refereeId"   INTEGER       NOT NULL,
  "redeemedAt"  TIMESTAMP(3),
  "rewardType"  VARCHAR(32),
  "rewardMeta"  JSONB,

  CONSTRAINT "ReferralToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReferralToken" ADD CONSTRAINT "ReferralToken_referrerId_fkey"
  FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ReferralToken_refereeId_key" ON "ReferralToken"("refereeId");
CREATE INDEX "ReferralToken_referrerId_idx" ON "ReferralToken"("referrerId");
