-- Named, reusable training-queue presets ("repeat-last" / saved templates,
-- roadmap Phase 3). Replaying a template re-submits {troopType, amount} to
-- the existing POST /api/troop/train endpoint, so no queue/cost/population
-- validation logic is duplicated here.
CREATE TABLE IF NOT EXISTS "QueueTemplate" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "troopType" VARCHAR(32) NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QueueTemplate_userId_galaxyId_idx"
    ON "QueueTemplate"("userId", "galaxyId");

ALTER TABLE "QueueTemplate"
    ADD CONSTRAINT "QueueTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QueueTemplate"
    ADD CONSTRAINT "QueueTemplate_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
