-- Add multi-galaxy support. Backfills all existing data into a galaxy
-- named "pre alphatest" so no existing data is lost.

-- 1. New enum + tables
CREATE TYPE "GalaxyStatus" AS ENUM ('active', 'ended');

CREATE TABLE "Galaxy" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "GalaxyStatus" NOT NULL DEFAULT 'active',
    "endedAt" TIMESTAMP(3),
    "winnerUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Galaxy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Galaxy_name_key" ON "Galaxy"("name");

CREATE TABLE "GalaxyPlayer" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questRewardClaims" JSONB NOT NULL DEFAULT '[]',
    "completedQuestIds" JSONB NOT NULL DEFAULT '[]',
    "nexusGroups" JSONB NOT NULL DEFAULT '[]',
    "dominanceSince" TIMESTAMP(3),

    CONSTRAINT "GalaxyPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GalaxyPlayer_userId_galaxyId_key" ON "GalaxyPlayer"("userId", "galaxyId");
CREATE INDEX "GalaxyPlayer_galaxyId_idx" ON "GalaxyPlayer"("galaxyId");

ALTER TABLE "GalaxyPlayer"
    ADD CONSTRAINT "GalaxyPlayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalaxyPlayer"
    ADD CONSTRAINT "GalaxyPlayer_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Seed the legacy galaxy that owns all pre-existing data
INSERT INTO "Galaxy" ("name", "status") VALUES ('pre alphatest', 'active');

-- 3. Add galaxyId columns as NULLable, backfill, then enforce NOT NULL

-- Nexus
ALTER TABLE "Nexus" ADD COLUMN "galaxyId" INTEGER;
UPDATE "Nexus" SET "galaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "Nexus" ALTER COLUMN "galaxyId" SET NOT NULL;
CREATE INDEX "Nexus_galaxyId_idx" ON "Nexus"("galaxyId");
ALTER TABLE "Nexus"
    ADD CONSTRAINT "Nexus_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attack
ALTER TABLE "Attack" ADD COLUMN "galaxyId" INTEGER;
UPDATE "Attack" SET "galaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "Attack" ALTER COLUMN "galaxyId" SET NOT NULL;
CREATE INDEX "Attack_galaxyId_idx" ON "Attack"("galaxyId");
ALTER TABLE "Attack"
    ADD CONSTRAINT "Attack_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TroopTransfer
ALTER TABLE "TroopTransfer" ADD COLUMN "galaxyId" INTEGER;
UPDATE "TroopTransfer" SET "galaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "TroopTransfer" ALTER COLUMN "galaxyId" SET NOT NULL;
CREATE INDEX "TroopTransfer_galaxyId_idx" ON "TroopTransfer"("galaxyId");
ALTER TABLE "TroopTransfer"
    ADD CONSTRAINT "TroopTransfer_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MarketListing
ALTER TABLE "MarketListing" ADD COLUMN "galaxyId" INTEGER;
UPDATE "MarketListing" SET "galaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "MarketListing" ALTER COLUMN "galaxyId" SET NOT NULL;
CREATE INDEX "MarketListing_galaxyId_idx" ON "MarketListing"("galaxyId");
ALTER TABLE "MarketListing"
    ADD CONSTRAINT "MarketListing_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MarketTransaction
ALTER TABLE "MarketTransaction" ADD COLUMN "galaxyId" INTEGER;
UPDATE "MarketTransaction" SET "galaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "MarketTransaction" ALTER COLUMN "galaxyId" SET NOT NULL;
CREATE INDEX "MarketTransaction_galaxyId_idx" ON "MarketTransaction"("galaxyId");
ALTER TABLE "MarketTransaction"
    ADD CONSTRAINT "MarketTransaction_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ReportRead
ALTER TABLE "ReportRead" ADD COLUMN "galaxyId" INTEGER;
UPDATE "ReportRead" SET "galaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "ReportRead" ALTER COLUMN "galaxyId" SET NOT NULL;
CREATE INDEX "ReportRead_galaxyId_idx" ON "ReportRead"("galaxyId");
ALTER TABLE "ReportRead"
    ADD CONSTRAINT "ReportRead_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Backfill GalaxyPlayer from existing User-scoped game state
INSERT INTO "GalaxyPlayer" ("userId", "galaxyId", "points", "questRewardClaims", "completedQuestIds", "nexusGroups")
SELECT
    u."id",
    (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest'),
    u."points",
    u."questRewardClaims",
    u."completedQuestIds",
    u."nexusGroups"
FROM "User" u;

-- 5. Add activeGalaxyId to User and set every existing user's active galaxy
ALTER TABLE "User" ADD COLUMN "activeGalaxyId" INTEGER;
UPDATE "User" SET "activeGalaxyId" = (SELECT "id" FROM "Galaxy" WHERE "name" = 'pre alphatest');
ALTER TABLE "User"
    ADD CONSTRAINT "User_activeGalaxyId_fkey"
    FOREIGN KEY ("activeGalaxyId") REFERENCES "Galaxy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Drop the now-migrated User columns (data has been copied into GalaxyPlayer)
ALTER TABLE "User" DROP COLUMN "points";
ALTER TABLE "User" DROP COLUMN "questRewardClaims";
ALTER TABLE "User" DROP COLUMN "completedQuestIds";
ALTER TABLE "User" DROP COLUMN "nexusGroups";
