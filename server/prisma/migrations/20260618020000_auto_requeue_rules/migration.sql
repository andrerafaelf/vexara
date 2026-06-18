-- Auto-requeue system (roadmap Phase 6). A rule that re-queues a training
-- batch or building upgrade each time the previous one drains, picked up
-- by processCompletedQueuesAndNotify. Building rules reuse the exact same
-- validation as the manual upgrade endpoint (buildingController's
-- attemptUpgradeBuilding) and self-pause + notify on validation failure
-- instead of erroring silently.
CREATE TABLE IF NOT EXISTS "AutoRequeueRule" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "nexusId" INTEGER NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "troopType" VARCHAR(32),
    "amount" INTEGER,
    "building" VARCHAR(32),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pausedReason" VARCHAR(255),
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoRequeueRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutoRequeueRule_userId_galaxyId_idx"
    ON "AutoRequeueRule"("userId", "galaxyId");

CREATE INDEX IF NOT EXISTS "AutoRequeueRule_nexusId_isActive_idx"
    ON "AutoRequeueRule"("nexusId", "isActive");

ALTER TABLE "AutoRequeueRule"
    ADD CONSTRAINT "AutoRequeueRule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoRequeueRule"
    ADD CONSTRAINT "AutoRequeueRule_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoRequeueRule"
    ADD CONSTRAINT "AutoRequeueRule_nexusId_fkey"
    FOREIGN KEY ("nexusId") REFERENCES "Nexus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New opt-out category for the self-pause notification sent when a rule's
-- requeue attempt fails validation.
ALTER TABLE "NotificationPreferences"
    ADD COLUMN IF NOT EXISTS "autoRequeuePaused" BOOLEAN NOT NULL DEFAULT true;
