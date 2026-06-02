-- Server-side scheduled attacks/waves. Replaces the in-browser setTimeout in the
-- Wave Planner, which only fired while the planning tab stayed open. The
-- processScheduledAttacks background job launches pending rows once launchAt passes.

-- CreateEnum
CREATE TYPE "ScheduledAttackStatus" AS ENUM ('pending', 'launched', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "ScheduledAttack" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromNexusId" INTEGER NOT NULL,
    "toNexusId" INTEGER NOT NULL,
    "troops" JSONB NOT NULL,
    "type" "AttackType" NOT NULL DEFAULT 'attack',
    "launchAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledAttackStatus" NOT NULL DEFAULT 'pending',
    "error" VARCHAR(256),
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledAttack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAttack_clientRequestId_key" ON "ScheduledAttack"("clientRequestId");

-- CreateIndex
CREATE INDEX "ScheduledAttack_status_launchAt_idx" ON "ScheduledAttack"("status", "launchAt");

-- CreateIndex
CREATE INDEX "ScheduledAttack_userId_idx" ON "ScheduledAttack"("userId");

-- CreateIndex
CREATE INDEX "ScheduledAttack_galaxyId_idx" ON "ScheduledAttack"("galaxyId");
